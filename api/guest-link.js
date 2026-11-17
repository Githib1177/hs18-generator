import {randomBytes} from 'node:crypto';
import {isAuthorized} from './_wallet-auth.js';
import {isAuthenticatedManager} from '../lib/hall3000-manager-auth.js';
import {alfredDetails} from '../lib/wallet-pass.js';
import {redis} from '../lib/wallet-store.js';
import {assertActiveReference,urlStay} from '../lib/cancellation-guard.js';
import {createPrevioReader} from '../lib/previo-reservations.js';
import {guestReferenceKey,guestReference,bindGuestReference,liveDestination} from '../lib/live-guest-link.js';
const prefix='hs18:guest-link:';
const internalLink=Symbol('manager preparation');
export const fromManagerPreparation=req=>({...req,[internalLink]:true});
const lifetime=180*86400;
const origin='https://hillside18-guest-portal.vercel.app';
const cancelledMessage={
 cs:'Tato rezervace byla zrušena. Odkaz již není platný. V případě dotazů nás kontaktujte na +420 840 113 114.',
 en:'This reservation has been cancelled. The link is no longer valid. For questions, contact us at +420 840 113 114.',
 de:'Diese Reservierung wurde storniert. Der Link ist nicht mehr gültig. Bei Fragen erreichen Sie uns unter +420 840 113 114.'
};
function destination(value,lang){
 if(typeof value!=='string'||value.length>2048)throw Error('Invalid URL');
 const url=new URL(value);
 if(url.origin!==origin||url.pathname!=='/'||url.username||url.password||!['',lang].includes(url.searchParams.get('lang')||'')||! /^[1-4]$/.test(url.searchParams.get('apt')||''))throw Error('Invalid destination');
 if(url.searchParams.has('door')&&(url.searchParams.get('done')!=='1'||url.searchParams.has('unpaid')||url.searchParams.has('paid')||!/^\d{4}$/.test(url.searchParams.get('door'))))throw Error('Invalid door state');
 return url.href;
}
export function createGuestLinkHandler({store=redis,reader=createPrevioReader(),env=process.env}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const view=req.query?.view==='1';
 if(view){
  if(req.headers?.origin!==origin)return res.status(403).end();
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
 }res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method==='POST'){
  if(!isAuthorized(req))return res.status(401).json({error:'Přihlaste se ke správě Wallet.'});
  let urls;try{urls=Object.fromEntries(['cs','en','de'].map(lang=>[lang,destination(req.body?.urls?.[lang],lang)]));}catch{return res.status(400).json({error:'Odkaz musí vést na portál Hillside se správným stavem pobytu.'});}
  try{
   let ref;
   if(env.VERCEL_ENV==='production'&&!isAuthenticatedManager(req)&&!req[internalLink]){
    if(!req.body?.reservation)return res.status(400).json({error:'Vyberte přesný pobyt z Previa.'});
    const stay=await reader.detail(req.body.reservation);
    for(const url of Object.values(urls)){
     const target=new URL(url);
     if(target.searchParams.get('apt')!==stay.apt||alfredDetails(target.searchParams.get('alf')).code!==stay.alf)throw Error('Stažená rezervace se změnila');
     liveDestination(url,stay);
    }
    ref={...guestReference(req.body.reservation,stay),guestName:stay.guestName,createdAt:Date.now(),
     preferredLanguage:['cs','en','de'].includes(req.body.language)?req.body.language:null};
   }
   for(const url of Object.values(urls)){const stay=urlStay(url);if(stay)await assertActiveReference(store,stay);}
   const supplied=req.body?.id;
   if(supplied!==undefined&&(typeof supplied!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(supplied)))return res.status(400).json({error:'Neplatný identifikátor přípravy odkazu.'});
   const id=supplied||randomBytes(16).toString('base64url');
   if(await store(['SET',prefix+id,JSON.stringify(urls),'EX',lifetime,'NX'])!=='OK'){
    const raw=await store(['GET',prefix+id]);
    if(!supplied||raw!==JSON.stringify(urls))return res.status(409).json({error:'Neměnný odkaz už patří jiné přípravě.'});
   }
   if(ref)await bindGuestReference(store,id,ref);
   const root='https://hs18-generator.vercel.app/s/'+id;
   return res.status(200).json({urls:{cs:root,en:root+'/en',de:root+'/de'}});
  }catch{return res.status(503).json({error:'Krátký odkaz se nepodařilo uložit. Zpráva nebyla odeslána; zkuste to znovu.'});}
 }
 if(!['GET','HEAD'].includes(req.method))return res.status(405).end();
 const id=req.query?.id,lang=req.query?.lang||'cs';
 if(typeof id!=='string'||! /^[A-Za-z0-9_-]{22}$/.test(id)||!['cs','en','de'].includes(lang))return res.status(404).end('Odkaz nebyl nalezen.');
 try{
  const raw=await store(['GET',prefix+id]);if(!raw)return res.status(404).end('Odkaz již není dostupný. Kontaktujte prosím recepci.');
  const url=destination(JSON.parse(raw)[lang],lang),stay=urlStay(url);if(stay)await assertActiveReference(store,stay);
  const bound=JSON.parse(await store(['GET',guestReferenceKey(id)])||'null');
  if(!bound&&env.VERCEL_ENV==='production')return res.status(409).end('Tento odkaz čeká na ověření recepcí.');
  if(bound&&!view){
   const target=new URL(origin);
   target.searchParams.set('ref',id);
   if(lang!=='cs')target.searchParams.set('lang',lang);
   res.setHeader('Location',target.href);
   return res.status(302).end();
  }
  let target=url;
  if(bound){
   if(urlStay(url)!==urlStay(origin+'/?alf='+encodeURIComponent(bound.roomAlf)))throw Error('Stored link identity differs');
   const observed=await reader.historyDetail(bound.reservation);
   if(observed.alf!==bound.roomAlf)throw Error('Guest link identity changed');
   if(observed.statusId==='7')throw Object.assign(Error('Pobyt je zrušený'),{code:'RESERVATION_CANCELLED'});
   const live=await reader.detail(bound.reservation);
   if(live.alf!==bound.roomAlf)throw Error('Guest link identity changed');
   target=liveDestination(url,live);
  }
  if(view)return bound?res.status(200).json({url:target}):res.status(404).end();
  res.setHeader('Location',target);return res.status(302).end();
 }catch(error){
  if(error?.code==='RESERVATION_CANCELLED'){
   res.setHeader('Content-Type','text/plain; charset=utf-8');
   return res.status(410).end(cancelledMessage[lang]);
  }
  return res.status(503).end('Portál je dočasně nedostupný. Zkuste to prosím znovu.');
 }
};}
export default createGuestLinkHandler();
