// Read-only planning. No network, Redis writes, claims, timers or SMS transport.
const crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const OTA_OWNERS=new Set(['booking.com xml','booking.com','airbnb','expedia']);
function day(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))throw new Error('Neplatné datum.');
 const d=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)throw new Error('Neplatné datum.');
 return value;
}
function addDays(value,offset){const d=new Date(day(value)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function pragueDay(now){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
function classifyOwner(item){
 const owner=String(item.owner||'').trim().replace(/^\s*/,'');
 if(OTA_OWNERS.has(owner.toLowerCase()))return 'ota';
 if(item.ownerKind==='guest'||['','---','host','guest'].includes(owner.toLowerCase()))return 'guest';
 return 'unknown';
}
function paymentState(account){
 if(!account?.complete||!Array.isArray(account.items))return {paid:null,guestDue:{},otaCovered:{},issues:['Chybí úplný aktuální rozpis vlastníků a úhrad položek.']};
 const due={},ota={};let unpaid=false,unknown=false;const issues=[];
 for(const item of account.items){
  if(!Number.isSafeInteger(item.amountMinor)||!['EUR','CZK'].includes(item.currency)||item.amountMinor<0){unknown=true;issues.push('Částka nebo měna položky vyžaduje kontrolu.');continue;}
  const kind=classifyOwner(item);
  if(kind==='ota'){ota[item.currency]=(ota[item.currency]||0)+item.amountMinor;continue;}
  if(kind==='unknown'){unknown=true;issues.push('Neznámý vlastník položky.');continue;}
  if(item.amountMinor===0)continue;
  if(item.paid===false){
   unpaid=true;
   if(Number.isSafeInteger(item.remainingMinor)&&item.remainingMinor>=0&&item.remainingMinor<=item.amountMinor)due[item.currency]=(due[item.currency]||0)+item.remainingMinor;
   else issues.push('Položka není uhrazena; zbývající částka není doložena.');
  }else if(item.paid!==true){unknown=true;issues.push('Stav úhrady položky hosta není doložen.');}
 }
 return {paid:unpaid?false:unknown?null:true,guestDue:due,otaCovered:ota,issues:[...new Set(issues)]};
}
function stateOf(checkin,paid){
 if(typeof checkin!=='boolean'||typeof paid!=='boolean')return null;
 return checkin?(paid?'done':'unpaid'):(paid?'paid':'none');
}
function normalizedAlf(alf){
 let s=String(alf||'').trim();
 if(/^https?:/i.test(s)){const u=new URL(s);if(u.protocol!=='https:'||u.hostname!=='alfred.previo.app')throw new Error('Neplatný Alfréd.');s=u.pathname.match(/^\/login\/([A-Za-z0-9_-]+)\/?$/)?.[1]||'';}
 if(!/^[A-Za-z0-9_-]{4,80}$/.test(s))throw new Error('Chybí reference Alfréda.');return s;
}
function portalUrl(r,state){
 if(!state)return null;
 const u=new URL('https://hillside18-guest-portal.vercel.app/');
 u.searchParams.set('apt',r.apartment.replace(/^Apt/,''));u.searchParams.set('alf',normalizedAlf(r.alf));
 if(r.language!=='cs')u.searchParams.set('lang',r.language);
 if(state!=='none')u.searchParams.set(state,'1');
 // This phase NEVER includes a PIN or a door parameter, even in a done preview.
 return u.toString();
}
function texts(r,state,url){
 const when=r.arrival.split('-').reverse().join('.');
 const messages={
  cs:{none:'Zbývá check-in všech hostů a úhrada otevřených položek v Alfrédovi.',paid:'Platba je vyřízena. Zbývá check-in všech hostů.',unpaid:'Check-in je hotový. Zbývá úhrada otevřených položek v Alfrédovi.',done:'Check-in i platba jsou vyřízené.',unknown:'Aktuální stav se ještě ověřuje.'},
  en:{none:'Please complete check-in for all guests and pay the outstanding items in Alfred.',paid:'Payment is complete. Please complete check-in for all guests.',unpaid:'Check-in is complete. Please pay the outstanding items in Alfred.',done:'Check-in and payment are complete.',unknown:'The current status is being checked.'},
  de:{none:'Bitte den Check-in aller Gäste und offene Zahlungen in Alfred abschließen.',paid:'Die Zahlung ist erledigt. Bitte den Check-in aller Gäste abschließen.',unpaid:'Der Check-in ist erledigt. Bitte offene Zahlungen in Alfred abschließen.',done:'Check-in und Zahlung sind erledigt.',unknown:'Der aktuelle Status wird noch geprüft.'}
 };
 const lang=r.language;
 const head={cs:`Hillside 18: Informace k příjezdu ${when} a pobytu.`,en:`Hillside 18: Information for your arrival on ${when} and stay.`,de:`Hillside 18: Informationen zu Ihrer Anreise am ${when} und zum Aufenthalt.`};
 return `${head[lang]}\n${messages[lang][state||'unknown']}\n${url||'[ODKAZ PO OVĚŘENÍ STAVU]'}\n${lang==='cs'?'Podpora':lang==='de'?'Kontakt':'Support'}: +420731990087`;
}
function analyze(snapshot,options={}){
 if(snapshot?.schema!=='hillside18.previo.snapshot.v1'||snapshot.hotelId!=='763519')throw new Error('Nesprávný zdroj nebo hotel.');
 if(!Array.isArray(snapshot.reservations)||snapshot.reservations.length!==snapshot.scope?.renderedRowCount||snapshot.scope?.complete!==true)throw new Error('Neúplný snímek Previa.');
 const now=options.nowUtc||new Date().toISOString();const realDay=pragueDay(now),planDay=day(options.planningDay||realDay);
 const ids=new Set(),n=Date.parse(now);if(!Number.isFinite(n))throw new Error('Neplatný čas.');
 const results=snapshot.reservations.map(r=>{
  if(!r.voucher||ids.has(r.voucher))throw new Error('Chybějící nebo duplicitní voucher ve snímku.');ids.add(r.voucher);
  const arrival=day(r.arrival),departure=day(r.departure);if(departure<=arrival)throw new Error('Neplatný termín pobytu.');
  const d2=addDays(arrival,-2),pay=paymentState(r.account),state=stateOf(r.checkinComplete,pay.paid),reasons=[];
  const latest=Math.min(...[snapshot.observedAt,r.observedAt||snapshot.observedAt,r.account?.observedAt||snapshot.observedAt].map(Date.parse));
  if(!Number.isFinite(latest)||n-latest>15*60*1000||latest>n+60*1000)reasons.push('Údaje jsou neúplné nebo starší než 15 minut; znovu načíst Previo.');
  if(r.status!=='P')reasons.push(r.status==='S'?'Stornovaná rezervace.':'Rezervace není potvrzená.');
  if(!r.guest?.trim())reasons.push('Chybí jméno hosta.');
  if(!['Apt1','Apt2','Apt3'].includes(r.apartment))reasons.push('Chybí jednoznačný apartmán.');
  if(!/^\+[1-9]\d{7,14}$/.test(r.phone||''))reasons.push('Chybí ověřený kontakt v mezinárodním formátu.');
  if(!['cs','en','de'].includes(r.language))reasons.push('Chybí ověřený jazyk zprávy.');
  if(!state)reasons.push('Nelze určit stav check-inu a úhrady podle položek.');
  let url=null,reference=null;
  try{reference=hash(normalizedAlf(r.alf));if(state&&['cs','en','de'].includes(r.language)&&['Apt1','Apt2','Apt3'].includes(r.apartment))url=portalUrl(r,state);}catch{reasons.push('Chybí ověřená reference Alfréda.');}
  const stage=state==='done'?'PIN_RELEASE':state?'PORTAL_'+state.toUpperCase():null;
  const duplicate=(snapshot.messages||[]).some(m=>m.stayHash===reference&&m.stage===stage&&['reported_success','accepted','pending','unknown','rejected','visible_sent'].includes(m.status));
  if(duplicate)reasons.push('Stejný pobyt a stav již byly odeslány nebo čekají na ověření výsledku.');
  const checked=Date.parse(r.duplicateCheck?.checkedAt);
  if(!Number.isFinite(checked)||checked>n+60*1000||r.duplicateCheck.state!==state||n-checked>15*60*1000||r.duplicateCheck.available!==true)reasons.push('Chybí čerstvá kontrola společného serverového registru pro tento stav.');
  else if(r.duplicateCheck.duplicate&&!duplicate)reasons.push('Serverový registr hlásí duplicitní nebo nevyřešený pokus.');
  if(state==='done')reasons.push('Vydání PINu vyžaduje samostatné ověření přístupu; v této zkoušce se PIN nepřebírá.');
  if(d2!==planDay)reasons.push(d2>planDay?'Termín D−2 teprve nastane.':'Termín D−2 již uplynul; automaticky nedohánět.');
  const sms=['cs','en','de'].includes(r.language)?texts(r,state,url):null;
  const eligible=reasons.length===0;
  return {voucher:r.voucher,guest:r.guest||'Bez jména',apartment:r.apartment,arrival,departure,d2,language:r.language||null,phone:r.phone||null,contactSource:r.contactSource||null,status:r.status,checkinComplete:r.checkinComplete,payment:pay,state,stage,duplicate,due:d2===planDay,eligible,sendAllowed:false,reasons,sms,sourceObservedAt:r.observedAt||snapshot.observedAt};
 });
 return {mode:'DRY_RUN_ONLY',automaticSendingEnabled:false,sendAllowed:false,transportCalls:0,nowUtc:now,realDay,planningDay:planDay,simulation:planDay!==realDay,sourceObservedAt:snapshot.observedAt,scope:snapshot.scope,results,counts:{reservations:results.length,confirmed:results.filter(r=>r.status==='P').length,cancelled:results.filter(r=>r.status==='S').length,waiting:results.filter(r=>r.status==='W').length,due:results.filter(r=>r.due&&r.status==='P').length,eligible:results.filter(r=>r.eligible).length,sent:0}};
}
module.exports={analyze,paymentState,classifyOwner,stateOf,addDays,pragueDay,portalUrl,texts};
