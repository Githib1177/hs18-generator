import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestLinkHandler} from '../api/guest-link.js';
import {bindGuestReference,checkedOriginal,guestReference} from '../lib/live-guest-link.js';
import {shortId,digest} from '../lib/dispatch-preparation.js';

const id='00000000-0000-4000-8000-000000000001',sid=shortId(id);
const reservation={id:'123',resId:'234',voucher:'fixture',apt:'1',arrival:'2090-10-23',departure:'2090-10-25'};
const stay={...reservation,alf:'ROOMABC',guestAlf:'GROUPABC',statusId:'2',startsAt:'2090-10-23T13:00:00.000Z',expiresAt:'2090-10-25T09:00:00.000Z',
 paymentComplete:true,checkinComplete:true,accessConfirmed:true,accessCode:'0123',phone:'+420700000001'};
const target='https://hillside18-guest-portal.vercel.app/?apt=1&alf=ROOMABC&door=0000&done=1#apt=1&wallet=SYNTHETIC';
const prepKey='hs18:manager-dispatch:v1:'+id;
const shortKey='hs18:guest-link:'+sid;
const reply=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},end(body){this.body=body;return this;},json(body){this.body=body;return this;}});
function fixture(){
 const record={id,shortId:sid,phase:'prepared',lang:'en',context:{alf:stay.alf,apt:'1',state:'done'},stayHash:digest(stay.alf),
  walletBody:{startsAt:stay.startsAt,expiresAt:stay.expiresAt}};
 const map=new Map([[prepKey,JSON.stringify(record)],
  [shortKey,JSON.stringify(Object.fromEntries(['cs','en','de'].map(l=>[l,target])))],
  [prepKey+':receipt',JSON.stringify({result:{ok:true},historySaved:true,messageHash:digest('old'),recipientHash:digest(stay.phone)})]]);
 const store=async ([op,key,val,...flags])=>{
  if(op==='GET')return map.get(key)??null;
  assert.equal(op,'SET');
  if(flags.includes('NX')&&map.has(key))return null;
  map.set(key,val);return 'OK';
 };
 let current={...stay};
 const reader={historyDetail:async q=>{assert.deepEqual(q,reservation);return current;},
  detail:async q=>{assert.deepEqual(q,reservation);return current;}};
 return {store,reader,change:d=>{current={...current,...d};}};
}
test('existing URL keeps the original same-stay binding and refreshes payment and access on every open',async()=>{
 const {store,reader,change}=fixture();
 const original=await checkedOriginal({store,reader,id,reservation});
 await bindGuestReference(store,sid,guestReference(reservation,original.stay));
 await assert.rejects(bindGuestReference(store,sid,guestReference(reservation,{...stay,alf:'OTHER01'})));
 const handler=createGuestLinkHandler({store,reader});
 const open=async()=>{const res=reply();await handler({method:'GET',headers:{origin:'https://hillside18-guest-portal.vercel.app'},query:{id:sid,lang:'en',view:'1'}},res);return res;};
 let res=await open(),url=new URL(res.body.url);
 assert.equal(res.code,200);assert.equal(url.searchParams.get('alf'),'https://alfred.previo.app/login/GROUPABC');
 assert.equal(url.searchParams.get('door'),'0123');assert.equal(url.searchParams.has('unpaid'),false);
 change({paymentComplete:false,accessConfirmed:false,accessCode:''});
 res=await open();url=new URL(res.body.url);
 assert.equal(url.searchParams.get('unpaid'),'1');assert.equal(url.searchParams.has('door'),false);
 change({statusId:'7'});res=await open();assert.equal(res.code,410);assert.equal(res.headers.Location,undefined);
});
