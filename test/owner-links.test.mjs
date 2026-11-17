import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createOwnerLinksHandler,readOwnerLinks} from '../lib/owner-links.js';
import {shortId,digest} from '../lib/dispatch-preparation.js';
import {guestReferenceKey} from '../lib/live-guest-link.js';
import registry from '../lib/registry.cjs';
import {createSessionCookie} from '../api/_wallet-auth.js';

const prep='hs18:manager-dispatch:v1:', short='hs18:guest-link:';
const now=new Date('2026-11-17T08:00:00Z');
const res=(voucher,apt)=>({voucher,apt,id:apt+'2',resId:apt+'1',arrival:'2026-11-21',departure:'2026-11-28'});
const wrapped=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
const target=(alf,apt,lang)=>'https://hillside18-guest-portal.vercel.app/?apt='+apt+'&alf='+alf+'&lang='+lang+'&done=1&door=0428#wallet=example';
function fixture(){
 const values=new Map(),events=[];
 const put=(key,data)=>values.set(key,JSON.stringify(data));
 const active=res('DEMO-A','1'),cancelled=res('DEMO-B','2');
 const setup=(ref,alf,id,isBound=true,preparedAt=now.getTime())=>{
  const preparationId='00000000-0000-4000-8000-00000000000'+id;
  const sid=shortId(preparationId),stay=digest(alf);
  put(short+sid,Object.fromEntries(['cs','en','de'].map(l=>[l,target(alf,ref.apt,l)])));
  put(prep+preparationId,{id:preparationId,shortId:sid,stayHash:stay,context:{apt:ref.apt,state:'done'},lang:'de',
   createdAt:preparedAt,history:{guestName:'<Guest>'},walletBody:{expiresAt:'2026-11-28T09:00:00Z'}});
  if(isBound)put(guestReferenceKey(sid),{roomAlf:alf,reservation:ref});
  return {preparationId,sid,stay,path:'/s/'+sid+'/de',ref};
 };
 const a=setup(active,'DEMOALFA',1), b=setup(cancelled,'DEMOALFB',2,false), other=setup(res('DEMO-C','3'),'DEMOALFC',3,false,now.getTime()-9000);
 put('hs18:cancellation:v1:'+b.stay,{receipt:{reservation:cancelled}});
 const s=async ([op,key,...args])=>{
  if(op==='SCAN')return ['0',[...values.keys()].filter(k=>k.startsWith(args[1].slice(0,-1)))];
  if(op==='MGET')return [key,...args].map(k=>values.get(k)||null);
  if(op==='HVALS'&&key===registry.EVENTS)return events.map(x=>JSON.stringify(x));
  throw Error('Unexpected mutation: '+op);
 };
 const reader={ownerLinkDetail:async q=>({...q,alf:q.voucher==='DEMO-A'?'DEMOALFA':'DEMOALFB',guestName:'Name '+q.voucher,statusId:q.voucher==='DEMO-B'?'7':'2'})};
 return {a,b,other,put,events,read:opts=>readOwnerLinks({store:s,reader,now,...opts})};
}
test('lists an unsent generated link, then shows only exact accepted SMS variants and suffixes',async()=>{
 const f=fixture(),find=async()=> (await f.read({voucher:'DEMO-A'})).items[0];
 let row=await find();assert.equal(row.lifecycle,'valid');assert.equal(row.sendStatus,'prepared');assert.equal(row.links[2].path,f.a.path);
 assert.equal(row.reservation.guestName,'Name DEMO-A');
 const e={channel:'sms',stay:f.a.stay,stage:'PIN_RELEASE',apt:'1',shortPath:f.a.path,finishedAt:now.getTime()};
 f.events.push({...e,status:'unknown'});row=await find();assert.equal(row.sendStatus,'pending_verification');
 f.events.push({...e,shortPath:'/s/'+f.other.sid+'/de',status:'accepted',results:[{ok:true,last3:'555'}]});
 f.events.push({...e,status:'accepted',results:[{ok:true,last3:'007',sms_id:'1'},{ok:false,last3:'999'}]});
 f.put(prep+f.a.preparationId+':receipt',{at:now.getTime(),result:{ok:true,results:[{ok:true,number:'+420700010007',sms_id:'1'}]}});
 row=await find();assert.deepEqual(row.deliveries,[{path:f.a.path,channel:'SMS',sentAt:now.toISOString(),recipientLast3:'007'}]);
 assert.equal(row.sendStatus,'sent');assert.doesNotMatch(JSON.stringify(row),/420700010007|DEMOALFA|door=|wallet=/);
});
test('historical exact receipt remains an SMS evidence; cancellation does not erase it; unrelated historical events do not get assigned',async()=>{
 const f=fixture();
 f.events.push({stay:f.a.stay,channel:'sms',stage:'PIN_RELEASE',status:'accepted'});
 assert.equal((await f.read({exact:f.a.ref})).items[0].sendStatus,'historical_unverified');
 assert.equal((await f.read({exact:{...f.a.ref,apt:'3'}})).items.length,0);
 f.put(prep+f.b.preparationId+':receipt',{at:now.getTime(),result:{ok:true,results:[{ok:true,number:'+420700010123'}]}});
 const row=(await f.read({voucher:'DEMO-B'})).items[0];
 assert.equal(row.lifecycle,'revoked');assert.equal(row.sendStatus,'sent');assert.equal(row.deliveries[0].path,f.b.path);
 assert.equal((await f.read()).items.find(x=>x.links[2].path===f.other.path).lifecycle,'paused');
});
test('owner inventory route rejects unauthenticated reads and non-GET requests before reading any data',async()=>{
 process.env.HILLSIDE_WALLET_SESSION_SECRET='owner-link-fixture-only';
 let reads=0;const endpoint=createOwnerLinksHandler({env:{VERCEL_ENV:'production'},read:async opts=>{reads++;assert.equal(opts.voucher,'DEMO-B');return {items:[]};}});
 const cookie=createSessionCookie().split(';')[0],call=async(method,headers,query={})=>{const reply=wrapped();await endpoint({method,headers,query},reply);return reply;};
 try{
  const unauth=await call('GET',{});assert.equal(unauth.code,401);assert.equal(unauth.headers['Cache-Control'],'private, no-store');
  assert.equal((await call('POST',{cookie})).code,405);assert.equal(reads,0);
  assert.equal((await call('GET',{cookie},{voucher:'demo-b'})).code,200);assert.equal(reads,1);
 }finally{delete process.env.HILLSIDE_WALLET_SESSION_SECRET;}
});
test('owner dashboard fetches read-only and opens the original short guest URL with no referrer',async()=>{
 const f=fixture(),html=await readFile(new URL('../public/index.html',import.meta.url),'utf8'),script=await readFile(new URL('../public/owner-links.js',import.meta.url),'utf8');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://hs18-generator.vercel.app',pretendToBeVisual:true});
 const {window}=dom,doc=window.document;let requests=0;
 window.fetch=async (url,init)=>{requests++;assert.equal(url,'/api/registry?operation=owner-links&page=0');assert.equal(init.method,undefined);return {ok:true,json:()=>f.read()};};
 try{
  window.eval(script);doc.getElementById('ownerLinks').open=true;
  await new Promise(r=>setTimeout(r,25));
  const a=[...doc.querySelectorAll('#ownerLinkRows a')].find(a=>a.getAttribute('href')===f.a.path);
  assert.equal(a.href,'https://hs18-generator.vercel.app'+f.a.path);assert.match(a.rel,/noreferrer/);
  assert.match(doc.getElementById('ownerLinkRows').textContent,/Připraven, neodeslán/);
  assert.equal(doc.querySelector('#ownerLinkRows guest'),null);
  assert.equal(requests,1);
 }finally{dom.window.close();}
});
