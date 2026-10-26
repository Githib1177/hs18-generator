import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagerDispatchHandler} from '../api/manager-dispatch.js';
import {createWalletHandler} from '../api/wallet.js';
import {createGuestLinkHandler} from '../api/guest-link.js';
import {createSessionCookie} from '../api/_wallet-auth.js';
import {verifyGuestToken} from '../lib/wallet-guest-token.js';
import registry from '../lib/registry.cjs';
import {randomUUID} from 'node:crypto';
import {shortId} from '../lib/dispatch-preparation.js';

const config={issuerId:'123',classSuffix:'test',key:{private_key:'synthetic-key-only'}};
function setup(t){
 const old={...process.env};t.after(()=>process.env=old);
 Object.assign(process.env,{HILLSIDE_WALLET_SESSION_SECRET:'test-secret',HISTORY_ACCESS_KEY:'test-history',SMS_LOGIN:'fake',SMS_PASSWORD:'fake',VERCEL_ENV:'production',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'fake'});
 const strings=new Map(),hashes=new Map(),objects=[];let sends=0,historyDown=false,googleDown=false,timeout=false,receiptDown=false;let failWalletCheckpoint=false,failLinkCheckpoint=false,googleReplyLost=false;
 const store=async c=>{
  const [op,key,value]=c;
  if(op==='GET')return strings.get(key)||null;
  if(op==='SET'){
   if(historyDown&&key===registry.HISTORY)throw Error('history down');
   if(receiptDown&&key.endsWith(':receipt'))throw Error('receipt down');
   if(c.includes('NX')&&strings.has(key))return null;strings.set(key,value);if(failWalletCheckpoint&&String(value).includes('wallet_ready')&&!key.includes('wallet:')){failWalletCheckpoint=false;throw Error('Lost Wallet checkpoint');}if(failLinkCheckpoint&&key.startsWith('hs18:guest-link:')){failLinkCheckpoint=false;throw Error('Lost link response');}return 'OK';
  }
  if(op==='HVALS')return [...(hashes.get(key)||new Map()).values()];
  if(op==='HSET'||op==='HSETNX'){if(!hashes.has(key))hashes.set(key,new Map());const h=hashes.get(key);if(op==='HSETNX'&&h.has(value))return 0;h.set(value,c[3]);return 1;}
  if(op==='EVAL'){
   if(c[2]===1){if(strings.get(c[3])!==c[4])return 0;strings.delete(c[3]);return 1;}
   if(c[2]===3){if(strings.get(c[3])!==c[6])return 0;const value=c.length>8?c[8]:c[7];if(c.length>8&&strings.get(c[4])!==c[7])return 0;strings.set(c[4],value);strings.set(c[5],value);return 1;}
  }
  throw Error('Unexpected command '+op);
 };
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url).startsWith('https://api.smsbrana.cz/')){sends++;if(timeout)throw Error('timeout');return {ok:true,status:200,text:async()=>'<err>0</err><sms_id>123456</sms_id>'};}
  assert.equal(url,'https://redis.invalid','No real network allowed');return {ok:true,json:async()=>({result:await store(JSON.parse(options.body))})};
 });
 const dependencies={store,getConfig:()=>config,getObject:async id=>objects.findLast(o=>o.id===id)||null,walletHandler:createWalletHandler({store,getConfig:()=>config,putObject:async o=>{if(googleDown)throw Error('Google failed');objects.push(o);if(googleReplyLost)throw Error('Google reply lost');},makeSaveUrl:()=>''}),linkHandler:createGuestLinkHandler({store})};
 let handler=createManagerDispatchHandler(dependencies);
 const call=async(body,auth=true)=>{
  const headers={cookie:auth?createSessionCookie().split(';')[0]:''};
  // Real Vercel/Node requests can expose headers through a prototype getter.
  const req=Object.assign(Object.create({get headers(){return headers;}}),{method:'POST',body});
  const r={code:200,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};await handler(req,r);return r;
 };
 const prepare=(state='done',alf='SYNTH001',lang='cs')=>({action:'prepare',alf,apt:'1',state,lang,door:'0258',operatorConfirmed:true,accessConfirmed:true,guestName:'Synthetic fixture',releaseAt:new Date(Date.now()-60000).toISOString(),startsAt:new Date(Date.now()+86400000).toISOString(),expiresAt:new Date(Date.now()+3*86400000).toISOString()});
 const sending=p=>({action:'send',id:p.body.id,operatorConfirmed:true,to:'+420777000001',text:'Hillside 18: '+p.body.urls.cs});
 return {call,prepare,sending,strings,objects,loseGoogleReply:()=>googleReplyLost=true,failWallet:()=>failWalletCheckpoint=true,failLink:()=>failLinkCheckpoint=true,sends:()=>sends,setHistoryDown:v=>historyDown=v,setGoogleDown:v=>googleDown=v,setTimeout:v=>timeout=v,setReceiptDown:v=>receiptDown=v,restart:()=>handler=createManagerDispatchHandler(dependencies)};
}

function stable(s){const body=s.prepare();body.preparationId=randomUUID();return body;}
const bound='a'.repeat(64),evidence='b'.repeat(64);
function first(s,p){return {...s.sending(p),operationId:'status:synthetic-original',bindingHash:bound};}
function retry(s,p){return {...first(s,p),action:'retry',recheck:{kind:'local_sms_retry',operationId:'status:synthetic-original:retry1',originalOperationId:'status:synthetic-original',bindingHash:bound,evidenceHash:evidence,checkedAt:new Date().toISOString(),noConfirmedSend:true}};}

test('stable preparation survives lost response, concurrent call and process restart without another Wallet/link',async t=>{
 const s=setup(t),body=stable(s);
 const all=await Promise.all([s.call(body),s.call(body)]);assert.deepEqual(all.map(r=>r.code).sort(),[200,409]);assert.equal(s.objects.length,1);
 s.restart();const status=await s.call({action:'status',id:body.preparationId});assert.equal(status.code,200);assert.equal(status.body.status,'prepared');
 const again=await s.call(body);assert.equal(again.body.id,body.preparationId);assert.equal(s.objects.length,1);assert.equal([...s.strings.keys()].filter(k=>k.startsWith('hs18:guest-link:')).length,1);
 assert.equal((await s.call({...body,apt:'2'})).code,409);assert.equal(s.sends(),0);
});
test('lost checkpoint after Google success is recovered by reading existing Wallet, not another PUT',async t=>{
 const s=setup(t),body=stable(s);s.failWallet();assert.equal((await s.call(body)).code,503);assert.equal(s.objects.length,1);
 s.restart();assert.equal((await s.call({action:'status',id:body.preparationId})).body.status,'preparation_unknown');
 const done=await s.call(body);assert.equal(done.code,200);assert.equal(s.objects.length,1);assert.equal(s.sends(),0);
});
test('lost short-link response is read back as the same immutable preparation',async t=>{
 const s=setup(t),body=stable(s);s.failLink();assert.equal((await s.call(body)).code,503);
 const id=shortId(body.preparationId),before=s.strings.get('hs18:guest-link:'+id);s.restart();
 const status=await s.call({action:'status',id:body.preparationId});assert.equal(status.body.status,'prepared');assert.ok(status.body.urls.cs.endsWith(id));
 assert.equal((await s.call(body)).body.status,'prepared');assert.equal(s.strings.get('hs18:guest-link:'+id),before);assert.equal(s.objects.length,1);
});
test('one locally authorized retry crosses the real shared registry once and survives restart',async t=>{
 const s=setup(t),p=await s.call(stable(s));s.setTimeout(true);assert.equal((await s.call(first(s,p))).body.status,'unconfirmed');assert.equal(s.sends(),1);
 s.setTimeout(false);const r=await s.call(retry(s,p));assert.equal(r.body.status,'accepted');assert.equal(r.body.historySaved,true);assert.equal(s.sends(),2);
 s.restart();assert.equal((await s.call(retry(s,p))).body.status,'accepted');assert.equal(s.sends(),2);
 assert.equal((await s.call({...retry(s,p),recheck:{...retry(s,p).recheck,operationId:'invented-third'}})).body.status,'accepted');assert.equal(s.sends(),2);
});
test('retry requires fresh local binding, unchanged recipient/content and no positive shared receipt',async t=>{
 const s=setup(t),p=await s.call(stable(s));s.setTimeout(true);await s.call(first(s,p));s.setTimeout(false);
 for(const change of [{to:'+420777000099'},{text:retry(s,p).text+' changed'},{recheck:{...retry(s,p).recheck,bindingHash:'c'.repeat(64)}},{recheck:{...retry(s,p).recheck,checkedAt:new Date(Date.now()-180000).toISOString()}},{recheck:{...retry(s,p).recheck,noConfirmedSend:false}}])assert.equal((await s.call({...retry(s,p),...change})).code,409);
 assert.equal(s.sends(),1);
});
test('owner instruction is separately counted once; it never restarts the automatic retry budget',async t=>{
 const s=setup(t),p=await s.call(stable(s));s.setTimeout(true);await s.call(first(s,p));
 const owner={...first(s,p),action:'owner-send',recheck:{...retry(s,p).recheck,kind:'owner_sms',operationId:'status:owner-request',grantId:'specific-human-request-1',expiresAt:new Date(Date.now()+60000).toISOString()}};
 assert.equal((await s.call(owner)).body.status,'unconfirmed');assert.equal(s.sends(),2);
 s.restart();assert.equal((await s.call(owner)).body.status,'unconfirmed');assert.equal(s.sends(),2);
 assert.equal((await s.call(retry(s,p))).code,409);assert.equal(s.sends(),2);
});
test('a stale preparation can finish after a new real source check, using the same ID',async t=>{
 const s=setup(t),body=stable(s),p=await s.call(body),key='hs18:manager-dispatch:v1:'+p.body.id;
 const record=JSON.parse(s.strings.get(key));record.createdAt-=1800000;s.strings.set(key,JSON.stringify(record));
 assert.equal((await s.call(first(s,p))).code,409);
 assert.equal((await s.call({...first(s,p),sourceCheckedAt:new Date().toISOString()})).body.status,'accepted');assert.equal(s.sends(),1);
});
test('an ambiguous Google PUT is reconciled by GET and the original preparation finishes without another PUT',async t=>{
 const s=setup(t),body=stable(s);s.loseGoogleReply();assert.equal((await s.call(body)).code,503);assert.equal(s.objects.length,1);
 const time=Date.now()+121000;t.mock.method(Date,'now',()=>time);s.restart();
 const r=await s.call({action:'reconcile-prepare',id:body.preparationId});assert.equal(r.code,200);assert.equal(r.body.status,'wallet_ready_link_missing');
 assert.equal((await s.call(body)).body.status,'prepared');assert.equal(s.objects.length,1);assert.equal(s.sends(),0);
});
test('a positive shared receipt blocks automatic retry even when the adapter receipt was lost',async t=>{
 const s=setup(t),p=await s.call(stable(s));s.setReceiptDown(true);assert.equal((await s.call(first(s,p))).code,503);s.setReceiptDown(false);
 const time=Date.now()+121000;t.mock.method(Date,'now',()=>time);
 assert.equal((await s.call(retry(s,p))).code,409);assert.equal(s.sends(),1);
});
test('a new specific owner instruction can resend an already accepted SMS exactly once',async t=>{
 const s=setup(t),p=await s.call(stable(s));await s.call(first(s,p));
 const owner={...first(s,p),action:'owner-send',recheck:{...retry(s,p).recheck,kind:'owner_sms',operationId:'status:owner-explicit',grantId:'specific-human-request-2',expiresAt:new Date(Date.now()+60000).toISOString()}};
 assert.equal((await s.call(owner)).body.status,'accepted');assert.equal(s.sends(),2);
 s.restart();await s.call(owner);assert.equal(s.sends(),2);
});
