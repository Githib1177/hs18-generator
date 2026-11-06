import {createHash,createDecipheriv} from 'node:crypto';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {OWNER_ARRIVAL_DECISIONS,OWNER_ARRIVAL_SOURCE} from './owner-arrival-decisions.js';

const HOTEL='763519',BASE='https://api.previo.app/x1/hotel/';
const parser=new XMLParser({ignoreAttributes:true,parseTagValue:false,trimValues:true,isArray:tag=>['reservation','guest'].includes(tag)});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs');
export class PrevioReadError extends Error{}
export function pragueInstant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value))throw new PrevioReadError('Previo nevrátilo přesný čas pobytu.');
 const local=value.replace(' ','T'),date=Date.parse(local+'Z');if(!Number.isFinite(date))throw new PrevioReadError('Neplatný čas pobytu.');
 const format=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const matches=[1,2].map(hours=>new Date(date-hours*3600000)).filter(d=>format.format(d).replace(' ','T')===local);
 if(matches.length!==1)throw new PrevioReadError('Nejednoznačný čas pobytu při změně času.');return matches[0].toISOString();
}
export function apiKey(env=process.env){
 if(env.PREVIO_API_KEY)return env.PREVIO_API_KEY;
 const [version,nonce,body,tag]=String(env.PREVIO_API_KEY_SEALED||'').split('.');
 if(version!=='v1'||!nonce||!body||!tag||!env.HILLSIDE_WALLET_SESSION_SECRET)throw new PrevioReadError('Vyhledávání rezervací zatím není připojené.');
 try{
  const key=createHash('sha256').update('hs18-previo-api-v1:'+env.HILLSIDE_WALLET_SESSION_SECRET).digest();
  const decrypt=createDecipheriv('aes-256-gcm',key,Buffer.from(nonce,'base64url'));decrypt.setAAD(Buffer.from('hotel763519'));decrypt.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decrypt.update(Buffer.from(body,'base64url')),decrypt.final()]).toString('utf8');
 }catch{throw new PrevioReadError('Připojení rezervací potřebuje obnovit.');}
}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
function positive(v){if(!/^[1-9]\d{0,14}$/.test(String(v)))throw new PrevioReadError('Neplatná rezervace.');return String(v);}
export function dateWindows(now=new Date()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const start=new Date(today+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-30);const finish=new Date(today+'T00:00:00Z');finish.setUTCDate(finish.getUTCDate()+365);
 const windows=[];
 while(start<finish){const end=new Date(Math.min(start.getTime()+90*86400000,finish.getTime()));windows.push({from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)});start.setTime(end.getTime());}
 return windows;
}
export function parseXml(raw,root){
 if(Buffer.byteLength(raw)>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(raw)||XMLValidator.validate(raw)!==true)throw new PrevioReadError('Previo vrátilo neplatnou odpověď.');
 const parsed=parser.parse(raw);
 if(parsed.error){const code=String(parsed.error.code||'');throw new PrevioReadError(code==='1022'?'Previo tomuto API účtu nepovolilo čtení rezervací.':'Previo odmítlo načtení rezervací.');}
 if(!Object.hasOwn(parsed,root))throw new PrevioReadError('Previo nepotvrdilo výsledek čtení.');
 return parsed[root];
}
export function onlineCheckin(commission){
 if(!commission||!Array.isArray(commission.guests))return null;
 if(commission.completeCheckin===false||commission.guests.some(g=>g.hasCompleteInfo===false))return false;
 return commission.completeCheckin===true&&commission.guests.length>0&&commission.guests.every(g=>g.hasCompleteInfo===true)?true:null;
}
export function alfredCode(reservation){
 const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{6,32}$/.test(v)?v:'';
 const list=reservation.alfredCodeList?.alfredCode,entries=Array.isArray(list)?list:list?[list]:[];
 if(entries.length){
  const codes=[...new Set(entries.filter(x=>x?.type==='room').map(x=>valid(x.code)).filter(Boolean))];
  // A room link must never silently become a link for the whole group.
  return codes.length===1?codes[0]:'';
 }
 const legacy=reservation.alfredCode;
 if(valid(legacy))return legacy;
 if(typeof legacy==='string'&&legacy.startsWith('https://')){
  try{const u=new URL(legacy);if(u.origin==='https://alfred.previo.app'&&!u.username&&!u.password&&!u.search&&!u.hash)return valid(/^\/login\/([^/]+)\/?$/.exec(u.pathname)?.[1]);}catch{}
 }
 return '';
}
export function accessCode(reservation,stay,term=reservation.term){
 const v2=accessMarker(reservation,stay,term);if(v2)return v2.verified==='APARTMENT SKIROOM'&&/^\d{4}$/.test(v2.code)?v2.code:'';
 const raw=String(reservation.note||'');if(raw.length>64000)return '';
 const text=raw.replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').replace(/&ndash;|&#8211;/gi,'–');
 const markers=[...text.matchAll(/\[HS18-ACCESS-V1;COM=([1-9]\d*);APT=([123]);FROM=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2});TO=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2});VERIFIED=APARTMENT,SKIROOM\]\s*Kód\s*[-–]\s*(\d{4})\s*\[\/HS18-ACCESS\]/gu)];
 if(markers.length!==1||text.split('[HS18-ACCESS').length!==2)return '';
 const [,id,apt,from,to,code]=markers[0];
 return id===stay.id&&apt===stay.apt&&from===term?.from?.replace(' ','T')&&to===term?.to?.replace(' ','T')?code:'';
}
function noteText(raw){
 return raw.replace(/<(?:br|\/p|\/div|\/li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&amp;/gi,'&').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):'';}).replace(/&(?:nbsp|ndash|oacute);/gi,v=>({'&nbsp;':' ','&ndash;':'–','&oacute;':'ó'})[v.toLowerCase()]);
}
function inspectAccessMarker(reservation,stay,term=reservation.term){
 const raw=String(reservation.note||'');
 const empty={count:0,validV2:false,v2DeclaresVerifiedPair:false,identityMatches:false,topCodeMatchesMarker:false,codePresent:false,parsed:null,privateMarker:null};
 if(raw.length>64000)return empty;
 const text=noteText(raw),count=text.split('HS18ACCESSV2').length-1;
 const rows=[...text.matchAll(/HS18ACCESSV2\s+COM\s+([1-9]\d*)\s+APT\s+([123])\s+FROM\s+(\d{14})\s+TO\s+(\d{14})\s+VERIFIED\s+(APARTMENT\s+SKIROOM|TEST\s+ONLY)\s+CODE\s+(\d{4}|TEST)\s+ENDHS18ACCESS/gu)];
 if(rows.length!==1||count!==1)return {...empty,count};
 const [,id,apt,from,to,verified,code]=rows[0],digits=v=>String(v||'').replace(/\D/g,'');
 const identityMatches=id===stay.id&&apt===stay.apt;
 // Compare the FIRST code heading, including a malformed/mismatched heading.
 // A later matching code must never conceal a different first heading.
 const firstHeading=/\bK[oó]d\s*[-–]\s*([^\n]*)/u.exec(text);
 const firstCode=/^(\d{4}|TEST)(?=\s|$)/u.exec((firstHeading?.[1]||'').trim())?.[1];
 const topCodeMatchesMarker=firstCode===code;
 const v2DeclaresVerifiedPair=verified.replace(/\s+/g,' ')==='APARTMENT SKIROOM',codePresent=/^\d{4}$/.test(code);
 const validV2=identityMatches&&from===digits(term?.from)&&to===digits(term?.to)&&topCodeMatchesMarker;
 const local=v=>v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6,8)+'T'+v.slice(8,10)+':'+v.slice(10,12)+':'+v.slice(12,14);
 return {count,validV2,v2DeclaresVerifiedPair,identityMatches,topCodeMatchesMarker,codePresent,parsed:identityMatches?{comId:id,apt,from:local(from),to:local(to)}:null,privateMarker:validV2?{verified:verified.replace(/\s+/g,' '),code}:null};
}
export function accessMarker(reservation,stay,term=reservation.term){
 return inspectAccessMarker(reservation,stay,term).privateMarker;
}
function effectiveAccessTerm(reservation,stay,at,decisions){
 const rawPmsFrom=String(reservation.term?.from||'').replace(' ','T'),rawPmsTo=String(reservation.term?.to||'').replace(' ','T');
 // An owner exception does not make an invalid or ambiguous PMS time valid.
 pragueInstant(rawPmsFrom);pragueInstant(rawPmsTo);
 let effectiveFrom=rawPmsFrom,ownerArrival=null;
 const matches=decisions.filter(d=>d.com_id===stay.id&&d.res_id===stay.resId&&d.voucher===stay.voucher&&d.apartment===stay.apt&&d.arrival===stay.arrival&&d.departure===stay.departure);
 if(matches.length>1)throw new PrevioReadError('Nejednoznačná schválená výjimka příjezdu.');
 if(matches.length){
  const d=matches[0],uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(d.valid_from)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(d.valid_until))throw new PrevioReadError('Neúplná doložená výjimka příjezdu.');
  if(d.action!=='EARLY_CHECKIN_CONFIRM'||d.source!=='owner_chat'||d.reservation_id!=='airbnb:'+d.voucher||!uuid.test(d.thread_id)||!uuid.test(d.human_message_id)||!/^[a-f0-9]{64}$/.test(d.actual_capture_sha256)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(d.confirmed_arrival_local)||!Number.isFinite(Date.parse(d.valid_from))||!Number.isFinite(Date.parse(d.valid_until))||Date.parse(d.valid_until)<=Date.parse(d.valid_from))throw new PrevioReadError('Neúplná doložená výjimka příjezdu.');
  if(at.getTime()>=Date.parse(d.valid_from)&&at.getTime()<=Date.parse(d.valid_until)){
   effectiveFrom=stay.arrival+'T'+d.confirmed_arrival_local+':00';
   ownerArrival={applied:true,sourceCaptureSha256:d.actual_capture_sha256,decisionConfigSha256:OWNER_ARRIVAL_SOURCE.sha256,humanMessageId:d.human_message_id,confirmedArrivalLocal:d.confirmed_arrival_local};
  }
 }
 const startsAt=pragueInstant(effectiveFrom),expiresAt=pragueInstant(rawPmsTo);
 if(Date.parse(startsAt)>=Date.parse(expiresAt))throw new PrevioReadError('Neplatná účinná platnost pobytu.');
 return {rawPmsFrom,rawPmsTo,effectiveFrom,effectiveTo:rawPmsTo,startsAt,expiresAt,ownerArrival};
}
export function guestPayment(account,reservation){
 const group=account?.groupAccount,rows=group?.items;if(!Array.isArray(rows)||String(account.resId)!==String(reservation.resId))return null;
 const money=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*100):null;
 const roomIds=new Set(reservation.commissions?.map(c=>String(c.comId)));
 if(!rows.length)return group.total===0&&group.paid===0&&group.needPay===false?true:null;
 const balances=new Map();let uncertain=false;
 for(const row of rows){
  if(!roomIds.has(String(row.comId)))return null;
  const owners=Array.isArray(row.owner)?row.owner:[row.owner];
  if(owners.length!==1){uncertain=true;continue;}
  const owner=owners[0],kind=String(owner?.type||'').trim().toLowerCase();
  // Owner decision: only explicit OTA items are excluded. Unassigned and
  // company-owned items remain part of the non-OTA balance.
  if(kind==='ota')continue;
  const price=money(row.price),paid=money(row.paid),count=row.count;
  if(price===null||paid===null||typeof count!=='number'||!Number.isFinite(count)||count<=0||count>100){uncertain=true;continue;}
  // Official REST contract: price and paid are per item; count is quantity.
  const ownerKey=owner?kind+':'+String(owner.id??'unassigned'):'unassigned';
  balances.set(ownerKey,(balances.get(ownerKey)||0)+(price-paid)*count);
 }
 if([...balances.values()].some(due=>due>0))return false;
 return uncertain?null:true;
}
export function createPrevioReader({fetcher=fetch,env=process.env,now=()=>new Date(),ownerDecisions=OWNER_ARRIVAL_DECISIONS}={}){
 const key=()=>apiKey(env);
 async function call(method,fields,signal){
  if(!['get','searchReservations'].includes(method))throw new PrevioReadError('Povoleno je pouze čtení rezervací.');
  let response;
  try{response=await fetcher(BASE+method,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/xml','Authorization':'ApiKey '+key()},body:'<?xml version="1.0" encoding="UTF-8"?><request><hotId>'+HOTEL+'</hotId>'+fields+'</request>'});}
  catch(error){if(error instanceof PrevioReadError)throw error;throw new PrevioReadError('Previo nyní neodpovídá. Zkuste vyhledání znovu.');}
  if(!response.ok)throw new PrevioReadError('Previo nyní není dostupné.');
  const declared=Number(response.headers?.get?.('content-length')||0);if(declared>2_000_000)throw new PrevioReadError('Odpověď Previa je příliš rozsáhlá.');
  return parseXml(await response.text(),method==='get'?'hotel':'reservations');
 }
 async function identity(signal){const h=await call('get','<lanId>1</lanId>',signal);if(h.hotId!==HOTEL||!['false','0'].includes(h.isTest))throw new PrevioReadError('Nepodařilo se ověřit správný hotel.');}
 async function rest(method,resId,signal){
  if(!['reservation','account'].includes(method))throw new PrevioReadError('Povoleno je pouze čtení.');
  const response=await fetcher('https://api.previo.app/rest/'+method+'?resId='+positive(resId),{method:'GET',redirect:'error',signal,headers:{'Authorization':'ApiKey '+key(),'X-Previo-Hotel-Id':HOTEL,'X-Previo-Language-ID':'1','Accept':'application/json'}});
  if(!response.ok)throw new PrevioReadError([401,403].includes(response.status)?'API nemá přístup k podrobnému stavu pobytu.':'Podrobný stav se nepodařilo načíst.');
  const raw=await response.text();if(Buffer.byteLength(raw)>2_000_000)throw new PrevioReadError('Příliš rozsáhlá odpověď.');return JSON.parse(raw);
 }
 function summary(x,statuses=['2','3']){
  const apt=/^Apt\s*([123])$/i.exec(x.object?.name||'')?.[1];
  const guest=Array.isArray(x.guest)?x.guest:[];const name=guest.map(g=>[g.firstName,g.lastName].filter(Boolean).join(' ')||g.name||'').filter(Boolean).join(', ')||x.contactPerson?.name||'';
  const arrival=String(x.term?.from||'').slice(0,10),departure=String(x.term?.to||'').slice(0,10);
  if(!apt||!validDate(arrival)||!validDate(departure)||departure<=arrival||!statuses.includes(x.status?.statusId)||!name)return null;
  return {id:positive(x.comId),resId:positive(x.resId),voucher:String(x.voucher||''),guestName:name.slice(0,200),apt,arrival,departure,status:x.status.statusId==='7'?'Storno':x.status.statusId==='3'?'Ubytováno':'Potvrzeno'};
 }
 function queryFields({from,to,query='',id,resId,offset=0}){
  if(!validDate(from)||!validDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>90)throw new PrevioReadError('Neplatný interval pobytu.');
  return '<term><from>'+from+'</from><to>'+to+'</to><termType>overlap</termType></term><roomsOnly>true</roomsOnly>'+ (query?'<fulltext>'+escape(query)+'</fulltext>':'')+(id?'<comIds><comId>'+positive(id)+'</comId></comIds><resId>'+positive(resId)+'</resId>':'')+'<limit><offset>'+offset+'</offset><limit>30</limit></limit>';
 }
 async function reference(q,statuses){
  if(!validDate(q.arrival)||!validDate(q.departure))throw new PrevioReadError('Neplatný termín.');
  const signal=AbortSignal.timeout(22000);await identity(signal);
  const through=new Date(Date.parse(q.arrival)+86400000).toISOString().slice(0,10);
  const result=await call('searchReservations',queryFields({from:q.arrival,to:through,id:q.id,resId:q.resId})+'<statuses>'+statuses.map(s=>'<cosId>'+s+'</cosId>').join('')+'</statuses>',signal);
  const rows=result?.reservation||[];if(rows.length!==1)throw new PrevioReadError('Přesná rezervace nebyla ověřena.');
  const x=rows[0],s=summary(x,statuses);
  if(!s||['id','resId','voucher','apt','arrival','departure'].some(k=>s[k]!==String(q[k])))throw new PrevioReadError('Identita pobytu nesouhlasí.');
  const alf=alfredCode(x);if(!alf)throw new PrevioReadError('Chybí jednoznačná reference pobytu.');
  let registrySourceCreatedAt=null;try{registrySourceCreatedAt=pragueInstant(x.created);}catch{}
  const {guestName,...safe}=s;
  return {...safe,hotelId:HOTEL,statusId:x.status.statusId,alf,registrySourceCreatedAt,observedAt:now().toISOString()};
 }
 async function exactActive({id,resId,arrival,departure,voucher,apt}){
  const signal=AbortSignal.timeout(22000);await identity(signal);const through=new Date(Date.parse(arrival)+86400000).toISOString().slice(0,10);const result=await call('searchReservations',queryFields({from:arrival,to:through,id,resId}),signal),rows=result?.reservation||[];
  if(rows.length!==1)throw new PrevioReadError('Rezervace se změnila. Vyhledejte ji znovu.');
  const x=rows[0],s=summary(x);
  if(!s||s.id!==String(id)||s.resId!==String(resId)||s.voucher!==String(voucher)||s.apt!==String(apt)||s.arrival!==arrival||s.departure!==departure)throw new PrevioReadError('Rezervace se změnila. Vyhledejte ji znovu.');
  return {x,s,signal};
 }

 return {
  // Separate read-only history/cancellation contracts. Active detail stays 2/3 only.
  historyDetail:q=>reference(q,['2','3','7']),
  cancelledDetail:q=>reference(q,['7']),
  async search(query){
   query=String(query||'').trim();if([...query].length<2||query.length>80)throw new PrevioReadError('Zadejte alespoň dva znaky jména nebo čísla rezervace.');
   const signal=AbortSignal.timeout(22000);await identity(signal);const windows=dateWindows(now()),found=new Map();let truncated=false;
   // Two bounded read workers; no guest cache, mutation, wallet or SMS endpoint.
   let cursor=0;
   await Promise.all([0,1].map(async()=>{while(cursor<windows.length){const window=windows[cursor++];for(let offset=0;offset<120;offset+=30){
    const result=await call('searchReservations',queryFields({...window,query,offset}),signal);const rows=result?.reservation||[];
    for(const x of rows){const s=summary(x);if(s&&[s.guestName,s.voucher,s.id,s.resId].some(v=>normalize(v).includes(normalize(query))))found.set(s.id,s);}
    if(rows.length<30)break;if(offset===90)truncated=true;
   }}}));
   const rows=[...found.values()].sort((a,b)=>(a.voucher===query?-1:0)-(b.voucher===query?-1:0)||a.arrival.localeCompare(b.arrival)||a.guestName.localeCompare(b.guestName,'cs'));
   return {items:rows.slice(0,20),truncated:truncated||rows.length>20,range:{from:windows[0].from,to:windows.at(-1).to},observedAt:now().toISOString()};
  },
  async uptake(q){
   const {x,s}=await exactActive(q),observed=now(),term=effectiveAccessTerm(x,s,observed,ownerDecisions);
   const {privateMarker,...marker}=inspectAccessMarker(x,s,{from:term.effectiveFrom,to:term.effectiveTo});
   const {id,resId,voucher,apt,arrival,departure}=s;
   // Only explicit non-secret metadata leaves this read path. No note/code digest.
   return {schema:'hs18-messenger-uptake-v1',serviceOrigin:'https://hs18-generator.vercel.app',deploymentCommit:/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA||'')?env.VERCEL_GIT_COMMIT_SHA:null,observedAt:observed.toISOString(),reservation:{hotelId:HOTEL,id,resId,voucher,apt,arrival,departure},source:{reader:'previo_xml.searchReservations',revision:null},marker,term,noGuestCodeReturned:true};
  },
  async detail({id,resId,arrival,departure,voucher,apt},{includeRegistryCreationEvidence=false}={}){
   const {x,s,signal}=await exactActive({id,resId,arrival,departure,voucher,apt});
   const first=x.guest?.[0]||{},phone=String(x.contactPerson?.phone||first.phone||'').trim().slice(0,60),alf=alfredCode(x);
   let checkinComplete=null,paymentComplete=null,stateNotice='';
   try{
    const booking=await rest('reservation',s.resId,signal);
    const commission=booking.commissions?.find(c=>String(c.comId)===s.id);
    if(String(booking.hotId)!==HOTEL||String(booking.resId)!==s.resId||String(booking.voucher)!==s.voucher||!commission||commission.termFrom?.slice(0,10)!==arrival||commission.termTo?.slice(0,10)!==departure)throw new PrevioReadError('Podrobný stav neodpovídá zvolenému pobytu.');
    checkinComplete=onlineCheckin(commission);
    try{paymentComplete=guestPayment(await rest('account',s.resId,signal),booking);}catch{stateNotice='Platbu se nepodařilo ověřit; zkontrolujte ji před odesláním.';}
   }catch{stateNotice='Check-in a platbu se nepodařilo ověřit; zkontrolujte je před odesláním.';}
   if((checkinComplete===null||paymentComplete===null)&&!stateNotice)stateNotice='Některý stav se nepodařilo ověřit; zkontrolujte přepínače před odesláním.';
    const term=effectiveAccessTerm(x,s,now(),ownerDecisions),{startsAt,expiresAt}=term;
    const door=checkinComplete===true&&paymentComplete===true&&now().getTime()>=Date.parse(startsAt)&&now().getTime()<Date.parse(expiresAt)?accessCode(x,s,{from:term.effectiveFrom,to:term.effectiveTo}):'';
    const marker=accessMarker(x,s,{from:term.effectiveFrom,to:term.effectiveTo}),testCode=marker?.verified==='TEST ONLY'&&marker.code==='TEST'?'TEST':undefined;
    let registrySourceCreatedAt=null;
    if(includeRegistryCreationEvidence){try{registrySourceCreatedAt=pragueInstant(x.created);}catch{/* Unknown creation time cannot prove lifetime coverage. */}}
    return {...s,phone,alf,startsAt,releaseAt:startsAt,expiresAt,...(term.ownerArrival?{rawPmsFrom:term.rawPmsFrom,rawPmsTo:term.rawPmsTo,ownerArrival:term.ownerArrival}:{}),accessCode:door,accessConfirmed:Boolean(door),...(testCode?{testCode}:{}),lang:({'1':'cs','2':'en','3':'de'})[x.lanId]||'cs',checkinComplete,paymentComplete,stateNotice,observedAt:now().toISOString(),...(includeRegistryCreationEvidence?{registrySourceCreatedAt}:{})};
  }
 };
}
