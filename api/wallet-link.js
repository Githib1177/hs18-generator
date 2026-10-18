import {createHash,randomUUID} from 'node:crypto';
import {isAuthorized} from './_wallet-auth.js';
import {createWalletHandler} from './wallet.js';
import {walletConfig,getWalletObject} from '../lib/google-wallet.js';
import {alfredDetails} from '../lib/wallet-pass.js';
import {guestToken,verifyGuestToken} from '../lib/wallet-guest-token.js';
import {redis,stayKey} from '../lib/wallet-store.js';
const linkKey=id=>'hs18:guest-link:'+id;
const auditKey='hs18:wallet-link:v1:events';
const attachScript="if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL');redis.call('HSET',KEYS[2],ARGV[3],ARGV[4]);return 1";
export function pragueTime(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Neplatný termín pobytu.');
 const target=Date.parse(value+'Z');if(!Number.isFinite(target))throw Error('Neplatný termín pobytu.');
 const format=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const local=t=>format.format(new Date(t)).replace(' ','T');let time=target;
 for(let i=0;i<3;i++)time+=target-Date.parse(local(time)+'Z');
 if(local(time)!==value||local(time-3600000)===value||local(time+3600000)===value)throw Error('Termín je neplatný nebo nejednoznačný kvůli změně času.');return time;
}
function parseLinks(raw){
 let urls;try{urls=JSON.parse(raw);}catch{throw Error('Odkaz nelze přečíst.');}let context;
 for(const lang of ['cs','en','de']){
  const u=new URL(urls[lang]);if(u.origin!=='https://hillside18-guest-portal.vercel.app'||u.pathname!=='/'||u.username||u.password||!['',lang].includes(u.searchParams.get('lang')||''))throw Error('Odkaz nevede na správný portál.');
  for(const field of ['alf','apt','door','done','paid','unpaid'])if(u.searchParams.getAll(field).length>1)throw Error('Odkaz obsahuje nejednoznačné údaje.');
  const alf=alfredDetails(u.searchParams.get('alf')).code,apt=u.searchParams.get('apt'),pin=u.searchParams.get('door');
  if(!/^[1-4]$/.test(apt||'')||!/^\d{4}$/.test(pin||'')||u.searchParams.get('done')!=='1'||u.searchParams.has('paid')||u.searchParams.has('unpaid'))throw Error('Vyžadován dokončený pobyt s ověřeným PINem.');
  const current={alf,apt,pin};if(context&&JSON.stringify(context)!==JSON.stringify(current))throw Error('Jazykové odkazy patří různým pobytům.');context=current;
 }
 return {urls,context};
}
const capture=()=>({code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
export function createWalletLinkHandler({store=redis,getConfig=walletConfig,getObject=getWalletObject,createCard}={}){
 const provision=createCard||createWalletHandler({store,getConfig});
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='POST'&&process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')return res.status(403).json({ok:false,error:'Testovací verze karty ani odkazy nemění.'});
  if(!isAuthorized(req))return res.status(401).json({ok:false,error:'Přihlaste se ke správě Wallet v Messengeru.'});
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Nepovolená metoda.'});
  try{
   const id=req.method==='GET'?req.query?.id:req.body?.id;if(typeof id!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(id))return res.status(400).json({ok:false,error:'Neplatný krátký odkaz.'});
   const raw=await store(['GET',linkKey(id)]);if(!raw)return res.status(404).json({ok:false,error:'Krátký odkaz nebyl nalezen.'});
   const {urls,context}=parseLinks(raw),config=getConfig(),hash=createHash('sha256').update(context.alf).digest('hex');
   let recordRaw=await store(['GET',stayKey(hash)]),record=recordRaw?JSON.parse(recordRaw):null;
   if(record?.busyUntil>Date.now()||record&&(!['ready','pending'].includes(record.state)))return res.status(409).json({ok:false,error:'Karta není v dokončeném stavu. Nejprve ověřte předchozí pokus.'});
   for(const lang of ['cs','en','de']){const previousToken=new URLSearchParams(new URL(urls[lang]).hash.slice(1)).get('wallet');if(previousToken&&(!record||verifyGuestToken(previousToken,config)!==record.passId))return res.status(409).json({ok:false,error:'Krátký odkaz obsahuje jinou nebo nedohledanou kartu. Změna zastavena.'});}
   let object=record?await getObject(config.issuerId+'.'+record.passId,config):null;
   const sameObject=o=>o?.textModulesData?.find(x=>x.id==='apartment')?.body===context.apt&&o?.textModulesData?.find(x=>x.id==='alfred')?.body==='https://alfred.previo.app/login/'+context.alf;
   if(object&&!sameObject(object))return res.status(409).json({ok:false,error:'Existující karta neodpovídá apartmánu a Alfrédovi.'});
   const linked=r=>['cs','en','de'].every(lang=>verifyGuestToken(new URLSearchParams(new URL(urls[lang]).hash.slice(1)).get('wallet'),config)===r?.passId);
   if(req.method==='GET')return res.status(200).json({ok:true,exists:!!object,recordExists:!!record,linked:!!record&&linked(record),context,state:record?.state||null,startsAt:record?.startsAt?new Date(record.startsAt).toISOString():null,expiresAt:record?.expiresAt?new Date(record.expiresAt).toISOString():null,hasUsers:typeof object?.hasUsers==='boolean'?object.hasUsers:null,pinOnCard:object?.textModulesData?.find(x=>x.id==='door')?.body===context.pin});
   const body=req.body||{};if(body.operatorConfirmed!==true||body.pinAlreadyShared!==true||body.expectedAlfred!==context.alf||body.expectedApartment!==context.apt||body.expectedPin!==context.pin)return res.status(400).json({ok:false,error:'Potvrďte správný pobyt, PIN, check-in a úhradu.'});
   const startsAt=pragueTime(body.arrivalLocal),expiresAt=pragueTime(body.departureLocal);
   if(startsAt>=expiresAt||expiresAt<=Date.now()||expiresAt>Date.now()+366*86400000)return res.status(400).json({ok:false,error:'Neplatná platnost pobytu.'});
   let created=false;
   if(!object){
    const result=capture();await provision({...req,method:'POST',body:{action:'create',alfred:context.alf,apartment:context.apt,doorCode:context.pin,checkinComplete:true,paymentComplete:true,accessConfirmed:true,operatorConfirmed:true,lang:'de',releaseAt:new Date(Date.now()-1000).toISOString(),startsAt:new Date(startsAt).toISOString(),expiresAt:new Date(expiresAt).toISOString()}},result);
    if(result.code!==200||!result.body?.passId)return res.status(result.code>=400?result.code:503).json({ok:false,error:result.body?.error||'Google nepotvrdil vytvoření karty.'});
    recordRaw=await store(['GET',stayKey(hash)]);record=recordRaw?JSON.parse(recordRaw):null;
    if(!record||record.state!=='ready'||record.busyUntil>Date.now())throw Error('Karta není připravená.');
    object=await getObject(config.issuerId+'.'+record.passId,config);created=true;
   }
   if(!object||!sameObject(object)||object.textModulesData?.find(x=>x.id==='door')?.body!==context.pin||Date.parse(object.validTimeInterval?.start?.date)!==startsAt||Date.parse(object.validTimeInterval?.end?.date)!==expiresAt)return res.status(409).json({ok:false,error:'Karta nemá očekávaný PIN nebo platnost pobytu. Odkaz nebyl změněn.'});
   const token=guestToken(record.passId,config),next={};
   for(const lang of ['cs','en','de']){const u=new URL(urls[lang]),fragment=new URLSearchParams(u.hash.slice(1)),old=fragment.get('wallet');if(old&&verifyGuestToken(old,config)!==record.passId)return res.status(409).json({ok:false,error:'Odkaz už obsahuje jinou kartu. Změna zastavena.'});fragment.set('wallet',token);u.hash=fragment.toString();next[lang]=u.href;}
   if(!linked(record)){
    const audit=JSON.stringify({at:new Date().toISOString(),shortIdHash:createHash('sha256').update(id).digest('hex'),passId:record.passId,created});
    if(await store(['EVAL',attachScript,2,linkKey(id),auditKey,raw,JSON.stringify(next),randomUUID(),audit])!==1)return res.status(409).json({ok:false,error:'Krátký odkaz se mezitím změnil. Kartu znovu ověřte; nevytvářejte další.'});
   }
   return res.status(200).json({ok:true,created,exists:true,linked:true,state:record.state,startsAt:new Date(startsAt).toISOString(),expiresAt:new Date(expiresAt).toISOString(),pinOnCard:true,hasUsers:typeof object.hasUsers==='boolean'?object.hasUsers:null,messagesSent:0});
  }catch(error){return res.status(503).json({ok:false,error:error.message||'Wallet nelze ověřit.'});}
 };
}
export default createWalletLinkHandler();
