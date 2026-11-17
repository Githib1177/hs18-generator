import registry from './registry.cjs';
import {isAuthorized} from '../api/_wallet-auth.js';
import {createPrevioReader} from './previo-reservations.js';
import {guestReferenceKey} from './live-guest-link.js';
import {cancellationKey} from './cancellation-guard.js';
import {shortId} from './dispatch-preparation.js';
import {redis} from './wallet-store.js';

const links='hs18:guest-link:', dispatch='hs18:manager-dispatch:v1:';
const paths=/^\/s\/([A-Za-z0-9_-]{22})(?:\/(en|de))?$/;
const ids=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fields=['id','resId','voucher','apt','arrival','departure'];
const date=/^\d{4}-\d{2}-\d{2}$/;
const langs=['cs','en','de'];
const pathFor=(id,lang)=>'/s/'+id+(lang==='cs'?'':'/'+lang);
const decode=raw=>{try{return JSON.parse(raw)||null;}catch{return null;}};
const timestamp=v=> typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=8.64e15?new Date(v).toISOString():null;
const str=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const validRef=r=>r&&fields.every(k=>typeof r[k]==='string'&&r[k]&&r[k].length<=80)&&
 /^[1-3]$/.test(r.apt)&&date.test(r.arrival)&&date.test(r.departure)&&r.arrival<r.departure;
const same=(a,b)=>fields.every(k=>a?.[k]===b?.[k]);

async function scan(store,prefix,accept){
 let cursor='0';const keys=new Set();
 do{
  const page=await store(['SCAN',cursor,'MATCH',prefix+'*','COUNT',500]);
  if(!Array.isArray(page)||page.length!==2||!Array.isArray(page[1]))throw Error('Link inventory unavailable');
  cursor=String(page[0]);
  for(const key of page[1])if(key.startsWith(prefix)&&accept(key.slice(prefix.length)))keys.add(key);
 }while(cursor!=='0');
 return [...keys];
}
async function readMap(store,keys){
 const list=[...new Set(keys)];const map=new Map();
 for(let i=0;i<list.length;i+=150){
  const chunk=list.slice(i,i+150),values=await store(['MGET',...chunk]);
  if(!Array.isArray(values)||values.length!==chunk.length)throw Error('Link inventory unavailable');
  values.forEach((value,j)=>map.set(chunk[j],decode(value)));
 }
 return map;
}
function original(dest){
 try{
  const parsed=langs.map(l=>{
   const u=new URL(dest[l]);
   if(u.origin!=='https://hillside18-guest-portal.vercel.app'||u.pathname!=='/')throw Error();
   return registry.contextFromText(u.href);
  });
  const [c]=parsed;
  return c&&parsed.every(x=>x&&x.stay===c.stay&&x.apt===c.apt&&x.stage===c.stage)?c:null;
 }catch{return null;}
}
function addDelivery(out,seen,path,result,at){
 const sentAt=timestamp(at);
 if(!result?.ok||!sentAt)return;
 const key=result.sms_id?path+':'+result.sms_id:path+':'+at+':'+(result.recipient||result.number||'');
 if(seen.has(key))return;
 seen.add(key);
 const last3=result.last3||String(result.number||'').slice(-3);
 out.push({path,channel:'SMS',sentAt,recipientLast3:/^\d{3}$/.test(last3)?last3:null});
}

export async function readOwnerLinks({store=redis,reader=createPrevioReader(),voucher='',page=0,exact=null,now=new Date()}={}){
 const [linkKeys,prepKeys,eventRaw]=await Promise.all([
  scan(store,links,id=>/^[A-Za-z0-9_-]{22}$/.test(id)),
  scan(store,dispatch,id=>ids.test(id)),
  store(['HVALS',registry.EVENTS])
 ]);
 if(!Array.isArray(eventRaw))throw Error('Durable send history unavailable');
 const linkIds=new Set(linkKeys.map(k=>k.slice(links.length)));
 const [rawLinks,rawPreps]=await Promise.all([
  readMap(store,[...linkKeys,...[...linkIds].map(guestReferenceKey)]),readMap(store,prepKeys)
 ]);
 const preps=new Map();
 for(const [key,p] of rawPreps)if(p?.id===key.slice(dispatch.length)&&linkIds.has(p.shortId)&&shortId(p.id)===p.shortId)preps.set(p.shortId,p);
 const contexts=new Map();
 for(const id of linkIds){const c=original(rawLinks.get(links+id));if(c)contexts.set(id,c);}
 const barriers=await readMap(store,[...contexts.values()].map(c=>cancellationKey(c.stay)));
 const byLink=new Map(),unattributed=new Set(),historicalByProviderId=new Map();
 for(const e of eventRaw.map(decode).filter(Boolean)){
  if(e.channel!=='sms')continue;
  const match=typeof e.shortPath==='string'?paths.exec(e.shortPath):null;
  if(match){
   const c=contexts.get(match[1]);
   if(c?.stay!==e.stay||c?.stage!==e.stage||c?.apt!==e.apt)continue;
   const events=byLink.get(match[1])||[];events.push(e);byLink.set(match[1],events);
  }else if(['pending','unknown','accepted','reported_success'].includes(e.status)){
   const scope=e.stay+'|'+e.stage;
   unattributed.add(scope);
   if(e.status==='accepted')for(const r of e.results||[])if(r.ok&&r.sms_id)historicalByProviderId.set(scope+'|'+r.sms_id,e.finishedAt);
  }
 }
 const rows=[];
 for(const id of linkIds){
  if(!rawLinks.get(links+id))continue;
  const c=contexts.get(id),bound=rawLinks.get(guestReferenceKey(id)),p=preps.get(id);
  const storedBarrier=c?barriers.get(cancellationKey(c.stay)):null;
  const verifiedBinding=!!c&&validRef(bound?.reservation)&&bound.reservation.apt===c.apt&&registry.hash(bound.roomAlf)===c.stay;
  const cancelledRef=storedBarrier?.receipt?.reservation;
  const ref=verifiedBinding?bound.reservation:validRef(cancelledRef)&&cancelledRef.apt===c?.apt?cancelledRef:null;
  if((exact&&!same(ref,exact))||(voucher&&ref?.voucher.toUpperCase()!==voucher))continue;
  const prepMatches=!!c&&p?.stayHash===c.stay&&p?.context?.apt===c.apt&&p.context.state===c.state;
  const preferred=prepMatches&&langs.includes(p.lang)?p.lang:verifiedBinding&&langs.includes(bound.preferredLanguage)?bound.preferredLanguage:null;
  const name=str(verifiedBinding?bound.guestName:null,200)||str(prepMatches?p.history?.guestName:null,200)||null;
  const reservation=ref?{voucher:ref.voucher,guestName:name,apt:ref.apt,arrival:ref.arrival,departure:ref.departure}:null;
  const expiry=prepMatches?Date.parse(p.walletBody?.expiresAt):NaN;
  const ended=Number.isFinite(expiry)?expiry<=now.getTime():!!ref&&ref.departure<new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(now);
  const lifecycle=storedBarrier?'revoked':ended?'expired':verifiedBinding?'valid':'paused';
  const events=byLink.get(id)||[];
  rows.push({id,ref,c,p:prepMatches?p:null,preferred,events,lifecycle,reservation,
   createdAt:timestamp(verifiedBinding?bound.createdAt:null)||timestamp(prepMatches?p.createdAt:null),
   rank:Math.max(0,...events.map(e=>Number(e.finishedAt||e.at)||0),Number(bound?.createdAt||p?.createdAt)||0)});
 }
 rows.sort((a,b)=>b.rank-a.rank||(b.ref?.arrival||'').localeCompare(a.ref?.arrival||'')||a.id.localeCompare(b.id));
 const size=30,selected=rows.slice(page*size,(page+1)*size);
 const details=await readMap(store,selected.flatMap(x=>x.p?[dispatch+x.p.id+':receipt',dispatch+x.p.id+':attempt']:[]));
 const current=new Map();
 if(voucher||exact){
  const refs=new Map(selected.filter(x=>x.ref).map(x=>[JSON.stringify(fields.map(k=>x.ref[k])),x.ref]));
  await Promise.all([...refs].map(async([key,ref])=>{
   try{current.set(key,await reader.ownerLinkDetail(ref));}catch{current.set(key,null);}
  }));
 }
 return {hasMore:(page+1)*size<rows.length,items:selected.map(x=>{
  const receipt=x.p?details.get(dispatch+x.p.id+':receipt'):null;
  const attempt=x.p?details.get(dispatch+x.p.id+':attempt'):null;
  const deliveries=[],seen=new Set();
  for(const e of x.events)if(e.status==='accepted')for(const result of e.results||[])addDelivery(deliveries,seen,e.shortPath,result,e.finishedAt);
  // Older manager receipts were keyed by the original immutable preparation.
  // Its send route required that preparation's exact URL and language.
  if(x.preferred&&receipt?.result?.ok)for(const result of receipt.result.results||[]){
   const acceptedAt=historicalByProviderId.get(x.c.stay+'|'+x.c.stage+'|'+result.sms_id);
   addDelivery(deliveries,seen,pathFor(x.id,x.preferred),result,acceptedAt??receipt.at);
  }
  deliveries.sort((a,b)=>b.sentAt.localeCompare(a.sentAt));
  const unresolved=x.events.some(e=>['pending','unknown'].includes(e.status))||Boolean(attempt&&!receipt)||
   Boolean(receipt?.result?.results?.some(r=>!r.ok&&r.err===null))||
   Boolean(receipt?.result?.ok&&!deliveries.length);
  const uncertainHistory=!!x.c&&unattributed.has(x.c.stay+'|'+x.c.stage);
  let lifecycle=x.lifecycle;
  const lookup=x.ref&&JSON.stringify(fields.map(k=>x.ref[k])),observed=current.get(lookup);
  if(observed?.statusId==='7')lifecycle='revoked';
  else if(lookup&&current.has(lookup)&&lifecycle==='valid'&&(!observed||registry.hash(observed.alf)!==x.c?.stay))lifecycle='paused';
  return {reservation:x.reservation?{...x.reservation,guestName:str(observed?.guestName,200)||x.reservation.guestName}:null,
   links:langs.map(lang=>({lang,path:pathFor(x.id,lang)})),preferredLanguage:x.preferred,createdAt:x.createdAt,
   lifecycle,sendStatus:deliveries.length?'sent':unresolved?'pending_verification':uncertainHistory?'historical_unverified':'prepared',
   deliveries};
 })};
}

export function createOwnerLinksHandler({authorize=isAuthorized,read=readOwnerLinks,env=process.env}={}){
 return async(req,res,{exact=null,query=req.query||{}}={})=>{
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Vary','Cookie');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!authorize(req))return res.status(401).json({ok:false,error:'Přihlaste se do Messengeru.'});
  if(req.method!=='GET')return res.status(405).json({ok:false});
  if(env.VERCEL_ENV&&env.VERCEL_ENV!=='production')return res.status(403).json({ok:false,error:'Přehled je dostupný jen v produkci.'});
  const voucher=query.voucher===undefined?'':query.voucher,page=query.page===undefined?'0':query.page;
  if((exact&&(!validRef(exact)||Object.keys(exact).some(k=>!fields.includes(k))))||
    typeof voucher!=='string'||voucher.length>80||typeof page!=='string'||!/^\d{1,5}$/.test(page))
   return res.status(400).json({ok:false,error:'Neplatný filtr přehledu.'});
  try{return res.status(200).json({ok:true,...await read({voucher:voucher.trim().toUpperCase(),page:Number(page),exact}),
   deployment:env.VERCEL_GIT_COMMIT_SHA||null});}
  catch{return res.status(503).json({ok:false,error:'Přehled odkazů teď nelze načíst.'});}
 };
}
