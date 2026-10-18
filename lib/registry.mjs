import crypto from 'node:crypto';
export const EVENTS='hs18:registry:v1:events';
export const HISTORY='hs18:message-history:v1';
export const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
export function normalizeAlf(value){
  let v=String(value||'').trim();
  if(/^https?:/i.test(v)){
    const u=new URL(v);
    if(u.protocol!=='https:'||u.hostname!=='alfred.previo.app')throw new Error('Neplatný odkaz Alfréda.');
    v=u.pathname.match(/^\/login\/([A-Za-z0-9_-]+)\/?$/)?.[1]||'';
  }
  if(!/^[A-Za-z0-9_-]{4,80}$/.test(v))throw new Error('Chybí jednoznačná reference Alfréda.');
  return v;
}
export function contextOf(body){
  const c=body?.context;
  if(!c)return null;
  if(!['none','paid','unpaid','done'].includes(c.state)||!['1','2','3'].includes(String(c.apt)))throw new Error('Zkontrolujte stav a apartmán (1–3).');
  const stay=hash(normalizeAlf(c.alf));
  const stage=c.state==='done'?'PIN_RELEASE':`PORTAL_${c.state.toUpperCase()}`;
  return {stay,stage,state:c.state,apt:String(c.apt),key:`hs18:registry:v1:claim:${hash(stay+'|'+stage)}`};
}
export function contextFromText(text){
  const urls=String(text||'').match(/https:\/\/hillside18-guest-portal\.vercel\.app\/[^\s]*/g)||[];
  if(urls.length!==1)return null;
  const u=new URL(urls[0]);
  const flags=['paid','unpaid','done'].filter(k=>u.searchParams.get(k)==='1');
  if(flags.length>1)throw new Error('Odkaz obsahuje neslučitelné stavy. Vytvořte jej znovu.');
  const state=flags[0]||'none';
  if(state!=='done'&&u.searchParams.has('door'))throw new Error('PIN nesmí být v odkazu před dokončením.');
  return contextOf({context:{alf:u.searchParams.get('alf'),apt:u.searchParams.get('apt'),state}});
}
export function authorized(req){
  const expected=String(process.env.HISTORY_ACCESS_KEY||'');const supplied=String(req.headers?.['x-history-key']||'');
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  return !!expected&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export async function redis(command){
  const url=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if(!url||!token)throw new Error('Registry storage unavailable');
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok||data.error)throw new Error('Registry storage failed');
  return data.result;
}
export async function bootstrap(){
  const raw=await redis(['GET',HISTORY]);
  if(!raw)return;
  const rows=JSON.parse(raw);
  if(!Array.isArray(rows))throw new Error('Invalid history');
  for(const row of rows){
    if(!row.id)continue;
    try{
      const c=contextOf({context:{alf:row.alf,apt:String(row.apt),state:row.state||'none'}});
      // No PIN, guest login link, name, phone or message text in the ledger.
      const event={id:'legacy:'+row.id,stay:c.stay,stage:c.stage,state:c.state,apt:c.apt,at:row.ts,status:'reported_success',source:'generator-history',channel:'sms'};
      await redis(['HSETNX',EVENTS,event.id,JSON.stringify(event)]);
    }catch(error){
      // Keep invalid legacy rows intact. A storage failure must not be swallowed.
      if(error.message.startsWith('Registry'))throw error;
    }
  }
}
export async function checkContext(context){
  await bootstrap();
  const rows=await redis(['HVALS',EVENTS]);
  const duplicate=(rows||[]).map(x=>JSON.parse(x)).some(x=>x.stay===context.stay&&x.stage===context.stage&&['reported_success','accepted','unknown','pending','rejected'].includes(x.status));
  const claimed=await redis(['GET',context.key]);
  return {duplicate:duplicate||!!claimed,stage:context.stage,automaticSendEnabled:false,reason:duplicate||claimed?'Stejný pobyt a stav již mají odeslání nebo nevyřešený pokus. Opakování je zablokováno.':'V registru nebyla nalezena stejná událost. Automatické odesílání zůstává vypnuté.'};
}
export async function claim(context){
  const id=crypto.randomUUID();
  const result=await redis(['SET',context.key,JSON.stringify({id,status:'pending',at:Date.now()}),'NX']);
  if(result!=='OK')return null;
  const event={id,stay:context.stay,stage:context.stage,state:context.state,apt:context.apt,at:Date.now(),status:'pending',source:'generator',channel:'sms'};
  await redis(['HSET',EVENTS,id,JSON.stringify(event)]);
  return event;
}
export async function finish(context,event,results){
  const status=results.some(r=>r.ok)?'accepted':results.some(r=>r.err===null)?'unknown':'rejected';
  // Per-recipient outcome, without storing raw phone numbers or SMS contents.
  const next={...event,status,results:results.map(r=>({recipient:hash(r.number),ok:r.ok,err:r.err,sms_id:r.sms_id||null})),finishedAt:Date.now()};
  await redis(['HSET',EVENTS,event.id,JSON.stringify(next)]);
  await redis(['SET',context.key,JSON.stringify({id:event.id,status,at:next.finishedAt})]);
}
