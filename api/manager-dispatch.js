import {randomUUID} from 'node:crypto';
import {isAuthorized} from './_wallet-auth.js';
import wallet from './wallet.js';
import guestLink from './guest-link.js';
import sendSms, {sendAuthorizedAttempt,prepareText,smsLength} from './send-sms.js';
import history from './history.js';
import registry from '../lib/registry.cjs';
import {alfredDetails} from '../lib/wallet-pass.js';
import {walletConfig,getWalletObject} from '../lib/google-wallet.js';
import {redis,passKey,lockKey} from '../lib/wallet-store.js';
import {digest,shortId,shortUrls,targets,recoverPreparation} from '../lib/dispatch-preparation.js';

const prefix='hs18:manager-dispatch:v1:',lifetime=180*86400;
const uuid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const fresh=value=>typeof value==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(value)&&Date.now()-Date.parse(value)>=0&&Date.now()-Date.parse(value)<=120000;
const invoke=async(handler,req,grant)=>{
 const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
 await handler(req,res,grant);return res;
};
function intended(b){
 const alf=alfredDetails(b.alf),context={alf:alf.code,apt:String(b.apt),state:b.state};
 const c=registry.contextOf({context});
 if(!['cs','en','de'].includes(b.lang))throw Error('Neplatný jazyk.');
 for(const v of [b.releaseAt,b.startsAt,b.expiresAt])if(typeof v!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(v))throw Error('Časy musí obsahovat pásmo.');
 const releaseAt=Date.parse(b.releaseAt),expiresAt=Date.parse(b.expiresAt),startsAt=Date.parse(b.startsAt);
 if(![releaseAt,expiresAt,startsAt].every(Number.isFinite)||releaseAt>=expiresAt||startsAt>=expiresAt||expiresAt<=Date.now())throw Error('Chybí ověřená platnost pobytu.');
 const done=b.state==='done';if(done&&(b.accessConfirmed!==true||!/^\d{4}$/.test(b.door||'')))throw Error('Chybí ověření připravených přístupů.');
 const walletBody={action:'create',alfred:alf.code,apartment:context.apt,lang:b.lang,checkinComplete:['unpaid','done'].includes(b.state),paymentComplete:['paid','done'].includes(b.state),accessConfirmed:done,operatorConfirmed:true,doorCode:done?b.door:'',releaseAt:b.releaseAt,expiresAt:b.expiresAt,startsAt:b.startsAt};
 const guestName=String(b.guestName||'').slice(0,120);
 return {context,stayHash:c.stay,walletBody,lang:b.lang,requestHash:digest({context,walletBody,guestName}),history:{guestName,alf:alf.code,apt:context.apt,state:b.state,door:done?b.door:'',lang:b.lang,baseUrl:'https://hillside18-guest-portal.vercel.app/'}};
}
export function createManagerDispatchHandler({store=redis,walletHandler=wallet,linkHandler=guestLink,smsHandler=sendSms,authorizedSmsHandler=sendAuthorizedAttempt,historyHandler=history,check=registry.checkContext,getConfig=walletConfig,getObject=getWalletObject}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!isAuthorized(req))return res.status(401).json({error:'Přihlaste se ke správě Wallet.'});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')return res.status(403).json({error:'Preview neprovádí provozní zápisy.'});
  const b=req.body||{},headers={...req.headers,'x-history-key':process.env.HISTORY_ACCESS_KEY};
  if(!headers['x-history-key'])return res.status(503).json({error:'Chybí konfigurace společné historie.'});
  const locks=[];
  async function hold(key){
   const existing=locks.find(x=>x.key===key);if(existing)return existing.claim;
   const claim=randomUUID();if(await store(['SET',key,claim,'NX','PX',120000])!=='OK')throw Object.assign(Error('Operace právě běží.'),{status:409});locks.push({key,claim});return claim;
  }
  const holdWallet=async record=>{record.recoveryLockClaim=await hold(lockKey(record.stayHash||registry.contextOf({context:record.context}).stay));};
  const save=record=>store(['SET',prefix+record.id,JSON.stringify(record),'EX',lifetime]);
  const recover=(record,reconcile=false)=>recoverPreparation(record,{store,getConfig,getObject,reconcile,holdWallet});
  const prepared=r=>({ok:true,status:'prepared',id:r.id,urls:r.urls,walletState:r.walletState,recovery:r.recovery});
  try{
   if(b.action==='prepare'){
    if(b.operatorConfirmed!==true)return res.status(400).json({error:'Chybí potvrzení ověřených podkladů manažerem.'});
    let input;try{input=intended(b);}catch(e){return res.status(400).json({error:e.message});}
    const id=b.preparationId===undefined?randomUUID():b.preparationId;if(!uuid(id))return res.status(400).json({error:'Neplatné stabilní ID přípravy.'});
    await hold(prefix+id+':prepare-lock');
    const oldRaw=await store(['GET',prefix+id]);let record=oldRaw?JSON.parse(oldRaw):null;
    if(record){
     if(record.requestHash!==input.requestHash)return res.status(409).json({error:'Stejné ID přípravy nesmí změnit pobyt ani obsah.'});
     record=await recover(record);
     if(record.phase==='prepared')return res.status(200).json(prepared(record));
     if(Date.now()-record.createdAt>900000&&!fresh(b.sourceCheckedAt))return res.status(409).json({status:'preparation_unknown',id,error:'Starou přípravu dokončete jen po novém ověření aktuálních podkladů.'});
     if(!['wallet_ready'].includes(record.phase)&&record.recovery!=='wallet_not_started')return res.status(202).json({ok:false,status:'preparation_unknown',id,recovery:record.recovery});
    }else{
     if((await check(registry.contextOf({context:input.context}))).duplicate)return res.status(409).json({error:'Původní pokus už existuje. Nejprve ověřte jeho výsledek.'});
     record={...input,id,shortId:shortId(id),createdAt:Date.now(),phase:'wallet_pending',contractVersion:b.preparationId?2:1};
     if(await store(['SET',prefix+id,JSON.stringify(record),'EX',lifetime,'NX'])!=='OK')throw Error('Preparation intent not saved');
    }
    if(record.phase!=='wallet_ready'){
     const w=await invoke(walletHandler,{...req,headers:req.headers,body:record.walletBody});
     if(w.code!==200)return res.status(w.code).json({...w.body,id,status:'preparation_unknown'});
     if(!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(w.body.guestToken||'')||w.body.state!==(record.context.state==='done'?'ready':'pending')||!w.body.revision)throw Error('Google nepotvrdil správný stav karty.');
     record={...record,phase:'wallet_ready',passId:w.body.passId,walletRevision:w.body.revision,walletState:w.body.state,targets:targets(record,w.body.guestToken)};await save(record);
    }
    const link=await invoke(linkHandler,{...req,headers:req.headers,body:{id:record.shortId,urls:record.targets}});
    if(link.code!==200)return res.status(link.code).json({...link.body,id,status:'preparation_unknown'});
    record={...record,phase:'prepared',urls:link.body.urls};await save(record);return res.status(200).json(prepared(record));
   }
   if(!['send','retry','owner-send','status','reconcile','reconcile-prepare'].includes(b.action)||!uuid(b.id))return res.status(400).json({error:'Neplatná operace.'});
   const raw=await store(['GET',prefix+b.id]);if(!raw)return res.status(404).json({error:'Příprava nebyla nalezena.'});
   let record=await recover(JSON.parse(raw),b.action==='reconcile-prepare');
   if(b.action==='reconcile-prepare'){
    if(record.phase==='prepared'||record.phase==='wallet_ready'){await save(record);return res.status(200).json(record.phase==='prepared'?prepared(record):{ok:false,status:'wallet_ready_link_missing',id:record.id,recovery:record.recovery});}
    return res.status(202).json({ok:false,status:'preparation_unknown',id:record.id,recovery:record.recovery});
   }
   if(record.walletBody&&record.phase!=='prepared')return res.status(202).json({ok:false,status:'preparation_unknown',id:record.id,recovery:record.recovery});
   const context=registry.contextOf({context:record.context}),originalKey=prefix+b.id,rootReceipt=JSON.parse(await store(['GET',originalKey+':receipt'])||'null');
   const kind=b.action==='retry'?'retry':b.action==='owner-send'?'owner':b.attemptKind;
   if(kind!==undefined&&!['retry','owner'].includes(kind))return res.status(400).json({error:'Neplatný druh pokusu.'});
   const ownerId=kind==='owner'?b.recheck?.grantId||b.grantId:null;
   if(kind==='owner'&&(typeof ownerId!=='string'||ownerId.length<8||ownerId.length>200))return res.status(400).json({error:'Chybí stabilní konkrétní pokyn vlastníka.'});
   const authorizationHash=kind==='owner'?digest(ownerId):null;
   const remoteBase=kind==='retry'?prefix+'retry:'+digest(context.key):kind==='owner'?prefix+'owner:'+digest(context.key)+':'+authorizationHash:originalKey;
   const attemptKey=remoteBase+':attempt',receiptKey=remoteBase+':receipt';let receipt=JSON.parse(await store(['GET',receiptKey])||'null');
   const sending=['send','retry','owner-send'].includes(b.action);
   if(sending&&!receipt){
    if(await store(['GET',attemptKey]))return res.status(409).json({ok:false,status:'unknown',error:'Pokus již začal. Ověřte bránu, neopakujte send.'});
    if(b.operatorConfirmed!==true||(!kind&&Date.now()-record.createdAt>900000&&!fresh(b.sourceCheckedAt)))return res.status(409).json({error:'Znovu ověřte aktuální podklady.'});
    if(!kind&&record.contractVersion===2&&(!hex(b.bindingHash)||typeof b.operationId!=='string'||!b.operationId))return res.status(400).json({error:'Chybí původní rezervovaný SMS_SEND a jeho binding.'});
    const phone=String(b.to||'').replace(/[\s()-]/g,'').replace(/^00/,'+'),text=prepareText(b.text);
    if(!/^\+\d{8,15}$/.test(phone)||!text||smsLength(text)>459)return res.status(400).json({error:'Neplatný příjemce nebo SMS.'});
    const links=text.match(/https?:\/\/\S+/g)||[];
    if(links.length!==1||links[0]!==record.urls[record.lang])return res.status(400).json({error:'SMS musí obsahovat právě připravený odkaz ve správném jazyce.'});
    await holdWallet(record);
    const pass=JSON.parse(await store(['GET',passKey(record.passId)])||'null');
    if(!pass||!record.walletRevision||pass.revision!==record.walletRevision||pass.state!==record.walletState||pass.busyUntil>Date.now()||pass.expiresAt<=Date.now())return res.status(409).json({error:'Karta se změnila nebo není ověřená a platná. Nic nebylo odesláno.'});
    let grant=null;
    if(kind){
     const proof=b.recheck||{},originalAttempt=JSON.parse(await store(['GET',originalKey+':attempt'])||'null'),origin=rootReceipt||originalAttempt;
     if(!origin||!origin.operationId||!origin.bindingHash||proof.originalOperationId!==origin.operationId||proof.bindingHash!==origin.bindingHash||!hex(proof.bindingHash)||!hex(proof.evidenceHash)||!fresh(proof.checkedAt)||typeof proof.operationId!=='string'||!proof.operationId||origin.messageHash!==digest(text)||origin.recipientHash!==digest(phone))return res.status(409).json({error:'Chybí čerstvý odpovídající původní guard/reconcile doklad.'});
     if(kind==='retry'){
      if(proof.kind!=='local_sms_retry'||proof.noConfirmedSend!==true||await store(['GET',prefix+'owner:'+digest(context.key)]))return res.status(409).json({error:'Automatický opravný pokus není povolen.'});
      if(rootReceipt?.result?.ok)return res.status(409).json({error:'Původní SMS již byla přijata.'});
      if(!rootReceipt&&Date.now()-originalAttempt.at<120000)return res.status(409).json({error:'Původní serverový pokus ještě nemusí být ukončen.'});
      const entries=(await store(['HVALS',registry.EVENTS])||[]).map(x=>JSON.parse(x));
      if(entries.some(x=>x.stay===context.stay&&x.stage===context.stage&&['accepted','reported_success'].includes(x.status)))return res.status(409).json({error:'Sdílená historie potvrzuje odeslání. Druhý automatický pokus je zakázaný.'});
     }else if(proof.kind!=='owner_sms'||!fresh(proof.checkedAt)||!Number.isFinite(Date.parse(proof.expiresAt))||Date.parse(proof.expiresAt)<=Date.now())return res.status(409).json({error:'Konkrétní pokyn vlastníka není platný.'});
     const authHash=kind==='owner'?authorizationHash:digest([proof.originalOperationId,proof.bindingHash,'retry1']);
     grant={kind,originalKey:context.key,key:context.key+(kind==='retry'?':retry1':':owner:'+authHash),authorizationHash:authHash};
    }
    const meta={at:Date.now(),operationId:kind?b.recheck.operationId:b.operationId,bindingHash:kind?b.recheck.bindingHash:b.bindingHash,messageHash:digest(text),recipientHash:digest(phone)};
    if(await store(['SET',attemptKey,JSON.stringify(meta),'NX'])!=='OK')return res.status(409).json({status:'pending',error:'Pokus již běží.'});
    if(kind==='owner')await store(['SET',prefix+'owner:'+digest(context.key),authorizationHash]);
    const sent=await invoke(kind?authorizedSmsHandler:smsHandler,{...req,headers,body:{to:phone,text,context:record.context,mode:kind==='owner'?'owner':'automatic'}},grant);
    receipt={...meta,http:sent.code,result:sent.body,history:{...record.history,phone},historySaved:false};await store(['SET',receiptKey,JSON.stringify(receipt),'EX',lifetime]);
   }
   if(!receipt){const started=await store(['GET',attemptKey]);return res.status(200).json(!started&&!kind?prepared(record):{ok:false,status:started?'unknown':'prepared',id:record.id});}
   if(b.action!=='status'&&receipt.result?.ok&&!receipt.historySaved){
    const saved=await invoke(historyHandler,{...req,headers,body:receipt.history});
    if(saved.code===200&&saved.body?.ok){receipt.historySaved=true;await store(['SET',receiptKey,JSON.stringify(receipt),'EX',lifetime]);}
   }
   return res.status(200).json({ok:receipt.result?.ok===true,status:receipt.result?.ok?'accepted':'unconfirmed',providerHttp:receipt.http,result:receipt.result,historySaved:receipt.historySaved,operationId:receipt.operationId});
  }catch(error){return res.status(error.status===409?409:503).json({ok:false,error:error.status===409?'Původní operace ještě běží. Vyčkejte na její výsledek.':'Postup se nepodařilo dokončit. Ověřte původní status; nic neopakujte naslepo.'});}
  finally{for(const {key,claim} of locks.reverse())try{await store(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,key,claim]);}catch{}}
 };
}
export default createManagerDispatchHandler();
