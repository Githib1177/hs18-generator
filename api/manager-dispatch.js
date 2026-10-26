import {randomUUID} from 'node:crypto';
import {isAuthorized} from './_wallet-auth.js';
import wallet from './wallet.js';
import guestLink from './guest-link.js';
import sendSms, {prepareText,smsLength} from './send-sms.js';
import history from './history.js';
import registry from '../lib/registry.cjs';
import {alfredDetails} from '../lib/wallet-pass.js';
import {redis,passKey,lockKey} from '../lib/wallet-store.js';

const prefix='hs18:manager-dispatch:v1:';
const invoke=async(handler,req)=>{
 const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
 await handler(req,res);return res;
};

// The manager still owns reservation verification, bans, leases and reserve/complete.
// This authenticated adapter replaces browser dialogs, not those business guards.
export function createManagerDispatchHandler({store=redis,walletHandler=wallet,linkHandler=guestLink,smsHandler=sendSms,historyHandler=history,check=registry.checkContext}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!isAuthorized(req))return res.status(401).json({error:'Přihlaste se ke správě Wallet.'});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')return res.status(403).json({error:'Preview neprovádí provozní zápisy.'});
  const b=req.body||{},headers={...req.headers,'x-history-key':process.env.HISTORY_ACCESS_KEY};
  if(!headers['x-history-key'])return res.status(503).json({error:'Chybí konfigurace společné historie.'});
  let heldLock,lockClaim;
  try{
   if(b.action==='prepare'){
    if(b.operatorConfirmed!==true)return res.status(400).json({error:'Chybí potvrzení ověřených podkladů manažerem.'});
    const alf=alfredDetails(b.alf),context={alf:alf.code,apt:String(b.apt),state:b.state};
    const c=registry.contextOf({context});
    if((await check(c)).duplicate)return res.status(409).json({error:'Původní pokus už existuje. Nejprve ověřte jeho výsledek.'});
    if(!['cs','en','de'].includes(b.lang))return res.status(400).json({error:'Neplatný jazyk.'});
    const releaseAt=Date.parse(b.releaseAt),expiresAt=Date.parse(b.expiresAt),startsAt=Date.parse(b.startsAt);
    if(![releaseAt,expiresAt,startsAt].every(Number.isFinite)||releaseAt>=expiresAt||startsAt>=expiresAt||expiresAt<=Date.now())return res.status(400).json({error:'Chybí ověřená platnost pobytu a zveřejnění přístupu.'});
    const done=b.state==='done';
    if(done&&b.accessConfirmed!==true)return res.status(400).json({error:'Chybí ověření připravených přístupů.'});
    const w=await invoke(walletHandler,{...req,headers:req.headers,body:{action:'create',alfred:alf.code,apartment:context.apt,lang:b.lang,
     checkinComplete:['unpaid','done'].includes(b.state),paymentComplete:['paid','done'].includes(b.state),
     accessConfirmed:done&&b.accessConfirmed===true,operatorConfirmed:true,doorCode:done?b.door:'',
     releaseAt:b.releaseAt,expiresAt:b.expiresAt,startsAt:b.startsAt}});
    if(w.code!==200)return res.status(w.code).json(w.body);
    if(!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(w.body.guestToken||'')||w.body.state!==(done?'ready':'pending'))return res.status(503).json({error:'Wallet nepotvrdila očekávaný stav. SMS nebyla odeslána.'});
    const targets={};
    for(const lang of ['cs','en','de']){
     const u=new URL('https://hillside18-guest-portal.vercel.app/');
     u.searchParams.set('apt',context.apt);u.searchParams.set('alf',alf.url);
     if(lang!=='cs')u.searchParams.set('lang',lang);
     if(b.state!=='none')u.searchParams.set(b.state,'1');
     if(done)u.searchParams.set('door',b.door);
     u.hash=new URLSearchParams({apt:context.apt,wallet:w.body.guestToken}).toString();targets[lang]=u.href;
    }
    const link=await invoke(linkHandler,{...req,headers:req.headers,body:{urls:targets}});
    if(link.code!==200)return res.status(link.code).json(link.body);
    const id=randomUUID(),record={id,createdAt:Date.now(),context,passId:w.body.passId,walletRevision:w.body.revision,walletState:w.body.state,urls:link.body.urls,lang:b.lang,
     history:{guestName:String(b.guestName||'').slice(0,120),alf:alf.code,apt:context.apt,state:b.state,door:done?b.door:'',lang:b.lang,baseUrl:'https://hillside18-guest-portal.vercel.app/'}};
    if(await store(['SET',prefix+id,JSON.stringify(record),'EX',180*86400,'NX'])!=='OK')throw Error('Preparation not saved');
    return res.status(200).json({ok:true,id,urls:record.urls,walletState:record.walletState});
   }
   if(!['send','status','reconcile'].includes(b.action)||!/^[0-9a-f-]{36}$/.test(b.id||''))return res.status(400).json({error:'Neplatná operace.'});
   const raw=await store(['GET',prefix+b.id]);if(!raw)return res.status(404).json({error:'Příprava nebyla nalezena.'});
   const record=JSON.parse(raw),attemptKey=prefix+b.id+':attempt',receiptKey=prefix+b.id+':receipt';
   let receipt=JSON.parse(await store(['GET',receiptKey])||'null');
   if(b.action==='send'&&!receipt){
    if(await store(['GET',attemptKey]))return res.status(409).json({ok:false,status:'unknown',error:'Pokus již začal. Ověřte bránu, neopakujte send.'});
    if(b.operatorConfirmed!==true||Date.now()-record.createdAt>15*60000)return res.status(409).json({error:'Znovu ověřte aktuální podklady a připravte odkaz.'});
    const phone=String(b.to||'').replace(/[\s()-]/g,'').replace(/^00/,'+'),text=prepareText(b.text);
    if(!/^\+\d{8,15}$/.test(phone)||!text||smsLength(text)>459)return res.status(400).json({error:'Neplatný příjemce nebo SMS.'});
    const links=text.match(/https?:\/\/\S+/g)||[];
    if(links.length!==1||links[0]!==record.urls[record.lang])return res.status(400).json({error:'SMS musí obsahovat právě připravený odkaz ve správném jazyce.'});
    const key=lockKey(registry.contextOf({context:record.context}).stay),claim=randomUUID();
    if(await store(['SET',key,claim,'NX','PX',120000])!=='OK')return res.status(409).json({error:'Karta je právě používána. Nic nebylo odesláno.'});
    heldLock=key;lockClaim=claim;
    const pass=JSON.parse(await store(['GET',passKey(record.passId)])||'null');
    if(!pass||!record.walletRevision||pass.revision!==record.walletRevision||pass.state!==record.walletState||pass.busyUntil>Date.now()||pass.expiresAt<=Date.now())return res.status(409).json({error:'Karta se změnila nebo není ověřená a platná. Nic nebylo odesláno.'});
    if(await store(['SET',attemptKey,JSON.stringify({at:Date.now()}),'NX'])!=='OK')return res.status(409).json({status:'pending',error:'Pokus již běží.'});
    const sent=await invoke(smsHandler,{...req,headers,body:{to:phone,text,context:record.context,mode:'automatic'}});
    receipt={http:sent.code,result:sent.body,history:{...record.history,phone},historySaved:false};
    // Persist the receipt BEFORE history. A lost response never causes a second SMS.
    await store(['SET',receiptKey,JSON.stringify(receipt),'EX',180*86400]);
   }
   if(!receipt)return res.status(200).json({ok:false,status:await store(['GET',attemptKey])?'unknown':'prepared'});
   if(b.action!=='status'&&receipt.result?.ok&&!receipt.historySaved){
    const saved=await invoke(historyHandler,{...req,headers,body:receipt.history});
    if(saved.code===200&&saved.body?.ok){receipt.historySaved=true;await store(['SET',receiptKey,JSON.stringify(receipt),'EX',180*86400]);}
   }
   return res.status(200).json({ok:receipt.result?.ok===true,status:receipt.result?.ok?'accepted':'unconfirmed',providerHttp:receipt.http,result:receipt.result,historySaved:receipt.historySaved});
  }catch{return res.status(503).json({ok:false,error:'Postup se nepodařilo dokončit. Ověřte status a původní výsledek; SMS neopakujte naslepo.'});}
  finally{if(heldLock)try{await store(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,heldLock,lockClaim]);}catch{}}
 };
}
export default createManagerDispatchHandler();
