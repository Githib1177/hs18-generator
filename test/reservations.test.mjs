import {test} from 'node:test';import assert from 'node:assert/strict';
import {createCipheriv,createHash} from 'node:crypto';
import {apiKey,createPrevioReader,dateWindows,parseXml,onlineCheckin,guestPayment,alfredCode} from '../lib/previo-reservations.js';
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
test('unknown item ownership or missing per-item payment cannot be called settled',()=>{const s=setup();s.acct.groupAccount.needPay=true;delete s.acct.groupAccount.items[0].owner;assert.equal(guestPayment(s.acct,s.booking),null);s.acct.groupAccount.items[0].owner={type:'guest',id:7};delete s.acct.groupAccount.items[0].paid;assert.equal(guestPayment(s.acct,s.booking),null)});
test('wrong reservation or unknown guest/room makes payment unknown',()=>{const s=setup();s.acct.resId=999;assert.equal(guestPayment(s.acct,s.booking),null);s.acct.resId=456;s.acct.groupAccount.items[0].comId=999;assert.equal(guestPayment(s.acct,s.booking),null)});
test('empty uninitialized account is not proof of payment',()=>{const s=setup();s.acct.groupAccount.items=[];s.acct.groupAccount.total=0;s.acct.groupAccount.paid=0;assert.equal(guestPayment(s.acct,s.booking),null);s.booking.requirePayment=false;assert.equal(guestPayment(s.acct,s.booking),true)});
test('sealed server credential decrypts only with correct existing server secret',()=>{
 const env={HILLSIDE_WALLET_SESSION_SECRET:'synthetic-server-secret'},nonce=Buffer.alloc(12,7),key=createHash('sha256').update('hs18-previo-api-v1:'+env.HILLSIDE_WALLET_SESSION_SECRET).digest(),c=createCipheriv('aes-256-gcm',key,nonce);c.setAAD(Buffer.from('hotel763519'));const data=Buffer.concat([c.update('synthetic-api-key'),c.final()]);env.PREVIO_API_KEY_SEALED='v1.'+nonce.toString('base64url')+'.'+data.toString('base64url')+'.'+c.getAuthTag().toString('base64url');assert.equal(apiKey(env),'synthetic-api-key');assert.throws(()=>apiKey({...env,HILLSIDE_WALLET_SESSION_SECRET:'other'}));
});
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(data){this.data=data;return this}}}
test('anonymous search returns 401 before any data is read',async()=>{let calls=0;const h=createReservationsHandler({authorize:()=>false,reader:{search(){calls++}}}),r=response();await h({method:'GET',query:{q:'No'}},r);assert.equal(r.code,401);assert.equal(calls,0);assert.match(r.headers['Cache-Control'],/no-store/)});
test('write methods cannot be used on reservation search',async()=>{const h=createReservationsHandler({authorize:()=>true}),r=response();await h({method:'POST'},r);assert.equal(r.code,405)});
test('authorized handler forwards only actual reader result',async()=>{const h=createReservationsHandler({authorize:()=>true,reader:{search:async()=>({items:[selected],observedAt:clock().toISOString()})}}),r=response();await h({method:'GET',query:{q:'No'}},r);assert.equal(r.code,200);assert.equal(r.data.items.length,1)});
