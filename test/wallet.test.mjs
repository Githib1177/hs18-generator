import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareText,smsLength} from '../api/send-sms.js';
import {JSDOM} from 'jsdom';
import {randomUUID} from 'node:crypto';
import {buildWalletObject} from '../lib/wallet-pass.js';
import {guestToken} from '../lib/wallet-guest-token.js';
import {createWalletHandler} from '../api/wallet.js';
import {createWalletSaveHandler} from '../api/wallet-save.js';
import {createSessionCookie} from '../api/_wallet-auth.js';
const config={issuerId:'123',classSuffix:'hillside18_stay_v2',key:{private_key:'synthetic-only'}};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;},end(b){this.body=b;return this;}});
test('all booking states, apartments and languages show apartment, support and full Alfred link; hide door until ready',()=>{
 const now=Date.now(),stay={passId:randomUUID(),releaseAt:now-1000,expiresAt:now+86400000};
 for(const lang of ['cs','en','de'])for(const apartment of ['1','2','3','4'])for(const checkinComplete of [false,true])for(const paymentComplete of [false,true]){
  const body={alfred:'DEMOHS',apartment,doorCode:'0258',checkinComplete,paymentComplete,accessConfirmed:true,lang};
  const {object,state}=buildWalletObject(stay,body,config,now);assert.equal(state,checkinComplete&&paymentComplete?'ready':'pending');
  assert.equal(JSON.stringify(object).includes('0258'),state==='ready');assert.equal(object.header.defaultValue.value,state==='ready'?'0258':apartment);assert.equal(object.textModulesData.find(x=>x.id==='alfred').body,'https://alfred.previo.app/login/DEMOHS');assert.equal(object.textModulesData.find(x=>x.id==='support').body,'+420 731 990 087');assert.ok(object.linksModuleData.uris.some(x=>x.id==='contact'&&x.uri.endsWith('/hillside-support.vcf')));assert.equal(object.textModulesData.find(x=>x.id==='apartment').body,apartment);
  for(const time of [now-2000,now+86400000])assert.ok(!JSON.stringify(buildWalletObject(stay,body,config,time).object).includes('0258'));
 }
});
function fakeStore(){const values=new Map();return {values,call:async c=>{if(c[0]==='GET')return values.get(c[1])||null;if(c[0]==='SET'){if(c.includes('NX')&&values.has(c[1]))return null;values.set(c[1],c[2]);return 'OK';}if(c[0]==='EVAL'){if(c[2]===1){if(values.get(c[3])===c[4]){values.delete(c[3]);return 1;}return 0;}if(values.get(c[3])!==c[6])return 0;values.set(c[4],c[7]);values.set(c[5],c[7]);return 1;}throw new Error('Unexpected store command');}};}
test('authenticated lifecycle, stable identity and dates, failure, expiry and guest tampering',async()=>{
 const previous=process.env.HILLSIDE_WALLET_SESSION_SECRET;process.env.HILLSIDE_WALLET_SESSION_SECRET='test-only';const store=fakeStore(),objects=[];let fail=false,hold=null;
 const handler=createWalletHandler({store:store.call,getConfig:()=>config,putObject:async o=>{if(hold)await hold;if(fail)throw new Error('Google failure');objects.push(o);},makeSaveUrl:id=>'https://pay.google.com/gp/v/save/'+id});
 const save=createWalletSaveHandler({store:store.call,getConfig:()=>config,makeSaveUrl:id=>'https://pay.google.com/gp/v/save/'+id});
 const body={alfred:'DEMOHS',apartment:'2',doorCode:'0258',checkinComplete:false,paymentComplete:false,accessConfirmed:false,operatorConfirmed:true,lang:'cs',releaseAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
 const call=async(change={},authenticated=true)=>{const r=response();await handler({method:'POST',headers:{cookie:authenticated?createSessionCookie().split(';')[0]:''},body:{...body,...change}},r);return r;};
 const get=async token=>{const r=response();await save({method:'GET',query:{token,done:1,door:'9999'}},r);return r;};
 try{
  assert.equal((await call({},false)).code,401);assert.equal(objects.length,0);
  const pending=await call();assert.equal(pending.body.state,'pending');assert.equal((await get(pending.body.guestToken)).code,302);
  assert.equal((await get(pending.body.guestToken+'a')).code,404);
  const done={action:'sync-existing',checkinComplete:true,paymentComplete:true,accessConfirmed:true,expiresAt:undefined,releaseAt:undefined};
  assert.equal((await call({...done,alfred:'MISSING'})).body.skipped,true);
  const ready=await call(done);assert.equal(ready.body.passId,pending.body.passId);assert.equal(ready.body.state,'ready');assert.equal(objects.at(-1).textModulesData.find(x=>x.id==='door').body,'0258');assert.equal(objects.at(-1).validTimeInterval.end.date,body.expiresAt);
  assert.equal((await call({...done,doorCode:'258'})).code,400);
  const downgraded=await call({...done,paymentComplete:false});assert.equal(downgraded.body.state,'pending');assert.ok(!JSON.stringify(objects.at(-1)).includes('0258'));
  fail=true;assert.equal((await call(done)).code,503);assert.equal((await get(pending.body.guestToken)).code,503);fail=false;
  let release;hold=new Promise(r=>release=r);const first=call(done);await new Promise(r=>setTimeout(r,0));assert.equal((await call(done)).code,409);release();await first;hold=null;
  assert.equal((await get(pending.body.guestToken)).code,302);
  for(const [key,value] of store.values){const row=JSON.parse(value);row.expiresAt=1;store.values.set(key,JSON.stringify(row));}
  assert.equal((await call(done)).code,400);assert.equal((await get(pending.body.guestToken)).code,404);
 }finally{if(previous===undefined)delete process.env.HILLSIDE_WALLET_SESSION_SECRET;else process.env.HILLSIDE_WALLET_SESSION_SECRET=previous;}
});
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const wallet=fs.readFileSync(new URL('../public/wallet.js',import.meta.url),'utf8');
function page(){const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://hs18-generator.vercel.app'}),w=dom.window;w.alert=()=>{};w.confirm=()=>true;w.fetch=async()=>({ok:true,json:async()=>({ok:true,items:[]})});for(const s of w.document.querySelectorAll('script:not([src])'))w.eval(s.textContent);w.eval(wallet);const q=id=>w.document.getElementById(id);q('alf').value='DEMOHS';w.setApartment('2');q('door').value='0258';q('phone').value='+420123456789';return {dom,w,q};}
test('generator waits for Wallet before sending and retains tokens in all language SMS',async t=>{
 for(const scenario of ['success','failure','changed-guest','cancel','missing','unauthorized','short-failure','short-changed'])await t.test(scenario,async()=>{
  const {dom,w,q}=page(),calls=[];let release;
  q('checkinComplete').checked=true;q('paymentComplete').checked=true;w.updateReservationState();
  w.confirm=()=>scenario!=='cancel';
  w.fetch=async(url,options)=>{if(url==='/api/wallet'){calls.push(url);return new Promise(r=>release=r);}if(url==='/api/guest-link'){const sent=JSON.parse(options.body);calls.push(sent);if(scenario==='short-changed')q('alf').value='OTHERX';return {ok:scenario!=='short-failure',json:async()=>({urls:{cs:'https://hs18-generator.vercel.app/s/'+'A'.repeat(22),en:'https://hs18-generator.vercel.app/s/'+'A'.repeat(22)+'/en',de:'https://hs18-generator.vercel.app/s/'+'A'.repeat(22)+'/de'},error:'Short link unavailable'})};}if(url==='/api/send-sms'){calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({results:[{ok:true,err:0}]})};}return {ok:true,json:async()=>({ok:true,items:[]})};};
  q('btnSendSms').click();await new Promise(r=>setTimeout(r,0));
  if(scenario==='cancel'){assert.equal(calls.length,0);dom.window.close();return;}
  assert.deepEqual(calls,['/api/wallet']);
  if(scenario==='changed-guest'){q('alf').value='OTHERX';q('alf').dispatchEvent(new w.Event('input',{bubbles:true}));}
  const token=guestToken(randomUUID(),config);
  release({ok:!['failure','unauthorized'].includes(scenario),status:scenario==='unauthorized'?401:200,json:async()=>scenario==='missing'?{skipped:true,reason:'no-card'}:{state:'ready',guestToken:token,error:'Google failure'}});
  await new Promise(r=>setTimeout(r,10));
  if(['failure','unauthorized','changed-guest'].includes(scenario)){assert.equal(calls.length,1);assert.equal(q('textsCard').style.display,'none');}
  else if(['short-failure','short-changed'].includes(scenario)){assert.equal(calls.length,2);assert.equal(q('textsCard').style.display,'none');}
  else{assert.equal(calls.length,3);for(const lang of ['cs','en','de']){const sms=q('sms_'+lang).value;assert.equal(calls[1].urls[lang].includes('wallet='),scenario!=='missing');assert.ok(sms.includes('/s/'+ 'A'.repeat(22)));assert.ok(!sms.includes('wallet='));assert.ok(sms.includes('0258'));assert.ok(smsLength(prepareText(sms))<=306);}}
  dom.window.close();
 });
});
