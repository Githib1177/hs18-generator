import {alfredDetails} from './wallet-pass.js';
import {shortId} from './dispatch-preparation.js';
import {assertActiveReference} from './cancellation-guard.js';

const fields=['id','resId','voucher','apt','arrival','departure'];
export const guestReferenceKey=id=>'hs18:guest-link:reference:'+id;
export const guestReference=(reference,stay)=>({
 reservation:Object.fromEntries(fields.map(k=>[k,stay[k]])),roomAlf:stay.alf
});
export async function bindGuestReference(store,id,reference){
 const raw=JSON.stringify(reference),key=guestReferenceKey(id);
 if(await store(['SET',key,raw,'EX',180*86400,'NX'])!=='OK'){
  const stored=JSON.parse(await store(['GET',key])||'null');
  if(stored?.roomAlf!==reference.roomAlf||fields.some(k=>stored?.reservation?.[k]!==reference.reservation?.[k]))
   throw Object.assign(Error('Guest link belongs to another stay'),{status:409});
 }
}
export async function checkedOriginal({store,reader,id,reservation,allowCancelled=false}){
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid preparation id');
 const stay=allowCancelled?await reader.historyDetail(reservation):await reader.detail(reservation);
 const raw=await store(['GET','hs18:manager-dispatch:v1:'+id]);
 if(!raw)throw Object.assign(Error('Original preparation missing'),{status:404});
 const record=JSON.parse(raw);
 if(record.id!==id||record.shortId!==shortId(id)||record.phase!=='prepared'||record.context?.alf!==stay.alf||
    record.context?.apt!==stay.apt)throw Error('Preparation identity differs from the current Previo stay');
 if(!allowCancelled&&(Date.parse(record.walletBody?.startsAt)!==Date.parse(stay.startsAt)||
    Date.parse(record.walletBody?.expiresAt)!==Date.parse(stay.expiresAt)))throw Error('Original stay dates differ');
 const destination=JSON.parse(await store(['GET','hs18:guest-link:'+record.shortId])||'null');
 if(!destination||!['cs','en','de'].every(lang=>{
  const url=new URL(destination[lang]);
  return url.origin==='https://hillside18-guest-portal.vercel.app'&&url.searchParams.get('apt')===stay.apt&&
   alfredDetails(url.searchParams.get('alf')).code===stay.alf;
 }))throw Error('Original stored destination differs');
 if(!allowCancelled)await assertActiveReference(store,record.stayHash);
 return {record,stay,destination};
}
export function liveDestination(url,stay){
 if(stay.statusId==='7')throw Object.assign(Error('Pobyt je zrušený'),{code:'RESERVATION_CANCELLED'});
 if(typeof stay.paymentComplete!=='boolean'||typeof stay.checkinComplete!=='boolean')throw Error('Current stay status unavailable');
 const ready=stay.paymentComplete&&stay.checkinComplete;
 if(ready&&(!stay.accessConfirmed||!/^\d{4}$/.test(stay.accessCode)))throw Error('Current access unavailable');
 if(Date.parse(stay.expiresAt)<=Date.now())throw Error('Stay ended');
 const u=new URL(url);
 if(u.searchParams.get('apt')!==stay.apt)throw Error('Wrong guest link apartment');
 u.searchParams.set('alf',alfredDetails(stay.guestAlf).url);
 for(const k of ['done','door','unpaid','paid'])u.searchParams.delete(k);
 if(ready){u.searchParams.set('done','1');u.searchParams.set('door',stay.accessCode);}
 else if(stay.checkinComplete)u.searchParams.set('unpaid','1');
 else if(stay.paymentComplete)u.searchParams.set('paid','1');
 return u.href;
}
