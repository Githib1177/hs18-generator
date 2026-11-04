import {randomUUID} from 'node:crypto';
import {isAuthorized} from '../api/_wallet-auth.js';
import {createPrevioReader} from '../lib/previo-reservations.js';
import registry from '../lib/registry.cjs';
import {redis,stayKey,passKey,lockKey} from '../lib/wallet-store.js';
import {walletConfig,getWalletObject,putWalletObject} from '../lib/google-wallet.js';
import {cancellationKey} from '../lib/cancellation-guard.js';

const fields=['id','resId','voucher','apt','arrival','departure'];
const decode=raw=>raw?JSON.parse(raw):null;
const expired=o=>o===null||(o.state==='EXPIRED'&&!o.textModulesData?.some(x=>x.id==='door')&&!o.barcode&&!o.linksModuleData&&o.header?.defaultValue?.value==='Pobyt zrušen');
export function createCancellationHandler({authorize=isAuthorized,reader=createPrevioReader(),store=redis,getConfig=walletConfig,getObject=getWalletObject,putObject=putWalletObject,env=process.env,now=()=>new Date()}={}){
 return async(req,res,readQuery=req.query)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');
  if(!authorize(req))return res.status(401).json({ok:false,error:'Přihlaste se do Messengeru.'});
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false});
  if(req.method==='POST'&&env.VERCEL_ENV&&env.VERCEL_ENV!=='production')return res.status(403).json({ok:false,error:'Preview nemění provoz.'});
  const q=req.method==='GET'?readQuery:req.body?.reservation;
  if(!q||fields.some(k=>typeof q[k]!=='string'||!q[k]||q[k].length>80)||Object.keys(q).some(k=>!fields.includes(k)))return res.status(400).json({ok:false,error:'Je nutná přesná identita pobytu.'});
  let lock,claim;
  try{
   const source=await reader.cancelledDetail(q);
   if(source.hotelId!=='763519'||source.statusId!=='7'||fields.some(k=>source[k]!==q[k])||!source.alf)throw Error('PMS identity mismatch');
   const stay=registry.hash(registry.normalizeAlf(source.alf)),key=cancellationKey(stay),identityHash=registry.hash(JSON.stringify(fields.map(k=>q[k])));
   let record=decode(await store(['GET',key]));
   if(record&&record.identityHash!==identityHash)throw Error('Cancellation reference changed');
   if(req.method==='POST'){
    lock=lockKey(stay);claim=randomUUID();
    if(await store(['SET',lock,claim,'NX','PX',120000])!=='OK'){claim=null;return res.status(409).json({ok:false,status:'busy'});}
    // Durable barrier first: all future preparation, claims and short-link opens stop.
    if(!record){
     const intent={version:1,identityHash,stay,state:'pending',startedAt:now().toISOString(),walletAttempted:false};
     await store(['SET',key,JSON.stringify(intent),'NX']);record=decode(await store(['GET',key]));
     if(!record||record.identityHash!==identityHash)throw Error('Barrier not verified');
    }
   }
   const pending=(await store(['HVALS',registry.EVENTS])||[]).map(decode).filter(x=>x.stay===stay&&!['accepted','rejected','reported_success'].includes(x.status));
   for(const state of ['none','paid','unpaid','done']){
    const context=registry.contextOf({context:{alf:source.alf,apt:source.apt,state}}),attempt=decode(await store(['GET',context.key]));
    if(attempt&&!['accepted','rejected','reported_success'].includes(attempt.status))pending.push(attempt);
   }
   const pass=decode(await store(['GET',stayKey(stay)]));
   let walletStatus='no_current_reference_record',object=null,config;
   if(pass){
    if(!pass.passId)throw Error('Pass mapping incomplete');
    config=getConfig();object=await getObject(config.issuerId+'.'+pass.passId,config);
    if(object&&object.id!==config.issuerId+'.'+pass.passId)throw Error('Wrong provider object');
    walletStatus=expired(object)?(object?'expired_verified':'absent_at_provider_verified'):'active';
   }
   if(req.method==='POST'&&pass&&walletStatus==='active'){
    // Ambiguous original updates or a previous expiration attempt are read-only reconciliation.
    if(record.walletAttempted||pass.busyUntil>now().getTime()||!['ready','pending'].includes(pass.state))return res.status(409).json({ok:false,status:'wallet_unknown',automaticRetry:false});
    record={...record,walletAttempted:true,passId:pass.passId};await store(['SET',key,JSON.stringify(record)]);
    const withdrawn={id:object.id,classId:object.classId,state:'EXPIRED',cardTitle:object.cardTitle,header:{defaultValue:{language:'cs',value:'Pobyt zrušen'}},textModulesData:[],validTimeInterval:{end:{date:now().toISOString()}}};
    // Never create an object while cancelling; a lost response never triggers another PUT.
    await putObject(withdrawn,config,undefined,{allowCreate:false});
    object=await getObject(withdrawn.id,config);
    if(!expired(object))throw Error('Provider expiration readback missing');
    walletStatus=object?'expired_verified':'absent_at_provider_verified';
   }
   if(req.method==='POST'&&pass&&walletStatus!=='active'){
    const revoked={...pass,state:'revoked',busyUntil:0};
    const saved=await store(['EVAL',"if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2]);redis.call('SET',KEYS[3],ARGV[2]);return 1",3,lock,stayKey(stay),passKey(pass.passId),claim,JSON.stringify(revoked)]);
    if(saved!==1)throw Error('Wallet mapping changed');
   }
   const barrier=decode(await store(['GET',key]));
   const finalPass=pass?decode(await store(['GET',passKey(pass.passId)])):null;
   const complete=!!barrier&&barrier.identityHash===identityHash&&pending.length===0&&walletStatus!=='active'&&(!pass||finalPass?.state==='revoked');
   const proof={version:1,reservation:q,hotelId:'763519',statusId:'7',pmsObservedAt:source.observedAt,observedAt:now().toISOString(),identityHash,stayHash:stay,
    status:complete?'verified':'partial',messengerShortLinksBlocked:!!barrier,unsentArrivalMessagesSuppressed:!!barrier,
    walletStatus,walletSaveBlocked:!pass||finalPass?.state==='revoked',unresolvedSendAttempts:pending.length,
    scope:'exact_current_PMS_reference',historicalExpandedLinksErased:false,financialEffects:0,messagesSent:0,deployment:env.VERCEL_GIT_COMMIT_SHA||null};
   proof.evidenceHash=registry.hash(JSON.stringify(proof));
   if(req.method==='POST'&&complete)await store(['SET',key,JSON.stringify({...barrier,state:'verified',receipt:proof})]);
   return res.status(200).json({ok:complete,receipt:proof});
  }catch{return res.status(503).json({ok:false,status:'unverified',error:'Storno nebylo celé ověřeno. Ověřte původní výsledek; neobnovujte ani neopakujte nejasný zápis.'});}
  finally{if(lock&&claim)try{await store(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lock,claim]);}catch{}}
 };
}
export default createCancellationHandler();
