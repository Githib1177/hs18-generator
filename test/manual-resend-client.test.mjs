import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
const html=await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function element(){return {value:'',checked:false,textContent:'',style:{},children:[],listeners:{},classList:{toggle(){}},set innerHTML(v){this.html=v;this.children=[]},get innerHTML(){return this.html||''},appendChild(c){this.children.push(c)},addEventListener(e,cb){(this.listeners[e]||=[]).push(cb)},querySelector(){return this.tbody||=element()}}}
for(const approve of [false,true])test('actual generator client '+(approve?'confirms':'cancels')+' conscious manual repeat without real network',async()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)},requests=[],confirms=[],links=[];let walletSyncs=0;
 const context=vm.createContext({URL,URLSearchParams,Intl,Date,Event,document:{getElementById:get,createElement:element,querySelectorAll:()=>[],addEventListener(){},dispatchEvent(){}},alert(x){assert.fail(x)},confirm(x){confirms.push(x);return approve},fetch:async(url,opts)=>{
  const b=opts.body&&JSON.parse(opts.body);
  if(url==='/api/history')return {ok:true,json:async()=>({ok:true,items:[]})};
  if(url==='/api/registry')return {ok:true,json:async()=>({ok:true,duplicate:true,reason:'Already sent'})};
  if(url==='/api/guest-link'){links.push(b);return {ok:true,json:async()=>({urls:{cs:'https://hs18-generator.vercel.app/s/abcdefghijklmnopqrstuv',en:'https://hs18-generator.vercel.app/s/abcdefghijklmnopqrstuv/en',de:'https://hs18-generator.vercel.app/s/abcdefghijklmnopqrstuv/de'}})}}
  assert.equal(url,'/api/send-sms');requests.push(b);
  if(requests.length===1)return {status:409,ok:false,json:async()=>({ok:false,error:'Already sent',allowManualResend:true,manualResendToken:'test-only-token'})};
  assert.equal(requests.length,2);assert.equal(b.manualResendToken,'test-only-token');assert.equal(b.mode,'manual');
  return {status:200,ok:true,json:async()=>({ok:true,results:[{number:'+420777000001',ok:true,err:0}]})};
 }});
 context.window=context;context.hillsideWalletSync=async()=>{walletSyncs++};context.hillsideWalletLink=url=>url;
 vm.runInContext(script,context);await vm.runInContext('loadSharedHistory()',context);
 get('guestName').value='Test Guest';get('guestIsFemale').value='auto';get('alf').value='TESTCODE';get('apt').value='1';get('phone').value='+420777000001';get('lang').value='cs';get('baseUrl').value='https://hillside18-guest-portal.vercel.app/';vm.runInContext('setReservationState("none")',context);
 for(const cb of get('btnBuild').listeners.click)await cb();
 for(const cb of get('btnSendSms').listeners.click)await cb();
 assert.equal(confirms.length,1);assert.match(confirms[0],/Test Guest/);assert.match(confirms[0],/\+420777000001/);
 assert.equal(requests.length,approve?2:1);assert.equal(get('btnSendSms').disabled,false);
 assert.equal(walletSyncs,2);assert.equal(links.length,2);assert.match(requests[0].text,/https:\/\/hs18-generator.vercel.app\/s\/abcdefghijklmnopqrstuv/);assert.doesNotMatch(requests[0].text,/guest-portal/);
 if(approve)assert.equal(requests[0].text,requests[1].text);
 if(!approve)assert.match(get('smsStatus').textContent,/zrušeno/);
});
