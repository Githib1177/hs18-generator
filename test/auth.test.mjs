import test from 'node:test';import assert from 'node:assert/strict';import {createAuthHandler} from '../api/wallet-auth.js';import {isAuthorized} from '../api/_wallet-auth.js';
test('Wallet login verifies existing Falconi password, fails closed and issues scoped HttpOnly cookie',async()=>{
 const old=process.env.HILLSIDE_WALLET_SESSION_SECRET;process.env.HILLSIDE_WALLET_SESSION_SECRET='test-session-only';
 try{for(const outcome of ['accepted','wrong','offline','bad-response']){
  let calls=0;const h=createAuthHandler({fetcher:async(url,options)=>{calls++;assert.equal(url,'https://falconi-messenger.vercel.app/api/auth');assert.equal(JSON.parse(options.body).password,'test-only');if(outcome==='offline')throw Error('offline');return {ok:outcome!=='wrong',json:async()=>({ok:outcome==='accepted'})};}});
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};
  await h({method:'POST',body:{password:'test-only'}},res);assert.equal(calls,1);
  if(outcome==='accepted'){assert.equal(res.code,200);assert.match(res.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);assert.ok(isAuthorized({headers:{cookie:res.headers['Set-Cookie'].split(';')[0]}}));}
  else{assert.ok([401,503].includes(res.code));assert.equal(res.headers['Set-Cookie'],undefined);}
 }}finally{if(old===undefined)delete process.env.HILLSIDE_WALLET_SESSION_SECRET;else process.env.HILLSIDE_WALLET_SESSION_SECRET=old;}
});
