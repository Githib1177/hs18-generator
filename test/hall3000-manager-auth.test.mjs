import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {authenticateManager, isAuthenticatedManager} from '../lib/hall3000-manager-auth.js';
import {isAuthorized, createSessionCookie} from '../api/_wallet-auth.js';

const {publicKey,privateKey} = generateKeyPairSync('ed25519');
const published = publicKey.export({format:'der',type:'spki'}).toString('base64url');
const now = 1794779000000;
function envelope(data, at=now) {
 const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
 const signature=sign(null,Buffer.from('hs18-manager-dispatch-v1\n'+at+'\n'+payload),privateKey).toString('base64url');
 return {method:'POST',headers:{},body:{at,payload,signature}};
}

test('native signed request opens only an internal, unforgeable authorization',()=>{
 const req=envelope({action:'prepare'});
 assert.equal(isAuthorized(req),false);
 const authenticated = authenticateManager(req,published,now);
 assert.equal(isAuthenticatedManager(authenticated),true);
 assert.equal(isAuthorized({...authenticated,body:{action:'create'}}),true);
 assert.equal(isAuthorized(JSON.parse(JSON.stringify(authenticated))),false);
});

import {createEndpoint} from '../api/manager-dispatch.js';

test('signed endpoint reuses existing preparation, send, history, and cancellation handlers',async()=>{
 const input={alf:'ReservationExample',apt:'2',state:'none',startsAt:'2026-11-16T15:00:00Z',releaseAt:'2026-11-16T15:00:00Z',expiresAt:'2026-11-18T09:00:00Z',reservation:{id:'123',resId:'456',apt:'2',voucher:'fixture',arrival:'2026-11-16',departure:'2026-11-18'}};
 const calls=[];
 const response=()=>({code:0, data:null,setHeader(){},status(n){this.code=n;return this;},json(body){this.data=body;return this;}});
 const handler=(service)=>(req,res)=>{
  assert.equal(isAuthorized(req),true);
  calls.push([service,req.method,req.body.action]);
  return res.status(200).json({ok:true});
 };
 const endpoint=createEndpoint({
  dispatch:handler('dispatch'),cancellation:handler('cancellation'),historyRead:handler('history'),
  env:{HILLSIDE_MANAGER_DISPATCH_PUBLIC_KEY:published,VERCEL_GIT_COMMIT_SHA:'local-fixture'},
  reader:{detail:async()=>({...input,guestName:'Fixture',checkinComplete:false,paymentComplete:false})}
 });
 const run=async(body)=>{
  const res=response();
  await endpoint(envelope(body,Date.now()),res);
  return res;
 };
 assert.equal((await run({action:'probe'})).data.deployment,'local-fixture');
 assert.equal((await run({action:'prepare',...input,state:'done'})).code,409);
 assert.equal((await run({action:'prepare',...input})).code,200);
 for(const action of ['send','status','history','cancel','cancellation-status'])assert.equal((await run({action,reservation:input.reservation})).code,200);
 assert.equal((await run({action:'arbitrary-provider-send'})).code,400);
 assert.deepEqual(calls,[
  ['dispatch','POST','prepare'],['dispatch','POST','send'],['dispatch','POST','status'],
  ['history','GET','history'],['cancellation','POST','cancel'],['cancellation','GET','cancellation-status']
 ]);
});
test('changed payload, changed time, wrong key, stale or future are rejected',()=>{
 const req=envelope({action:'prepare'});
 for(const bad of [
  {...req,body:{...req.body,payload:envelope({action:'send'}).body.payload}},
  {...req,body:{...req.body,at:now+1}},
  envelope({action:'prepare'},now-60001),
  envelope({action:'prepare'},now+60001)
 ]) assert.equal(authenticateManager(bad,published,now),null);
 assert.equal(authenticateManager(req,generateKeyPairSync('ed25519').publicKey.export({format:'der',type:'spki'}).toString('base64url'),now),null);
});
test('GET, unsigned and malformed envelopes do not acquire authorization',()=>{
 const req=envelope({action:'cancel'});
 for(const bad of [{...req,method:'GET'},{method:'POST',headers:{},body:{authenticatedManager:true}},envelope([]),{...req,body:{...req.body,extra:true}}])
  assert.equal(authenticateManager(bad,published,now),null);
 assert.equal(authenticateManager(req,'',now),null);
});
test('existing browser session still works independently',()=>{
 process.env.HILLSIDE_WALLET_SESSION_SECRET='only-a-fixture';
 try {
  const headers={cookie:createSessionCookie().split(';')[0]};
  assert.equal(isAuthorized({headers}),true);
  assert.equal(isAuthorized({headers:{cookie:'hillside_wallet_session=nope'}}),false);
 } finally {
  delete process.env.HILLSIDE_WALLET_SESSION_SECRET;
 }
});
