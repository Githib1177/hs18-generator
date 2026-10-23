const crypto=require('node:crypto');
const {redis,EVENTS,hash,isDefinitiveRejection,isRejectedEvent}=require('./registry.cjs');
const WINDOW=5*60*1000;
function signature(context,message,numbers,expiry,nonce){
 const secret=process.env.HISTORY_ACCESS_KEY;if(!secret)throw new Error('Confirmation unavailable');
 return crypto.createHmac('sha256',secret).update(JSON.stringify([context.stay,context.stage,context.apt,message,[...numbers].sort(),expiry,nonce])).digest('hex');
}
function issue(context,message,numbers){const expiry=Date.now()+WINDOW,nonce=crypto.randomUUID();return `${expiry}.${nonce}.${signature(context,message,numbers,expiry,nonce)}`;}
function verify(token,context,message,numbers){
 if(typeof token!=='string'||token.length>200)return false;
 const [raw,nonce,sig,...extra]=token.split('.'),expiry=Number(raw);
 if(extra.length||!Number.isSafeInteger(expiry)||expiry<Date.now()||expiry>Date.now()+WINDOW||!/^[a-f0-9-]{36}$/.test(nonce||'')||!/^[a-f0-9]{64}$/.test(sig||''))return false;
 const expected=signature(context,message,numbers,expiry,nonce);return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));
}
async function assess(context){
 const entries=(await redis(['HVALS',EVENTS])||[]).map(x=>JSON.parse(x)).filter(x=>x.stay===context.stay&&x.stage===context.stage);
 const raw=await redis(['GET',context.key]);
 const current=raw?JSON.parse(raw):null;
 const claimUncertain=current&&(['pending','unknown'].includes(current.status)||current.status==='rejected'&&!entries.some(x=>x.id===current.id&&isRejectedEvent(x)));
 const uncertain=claimUncertain||entries.some(x=>!['reported_success','accepted','rejected'].includes(x.status)||x.status==='rejected'&&!isRejectedEvent(x)||(x.results||[]).some(r=>r.err===null||r.ok!==true&&!isDefinitiveRejection(r)));
 return {allowed:!uncertain,reason:uncertain?'Předchozí pokus nemá jistý výsledek. Nejprve ověřte SMS bránu; ruční opakování je zatím blokované.':'Stejná zpráva již byla odeslána. Vědomé ruční opakování vyžaduje nové potvrzení.'};
}
function key(token){return 'hs18:registry:v1:manual-repeat:'+hash(token);}
module.exports={issue,verify,assess,key};
