import {test} from 'node:test';
import assert from 'node:assert/strict';
import registry from '../lib/registry.cjs';
import {createHistoryReader} from '../lib/manager-history.js';
import {createManagerHistoryHandler} from '../lib/manager-history-handler.js';
import {createSessionCookie} from '../api/_wallet-auth.js';
const selected={id:'123',resId:'456',voucher:'1234567890',apt:'2',arrival:'2027-01-15',departure:'2027-01-20'};
const stay={...selected,alf:'SYNTHETIC001',phone:'SENSITIVE_PHONE',accessCode:'1234',guestName:'PRIVATE_GUEST'};
function response(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},json(v){this.body=v;return this}};}
function setup({events=[],legacy=[],claims={}}={}){
 const calls=[];const contexts=['none','paid','unpaid','done'].map(state=>registry.contextOf({context:{alf:stay.alf,apt:'2',state}}));
 const history=createHistoryReader({now:()=>new Date('2026-11-03T08:00:00Z'),read:async command=>{
  calls.push(command);assert.ok(['GET','HVALS'].includes(command[0]),'Read endpoint attempted mutation');
  if(command[0]==='HVALS')return events.map(e=>JSON.stringify(e));
  if(command[1]===registry.HISTORY)return JSON.stringify(legacy);
  const index=contexts.findIndex(c=>c.key===command[1]);return claims[index]===undefined?null:JSON.stringify(claims[index]);
 }});return {history,calls,contexts};
}
test('durable event older than recent20 is found in exact stage without storage writes',async()=>{
 const c=registry.contextOf({context:{alf:stay.alf,apt:'2',state:'paid'}}),s=setup({events:[{id:'old',stay:c.stay,stage:c.stage,status:'accepted',at:1}],legacy:Array.from({length:20},(_,i)=>({id:i,alf:'UNRELATED001',apt:'1',state:'none'}))});
 const r=await s.history(stay);assert.equal(r.stages[1].hasPriorOrUnresolvedAttempt,true);assert.equal(r.stages[0].hasPriorOrUnresolvedAttempt,false);assert.equal(s.calls.length,6);assert.equal(r.allChannelsVerified,false);assert.equal(r.legacyRecentHistoryComplete,false);
});
test('all four pending/unknown/rejected/accepted claims remain blocking',async()=>{
 const s=setup({claims:{0:{status:'pending',at:1},1:{status:'unknown',at:2},2:{status:'rejected',at:3},3:{status:'accepted',at:4}}});
 const r=await s.history(stay);assert.ok(r.stages.every(x=>x.hasPriorOrUnresolvedAttempt));assert.deepEqual(r.stages.map(x=>x.claim.status),['pending','unknown','rejected','accepted']);
});
test('legacy rows are read without bootstrap and never claim complete pre-ledger history',async()=>{
 const s=setup({legacy:[{id:'l',alf:stay.alf,apt:'2',state:'done',ts:10}]});const r=await s.history(stay);assert.equal(r.stages[3].records[0].status,'reported_success');assert.equal(r.absenceIsNotProofOfNoHistoricSend,true);assert.ok(s.calls.every(c=>c[0]!=='HSETNX'));
});
test('unrelated stay cannot block or disclose its metadata',async()=>{
 const s=setup({events:[{id:'PRIVATE_GUEST',stay:'unrelated',stage:'PORTAL_NONE',status:'accepted',text:'SECRET_MESSAGE',phone:'SENSITIVE_PHONE'}]});const r=await s.history(stay);assert.ok(r.stages.every(s=>!s.hasPriorOrUnresolvedAttempt));assert.doesNotMatch(JSON.stringify(r),/PRIVATE_GUEST|SECRET_MESSAGE|SENSITIVE_PHONE/);
});
test('malformed durable data or claim fails closed',async()=>{
 await assert.rejects(createHistoryReader({read:async c=>c[0]==='HVALS'?['broken']:null})(stay));
 await assert.rejects(createHistoryReader({read:async c=>c[0]==='HVALS'?[]:c[1]===registry.HISTORY?'[]':'broken'})(stay));
});
test('GET authorizes before any PMS or registry read; POST cannot mutate',async()=>{
 let calls=0;const h=createManagerHistoryHandler({authorize:()=>false,reader:{detail:async()=>{calls++}},history:async()=>{calls++}});
 for(const method of ['GET','POST']){const res=response();await h({method,query:selected},res);assert.equal(res.code,method==='GET'?401:405);}assert.equal(calls,0);
});
test('bound read response excludes name, phone, PIN and Alfred secret',async()=>{
 const s=setup(),res=response(),h=createManagerHistoryHandler({authorize:()=>true,reader:{detail:async q=>{assert.deepEqual(q,selected);return stay}},history:s.history,env:{VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)}});
 await h({method:'GET',query:selected},res);assert.equal(res.code,200);assert.equal(res.body.readOnly,true);assert.equal(res.body.noGuestActionPerformed,true);assert.doesNotMatch(JSON.stringify(res.body),/SYNTHETIC001|PRIVATE_GUEST|SENSITIVE_PHONE|accessCode|guestName/);assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('missing/array/extra request fields and changed PMS identity cannot pass',async()=>{
 for(const query of [{...selected,alf:'SYNTHETIC001'},{...selected,id:['123']},{...selected,apt:'4'},{...selected,id:undefined}]){
  const res=response();await createManagerHistoryHandler({authorize:()=>true,reader:{detail:async()=>{assert.fail('Invalid query reached PMS')}}})({method:'GET',query},res);assert.equal(res.code,400);
 }
 for(const wrong of [{...stay,apt:'1'},{...stay,alf:''}]){let read=false;const res=response();await createManagerHistoryHandler({authorize:()=>true,reader:{detail:async()=>wrong},history:async()=>{read=true}})({method:'GET',query:selected},res);assert.equal(res.code,503);assert.equal(read,false);}
});
test('registry outage is not a successful empty history',async()=>{
 const res=response();await createManagerHistoryHandler({authorize:()=>true,reader:{detail:async()=>stay},history:async()=>{throw Error('offline')}})({method:'GET',query:selected},res);assert.equal(res.code,503);assert.equal(res.body.ok,false);
});
test('unrecognized phase is preserved as unresolved evidence instead of silently omitted',async()=>{
 const c=registry.contextOf({context:{alf:stay.alf,apt:'2',state:'none'}}),s=setup({events:[{id:'new-phase',stay:c.stay,stage:'FUTURE_PHASE',status:'new_status'}]});const r=await s.history(stay);assert.equal(r.hasUnmappedPriorOrUnresolvedAttempt,true);assert.equal(r.otherStages[0].status,'unknown');assert.equal(r.otherStages[0].at,null);
});
test('actual existing registry GET route authorizes with original cookie and calls only PMS reads and Redis reads',async t=>{
 const original={...process.env};t.after(()=>{process.env=original});
 Object.assign(process.env,{HILLSIDE_WALLET_SESSION_SECRET:'synthetic-session-secret',PREVIO_API_KEY:'synthetic-api-key',UPSTASH_REDIS_REST_URL:'https://isolated.invalid',UPSTASH_REDIS_REST_TOKEN:'synthetic'});
 let pms=0,reads=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url==='https://isolated.invalid'){const c=JSON.parse(options.body);assert.ok(['GET','HVALS'].includes(c[0]));reads++;return {ok:true,json:async()=>({result:c[0]==='HVALS'?[]:c[1]===registry.HISTORY?'[]':null})};}
  assert.match(String(url),/^https:\/\/api\.previo\.app\/(x1\/hotel\/(get|searchReservations)|rest\/(reservation|account)\?resId=456)$/);pms++;
  if(String(url).endsWith('/get'))return {ok:true,text:async()=>'<hotel><hotId>763519</hotId><isTest>false</isTest></hotel>'};
  if(String(url).includes('/searchReservations'))return {ok:true,text:async()=>'<reservations><reservation><comId>123</comId><resId>456</resId><voucher>1234567890</voucher><object><name>Apt2</name></object><term><from>2027-01-15 14:00:00</from><to>2027-01-20 10:00:00</to></term><status><statusId>2</statusId></status><guest><name>Synthetic Guest</name></guest><alfredCode>SYNTHETIC001</alfredCode></reservation></reservations>'};
  return {ok:true,text:async()=>JSON.stringify({hotId:763519,resId:456,voucher:'1234567890',commissions:[{comId:123,termFrom:'2027-01-15T14:00:00',termTo:'2027-01-20T10:00:00'}]})};
 });
 const {default:handler}=await import('../api/registry.js?manager-history-route-test');
 const res=response();await handler({method:'GET',query:selected,headers:{cookie:createSessionCookie().split(';')[0]}},res);
 assert.equal(res.code,200);assert.equal(res.body.readOnly,true);assert.equal(pms,4);assert.equal(reads,6);assert.doesNotMatch(JSON.stringify(res.body),/SYNTHETIC001|Synthetic Guest/);
 const blocked=response();await handler({method:'GET',query:selected,headers:{'x-history-key':'old-key-without-session'}},blocked);assert.equal(blocked.code,401);assert.equal(pms,4);assert.equal(reads,6);
});
