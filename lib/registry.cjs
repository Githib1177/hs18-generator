const crypto = require('node:crypto');
const EVENTS='hs18:registry:v1:events';
const HISTORY='hs18:message-history:v1';
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
function normalizeAlf(value){
  let v=String(value||'').trim();
  if(/^https?:/i.test(v)){
    const u=new URL(v);
    if(u.protocol!=='https:'||u.hostname!=='alfred.previo.app')throw new Error('Neplatný odkaz Alfréda.');
    v=u.pathname.match(/^\/login\/([A-Za-z0-9_-]+)\/?$/)?.[1]||'';
  }
  if(!/^[A-Za-z0-9_-]{4,80}$/.test(v))throw new Error('Chybí jednoznačná reference Alfréda.');
  return v;
}
function contextOf(body){
  const c=body?.context;
  if(!c)return null;
  if(!['none','paid','unpaid','done'].includes(c.state)||!['1','2','3'].includes(String(c.apt)))throw new Error('Zkontrolujte stav a apartmán (1–3).');
  const stay=hash(normalizeAlf(c.alf));
  const stage=c.state==='done'?'PIN_RELEASE':`PORTAL_${c.state.toUpperCase()}`;
  return {stay,stage,state:c.state,apt:String(c.apt),key:`hs18:registry:v1:claim:${hash(stay+'|'+stage)}`};
}
function contextFromText(text){
  const urls=String(text||'').match(/https:\/\/hillside18-guest-portal\.vercel\.app\/[^\s]*/g)||[];
  if(urls.length!==1)return null;
  const u=new URL(urls[0]);
  const flags=['paid','unpaid','done'].filter(k=>u.searchParams.get(k)==='1');
  if(flags.length>1)throw new Error('Odkaz obsahuje neslučitelné stavy. Vytvořte jej znovu.');
  const state=flags[0]||'none';
  if(state!=='done'&&u.searchParams.has('door'))throw new Error('PIN nesmí být v odkazu před dokončením.');
  return contextOf({context:{alf:u.searchParams.get('alf'),apt:u.searchParams.get('apt'),state}});
}
function authorized(req){
  const expected=String(process.env.HISTORY_ACCESS_KEY||'');const supplied=String(req.headers?.['x-history-key']||'');
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  return !!expected&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function contextFromMessage(text){
  const short=String(text||'').match(/https:\/\/hs18-generator\.vercel\.app\/s\/[^\s]+/g)||[];
  if(!short.length)return contextFromText(text);
  if(short.length!==1||contextFromText(text))throw new Error('SMS musí obsahovat jeden odkaz na pobyt.');
  const url=new URL(short[0]),match=/^\/s\/([A-Za-z0-9_-]{22})(?:\/(en|de))?$/.exec(url.pathname);
  if(!match||url.search||url.hash)throw new Error('Neplatný krátký odkaz. Vytvořte jej znovu.');
  const raw=await redis(['GET','hs18:guest-link:'+match[1]]);
  if(!raw)throw new Error('Krátký odkaz již není dostupný. Vytvořte jej znovu.');
  const target=JSON.parse(raw)[match[2]||'cs'];
  if(typeof target!=='string'||new URL(target).origin!=='https://hillside18-guest-portal.vercel.app')throw new Error('Neplatný cíl odkazu.');
  const context=contextFromText(target);
  if(!context)throw new Error('Odkaz neobsahuje platný pobyt.');
  return context;
}
async function redis(command){
  const url=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if(!url||!token)throw new Error('Registry storage unavailable');
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok||data.error)throw new Error('Registry storage failed');
  return data.result;
}
async function bootstrap(){
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
// Only documented, explicit provider errors prove that a recipient was rejected.
// -1 means an existing message; missing/new error codes must remain protected.
function isDefinitiveRejection(result){
  return result.ok===false&&Number.isInteger(result.err)&&result.err>=1&&result.err<=13;
}
function isRejectedEvent(event){
  return event.status==='rejected'&&Array.isArray(event.results)&&event.results.length>0&&event.results.every(isDefinitiveRejection);
}
// Compare both the claim and persisted outcome before changing the lock. Never
// release a newer attempt, or release before the audit result has been saved.
const updateClaimScript=`
if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('HGET',KEYS[2],ARGV[2])~=ARGV[3] then return 0 end
if ARGV[4]=='' then return redis.call('DEL',KEYS[1]) end
redis.call('SET',KEYS[1],ARGV[4])
return 1`;
async function updateClaim(context,raw,eventRaw,eventId,replacement=''){
  return redis(['EVAL',updateClaimScript,2,context.key,EVENTS,raw,eventId,eventRaw,replacement]);
}
async function checkContext(context){
  await bootstrap();
  const rows=(await redis(['HVALS',EVENTS])||[]).map(raw=>({raw,event:JSON.parse(raw)}));
  const matching=rows.filter(({event})=>event.stay===context.stay&&event.stage===context.stage);
  const duplicate=matching.some(({event})=>!isRejectedEvent(event));
  const raw=await redis(['GET',context.key]);
  let claimed=!!raw;
  if(raw){
    const current=JSON.parse(raw);
    const rejected=matching.find(({event})=>event.id===current.id&&isRejectedEvent(event));
    // Recover locks left by the old implementation (or an interrupted finish).
    // The full audit record, rather than the claim status alone, is authoritative.
    if(rejected)claimed=(await updateClaim(context,raw,rejected.raw,current.id))!==1;
  }
  const blocked=duplicate||claimed;
  const reason=blocked?'Stejný pobyt a stav již mají odeslání nebo nevyřešený pokus. Opakování je zablokováno.':matching.length?'Předchozí pokus SMS brána jednoznačně odmítla. Po odstranění příčiny lze odeslání zopakovat.':'V registru nebyla nalezena stejná událost. Automatické odesílání zůstává vypnuté.';
  return {duplicate:blocked,stage:context.stage,automaticSendEnabled:false,reason};
}
async function claim(context){
  const id=crypto.randomUUID();
  const result=await redis(['SET',context.key,JSON.stringify({id,status:'pending',at:Date.now()}),'NX']);
  if(result!=='OK')return null;
  const event={id,stay:context.stay,stage:context.stage,state:context.state,apt:context.apt,at:Date.now(),status:'pending',source:'generator',channel:'sms',manualResend:!!context.manualResend,repeatOf:context.repeatOf||null};
  await redis(['HSET',EVENTS,id,JSON.stringify(event)]);
  return event;
}
async function finish(context,event,results){
  const status=results.some(r=>r.ok===true)?'accepted':results.length>0&&results.every(isDefinitiveRejection)?'rejected':'unknown';
  // Per-recipient outcome, without storing raw phone numbers or SMS contents.
  const next={...event,status,results:results.map(r=>({recipient:hash(r.number),ok:r.ok,err:r.err,sms_id:r.sms_id||null})),finishedAt:Date.now()};
  const eventRaw=JSON.stringify(next);
  await redis(['HSET',EVENTS,event.id,eventRaw]);
  const raw=await redis(['GET',context.key]);
  if(!raw||JSON.parse(raw).id!==event.id)throw new Error('Registry claim changed');
  // A manual confirmation token remains single-use even when its send fails.
  const replacement=status==='rejected'&&!event.manualResend?'':JSON.stringify({id:event.id,status,at:next.finishedAt});
  if(await updateClaim(context,raw,eventRaw,event.id,replacement)!==1)throw new Error('Registry claim changed');
}

module.exports={EVENTS,HISTORY,hash,normalizeAlf,contextOf,contextFromText,contextFromMessage,authorized,redis,bootstrap,checkContext,claim,finish,isDefinitiveRejection,isRejectedEvent};

