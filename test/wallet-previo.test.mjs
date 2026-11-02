import test from 'node:test';import assert from 'node:assert/strict';
import {createWalletHandler} from '../api/wallet.js';import {createSessionCookie} from '../api/_wallet-auth.js';
const config={issuerId:'123',classSuffix:'hillside18_stay_v2',key:{private_key:'synthetic'}};
function fixture(t){
 const prior=process.env.HILLSIDE_WALLET_SESSION_SECRET;process.env.HILLSIDE_WALLET_SESSION_SECRET='synthetic-only';t.after(()=>{if(prior===undefined)delete process.env.HILLSIDE_WALLET_SESSION_SECRET;else process.env.HILLSIDE_WALLET_SESSION_SECRET=prior});
 const values=new Map(),objects=[],now=Date.now(),source={alf:'SYNTH01',apt:'3',lang:'de',startsAt:new Date(now-60000).toISOString(),releaseAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+86400000).toISOString(),checkinComplete:false,paymentComplete:true,accessCode:'',accessConfirmed:false};let reads=0,fail=false,wrongReadback=false;
 const store=async c=>{if(c[0]==='GET')return values.get(c[1])||null;if(c[0]==='SET'){if(c.includes('NX')&&values.has(c[1]))return null;values.set(c[1],c[2]);return 'OK'}if(c[0]==='EVAL'){if(c[2]===1){if(values.get(c[3])===c[4]){values.delete(c[3]);return 1}return 0}if(values.get(c[3])!==c[6])return 0;values.set(c[4],c[7]);values.set(c[5],c[7]);return 1}throw Error('Unexpected store command')};
 const handler=createWalletHandler({store,getConfig:()=>config,reader:{detail:async()=>{reads++;return {...source}}},putObject:async o=>{if(fail)throw Error('Google failure');objects.push(o)},getObject:async()=>wrongReadback?{...objects.at(-1),validTimeInterval:{start:{date:source.startsAt},end:{date:new Date(Date.now()+1000).toISOString()}}}:objects.at(-1),makeSaveUrl:()=> 'https://pay.google.com/synthetic'});
 const call=async(auth=true)=>{const res={headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(b){this.body=b;return this}};await handler({method:'POST',headers:{cookie:auth?createSessionCookie().split(';')[0]:''},body:{action:'from-reservation',reservation:{id:'123',resId:'456'},doorCode:'9999',checkinComplete:true,paymentComplete:true}},res);return res};
 return {source,objects,call,get reads(){return reads},setFail:v=>{fail=v},setWrongReadback:v=>{wrongReadback=v}};
}
test('automatic Wallet rereads Previo, uses exact dates and repeats without another object/write',async t=>{
 const s=fixture(t);assert.equal((await s.call(false)).code,401);assert.equal(s.reads,0);const first=await s.call();assert.equal(first.code,200);assert.equal(first.body.state,'pending');assert.deepEqual(s.objects[0].validTimeInterval,{start:{date:s.source.startsAt},end:{date:s.source.expiresAt}});assert.ok(!JSON.stringify(s.objects).includes('9999'));const next=await s.call();assert.equal(next.body.passId,first.body.passId);assert.equal(s.objects.length,1);
});
test('same card moves pending to ready with verified marker code and removes code when payment is withdrawn',async t=>{
 const s=fixture(t),first=await s.call();s.source.checkinComplete=true;s.source.accessCode='0258';s.source.accessConfirmed=true;const ready=await s.call();assert.equal(ready.body.passId,first.body.passId);assert.equal(ready.body.state,'ready');assert.equal(s.objects.at(-1).textModulesData.find(x=>x.id==='door').body,'0258');s.source.paymentComplete=false;s.source.accessCode='';s.source.accessConfirmed=false;const revoked=await s.call();assert.equal(revoked.body.state,'pending');assert.ok(!s.objects.at(-1).textModulesData.some(x=>x.id==='door'));
});
test('all done without access proof stays pending; unknown states do not change Wallet',async t=>{
 const s=fixture(t);s.source.checkinComplete=true;const pending=await s.call();assert.equal(pending.body.accessPending,true);assert.equal(pending.body.state,'pending');s.source.paymentComplete=null;assert.equal((await s.call()).code,409);assert.equal(s.objects.length,1);
});
test('failed Google write is not blindly repeated by automatic refresh',async t=>{
 const s=fixture(t);s.setFail(true);assert.equal((await s.call()).code,503);s.setFail(false);assert.equal((await s.call()).code,409);assert.equal(s.objects.length,0);
});
test('literal TEST is visible on a non-operational card and can never become ready',async t=>{
 const s=fixture(t);s.source.testCode='TEST';s.source.checkinComplete=true;s.source.paymentComplete=true;s.source.accessCode='0258';s.source.accessConfirmed=true;
 const r=await s.call();assert.equal(r.body.state,'pending');assert.equal(r.body.testCode,'TEST');assert.ok(!s.objects.at(-1).textModulesData.some(x=>x.id==='door'));assert.equal(s.objects.at(-1).textModulesData.find(x=>x.id==='test-only').body,'Kód - TEST');
});
test('independent Google readback must match validity before success is reported',async t=>{
 const s=fixture(t);s.setWrongReadback(true);assert.equal((await s.call()).code,503);assert.equal(s.objects.length,1);s.setWrongReadback(false);assert.equal((await s.call()).code,409);assert.equal(s.objects.length,1);
});
