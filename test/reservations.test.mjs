import {test} from 'node:test';import assert from 'node:assert/strict';
import {createCipheriv,createHash} from 'node:crypto';
import {apiKey,createPrevioReader,dateWindows,parseXml,onlineCheckin,guestPayment,alfredCode,pragueInstant,accessCode,accessMarker} from '../lib/previo-reservations.js';
import {createReservationsHandler} from '../api/reservations.js';
const clock=()=>new Date('2026-11-02T12:00:00Z');
const room=(extra='')=>'<reservation><comId>123</comId><resId>456</resId><voucher>1234567890</voucher><term><from>2027-01-15 14:00:00</from><to>2027-01-20 10:00:00</to></term><status><statusId>2</statusId></status><object><name>Apt3</name></object><guest><gueId>7</gueId><firstName>Žaneta</firstName><lastName>Nováková</lastName><phone>+420777000001</phone></guest><alfredCode>SYNTH01</alfredCode><lanId>3</lanId><note>Must never be exported</note>'+extra+'</reservation>';
function setup({restDenied=false,changeRoom=false}={}){
 const calls=[],booking={resId:456,hotId:763519,voucher:'1234567890',requirePayment:true,commissions:[{comId:123,cosId:2,termFrom:'2027-01-15T14:00:00',termTo:'2027-01-20T10:00:00',completeCheckin:true,guests:[{gueId:7,hasCompleteInfo:true}]}]};
 const acct={resId:456,groupAccount:{total:1250,paid:1250,needPay:false,items:[{coaId:1,comId:123,owner:{type:'guest',id:7},price:1250,paid:1250,count:1}]}};
 const reader=createPrevioReader({env:{PREVIO_API_KEY:'synthetic'},now:clock,fetcher:async(url,options)=>{
  calls.push({url,options});let raw;
  if(url.includes('/rest/')){assert.equal(options.headers['X-Previo-Hotel-Id'],'763519');assert.equal(options.headers['X-Previo-Language-ID'],'1');assert.equal(options.headers.Authorization,'ApiKey synthetic');return {ok:!restDenied,status:restDenied?403:200,text:async()=>JSON.stringify(url.includes('/account?')?acct:booking)};}
  assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'ApiKey synthetic');
  if(url.endsWith('/get'))raw='<hotel><hotId>763519</hotId><isTest>false</isTest></hotel>';
  else{assert.ok(url.endsWith('/searchReservations'));raw='<reservations>'+room().replace('Apt3',changeRoom?'Apt2':'Apt3')+'</reservations>';}
  return {ok:true,status:200,text:async()=>raw};
 }});return {reader,calls,booking,acct};
}
const selected={id:'123',resId:'456',voucher:'1234567890',apt:'3',arrival:'2027-01-15',departure:'2027-01-20'};

test('registry creation metadata is explicit opt-in; ordinary lookup and Wallet inputs keep their original shape',async()=>{
 const reader=createPrevioReader({env:{PREVIO_API_KEY:'synthetic'},now:clock,fetcher:async url=>{
  if(url.includes('/rest/'))return {ok:false,status:403};
  return {ok:true,text:async()=>url.endsWith('/get')?'<hotel><hotId>763519</hotId><isTest>false</isTest></hotel>':'<reservations>'+room('<created>2026-11-02 21:20:04</created>')+'</reservations>'};
 }});
 const ordinary=await reader.detail(selected),registry=await reader.detail(selected,{includeRegistryCreationEvidence:true});
 assert.ok(!Object.hasOwn(ordinary,'registrySourceCreatedAt'));assert.equal(registry.registrySourceCreatedAt,'2026-11-02T20:20:04.000Z');const {registrySourceCreatedAt,...originalShape}=registry;assert.deepEqual(originalShape,ordinary);
});
test('PMS times use Prague winter/summer offset and reject ambiguous local times',()=>{assert.equal(pragueInstant('2027-01-15 14:00:00'),'2027-01-15T13:00:00.000Z');assert.equal(pragueInstant('2027-07-15 14:00:00'),'2027-07-15T12:00:00.000Z');assert.throws(()=>pragueInstant('2027-03-28 02:30:00'));assert.throws(()=>pragueInstant('2027-10-31 02:30:00'));});
test('access marker must match exact room, apartment, times and be unique',()=>{
 const marker='[HS18-ACCESS-V1;COM=123;APT=3;FROM=2027-01-15T14:00:00;TO=2027-01-20T10:00:00;VERIFIED=APARTMENT,SKIROOM]<b><u>Kód - 0258</u></b>[/HS18-ACCESS]',x={note:marker,term:{from:'2027-01-15 14:00:00',to:'2027-01-20 10:00:00'}};
 assert.equal(accessCode(x,selected),'0258');for(const note of ['Kód - 0258',marker+marker,marker.replace('APT=3','APT=2'),marker.replace('COM=123','COM=999'),marker.replace('TO=2027-01-20','TO=2027-01-21')])assert.equal(accessCode({...x,note},selected),'');
});
test('GUI-safe V2 marker survives divs and entities and keeps the human code on top',()=>{
 const note='<b><u>K&#243;d - 0258</u></b><div>HS18ACCESSV2 COM 123 APT 3 FROM 20270115140000 TO 20270120100000 VERIFIED APARTMENT SKIROOM CODE 0258 ENDHS18ACCESS</div>',r={note,term:{from:'2027-01-15 14:00:00',to:'2027-01-20 10:00:00'}};
 assert.equal(accessCode(r,selected),'0258');assert.equal(accessCode({...r,note:note+note},selected),'');assert.equal(accessCode({...r,note:note.replace('COM 123','COM 999')},selected),'');
});
test('TEST ONLY marker transfers only literal TEST and never proves door access',()=>{
 const r={note:'<b><u>Kód - TEST</u></b><div>HS18ACCESSV2 COM 123 APT 3 FROM 20270115140000 TO 20270120100000 VERIFIED TEST ONLY CODE TEST ENDHS18ACCESS</div>',term:{from:'2027-01-15 14:00:00',to:'2027-01-20 10:00:00'}};
 assert.deepEqual(accessMarker(r,selected),{verified:'TEST ONLY',code:'TEST'});assert.equal(accessCode(r,selected),'');
});
test('search name or voucher uses bounded read calls and deduplicates overlapping windows',async()=>{
 const s=setup();const a=await s.reader.search('no');assert.equal(a.items.length,1);assert.equal(a.items[0].guestName,'Žaneta Nováková');assert.equal(a.items[0].apt,'3');assert.ok(!('phone'in a.items[0]));assert.ok(!('alf'in a.items[0]));assert.ok(!('note'in a.items[0]));
 assert.equal((await s.reader.search('1234')).items.length,1);assert.ok(s.calls.every(c=>/\/(get|searchReservations)$/.test(c.url)));
});
test('one letter never requests Previo',async()=>{const s=setup();await assert.rejects(s.reader.search('n'));assert.equal(s.calls.length,0)});
test('name matching ignores diacritics and case',async()=>{const s=setup();assert.equal((await s.reader.search('ZAN')).items.length,1)});
test('query is escaped as XML text',async()=>{const s=setup();await s.reader.search('<x>');assert.match(s.calls[1].options.body,/<fulltext>&lt;x&gt;<\/fulltext>/)});
test('date windows cover recent and future stays without any more than 90 days',()=>{const windows=dateWindows(clock());assert.equal(windows[0].from,'2026-10-03');assert.equal(windows.at(-1).to,'2027-11-02');for(const w of windows)assert.ok((Date.parse(w.to)-Date.parse(w.from))/86400000<=90)});
test('detail fetches exact stay, verified state and excludes notes or door PIN',async()=>{const s=setup();const d=await s.reader.detail(selected);assert.equal(d.checkinComplete,true);assert.equal(d.paymentComplete,true);assert.equal(d.alf,'SYNTH01');assert.equal(d.lang,'de');assert.equal(d.phone,'+420777000001');assert.ok(!('note'in d));assert.ok(!('door'in d));assert.match(s.calls.find(c=>c.url.endsWith('/searchReservations')).options.body,/<comId>123<\/comId>/)});
test('current API Alfred list selects only the unique room code, never the group code',()=>{
 const parsed=parseXml('<reservations>'+room().replace('<alfredCode>SYNTH01</alfredCode>','<alfredCodeList><alfredCode><code>ROOM001</code><type>room</type></alfredCode><alfredCode><code>GROUP01</code><type>group</type></alfredCode></alfredCodeList>')+'</reservations>','reservations');assert.equal(alfredCode(parsed.reservation[0]),'ROOM001');
 assert.equal(alfredCode({alfredCodeList:{alfredCode:[{code:'ROOM001',type:'room'},{code:'ROOM002',type:'room'}]}}),'');assert.equal(alfredCode({alfredCodeList:{alfredCode:{code:'GROUP01',type:'group'}}}),'');
});
test('legacy Alfred URL accepts only the original allowed login host',()=>{assert.equal(alfredCode({alfredCode:'https://alfred.previo.app/login/SYNTH01'}),'SYNTH01');assert.equal(alfredCode({alfredCode:'https://attacker.invalid/login/SYNTH01'}),'')});
test('wrong apartment prevents detail from being used',async()=>{const s=setup({changeRoom:true});await assert.rejects(s.reader.detail(selected),/změnila/)});
test('checked-out stay is not presented as an active arrival',async()=>{const reader=createPrevioReader({env:{PREVIO_API_KEY:'synthetic'},now:clock,fetcher:async url=>({ok:true,text:async()=>url.endsWith('/get')?'<hotel><hotId>763519</hotId><isTest>false</isTest></hotel>':'<reservations>'+room().replace('<statusId>2</statusId>','<statusId>9</statusId>')+'</reservations>'})});assert.equal((await reader.search('No')).items.length,0);await assert.rejects(reader.detail(selected),/změnila/)});
test('REST permission failure keeps identity but returns UNKNOWN states',async()=>{const s=setup({restDenied:true});const d=await s.reader.detail(selected);assert.equal(d.id,'123');assert.equal(d.checkinComplete,null);assert.equal(d.paymentComplete,null);assert.match(d.stateNotice,/nepodařilo ověřit/)});
test('XML DTD and API errors are not a successful empty result',()=>{assert.throws(()=>parseXml('<!DOCTYPE a><reservations/>','reservations'));assert.throws(()=>parseXml('<error><code>1022</code></error>','reservations'),/nepovolilo/);assert.throws(()=>parseXml('<html/>','reservations'))});
test('only complete online registration of all guests gives checked-in flag',()=>{
 assert.equal(onlineCheckin({cosId:3,completeCheckin:false,guests:[{hasCompleteInfo:false}]}),false);
 assert.equal(onlineCheckin({cosId:2,completeCheckin:true,guests:[{hasCompleteInfo:true},{hasCompleteInfo:true}]}),true);
 assert.equal(onlineCheckin({completeCheckin:true,guests:[{hasCompleteInfo:true},{hasCompleteInfo:false}]}),false);
 assert.equal(onlineCheckin({cosId:3,guests:[{hasCompleteInfo:true}]}),null);
 assert.equal(onlineCheckin({completeCheckin:true,guests:[]}),null);
});
test('OTA balance does not become guest debt, guest dog charge remains due',()=>{
 const s=setup();s.acct.groupAccount.total=11250;s.acct.groupAccount.paid=1250;s.acct.groupAccount.needPay=true;s.acct.groupAccount.items.push({comId:123,owner:{type:'ota',id:100},price:10000,paid:0,count:1});assert.equal(guestPayment(s.acct,s.booking),true);
 s.acct.groupAccount.items[0].paid=0;assert.equal(guestPayment(s.acct,s.booking),false);
});
test('unassigned items count as non-OTA, missing payment stays unknown',()=>{const s=setup();s.acct.groupAccount.needPay=true;delete s.acct.groupAccount.items[0].owner;assert.equal(guestPayment(s.acct,s.booking),true);s.acct.groupAccount.items[0].paid=0;assert.equal(guestPayment(s.acct,s.booking),false);delete s.acct.groupAccount.items[0].paid;assert.equal(guestPayment(s.acct,s.booking),null)});
test('wrong reservation or unknown guest/room makes payment unknown',()=>{const s=setup();s.acct.resId=999;assert.equal(guestPayment(s.acct,s.booking),null);s.acct.resId=456;s.acct.groupAccount.items[0].comId=999;assert.equal(guestPayment(s.acct,s.booking),null)});
test('explicit empty zero account has no debt; missing totals do not prove settlement',()=>{const s=setup();s.acct.groupAccount.items=[];s.acct.groupAccount.total=0;s.acct.groupAccount.paid=0;assert.equal(guestPayment(s.acct,s.booking),true);delete s.acct.groupAccount.total;assert.equal(guestPayment(s.acct,s.booking),null)});
test('company debt counts and OTA overpayment cannot cancel it',()=>{const s=setup();s.acct.groupAccount.items[0].owner={type:'company',id:77};s.acct.groupAccount.items[0].paid=0;s.acct.groupAccount.items.push({comId:123,owner:{type:'OTA',id:1},price:100,paid:10000,count:1});assert.equal(guestPayment(s.acct,s.booking),false);s.acct.groupAccount.items[0].paid=1250;assert.equal(guestPayment(s.acct,s.booking),true)});
test('OTA-only debt is settled for the guest even when group needPay is true',()=>{const s=setup();s.acct.groupAccount.items[0].owner={type:'ota',id:1};s.acct.groupAccount.items[0].paid=0;s.acct.groupAccount.needPay=true;assert.equal(guestPayment(s.acct,s.booking),true)});
test('one non-OTA owner credit does not erase another owner debt',()=>{const s=setup();s.acct.groupAccount.items[0].paid=2500;s.acct.groupAccount.items.push({comId:123,owner:{type:'company',id:77},price:1250,paid:0,count:1});assert.equal(guestPayment(s.acct,s.booking),false)});
test('sealed server credential decrypts only with correct existing server secret',()=>{
 const env={HILLSIDE_WALLET_SESSION_SECRET:'synthetic-server-secret'},nonce=Buffer.alloc(12,7),key=createHash('sha256').update('hs18-previo-api-v1:'+env.HILLSIDE_WALLET_SESSION_SECRET).digest(),c=createCipheriv('aes-256-gcm',key,nonce);c.setAAD(Buffer.from('hotel763519'));const data=Buffer.concat([c.update('synthetic-api-key'),c.final()]);env.PREVIO_API_KEY_SEALED='v1.'+nonce.toString('base64url')+'.'+data.toString('base64url')+'.'+c.getAuthTag().toString('base64url');assert.equal(apiKey(env),'synthetic-api-key');assert.throws(()=>apiKey({...env,HILLSIDE_WALLET_SESSION_SECRET:'other'}));
});
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(data){this.data=data;return this}}}
test('anonymous search returns 401 before any data is read',async()=>{let calls=0;const h=createReservationsHandler({authorize:()=>false,reader:{search(){calls++}}}),r=response();await h({method:'GET',query:{q:'No'}},r);assert.equal(r.code,401);assert.equal(calls,0);assert.match(r.headers['Cache-Control'],/no-store/)});
test('write methods cannot be used on reservation search',async()=>{const h=createReservationsHandler({authorize:()=>true}),r=response();await h({method:'POST'},r);assert.equal(r.code,405)});
test('authorized handler forwards only actual reader result',async()=>{const h=createReservationsHandler({authorize:()=>true,reader:{search:async()=>({items:[selected],observedAt:clock().toISOString()})}}),r=response();await h({method:'GET',query:{q:'No'}},r);assert.equal(r.code,200);assert.equal(r.data.items.length,1)});
