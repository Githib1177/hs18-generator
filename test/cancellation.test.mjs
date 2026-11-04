import test from 'node:test';import assert from 'node:assert/strict';
import {IncomingMessage} from 'node:http';import {Socket} from 'node:net';
import {createCancellationHandler} from '../lib/cancellation-handler.js';
import {createPrevioReader} from '../lib/previo-reservations.js';
import {createGuestLinkHandler} from '../api/guest-link.js';
import {assertActiveReference,cancellationKey} from '../lib/cancellation-guard.js';
import {stayKey,passKey} from '../lib/wallet-store.js';
import registry from '../lib/registry.cjs';
import {createSessionCookie} from '../api/_wallet-auth.js';
const q={id:'123',resId:'456',voucher:'fixture',apt:'3',arrival:'2027-01-15',departure:'2027-01-24'};
const source={...q,hotelId:'763519',statusId:'7',alf:'SYNTHCANCEL',observedAt:'2026-11-04T12:00:00Z'};
const hash=registry.hash(source.alf),clock=()=>new Date('2026-11-04T12:00:00Z');
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},json(v){this.body=v;return this},end(v){this.body=v;return this}});
function fixture({hasPass=true,lost=false,unknown=false,pending=false,wrong=false}={}){
 const strings=new Map(),writes=[],events=pending?[JSON.stringify({stay:hash,status:'unknown'})]:[];
 let google=hasPass?{id:'123.00000000-0000-0000-0000-000000000001',classId:'123.c',state:'ACTIVE',cardTitle:{defaultValue:{language:'cs',value:'Hillside'}},header:{defaultValue:{value:'PRIVATE_PIN'}},textModulesData:[{id:'door',body:'PRIVATE_PIN'}],barcode:{value:'PRIVATE'}}:null,puts=0;
 const store=async c=>{
  if(c[0]==='GET')return strings.get(c[1])||null;
  if(c[0]==='HVALS')return events;
  writes.push(c[0]);
  if(c[0]==='SET'){if(c.includes('NX')&&strings.has(c[1]))return null;strings.set(c[1],c[2]);return 'OK';}
  if(c[0]==='EVAL'){if(c[2]===1){if(strings.get(c[3])!==c[4])return 0;strings.delete(c[3]);return 1;}if(strings.get(c[3])!==c[6])return 0;strings.set(c[4],c[7]);strings.set(c[5],c[7]);return 1;}
  throw Error('Unmocked command');
 };
 const pass={passId:'00000000-0000-0000-0000-000000000001',state:unknown?null:'ready',busyUntil:0};
 if(hasPass){strings.set(stayKey(hash),JSON.stringify(pass));strings.set(passKey(pass.passId),JSON.stringify(pass));}
 const h=createCancellationHandler({authorize:()=>true,env:{VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)},now:clock,store,reader:{cancelledDetail:async()=>wrong?{...source,statusId:'2'}:source},getConfig:()=>({issuerId:'123'}),getObject:async()=>google,putObject:async(o,c,f,options)=>{assert.equal(options.allowCreate,false);puts++;google=o;if(lost)throw Error('response lost');}});
 const call=async(method='POST')=>{const r=response();await h({method,query:q,body:{reservation:q}},r);return r;};
 return {call,strings,store,writes,puts:()=>puts,object:()=>google};
}
test('cancelled PMS is read separately, exact identity/status/hotel and proper XML; active reader rejects it',async()=>{
 const xml='<reservation><comId>123</comId><resId>456</resId><voucher>fixture</voucher><object><name>Apt3</name></object><term><from>2027-01-15 16:00:00</from><to>2027-01-24 10:00:00</to></term><status><statusId>7</statusId></status><guest><name>Private</name></guest><note>PRIVATE_PIN</note><alfredCode>SYNTHCANCEL</alfredCode></reservation>';
 let body,hotel='763519';const r=createPrevioReader({env:{PREVIO_API_KEY:'synthetic'},now:clock,fetcher:async(url,opt)=>{body=opt.body;return {ok:true,text:async()=>url.endsWith('/get')?`<hotel><hotId>${hotel}</hotId><isTest>false</isTest></hotel>`:'<reservations>'+xml+'</reservations>'};}});
 const d=await r.cancelledDetail(q);assert.equal(d.statusId,'7');assert.doesNotMatch(JSON.stringify(d),/PRIVATE_PIN|guestName|Private/);assert.match(body,/<term>.*<termType>overlap<\/termType><\/term>/);assert.match(body,/<statuses><cosId>7<\/cosId><\/statuses>/);
 await assert.rejects(r.detail(q));await assert.rejects(r.cancelledDetail({...q,apt:'2'}));hotel='85';await assert.rejects(r.cancelledDetail(q));
});
test('GET is truly read only and cannot present an unrevoked stay as complete',async()=>{const s=fixture();const r=await s.call('GET');assert.equal(r.body.ok,false);assert.equal(s.writes.length,0);assert.equal(s.puts(),0);});
test('one cancellation expires existing card, blocks save/messages/links; repeated request never repeats PUT',async()=>{
 const s=fixture();let r=await s.call();assert.equal(r.body.ok,true);assert.equal(r.body.receipt.messagesSent,0);assert.equal(s.puts(),1);assert.doesNotMatch(JSON.stringify(s.object()),/PRIVATE/);
 assert.equal((await s.call()).body.ok,true);assert.equal(s.puts(),1);await assert.rejects(assertActiveReference(s.store,hash));
 const id='x'.repeat(22);s.strings.set('hs18:guest-link:'+id,JSON.stringify({cs:'https://hillside18-guest-portal.vercel.app/?apt=3&alf='+source.alf}));
 const out=response();await createGuestLinkHandler({store:s.store})({method:'GET',query:{id}},out);assert.notEqual(out.code,302);assert.equal(out.headers.Location,undefined);
});
test('lost expiration response reconciles by GET without second PUT',async()=>{const s=fixture({lost:true});assert.equal((await s.call()).code,503);assert.equal((await s.call()).body.ok,true);assert.equal(s.puts(),1);});
test('unknown original Wallet is not overwritten, unresolved send prevents full completion',async()=>{
 const s=fixture({unknown:true});assert.equal((await s.call()).body.status,'wallet_unknown');assert.equal(s.puts(),0);
 const p=fixture({pending:true,hasPass:false});assert.equal((await p.call()).body.ok,false);assert.ok(p.strings.has(cancellationKey(hash)));
});
test('no current Wallet record creates no card and says exact scope; wrong PMS never writes',async()=>{
 const s=fixture({hasPass:false}),r=await s.call();assert.equal(r.body.ok,true);assert.equal(r.body.receipt.walletStatus,'no_current_reference_record');assert.equal(r.body.receipt.historicalExpandedLinksErased,false);assert.equal(s.puts(),0);
 const wrong=fixture({wrong:true});assert.equal((await wrong.call()).code,503);assert.equal(wrong.writes.length,0);
});
test('concurrent cancellation takes only one original Wallet lock',async()=>{const s=fixture(),r=await Promise.all([s.call(),s.call()]);assert.ok(r.some(x=>x.code===409));assert.equal(s.puts(),1);});
test('anonymous and preview cancellation cannot write',async()=>{
 for(const opt of [{authorize:()=>false},{authorize:()=>true,env:{VERCEL_ENV:'preview'}}]){let calls=0;const h=createCancellationHandler({...opt,store:async()=>{calls++}}),r=response();await h({method:'POST',body:{reservation:q}},r);assert.ok(r.code>=400);assert.equal(calls,0);}
});
test('actual existing registry route separates cancellation and preserves cookie authorization',async t=>{
 const original={...process.env};t.after(()=>{process.env=original});
 Object.assign(process.env,{HILLSIDE_WALLET_SESSION_SECRET:'synthetic',PREVIO_API_KEY:'synthetic',UPSTASH_REDIS_REST_URL:'https://isolated.invalid',UPSTASH_REDIS_REST_TOKEN:'synthetic'});
 let reads=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url==='https://isolated.invalid'){const c=JSON.parse(options.body);assert.ok(['GET','HVALS'].includes(c[0]));reads++;return {ok:true,json:async()=>({result:c[0]==='HVALS'?[]:null})};}
  assert.match(String(url),/^https:\/\/api.previo.app\/x1\/hotel\/(get|searchReservations)$/);
  return {ok:true,text:async()=>String(url).endsWith('/get')?'<hotel><hotId>763519</hotId><isTest>false</isTest></hotel>':'<reservations><reservation><comId>123</comId><resId>456</resId><voucher>fixture</voucher><object><name>Apt3</name></object><term><from>2027-01-15 16:00:00</from><to>2027-01-24 10:00:00</to></term><status><statusId>7</statusId></status><guest><name>Synthetic</name></guest><alfredCode>SYNTHCANCEL</alfredCode></reservation></reservations>'};
 });
 const {default:handler}=await import('../api/registry.js?cancel-route-test');
 for(const req of [{},new IncomingMessage(new Socket())]){
  req.method='GET';req.query={operation:'cancellation',...q};req.headers={cookie:createSessionCookie().split(';')[0]};
  const out=response();await handler(req,out);assert.equal(out.code,200);assert.equal(out.body.receipt.statusId,'7');assert.equal(out.body.ok,false);assert.ok(reads>0);
 }
 const denied=response();await handler({method:'POST',query:{operation:'cancellation'},body:{reservation:q},headers:{'x-history-key':'synthetic'}},denied);assert.equal(denied.code,401);
});
