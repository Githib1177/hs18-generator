import {randomBytes} from 'node:crypto';
import {isAuthorized} from './_wallet-auth.js';
import {redis} from '../lib/wallet-store.js';
const prefix='hs18:guest-link:';
const lifetime=180*86400;
const origin='https://hillside18-guest-portal.vercel.app';
function destination(value,lang){
 if(typeof value!=='string'||value.length>2048)throw Error('Invalid URL');
 const url=new URL(value);
 if(url.origin!==origin||url.pathname!=='/'||url.username||url.password||!['',lang].includes(url.searchParams.get('lang')||'')||! /^[1-4]$/.test(url.searchParams.get('apt')||''))throw Error('Invalid destination');
 if(url.searchParams.has('door')&&(url.searchParams.get('done')!=='1'||url.searchParams.has('unpaid')||url.searchParams.has('paid')||!/^\d{4}$/.test(url.searchParams.get('door'))))throw Error('Invalid door state');
 return url.href;
}
export function createGuestLinkHandler({store=redis}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method==='POST'){
  if(!isAuthorized(req))return res.status(401).json({error:'Přihlaste se ke správě Wallet.'});
  let urls;try{urls=Object.fromEntries(['cs','en','de'].map(lang=>[lang,destination(req.body?.urls?.[lang],lang)]));}catch{return res.status(400).json({error:'Odkaz musí vést na portál Hillside se správným stavem pobytu.'});}
  try{
   const supplied=req.body?.id;
   if(supplied!==undefined&&(typeof supplied!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(supplied)))return res.status(400).json({error:'Neplatný identifikátor přípravy odkazu.'});
   const id=supplied||randomBytes(16).toString('base64url');
   if(await store(['SET',prefix+id,JSON.stringify(urls),'EX',lifetime,'NX'])!=='OK'){
    const raw=await store(['GET',prefix+id]);
    if(!supplied||raw!==JSON.stringify(urls))return res.status(409).json({error:'Neměnný odkaz už patří jiné přípravě.'});
   }
   const root='https://hs18-generator.vercel.app/s/'+id;
   return res.status(200).json({urls:{cs:root,en:root+'/en',de:root+'/de'}});
  }catch{return res.status(503).json({error:'Krátký odkaz se nepodařilo uložit. Zpráva nebyla odeslána; zkuste to znovu.'});}
 }
 if(!['GET','HEAD'].includes(req.method))return res.status(405).end();
 const id=req.query?.id,lang=req.query?.lang||'cs';
 if(typeof id!=='string'||! /^[A-Za-z0-9_-]{22}$/.test(id)||!['cs','en','de'].includes(lang))return res.status(404).end('Odkaz nebyl nalezen.');
 try{
  const raw=await store(['GET',prefix+id]);if(!raw)return res.status(404).end('Odkaz již není dostupný. Kontaktujte prosím recepci.');
  const url=destination(JSON.parse(raw)[lang],lang);res.setHeader('Location',url);return res.status(302).end();
 }catch{return res.status(503).end('Portál je dočasně nedostupný. Zkuste to prosím znovu.');}
};}
export default createGuestLinkHandler();
