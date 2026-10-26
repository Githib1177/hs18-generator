import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagerDispatchHandler} from '../api/manager-dispatch.js';
import {createWalletHandler} from '../api/wallet.js';
import {createGuestLinkHandler} from '../api/guest-link.js';
import {createSessionCookie} from '../api/_wallet-auth.js';
import {verifyGuestToken} from '../lib/wallet-guest-token.js';
import registry from '../lib/registry.cjs';

const config={issuerId:'123',classSuffix:'test',key:{private_key:'synthetic-key-only'}};
function setup(t){
 const old={...process.env};t.after(()=>process.env=old);
 Object.assign(process.env,{HILLSIDE_WALLET_SESSION_SECRET:'test-secret',HISTORY_ACCESS_KEY:'test-history',SMS_LOGIN:'fake',SMS_PASSWORD:'fake',VERCEL_ENV:'production',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'fake'});
 const strings=new Map(),hashes=new Map(),objects=[];let sends=0,historyDown=false,googleDown=false,timeout=false,receiptDown=false;
 const store=async c=>{
  const [op,key,value]=c;
  if(op==='GET')return strings.get(key)||null;
  if(op==='SET'){
   if(historyDown&&key===registry.HISTORY)throw Error('history down');
   if(receiptDown&&key.endsWith(':receipt'))throw Error('receipt down');
   if(c.includes('NX')&&strings.has(key))return null;strings.set(key,value);return 'OK';
  }
  if(op==='HVALS')return [...(hashes.get(key)||new Map()).values()];
  if(op==='HSET'||op==='HSETNX'){if(!hashes.has(key))hashes.set(key,new Map());const h=hashes.get(key);if(op==='HSETNX'&&h.has(value))return 0;h.set(value,c[3]);return 1;}
  if(op==='EVAL'){
   if(c[2]===1){if(strings.get(c[3])!==c[4])return 0;strings.delete(c[3]);return 1;}
   if(c[2]===3){if(strings.get(c[3])!==c[6])return 0;strings.set(c[4],c[7]);strings.set(c[5],c[7]);return 1;}
  }
  throw Error('Unexpected command '+op);
 };
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url).startsWith('https://api.smsbrana.cz/')){sends++;if(timeout)throw Error('timeout');return {ok:true,status:200,text:async()=>'<err>0</err><sms_id>123456</sms_id>'};}
  assert.equal(url,'https://redis.invalid','No real network allowed');return {ok:true,json:async()=>({result:await store(JSON.parse(options.body))})};
 });
 const dependencies={store,walletHandler:createWalletHandler({store,getConfig:()=>config,putObject:async o=>{if(googleDown)throw Error('Google failed');objects.push(o);},makeSaveUrl:()=>''}),linkHandler:createGuestLinkHandler({store})};
 let handler=createManagerDispatchHandler(dependencies);
 const call=async(body,auth=true)=>{
  const headers={cookie:auth?createSessionCookie().split(';')[0]:''};
  // Real Vercel/Node requests can expose headers through a prototype getter.
  const req=Object.assign(Object.create({get headers(){return headers;}}),{method:'POST',body});
  const r={code:200,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};await handler(req,r);return r;
 };
 const prepare=(state='done',alf='SYNTH001',lang='cs')=>({action:'prepare',alf,apt:'1',state,lang,door:'0258',operatorConfirmed:true,accessConfirmed:true,guestName:'Synthetic fixture',releaseAt:new Date(Date.now()-60000).toISOString(),startsAt:new Date(Date.now()+86400000).toISOString(),expiresAt:new Date(Date.now()+3*86400000).toISOString()});
 const sending=p=>({action:'send',id:p.body.id,operatorConfirmed:true,to:'+420777000001',text:'Hillside 18: '+p.body.urls.cs});
 return {call,prepare,sending,strings,objects,sends:()=>sends,setHistoryDown:v=>historyDown=v,setGoogleDown:v=>googleDown=v,setTimeout:v=>timeout=v,setReceiptDown:v=>receiptDown=v,restart:()=>handler=createManagerDispatchHandler(dependencies)};
}
test('real prepare, Wallet, immutable redirect, registry, SMS and history flow for every state and language',async t=>{
 const s=setup(t);
 for(const state of ['none','paid','unpaid','done'])for(const lang of ['cs','en','de']){
  const p=await s.call(s.prepare(state,'SYNTH'+state.toUpperCase()+lang.toUpperCase(),lang));assert.equal(p.code,200);
  const id=new URL(p.body.urls.cs).pathname.split('/').at(-1),targets=JSON.parse(s.strings.get('hs18:guest-link:'+id));
  for(const l of ['cs','en','de']){const u=new URL(targets[l]);assert.ok(verifyGuestToken(new URLSearchParams(u.hash.slice(1)).get('wallet'),config));assert.equal(u.searchParams.has('door'),state==='done');assert.equal(u.searchParams.get('apt'),'1');}
  const frozen=JSON.stringify(targets),body={...s.sending(p),text:'Hillside 18: '+p.body.urls[lang]},before=s.sends();
  const r=await s.call(body);assert.equal(r.code,200);assert.equal(r.body.status,'accepted');assert.equal(r.body.historySaved,true);assert.equal(s.sends(),before+1);
  assert.equal(JSON.parse(s.strings.get(registry.HISTORY))[0].state,state);
  s.restart();assert.equal((await s.call(body)).body.status,'accepted');assert.equal(s.sends(),before+1);
  assert.equal(JSON.stringify(JSON.parse(s.strings.get('hs18:guest-link:'+id))),frozen);
  assert.equal((await s.call(s.prepare(state,'SYNTH'+state.toUpperCase()+lang.toUpperCase(),lang))).code,409);
 }
});
test('authentication, preview, missing dates, future release and Google failure block all SMS',async t=>{
 const s=setup(t);assert.equal((await s.call(s.prepare(),false)).code,401);assert.equal(s.objects.length,0);
 process.env.VERCEL_ENV='preview';assert.equal((await s.call(s.prepare())).code,403);process.env.VERCEL_ENV='production';
 for(const change of [{expiresAt:null},{operatorConfirmed:false},{accessConfirmed:false},{state:'bad'},{releaseAt:new Date(Date.now()+60000).toISOString()}])assert.ok((await s.call({...s.prepare(),...change})).code>=400);
 s.setGoogleDown(true);assert.equal((await s.call(s.prepare())).code,503);assert.equal(s.sends(),0);assert.ok(![...s.strings.keys()].some(k=>k.startsWith('hs18:guest-link:')));
});
test('concurrent send and restart do not duplicate; history failure is repaired without sending again',async t=>{
 const s=setup(t),p=await s.call(s.prepare());s.setHistoryDown(true);
 const responses=await Promise.all([s.call(s.sending(p)),s.call(s.sending(p))]);assert.equal(s.sends(),1);assert.ok(responses.some(r=>r.body.status==='accepted'));assert.ok(responses.some(r=>r.code===409));
 s.restart();s.setHistoryDown(false);const r=await s.call({action:'reconcile',id:p.body.id});assert.equal(r.body.historySaved,true);assert.equal(s.sends(),1);
 assert.equal((await s.call({action:'status',id:p.body.id})).body.historySaved,true);
});
test('timeout and lost receipt remain uncertain across restart, never resend',async t=>{
 for(const kind of ['timeout','receipt'])await t.test(kind,async t=>{
  const s=setup(t),p=await s.call(s.prepare());if(kind==='timeout')s.setTimeout(true);else s.setReceiptDown(true);
  await s.call(s.sending(p));assert.equal(s.sends(),1);s.restart();s.setReceiptDown(false);
  const r=await s.call(s.sending(p));assert.equal(s.sends(),1);assert.ok(r.code===409||r.body.status==='unconfirmed');assert.equal(s.strings.has(registry.HISTORY),false);
 });
});
test('wrong link, recipient, changed Wallet revision, expired preparation and held Wallet prevent send',async t=>{
 const s=setup(t),p=await s.call(s.prepare());
 assert.equal((await s.call({...s.sending(p),text:'Hillside https://example.com/'})).code,400);
 assert.equal((await s.call({...s.sending(p),to:'bad'})).code,400);
 const key='hs18:manager-dispatch:v1:'+p.body.id,record=JSON.parse(s.strings.get(key)),passKey='hs18:wallet:pass:'+record.passId;
 const original=s.strings.get(passKey),pass=JSON.parse(original);pass.revision='changed';s.strings.set(passKey,JSON.stringify(pass));assert.equal((await s.call(s.sending(p))).code,409);
 s.strings.set(passKey,original);record.createdAt-=16*60000;s.strings.set(key,JSON.stringify(record));assert.equal((await s.call(s.sending(p))).code,409);assert.equal(s.sends(),0);
});
