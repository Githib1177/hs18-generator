import {createHash,createDecipheriv} from 'node:crypto';
import {XMLParser,XMLValidator} from 'fast-xml-parser';

const HOTEL='763519',BASE='https://api.previo.app/x1/hotel/';
const parser=new XMLParser({ignoreAttributes:true,parseTagValue:false,trimValues:true,isArray:tag=>['reservation','guest'].includes(tag)});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs');
export class PrevioReadError extends Error{}
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
export function guestPayment(account,reservation){
 const group=account?.groupAccount,rows=group?.items;if(!Array.isArray(rows)||String(account.resId)!==String(reservation.resId))return null;
 const money=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*100):null;
 const roomIds=new Set(reservation.commissions?.map(c=>String(c.comId))),guestIds=new Set(reservation.commissions?.flatMap(c=>c.guests||[]).map(g=>String(g.gueId)));
 if(!rows.length)return group.total===0&&group.paid===0&&group.needPay===false&&reservation.requirePayment===false?true:null;
 let due=0,uncertain=false;
 for(const row of rows){
  if(!roomIds.has(String(row.comId)))return null;
  const owners=Array.isArray(row.owner)?row.owner:[row.owner];
  if(owners.length!==1||!owners[0]||!['guest','company','ota'].includes(String(owners[0].type).toLowerCase())){uncertain=true;continue;}
  if(String(owners[0].type).toLowerCase()!=='guest')continue;
  if(!guestIds.has(String(owners[0].id))){uncertain=true;continue;}
  const price=money(row.price),paid=money(row.paid),count=row.count;
  if(price===null||paid===null||typeof count!=='number'||!Number.isFinite(count)||count<=0||count>100){uncertain=true;continue;}
  // Official REST contract: price and paid are per item; count is quantity.
  due+=(price-paid)*count;
 }
 if(!uncertain)return due<=0;
 // A genuinely fully settled whole account proves all guest items settled too.
 return money(group.total)>0&&money(group.paid)>=money(group.total)&&group.needPay===false?true:null;
}
export function createPrevioReader({fetcher=fetch,env=process.env,now=()=>new Date()}={}){
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
  const response=await fetcher('https://api.previo.app/rest/'+method+'?resId='+positive(resId),{method:'GET',redirect:'error',signal,headers:{'Authorization':'ApiKey '+key()}});
  if(!response.ok)throw new PrevioReadError([401,403].includes(response.status)?'API nemá přístup k podrobnému stavu pobytu.':'Podrobný stav se nepodařilo načíst.');
  const raw=await response.text();if(Buffer.byteLength(raw)>2_000_000)throw new PrevioReadError('Příliš rozsáhlá odpověď.');return JSON.parse(raw);
 }
 function summary(x){
  const apt=/^Apt\s*([123])$/i.exec(x.object?.name||'')?.[1];
  const guest=Array.isArray(x.guest)?x.guest:[];const name=guest.map(g=>[g.firstName,g.lastName].filter(Boolean).join(' ')||g.name||'').filter(Boolean).join(', ')||x.contactPerson?.name||'';
  const arrival=String(x.term?.from||'').slice(0,10),departure=String(x.term?.to||'').slice(0,10);
  if(!apt||!validDate(arrival)||!validDate(departure)||departure<=arrival||!['2','3'].includes(x.status?.statusId)||!name)return null;
  return {id:positive(x.comId),resId:positive(x.resId),voucher:String(x.voucher||''),guestName:name.slice(0,200),apt,arrival,departure,status:x.status.statusId==='3'?'Ubytováno':'Potvrzeno'};
 }
 function queryFields({from,to,query='',id,resId,offset=0}){
  if(!validDate(from)||!validDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>90)throw new PrevioReadError('Neplatný interval pobytu.');
  return '<term><from>'+from+'</from><to>'+to+'</to></term><termType>overlap</termType><roomsOnly>true</roomsOnly>'+ (query?'<fulltext>'+escape(query)+'</fulltext>':'')+(id?'<comIds><comId>'+positive(id)+'</comId></comIds><resId>'+positive(resId)+'</resId>':'')+'<limit><offset>'+offset+'</offset><limit>30</limit></limit>';
 }
 return {
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
  async detail({id,resId,arrival,departure,voucher,apt}){
   const signal=AbortSignal.timeout(22000);await identity(signal);const through=new Date(Date.parse(arrival)+86400000).toISOString().slice(0,10);const result=await call('searchReservations',queryFields({from:arrival,to:through,id,resId}),signal),rows=result?.reservation||[];
   if(rows.length!==1)throw new PrevioReadError('Rezervace se změnila. Vyhledejte ji znovu.');
   const x=rows[0],s=summary(x);
   if(!s||s.id!==String(id)||s.resId!==String(resId)||s.voucher!==String(voucher)||s.apt!==String(apt)||s.arrival!==arrival||s.departure!==departure)throw new PrevioReadError('Rezervace se změnila. Vyhledejte ji znovu.');
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
   return {...s,phone,alf,lang:({'1':'cs','2':'en','3':'de'})[x.lanId]||'cs',checkinComplete,paymentComplete,stateNotice,observedAt:now().toISOString()};
  }
 };
}
