import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/send-sms.js';
import registryHandler from '../api/registry.js';
import registry from '../lib/registry.cjs';
const {HISTORY,EVENTS,contextOf,normalizeAlf,contextFromText,claim,finish}=registry;
import * as esmRegistry from '../lib/registry.mjs';

test('registry guards actual SMS handler without a real network',async t=>{
 const original={...process.env};t.after(()=>{process.env=original});
 Object.assign(process.env,{HISTORY_ACCESS_KEY:'unit-test',SMS_LOGIN:'test',SMS_PASSWORD:'test',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'test',VERCEL_ENV:'production'});
 const strings=new Map(),hashes=new Map();let providerCalls=0,storageDown=false,providerMode='ok',failOutcome=false,beforeEval=null;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url).startsWith('https://api.smsbrana.cz/')){
   providerCalls++;const mode=Array.isArray(providerMode)?providerMode.shift():providerMode;
   if(mode==='timeout')throw new Error('timeout');
   const raw=mode==='malformed'?'upstream failure':`<err>${mode==='ok'||mode==='http-error'?0:mode}</err><sms_id>12345</sms_id>`;
   return {ok:mode!=='http-error',status:mode==='http-error'?500:200,text:async()=>raw};
  }
  assert.equal(url,'https://redis.invalid');if(storageDown)throw new Error('offline');
  const [op,key,a,b]=JSON.parse(options.body);let result;
  if(op==='GET')result=strings.get(key)||null;
  else if(op==='SET'){if(b==='NX'&&strings.has(key))result=null;else{strings.set(key,a);result='OK'}}
  else if(op==='EVAL'){
   const [,script,count,claimKey,eventKey,expected,id,eventRaw,replacement]=JSON.parse(options.body);
   assert.equal(count,2);assert.equal(eventKey,EVENTS);assert.match(script,/redis.call\('HGET'/);
   if(beforeEval){const hook=beforeEval;beforeEval=null;hook(claimKey);}
   if(strings.get(claimKey)!==expected||hashes.get(eventKey)?.get(id)!==eventRaw)result=0;
   else if(replacement===''){strings.delete(claimKey);result=1;}
   else{strings.set(claimKey,replacement);result=1;}
  }
  else if(op==='HVALS')result=[...(hashes.get(key)||new Map()).values()];
  else if(op==='HSET'||op==='HSETNX'){
   if(failOutcome&&op==='HSET'&&JSON.parse(b).status!=='pending')throw new Error('write failed');
   if(!hashes.has(key))hashes.set(key,new Map());let h=hashes.get(key);
   if(op==='HSETNX'&&h.has(a))result=0;else{h.set(a,b);result=1;}
  }else assert.fail('Unexpected command '+op);
  return {ok:true,json:async()=>({result})};
 });
 const body=(alf='TESTCODE',state='none')=>({to:['+420777000001'],text:`Hillside 18: Info https://hillside18-guest-portal.vercel.app/?apt=1&alf=${alf}${state==='none'?'':'&'+state+'=1'}`,context:{alf,apt:'1',state}});
 async function call(fn,b,auth=true){let r={setHeader(){},status(c){this.code=c;return this},json(d){this.data=d;return this}};await fn({method:'POST',headers:auth?{'x-history-key':'unit-test'}:{},body:b},r);return r;}
 await t.test('old full and compact Alfred links normalize identically',()=>{assert.equal(normalizeAlf('https://alfred.previo.app/login/TESTCODE'),'TESTCODE');assert.equal(contextOf(body()).stay,contextFromText(body().text).stay)});
 await t.test('historical success blocks repeat without mutating old history',async()=>{
  const raw=JSON.stringify([{id:'old-1',alf:'https://alfred.previo.app/login/TESTCODE',apt:'1',state:'none',ts:123,door:'SECRET',guestName:'private'}]);strings.set(HISTORY,raw);
  let r=await call(handler,body());assert.equal(r.code,409);assert.equal(providerCalls,0);assert.equal(strings.get(HISTORY),raw);assert.ok(![...hashes.get(EVENTS).values()].join('').includes('SECRET'));
  await call(registryHandler,body());assert.equal(hashes.get(EVENTS).size,1);
 });
 await t.test('read-only check never reserves or sends',async()=>{let r=await call(registryHandler,body('CHECKONLY'));assert.equal(r.code,200);assert.equal(r.data.duplicate,false);assert.equal(r.data.automaticSendEnabled,false);assert.equal(providerCalls,0);assert.ok(!strings.has(contextOf(body('CHECKONLY')).key))});
 await t.test('manual repeat requires explicit bound confirmation and is single-use',async()=>{
  const b=body();let before=providerCalls;
  let first=await call(handler,b);assert.equal(first.code,409);assert.equal(first.data.allowManualResend,true);assert.equal(before,providerCalls);const token=first.data.manualResendToken;assert.ok(token);
  const changed=await call(handler,{...b,to:['+420777000099'],mode:'manual',manualResendToken:token});assert.equal(changed.code,409);assert.equal(before,providerCalls);
  assert.equal((await call(handler,{...b,mode:'automatic',manualResendToken:token})).code,401);assert.equal(before,providerCalls);
  let approved=await call(handler,{...b,mode:'manual',manualResendToken:token});assert.equal(approved.code,200);assert.equal(providerCalls-before,1);
  before=providerCalls;assert.equal((await call(handler,{...b,mode:'manual',manualResendToken:token})).code,409);assert.equal(before,providerCalls);
  assert.equal([...hashes.get(EVENTS).values()].map(x=>JSON.parse(x)).filter(x=>x.manualResend).length,1);
 });
 await t.test('later done is a distinct event; two concurrent requests send once',async()=>{
  let before=providerCalls;let rs=await Promise.all([call(handler,body('TESTCODE','done')),call(handler,body('TESTCODE','done'))]);assert.deepEqual(rs.map(r=>r.code).sort(),[200,409]);assert.equal(providerCalls-before,1);
 });
 await t.test('changing language, apartment or recipient cannot bypass same stay/stage',async()=>{let b=body('TESTCODE','done');b.to=['+420777000002'];b.context.apt='3';b.text=b.text.replace('apt=1','apt=3')+'&lang=de';assert.equal((await call(handler,b)).code,409)});
 await t.test('ambiguous provider result stays locked',async()=>{providerMode='timeout';let r=await call(handler,body('UNKNOWN1'));assert.equal(r.code,200);assert.equal(r.data.results[0].err,null);let before=providerCalls;assert.equal((await call(handler,body('UNKNOWN1'))).code,409);assert.equal(before,providerCalls);providerMode='ok'});
 await t.test('storage unavailable means no provider call',async()=>{storageDown=true;let before=providerCalls;assert.equal((await call(handler,body('OFFLINE1'))).code,503);assert.equal(before,providerCalls);storageDown=false});
 await t.test('preview refuses provider and registry claims',async()=>{process.env.VERCEL_ENV='preview';let before=providerCalls;assert.equal((await call(handler,body('PREVIEW1'))).code,403);assert.equal(before,providerCalls);process.env.VERCEL_ENV='production'});
 await t.test('stale text and malformed context never send',async()=>{let b=body('STALE001');b.context.alf='OTHER001';let before=providerCalls;assert.equal((await call(handler,b)).code,400);assert.equal(before,providerCalls);assert.equal((await call(handler,body('NOAUTH01'),false)).code,401)});
 await t.test('older live tabs with only to/text still receive duplicate protection',async()=>{let b=body();delete b.context;let before=providerCalls;assert.equal((await call(handler,b,false)).code,409);assert.equal(providerCalls,before)});
 await t.test('legacy non-portal SMS contract preserved',async()=>{let r=await call(handler,{to:'+420777000001',text:'Unit test without portal'},false);assert.equal(r.code,200);assert.equal(r.data.results[0].ok,true)});
 await t.test('short links resolve stored state and retain duplicate and mismatch guards',async()=>{
  for(const state of ['none','paid','unpaid','done']){
   const b=body('SHORT'+state.toUpperCase(),state),id=state.padEnd(22,'x');
   strings.set('hs18:guest-link:'+id,JSON.stringify({cs:b.text.split('Info ')[1]}));
   b.text='Hillside 18: https://hs18-generator.vercel.app/s/'+id;
   let before=providerCalls;const wrong={...b,context:{...b.context,state:state==='done'?'unpaid':'done'}};
   assert.equal((await call(handler,wrong)).code,400);assert.equal(providerCalls,before);
   assert.equal((await call(handler,b)).code,200);assert.equal(providerCalls,before+1);
   delete b.context;assert.equal((await call(handler,b,false)).code,409);assert.equal(providerCalls,before+1);
  }
  let before=providerCalls;const missing=body('SHORTMISS');missing.text='https://hs18-generator.vercel.app/s/'+'z'.repeat(22);
  assert.equal((await call(handler,missing)).code,400);assert.equal(providerCalls,before);
 });
 const eventsFor=b=>[...hashes.get(EVENTS).values()].map(JSON.parse).filter(e=>e.stay===contextOf(b).stay);
 await t.test('ESM and CJS callers share the same state machine',()=>{
  for(const fn of ['checkContext','claim','finish'])assert.equal(esmRegistry[fn],registry[fn]);
 });
 await t.test('accepted SMS stays protected and has an audited provider result',async()=>{
  const b=body('ACCEPTED');providerMode='ok';const before=providerCalls;
  assert.equal((await call(handler,b)).data.ok,true);
  const [event]=eventsFor(b);assert.equal(event.status,'accepted');assert.equal(event.results[0].sms_id,'12345');
  assert.equal(JSON.parse(strings.get(contextOf(b).key)).id,event.id);
  const repeat=await call(handler,b);assert.equal(repeat.code,409);assert.equal(repeat.data.allowManualResend,true);
  assert.equal(providerCalls,before+1);
 });
 for(const err of [9,10])await t.test(`definitive rejection ${err} permits a corrected concurrent retry without a resend warning`,async()=>{
  const b=body('REJECT'+err);providerMode=err;
  const first=await call(handler,b);assert.equal(first.code,200);assert.equal(first.data.ok,false);assert.equal(first.data.registryWarning,undefined);
  const [rejected]=eventsFor(b);assert.equal(rejected.status,'rejected');assert.equal(rejected.results[0].err,err);
  assert.ok(!strings.has(contextOf(b).key));
  const check=await call(registryHandler,b);assert.equal(check.data.duplicate,false);assert.match(check.data.reason,/odmítla/);assert.equal(check.data.automaticSendEnabled,false);
  providerMode='ok';b.to=['+420777000099'];const before=providerCalls;
  const replies=await Promise.all([call(handler,b),call(handler,b)]);
  assert.deepEqual(replies.map(r=>r.code).sort(),[200,409]);assert.equal(providerCalls,before+1);
  const success=replies.find(r=>r.code===200);assert.equal(success.data.allowManualResend,undefined);
  assert.deepEqual(eventsFor(b).map(e=>e.status),['rejected','accepted']);
  assert.deepEqual(eventsFor(b)[0],rejected);assert.notEqual(eventsFor(b)[1].id,rejected.id);
  assert.equal((await call(handler,b)).code,409);
 });
 await t.test('all recipients must be definitively rejected before a normal retry is allowed',async()=>{
  const b=body('ALLREJECT');b.to.push('+420777000002');providerMode=[9,10];
  assert.equal((await call(handler,b)).data.ok,false);assert.equal(eventsFor(b)[0].status,'rejected');
  assert.equal(eventsFor(b)[0].results.length,2);assert.ok(!strings.has(contextOf(b).key));providerMode='ok';
 });
 await t.test('partial acceptance remains locked and requires conscious manual confirmation',async()=>{
  const b=body('PARTIAL1');b.to.push('+420777000002');providerMode=['ok',10];
  assert.equal((await call(handler,b)).data.ok,true);assert.equal(eventsFor(b)[0].status,'accepted');
  assert.deepEqual(eventsFor(b)[0].results.map(r=>r.ok),[true,false]);
  const before=providerCalls;const r=await call(handler,b);assert.equal(r.code,409);assert.equal(r.data.allowManualResend,true);assert.equal(providerCalls,before);
  assert.equal((await call(registryHandler,b)).data.duplicate,true);providerMode='ok';
 });
 for(const mode of ['timeout','malformed','http-error',-1,99])await t.test(`uncertain provider outcome ${mode} cannot be retried normally or by manual override`,async()=>{
  const b=body('OUTCOME'+String(mode).replace(/-/g,'NEG'));providerMode=mode;
  const beforeFirst=providerCalls;const first=await call(handler,b);assert.equal(first.code,200);assert.equal(providerCalls,beforeFirst+1);assert.equal(first.data.ok,false);assert.equal(eventsFor(b)[0].status,'unknown');
  const before=providerCalls;const r=await call(handler,b);assert.equal(r.code,409);assert.equal(r.data.allowManualResend,false);assert.equal(providerCalls,before);
  assert.ok(strings.has(contextOf(b).key));providerMode='ok';
 });
 await t.test('partial acceptance with an unknown recipient cannot use manual override',async()=>{
  const b=body('PARTUNKNOWN');b.to.push('+420777000002');providerMode=['ok','timeout'];
  assert.equal((await call(handler,b)).data.ok,true);const before=providerCalls;
  assert.equal((await call(handler,b)).data.allowManualResend,false);assert.equal(providerCalls,before);providerMode='ok';
 });
 await t.test('empty or incomplete outcomes fail closed',async()=>{
  for(const [name,results] of [['EMPTY',[]],['INCOMPLETE',[{number:'+420777000001',ok:false}]]]){
   const b=body(name),c=contextOf(b),event=await claim(c);await finish(c,event,results);
   assert.equal(eventsFor(b)[0].status,'unknown');assert.equal((await call(handler,b)).code,409);
  }
 });
 function seedRejected(b,id,results=[{recipient:'synthetic-hash',ok:false,err:9,sms_id:null}]){
  const c=contextOf(b),event={id,stay:c.stay,stage:c.stage,status:'rejected',results};
  hashes.get(EVENTS).set(id,JSON.stringify(event));strings.set(c.key,JSON.stringify({id,status:'rejected',at:1}));return event;
 }
 await t.test('old rejected locks are recovered without deleting audit history',async()=>{
  const b=body('OLDREJECT'),old=seedRejected(b,'old-rejected');
  assert.equal((await call(registryHandler,b)).data.duplicate,false);assert.ok(!strings.has(contextOf(b).key));
  assert.deepEqual(eventsFor(b),[old]);providerMode='ok';assert.equal((await call(handler,b)).code,200);
  assert.deepEqual(eventsFor(b).map(e=>e.status),['rejected','accepted']);
 });
 await t.test('rejected claim alone or unproven rejected audit never unlocks',async()=>{
  for(const [name,results] of [['NOREASONS',[]],['OLDUNKNOWN',[{ok:false,err:null}]],['OLDPARTIAL',[{ok:true,err:0},{ok:false,err:9}]],['OLDEXISTS',[{ok:false,err:-1}]]]){
   const b=body(name);seedRejected(b,'old-'+name,results);assert.equal((await call(registryHandler,b)).data.duplicate,true);assert.ok(strings.has(contextOf(b).key));
   const before=providerCalls;const retry=await call(handler,b);assert.equal(retry.code,409);assert.equal(retry.data.allowManualResend,false);assert.equal(providerCalls,before);
  }
  const b=body('ORPHANED');strings.set(contextOf(b).key,JSON.stringify({id:'orphan',status:'rejected'}));assert.equal((await call(registryHandler,b)).data.duplicate,true);assert.equal((await call(handler,b)).data.allowManualResend,false);
 });
 await t.test('a rejected retry never bypasses an earlier acceptance or unknown attempt',async()=>{
  for(const status of ['accepted','unknown','pending','reported_success']){
   const b=body('EARLIER'+status.replace('_',''));seedRejected(b,'rejected-'+status);
   const c=contextOf(b);hashes.get(EVENTS).set('earlier-'+status,JSON.stringify({id:'earlier-'+status,stay:c.stay,stage:c.stage,status}));
   const before=providerCalls;assert.equal((await call(handler,b)).code,409);assert.equal(providerCalls,before);
  }
 });
 await t.test('failed audit persistence keeps the pending lock',async()=>{
  const b=body('AUDITFAIL');providerMode=9;failOutcome=true;
  const first=await call(handler,b);assert.ok(first.data.registryWarning);assert.equal(eventsFor(b)[0].status,'pending');
  failOutcome=false;providerMode='ok';const before=providerCalls;assert.equal((await call(handler,b)).code,409);assert.equal(providerCalls,before);
 });
 await t.test('recovery and late finish cannot delete or overwrite a newer claim',async()=>{
  const b=body('RECOVERRACE');seedRejected(b,'old-race');
  const replacement=JSON.stringify({id:'new-pending',status:'pending'});
  beforeEval=key=>strings.set(key,replacement);
  assert.equal((await call(registryHandler,b)).data.duplicate,true);assert.equal(strings.get(contextOf(b).key),replacement);
  const c=contextOf(body('FINISHRACE')),event=await claim(c);
  beforeEval=key=>strings.set(key,replacement);
  await assert.rejects(finish(c,event,[{number:'+420777000001',ok:false,err:9}]),/claim changed/);
  assert.equal(strings.get(c.key),replacement);assert.equal(JSON.parse(hashes.get(EVENTS).get(event.id)).status,'rejected');
 });
 await t.test('a rejected manual resend keeps its confirmation token single-use',async()=>{
  const b=body('MANUALFAIL');providerMode='ok';await call(handler,b);
  const warning=await call(handler,b),token=warning.data.manualResendToken;assert.ok(token);
  providerMode=9;const first=await call(handler,{...b,mode:'manual',manualResendToken:token});assert.equal(first.code,200);assert.equal(first.data.ok,false);
  const before=providerCalls;assert.equal((await call(handler,{...b,mode:'manual',manualResendToken:token})).code,409);assert.equal(providerCalls,before);
  assert.deepEqual(eventsFor(b).map(e=>e.status),['accepted','rejected']);providerMode='ok';
 });

});

