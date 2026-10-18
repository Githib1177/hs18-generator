import {createHash,randomUUID} from 'node:crypto';
import {isAuthorized} from './_wallet-auth.js';
import {walletConfig,putWalletObject,walletSaveUrl} from '../lib/google-wallet.js';
import {alfredDetails,buildWalletObject} from '../lib/wallet-pass.js';
import {guestToken} from '../lib/wallet-guest-token.js';
import {redis,stayKey,passKey,lockKey} from '../lib/wallet-store.js';
const commitScript="if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2]);redis.call('SET',KEYS[3],ARGV[2]);return 1";
export function createWalletHandler({store=redis,getConfig=walletConfig,putObject=putWalletObject,makeSaveUrl=walletSaveUrl}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!isAuthorized(req))return res.status(401).json({error:'Přihlaste se ke správě Wallet heslem Falconi Messengeru.'});
 if(req.method!=='POST')return res.status(405).json({error:'Nepovolená metoda.'});
 let hash,claim;
 try{
  const config=getConfig(),body=req.body||{},now=Date.now();
  if(body.operatorConfirmed!==true)return res.status(400).json({error:'Potvrďte správnost údajů pobytu.'});
  const alf=alfredDetails(body.alfred);
  if(!/^[1-4]$/.test(body.apartment))return res.status(400).json({error:'Vyberte apartmán 1 až 4.'});
  for(const field of ['checkinComplete','paymentComplete','accessConfirmed'])if(typeof body[field]!=='boolean')return res.status(400).json({error:'Chybí stav pobytu.'});
  if(body.checkinComplete&&body.paymentComplete&&(!body.accessConfirmed||!/^\d{4}$/.test(body.doorCode||'')))return res.status(400).json({error:'Potvrďte správný čtyřmístný kód dveří.'});
  hash=createHash('sha256').update(alf.code).digest('hex');claim=randomUUID();
  if(await store(['SET',lockKey(hash),claim,'NX','PX',120000])!=='OK'){claim=null;return res.status(409).json({error:'Karta se právě aktualizuje. Zkuste to za chvíli.'});}
  const raw=await store(['GET',stayKey(hash)]),previous=raw?JSON.parse(raw):null;
  const existing=body.action==='sync-existing';
  if(existing&&!previous)return res.status(200).json({skipped:true,reason:'no-card'});
  const expiresAt=existing?previous.expiresAt:Date.parse(body.expiresAt),releaseAt=existing?previous.releaseAt:Date.parse(body.releaseAt);
  if(!Number.isFinite(expiresAt)||!Number.isFinite(releaseAt)||releaseAt>=expiresAt||expiresAt<=now||expiresAt>now+366*86400000)return res.status(400).json({error:'Zadejte platný začátek přístupu a konec pobytu v části Wallet.'});
  if(body.checkinComplete&&body.paymentComplete&&releaseAt>now)return res.status(409).json({error:'Čas přístupu ještě nenastal. Vyčkejte, nebo opravte čas v části Wallet.'});
  const stay={passId:previous?.passId||randomUUID(),expiresAt,releaseAt};
  const {object,state}=buildWalletObject(stay,body,config,now);
  const record={...stay,state:null,busyUntil:now+120000};
  const write=async value=>{if(await store(['EVAL',commitScript,3,lockKey(hash),stayKey(hash),passKey(stay.passId),claim,JSON.stringify(value)])!==1)throw new Error('Kartu současně změnil jiný požadavek. Zkuste to znovu.');};
  await write(record);await putObject(object,config);await write({...record,state,busyUntil:0});
  return res.status(200).json({state,passId:stay.passId,guestToken:guestToken(stay.passId,config),saveUrl:makeSaveUrl(object.id,config)});
 }catch(error){return res.status(503).json({error:/^(Neplatný|Google|Wallet|Chybí)/.test(error.message||'')?error.message:'Kartu se nepodařilo aktualizovat. Zkuste to znovu; zpráva nebyla odeslána.'});}
 finally{if(hash&&claim)try{await store(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lockKey(hash),claim]);}catch{}}
};}
export default createWalletHandler();
