import test from 'node:test';import assert from 'node:assert/strict';
import {createGuestLinkHandler} from '../api/guest-link.js';
import {createSessionCookie} from '../api/_wallet-auth.js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;},end(b){this.body=b;return this;}});
test('short links preserve every language and secret fragment, reject unauthenticated/open redirects and expire',async()=>{
 const previous=process.env.HILLSIDE_WALLET_SESSION_SECRET;process.env.HILLSIDE_WALLET_SESSION_SECRET='test-only';
 const records=new Map();let failed=false;
 const handler=createGuestLinkHandler({store:async c=>{if(failed)throw Error('offline');if(c[0]==='SET'){assert.equal(c[3],'EX');assert.equal(c[4],180*86400);records.set(c[1],c[2]);return 'OK';}return records.get(c[1]);}});
 const cookie=createSessionCookie().split(';')[0];const urls=Object.fromEntries(['cs','en','de'].map(l=>[l,'https://hillside18-guest-portal.vercel.app/?apt=2&lang='+l+'&alf=DEMOHS&done=1&door=0258#wallet=synthetic']));
 const call=async(method,body,query={},auth=true)=>{const res=response();await handler({method,body,query,headers:{cookie:auth?cookie:''}},res);return res;};
 try{
  assert.equal((await call('POST',{urls},{},false)).code,401);
  assert.equal((await call('POST',{urls:{...urls,cs:'https://evil.example/?apt=2'}})).code,400);
  assert.equal((await call('POST',{urls:{...urls,cs:urls.cs.replace('done=1','unpaid=1')}})).code,400);
  const created=await call('POST',{urls});assert.equal(created.code,200);const id=created.body.urls.cs.split('/').at(-1);assert.equal(id.length,22);
  for(const lang of ['cs','en','de']){const result=await call('GET',null,{id,lang});assert.equal(result.code,302);assert.equal(result.headers.Location,urls[lang]);assert.equal(result.headers['Cache-Control'],'no-store');}
  for(const apt of ['1','2','3','4'])for(const state of ['none','paid','unpaid','done']){
   const variants=Object.fromEntries(['cs','en','de'].map(lang=>{const u=new URL(urls[lang]);u.searchParams.set('apt',apt);u.searchParams.delete('done');u.searchParams.delete('door');if(state!=='none')u.searchParams.set(state,'1');if(state==='done')u.searchParams.set('door','0258');return [lang,u.href];}));
   const saved=await call('POST',{urls:variants});assert.equal(saved.code,200);const savedId=saved.body.urls.cs.split('/').at(-1);assert.notEqual(savedId,id);
   for(const lang of ['cs','en','de']){const opened=await call('GET',null,{id:savedId,lang});assert.equal(opened.headers.Location,variants[lang]);assert.equal(opened.headers.Location.includes('door=0258'),state==='done');}
   assert.equal((await call('GET',null,{id,lang:'cs'})).headers.Location,urls.cs);
  }
  assert.equal((await call('GET',null,{id:'guessed'})).code,404);
  failed=true;assert.equal((await call('POST',{urls})).code,503);assert.equal((await call('GET',null,{id})).code,503);failed=false;
  records.clear();assert.equal((await call('GET',null,{id})).code,404);
 }finally{if(previous===undefined)delete process.env.HILLSIDE_WALLET_SESSION_SECRET;else process.env.HILLSIDE_WALLET_SESSION_SECRET=previous;}
});
