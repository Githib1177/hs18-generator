import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPrevioReader,accessMarker} from '../lib/previo-reservations.js';
import {createReservationsHandler} from '../api/reservations.js';
import {OWNER_ARRIVAL_DECISIONS,OWNER_ARRIVAL_SOURCE} from '../lib/owner-arrival-decisions.js';

// All HTTP bodies, contacts and codes here are synthetic. Only the approved
// identity scope is copied from the source-bound server allowlist.
const owner=OWNER_ARRIVAL_DECISIONS[0];
const exact={id:owner.com_id,resId:owner.res_id,voucher:owner.voucher,apt:owner.apartment,arrival:owner.arrival,departure:owner.departure};
const SYNTHETIC_CODE='0472',SYNTHETIC_PHONE='+420777000009',SYNTHETIC_ALF='SYNTHONLY';
const makeNote=(q=exact,{from=q.arrival+'T15:00:00',to=q.departure+'T10:00:00',code=SYNTHETIC_CODE,com=q.id,apt=q.apt,heading=code}={})=>'<p>Kód - <b><u>'+heading+'</u></b></p><p>HS18ACCESSV2 COM '+com+' APT '+apt+' FROM '+from.replace(/\D/g,'')+' TO '+to.replace(/\D/g,'')+' VERIFIED APARTMENT SKIROOM CODE '+code+' ENDHS18ACCESS</p>';
function setup({selected=exact,note=makeNote(selected),now='2026-11-06T02:00:00Z',ownerDecisions=OWNER_ARRIVAL_DECISIONS,roomCount=1,hotel='763519',status='2',rawFrom=selected.arrival+' 16:00:00',rawTo=selected.departure+' 10:00:00',checkin=true,paid=true,restDenied=false,sourceMismatch={}}={}){
 const calls=[],q={...selected,...sourceMismatch};
 const room='<reservation><comId>'+q.id+'</comId><resId>'+q.resId+'</resId><voucher>'+q.voucher+'</voucher><term><from>'+rawFrom+'</from><to>'+rawTo+'</to></term><status><statusId>'+status+'</statusId></status><object><name>Apt'+q.apt+'</name></object><guest><gueId>900001</gueId><firstName>SYNTHETIC_GUEST</firstName><phone>'+SYNTHETIC_PHONE+'</phone></guest><contactPerson><phone>'+SYNTHETIC_PHONE+'</phone></contactPerson><alfredCode>'+SYNTHETIC_ALF+'</alfredCode><note><![CDATA['+note+']]></note></reservation>';
 const booking={hotId:763519,resId:Number(q.resId),voucher:q.voucher,commissions:[{comId:Number(q.id),termFrom:rawFrom.replace(' ','T'),termTo:rawTo.replace(' ','T'),completeCheckin:checkin,guests:[{gueId:900001,hasCompleteInfo:checkin}]}]};
 const account={resId:Number(q.resId),groupAccount:{total:100,paid:paid?100:0,needPay:!paid,items:[{comId:Number(q.id),owner:{type:'guest',id:900001},price:100,paid:paid?100:0,count:1}]}};
 const reader=createPrevioReader({env:{PREVIO_API_KEY:'synthetic-only',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)},now:()=>new Date(now),ownerDecisions,fetcher:async(url,options)=>{
  calls.push({url,method:options.method,redirect:options.redirect});
  assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
  if(url==='https://api.previo.app/x1/hotel/get'){assert.equal(options.method,'POST');return {ok:true,text:async()=>'<hotel><hotId>'+hotel+'</hotId><isTest>false</isTest></hotel>'};}
  if(url==='https://api.previo.app/x1/hotel/searchReservations'){assert.equal(options.method,'POST');return {ok:true,text:async()=>'<reservations>'+room.repeat(roomCount)+'</reservations>'};}
  assert.equal(options.method,'GET');assert.ok(url==='https://api.previo.app/rest/reservation?resId='+selected.resId||url==='https://api.previo.app/rest/account?resId='+selected.resId,'only original read URLs');
  return {ok:!restDenied,status:restDenied?403:200,text:async()=>JSON.stringify(url.includes('/account?')?account:booking)};
 }});
 return {reader,calls,selected};
}
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(value){this.data=value;return this}};}
async function call(query,{authorized=true,method='GET',reader}={}){
 let calls=0;const h=createReservationsHandler({authorize:()=>authorized,reader:reader||{uptake:async q=>{calls++;return {received:q}}}}),r=response();
 await h({method,query},r);return {r,calls};
}
const query=(extra={})=>({mode:'uptake',...exact,...extra});
function assertRedacted(value){
 const forbidden=new Set(['code','pin','accessCode','note','rawNote','phone','alf','guestName','noteSha256','source_note_sha256','pinHash','sourceNoteSha256','privateMarker','cardsVerified','matchesBothVerifiedCards','complete','receipt']);
 function walk(v){if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){assert.ok(!forbidden.has(k),'forbidden response key: '+k);walk(x);}}
 walk(value);const raw=JSON.stringify(value);
 for(const s of [SYNTHETIC_CODE,SYNTHETIC_PHONE,SYNTHETIC_ALF,'SYNTHETIC_GUEST','HS18ACCESSV2 COM'])assert.ok(!raw.includes(s),'private synthetic value must not leave uptake');
}

test('uptake exact owner stay reads only original XML identity/detail and returns safe metadata',async()=>{
 const s=setup(),d=await s.reader.uptake(exact);
 assert.equal(d.schema,'hs18-messenger-uptake-v1');assert.deepEqual(d.reservation,{hotelId:'763519',...exact});
 assert.equal(d.marker.validV2,true);assert.equal(d.marker.v2DeclaresVerifiedPair,true);assert.equal(d.marker.topCodeMatchesMarker,true);
 assert.deepEqual(d.marker.parsed,{comId:exact.id,apt:'2',from:'2027-01-25T15:00:00',to:'2027-01-29T10:00:00'});
 assert.equal(d.term.rawPmsFrom,'2027-01-25T16:00:00');assert.equal(d.term.effectiveFrom,'2027-01-25T15:00:00');
 assert.equal(d.term.startsAt,'2027-01-25T14:00:00.000Z');assert.equal(d.term.ownerArrival.sourceCaptureSha256,owner.actual_capture_sha256);
 assert.equal(d.term.ownerArrival.decisionConfigSha256,OWNER_ARRIVAL_SOURCE.sha256);assert.equal(d.source.revision,null);
 assert.equal(d.observedAt,'2026-11-06T02:00:00.000Z');assert.equal(d.deploymentCommit,'a'.repeat(40));assert.equal(d.noGuestCodeReturned,true);
 assert.equal(s.calls.length,2);assert.ok(s.calls.every(c=>c.method==='POST'&&/\/(get|searchReservations)$/.test(c.url)));assertRedacted(d);
});
test('uptake still returns no guest code inside the eligible time window',async()=>{assertRedacted(await setup({now:'2027-01-25T14:00:00Z'}).reader.uptake(exact));});
test('uptake metadata does not depend on calling account/checkin/Wallet or registry',async()=>{const s=setup({restDenied:true});assert.equal((await s.reader.uptake(exact)).marker.validV2,true);assert.equal(s.calls.length,2);});
test('detail before approved 15h retains all gates and keeps code hidden',async()=>{const d=await setup({now:'2027-01-25T13:59:59Z'}).reader.detail(exact);assert.equal(d.accessCode,'');assert.equal(d.releaseAt,'2027-01-25T14:00:00.000Z');assert.equal(d.rawPmsFrom,'2027-01-25T16:00:00');});
test('detail after approved 15h reveals synthetic code only with paid completed registration',async()=>{const d=await setup({now:'2027-01-25T14:00:00Z'}).reader.detail(exact);assert.equal(d.accessCode,SYNTHETIC_CODE);assert.equal(d.accessConfirmed,true);});
test('approved arrival never bypasses incomplete checkin',async()=>{assert.equal((await setup({now:'2027-01-25T14:00:00Z',checkin:false}).reader.detail(exact)).accessCode,'');});
test('approved arrival never bypasses guest debt',async()=>{assert.equal((await setup({now:'2027-01-25T14:00:00Z',paid:false}).reader.detail(exact)).accessCode,'');});
test('approved arrival never bypasses unknown REST state',async()=>{const d=await setup({now:'2027-01-25T14:00:00Z',restDenied:true}).reader.detail(exact);assert.equal(d.accessCode,'');assert.equal(d.checkinComplete,null);});
test('detail closes code at original departure exactly',async()=>{assert.equal((await setup({now:'2027-01-29T09:00:00Z'}).reader.detail(exact)).accessCode,'');});
test('ordinary stay keeps original 16h release without owner decision',async()=>{
 const q={...exact,voucher:'SYNTHETIC-OTHER'},s=setup({selected:q,note:makeNote(q,{from:q.arrival+'T16:00:00'}),now:'2027-01-25T14:00:00Z'}),d=await s.reader.detail(q);
 assert.equal(d.accessCode,'');assert.equal(d.releaseAt,'2027-01-25T15:00:00.000Z');assert.equal(Object.hasOwn(d,'ownerArrival'),false);assert.equal(Object.hasOwn(d,'rawPmsFrom'),false);
 const u=await s.reader.uptake(q);assert.equal(u.marker.validV2,true);assert.equal(u.term.effectiveFrom,'2027-01-25T16:00:00');
});
test('ordinary stay may release at original 16h with all original gates',async()=>{const q={...exact,voucher:'SYNTHETIC-OTHER'};assert.equal((await setup({selected:q,note:makeNote(q,{from:q.arrival+'T16:00:00'}),now:'2027-01-25T15:00:00Z'}).reader.detail(q)).accessCode,SYNTHETIC_CODE);});
test('owner grant does not transfer to another COM with same voucher',async()=>{const q={...exact,id:'999999002'},d=await setup({selected:q}).reader.uptake(q);assert.equal(d.term.ownerArrival,null);assert.equal(d.marker.validV2,false);});
test('owner grant does not transfer to another reservation ID',async()=>{const q={...exact,resId:'999999003'},d=await setup({selected:q}).reader.uptake(q);assert.equal(d.term.ownerArrival,null);assert.equal(d.marker.validV2,false);});
test('owner grant does not transfer to another apartment',async()=>{const q={...exact,apt:'3'},d=await setup({selected:q}).reader.uptake(q);assert.equal(d.term.ownerArrival,null);assert.equal(d.marker.validV2,false);});
test('owner grant does not transfer to different dates',async()=>{const q={...exact,arrival:'2027-01-26'},d=await setup({selected:q}).reader.uptake(q);assert.equal(d.term.ownerArrival,null);assert.equal(d.marker.validV2,false);});
test('expired owner grant cannot admit the 15h marker',async()=>{const d=await setup({ownerDecisions:[{...owner,valid_until:'2026-11-05T09:00:00Z'}]}).reader.uptake(exact);assert.equal(d.term.ownerArrival,null);assert.equal(d.marker.validV2,false);});
test('owner grant not yet valid cannot admit 15h',async()=>{const d=await setup({now:'2026-11-05T07:00:00Z'}).reader.uptake(exact);assert.equal(d.term.ownerArrival,null);assert.equal(d.marker.validV2,false);});
test('malformed owner source hash fails closed',async()=>{await assert.rejects(setup({ownerDecisions:[{...owner,actual_capture_sha256:'caller-boolean'}]}).reader.uptake(exact),/výjimka/);});
test('missing owner source message fails closed',async()=>{await assert.rejects(setup({ownerDecisions:[{...owner,human_message_id:''}]}).reader.uptake(exact),/výjimka/);});
test('duplicate exact owner decisions fail closed',async()=>{await assert.rejects(setup({ownerDecisions:[owner,owner]}).reader.uptake(exact),/Nejednoznačná/);});
test('invalid owner local time fails closed',async()=>{await assert.rejects(setup({ownerDecisions:[{...owner,confirmed_arrival_local:'25:00'}]}).reader.uptake(exact),/výjimka/);});
test('mismatched first heading cannot be concealed by correct code lower down',async()=>{
 const note='<p>Kód - 9999</p>'+makeNote(),s=setup({note,now:'2027-01-25T14:00:00Z'}),d=await s.reader.uptake(exact);
 assert.equal(d.marker.topCodeMatchesMarker,false);assert.equal(d.marker.validV2,false);assert.equal((await s.reader.detail(exact)).accessCode,'');
});
test('malformed first heading is not skipped for a valid later heading',async()=>{const d=await setup({note:'<p>Kód - invalid</p>'+makeNote()}).reader.uptake(exact);assert.equal(d.marker.topCodeMatchesMarker,false);assert.equal(d.marker.validV2,false);});
test('duplicate V2 source cannot be claimed as valid',async()=>{const d=await setup({note:makeNote()+makeNote()}).reader.uptake(exact);assert.equal(d.marker.count,2);assert.equal(d.marker.validV2,false);assert.equal(d.marker.parsed,null);});
test('extra malformed V2 token makes source ambiguous',async()=>{const d=await setup({note:makeNote()+' HS18ACCESSV2 garbage'}).reader.uptake(exact);assert.equal(d.marker.count,2);assert.equal(d.marker.validV2,false);});
test('wrong marker COM is invalid and unrelated parsed identity is not exported',async()=>{const d=await setup({note:makeNote(exact,{com:'999999999'})}).reader.uptake(exact);assert.equal(d.marker.identityMatches,false);assert.equal(d.marker.parsed,null);assert.equal(d.marker.validV2,false);});
test('wrong marker apartment is invalid',async()=>{assert.equal((await setup({note:makeNote(exact,{apt:'3'})}).reader.uptake(exact)).marker.validV2,false);});
test('wrong marker departure is invalid',async()=>{assert.equal((await setup({note:makeNote(exact,{to:'2027-01-30T10:00:00'})}).reader.uptake(exact)).marker.validV2,false);});
test('raw PMS 16 marker cannot silently replace approved 15 term',async()=>{assert.equal((await setup({note:makeNote(exact,{from:'2027-01-25T16:00:00'})}).reader.uptake(exact)).marker.validV2,false);});
test('missing marker remains a read result without false uptake',async()=>{const d=await setup({note:'No access block'}).reader.uptake(exact);assert.equal(d.marker.count,0);assert.equal(d.marker.validV2,false);assert.equal(d.marker.codePresent,false);assertRedacted(d);});
test('oversized note is not parsed or returned',async()=>{const d=await setup({note:'x'.repeat(64001)+makeNote()}).reader.uptake(exact);assert.equal(d.marker.validV2,false);assertRedacted(d);});
test('same-stay mismatch from source is rejected',async()=>{await assert.rejects(setup({sourceMismatch:{voucher:'SYNTH-WRONG'}}).reader.uptake(exact));});
test('wrong hotel cannot be read as Hillside',async()=>{await assert.rejects(setup({hotel:'85'}).reader.uptake(exact));});
test('multiple matching PMS rows are rejected',async()=>{await assert.rejects(setup({roomCount:2}).reader.uptake(exact));});
test('cancelled source is not active uptake',async()=>{await assert.rejects(setup({status:'7'}).reader.uptake(exact));});
test('anonymous uptake rejects before reader',async()=>{const {r,calls}=await call(query(),{authorized:false});assert.equal(r.code,401);assert.equal(calls,0);assert.equal(r.headers['Cache-Control'],'private, no-store');});
test('POST uptake is forbidden even for authenticated session',async()=>{const {r,calls}=await call(query(),{method:'POST'});assert.equal(r.code,405);assert.equal(calls,0);});
test('valid authenticated GET reaches only uptake reader',async()=>{const {r,calls}=await call(query());assert.equal(r.code,200);assert.equal(calls,1);assert.equal(r.headers.Vary,'Cookie');});
test('caller arrival override query parameter is refused',async()=>{const {r,calls}=await call(query({confirmedArrivalLocal:'12:00'}));assert.equal(r.code,400);assert.equal(calls,0);});
test('expected PIN or digest query parameter is refused',async()=>{for(const key of ['pin','expectedPin','source_note_sha256']){const {r,calls}=await call(query({[key]:'synthetic'}));assert.equal(r.code,400);assert.equal(calls,0);}});
test('missing exact identity is refused',async()=>{const q=query();delete q.resId;const {r,calls}=await call(q);assert.equal(r.code,400);assert.equal(calls,0);});
test('repeated query values are refused',async()=>{const {r,calls}=await call(query({id:[exact.id,exact.id]}));assert.equal(r.code,400);assert.equal(calls,0);});
test('malformed IDs and excessive fields are refused before read',async()=>{for(const extra of [{id:'0'},{resId:'-1'},{apt:'4'},{voucher:'x'.repeat(81)},{arrival:'tomorrow'}]){const {r,calls}=await call(query(extra));assert.equal(r.code,400);assert.equal(calls,0);}});
test('pure original accessMarker API keeps its return shape',()=>{const x={note:makeNote(exact,{from:'2027-01-25T16:00:00'}),term:{from:'2027-01-25 16:00:00',to:'2027-01-29 10:00:00'}};assert.deepEqual(accessMarker(x,exact),{verified:'APARTMENT SKIROOM',code:SYNTHETIC_CODE});});
test('approved arrival cannot hide invalid raw PMS clock',async()=>{await assert.rejects(setup({rawFrom:'2027-01-25 25:00:00'}).reader.uptake(exact));});
test('invalid raw PMS departure remains rejected',async()=>{await assert.rejects(setup({rawTo:'2027-01-29 25:00:00'}).reader.uptake(exact));});
test('owner validity without explicit timezone fails closed',async()=>{await assert.rejects(setup({ownerDecisions:[{...owner,valid_from:'2026-11-05T08:12:19'}]}).reader.uptake(exact),/výjimka/);});
test('owner validity with reversed interval fails closed',async()=>{await assert.rejects(setup({ownerDecisions:[{...owner,valid_until:'2026-11-04T08:12:19Z'}]}).reader.uptake(exact),/výjimka/);});
test('owner15 cannot release a legacy V1 marker bound only to raw PMS16',async()=>{
 const note='[HS18-ACCESS-V1;COM='+exact.id+';APT=2;FROM=2027-01-25T16:00:00;TO=2027-01-29T10:00:00;VERIFIED=APARTMENT,SKIROOM]Kód - '+SYNTHETIC_CODE+'[/HS18-ACCESS]';
 const d=await setup({note,now:'2027-01-25T14:00:00Z'}).reader.detail(exact);
 assert.equal(d.releaseAt,'2027-01-25T14:00:00.000Z');assert.equal(d.checkinComplete,true);assert.equal(d.paymentComplete,true);assert.equal(d.accessCode,'');assert.equal(d.accessConfirmed,false);
});
test('ordinary V1 detail still follows its original PMS16 scope and release',async()=>{
 const q={...exact,voucher:'SYNTHETIC-OTHER'},note='[HS18-ACCESS-V1;COM='+q.id+';APT=2;FROM=2027-01-25T16:00:00;TO=2027-01-29T10:00:00;VERIFIED=APARTMENT,SKIROOM]Kód - '+SYNTHETIC_CODE+'[/HS18-ACCESS]';
 const d=await setup({selected:q,note,now:'2027-01-25T15:00:00Z'}).reader.detail(q);
 assert.equal(d.releaseAt,'2027-01-25T15:00:00.000Z');assert.equal(d.accessCode,SYNTHETIC_CODE);assert.equal(Object.hasOwn(d,'ownerArrival'),false);
});
