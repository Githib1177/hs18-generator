import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/send-sms.js';
import registryHandler from '../api/registry.js';
import registry from '../lib/registry.cjs';
const {HISTORY,EVENTS,contextOf,normalizeAlf,contextFromText}=registry;

test('registry guards actual SMS handler without a real network',async t=>{
 const original={...process.env};t.after(()=>{process.env=original});
 Object.assign(process.env,{HISTORY_ACCESS_KEY:'unit-test',SMS_LOGIN:'test',SMS_PASSWORD:'test',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'test',VERCEL_ENV:'production'});
 const strings=new Map(),hashes=new Map();let providerCalls=0,storageDown=false,providerMode='ok';
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url).startsWith('https://api.smsbrana.cz/')){
   providerCalls++;if(providerMode==='timeout')throw new Error('timeout');
   return {ok:true,text:async()=>'<err>0</err><sms_id>12345</sms_id>'};
  }
  assert.equal(url,'https://redis.invalid');if(storageDown)throw new Error('offline');
  const [op,key,a,b]=JSON.parse(options.body);let result;
  if(op==='GET')result=strings.get(key)||null;
  else if(op==='SET'){if(b==='NX'&&strings.has(key))result=null;else{strings.set(key,a);result='OK'}}
  else if(op==='HVALS')result=[...(hashes.get(key)||new Map()).values()];
  else if(op==='HSET'||op==='HSETNX'){
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
});

