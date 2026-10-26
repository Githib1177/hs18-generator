import registry from '../lib/registry.cjs';
import manualRepeat from '../lib/manual-resend.cjs';
import {isAuthorized} from './_wallet-auth.js';
const {authorized,contextOf,contextFromMessage,checkContext,claim,finish} = registry;
// SMS Connect accepts at most three 7-bit SMS segments (459 septets).
export function prepareText(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/ß/g, 'ss').replace(/[„“”«»]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-').replace(/•/g, '-').replace(/…/g, '...')
    .replace(/\s+/g, ' ').trim();
}
export function smsLength(text) {
  const basic = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const extended = '^{}\\[~]|€';
  let count = 0;
  for (const ch of text) { if (basic.includes(ch)) count++; else if (extended.includes(ch)) count += 2; else return Infinity; }
  return count;
}
export const ERR_MAP = {
  '-1':'Zpráva s tímto identifikátorem již existuje',0:'Přijato SMS bránou',
  1:'Chyba SMS brány',2:'Neplatné přihlašovací jméno',3:'Chyba přihlášení k SMS bráně',
  4:'Neplatný čas požadavku',5:'Nepovolená IP adresa',6:'Neplatná akce SMS brány',
  7:'Duplicitní ověřovací údaj',8:'Chyba databáze SMS brány',9:'Nedostatečný kredit nebo denní limit',
  10:'Neplatné telefonní číslo',11:'Prázdný text zprávy',12:'Zpráva je příliš dlouhá; zkraťte ji na nejvýše 459 SMS znaků',13:'Neplatné číslo odesílatele'
};
async function send(req, res, managerGrant=null) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const {to,text} = req.body || {};
  const message = prepareText(text);
  if (!message) return res.status(400).json({ok:false,error:'Chybí text SMS.'});
  const length = smsLength(message);
  if (!Number.isFinite(length)) return res.status(400).json({ok:false,error:'SMS obsahuje nepodporované znaky (například emoji). Odstraňte je před odesláním.'});
  if (length > 459) return res.status(400).json({ok:false,error:`SMS je příliš dlouhá (${length}/459 znaků). Zkraťte text nebo znovu vytvořte odkaz.`});
  const list = Array.isArray(to) ? to : String(to || '').split(/[,\n;]+/);
  const numbers = [...new Set(list.map(n => String(n).replace(/[\s()-]/g,'')).filter(Boolean).map(n => n.replace(/^00/,'+')))];
  if (!numbers.length || numbers.some(n=>!/^\+?\d{8,15}$/.test(n))) return res.status(400).json({ok:false,error:'Zkontrolujte telefonní číslo včetně mezinárodní předvolby.'});
  // Preview deployments never contact the SMS provider, even with production credentials.
  if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')return res.status(403).json({ok:false,error:'Testovací verze nic hostům neposílá.'});
  const login = process.env.SMS_LOGIN, password = process.env.SMS_PASSWORD;
  if (!login || !password) return res.status(500).json({ok:false,error:'Chybí přihlášení k SMS bráně.'});
  let context=null,event=null;
  if(req.body?.context){
    if(!authorized(req))return res.status(401).json({ok:false,error:'Obnovte generátor: chybí ověření historie.'});
    try{
      context=contextOf(req.body);const actual=await contextFromMessage(text);
      if(!actual||actual.stay!==context.stay||actual.state!==context.state||actual.apt!==context.apt)throw new Error('Text neodpovídá aktuálním údajům. Vytvořte odkaz znovu.');
    }catch(error){return res.status(400).json({ok:false,error:error.message});}
  }else{
    // Also cover old browser tabs whose request has only {to,text}.
    try{context=await contextFromMessage(text);}catch(error){return res.status(400).json({ok:false,error:error.message});}
  }
  if(context){
    try{
      const duplicate=(await checkContext(context)).duplicate;
      const token=req.body?.manualResendToken;
      if(token&&(!req.body?.context||req.body?.mode!=='manual'||!authorized(req)))return res.status(401).json({ok:false,error:'Ruční opakování není ověřeno.'});
      if(managerGrant){
        if(!isAuthorized(req)||!['retry','owner'].includes(managerGrant.kind)||managerGrant.originalKey!==context.key||!/^[a-f0-9]{64}$/.test(managerGrant.authorizationHash||'')||managerGrant.key!==(context.key+(managerGrant.kind==='retry'?':retry1':':owner:'+managerGrant.authorizationHash)))return res.status(401).json({ok:false,error:'Neplatná vazba povoleného pokusu.'});
        if(token)return res.status(400).json({ok:false,error:'Automatický pokus není ruční opakování.'});
        context={...context,repeatOf:context.key,key:managerGrant.key,managerAttempt:managerGrant.kind,authorizationHash:managerGrant.authorizationHash};
      }else if(duplicate){
        const safety=await manualRepeat.assess(context);
        if(!safety.allowed)return res.status(409).json({ok:false,error:safety.reason,allowManualResend:false});
        if(!token)return res.status(409).json({ok:false,error:safety.reason,allowManualResend:!!req.body?.context&&authorized(req),manualResendToken:req.body?.context&&authorized(req)?manualRepeat.issue(context,message,numbers):undefined});
        if(!manualRepeat.verify(token,context,message,numbers))return res.status(409).json({ok:false,error:'Potvrzení vypršelo nebo se změnil obsah. Zkontrolujte zprávu znovu.'});
        context={...context,repeatOf:context.key,key:manualRepeat.key(token),manualResend:true};
      }else if(token)return res.status(409).json({ok:false,error:'Stav registru se změnil. Zkontrolujte zprávu znovu.'});
      event=await claim(context);
      if(!event)return res.status(409).json({ok:false,error:'Tato událost je již zpracovávána. SMS zablokována.'});
    }catch{return res.status(503).json({ok:false,error:'Registr není dostupný. SMS nebyla odeslána.'});}
  }
  const endpoint = 'https://api.smsbrana.cz/smsconnect/';
  const results = [];
  for (const number of numbers) {
    try {
      // Never retry an ambiguous send: the provider may already have accepted it.
      const query = new URLSearchParams({action:'send_sms',login,password,number,message,data_code:'7bit'});
      const response = await fetch(endpoint+'?'+query, {signal:AbortSignal.timeout(15000)});
      const raw = await response.text();
      const match = raw.match(/<err>\s*(-?\d+)\s*<\/err>/);
      const err = match ? Number(match[1]) : null;
      const sms_id = raw.match(/<sms_id>(\d+)<\/sms_id>/)?.[1] || null;
      const accepted = response.ok && err === 0;
      results.push({number,ok:accepted,err:response.ok?err:null,sms_id,attempt:'GET-7bit',endpoint,
        errMessage:!response.ok || err === null ? 'Výsledek nelze ověřit. Před dalším pokusem zkontrolujte odeslané SMS v bráně.' : ERR_MAP[err] || 'Neznámá chyba brány ('+err+')'});
      console.info('[send-sms] result', {http:response.status,err,sms_id});
    } catch {
      results.push({number,ok:false,err:null,attempt:'GET-7bit',endpoint,errMessage:'Spojení s bránou se přerušilo. Před opakováním zkontrolujte odeslané SMS v bráně.'});
    }
  }
  let registryWarning;
  if(context&&event){try{await finish(context,event,results);}catch{registryWarning='Výsledek se nepodařilo doplnit do registru. Pokus zůstává uzamčen; před opakováním zkontrolujte bránu.';}}
  return res.status(200).json({ok:results.some(r=>r.ok),results,registryWarning});
}

// Internal server-only entry point. HTTP request bodies cannot supply this grant.
export async function sendAuthorizedAttempt(req,res,grant){return send(req,res,grant);}
export default async function handler(req,res){return send(req,res);}


