import {test} from 'node:test';import assert from 'node:assert/strict';
import handler from '../api/previo-preview.js';
import planner from '../lib/previo-dry-run.cjs';
test('actual preview API processes fresh Previo data with no network or send capability',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw new Error('Network forbidden in preview test')});
 const now=new Date().toISOString(),today=planner.pragueDay(now),arrival=planner.addDays(today,2);
 const snapshot={schema:'hillside18.previo.snapshot.v1',hotelId:'763519',observedAt:now,scope:{complete:true,renderedRowCount:1},messages:[],reservations:[{voucher:'DEMO',guest:'Test Guest',arrival,departure:planner.addDays(arrival,2),apartment:'Apt1',status:'P',checkinComplete:false,phone:'+420777000001',language:'de',alf:'DEMOONLY',account:{complete:true,observedAt:now,items:[{owner:'Booking.com XML',amountMinor:10000,currency:'EUR',paid:false},{owner:'---',amountMinor:1000,currency:'EUR',paid:false,remainingMinor:1000}]},duplicateCheck:{checkedAt:now,state:'none',available:true,duplicate:false}}]};
 async function req(method,body){let r={headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.code=c;return this},json(d){this.data=d;return this}};await handler({method,body},r);return r;}
 const r=await req('POST',{snapshot,planningDay:today,nowUtc:'2099-01-01T00:00:00Z',send:true});
 assert.equal(r.code,200);assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.data.mode,'DRY_RUN_ONLY');assert.equal(r.data.counts.eligible,1);assert.equal(r.data.results[0].state,'none');assert.equal(r.data.counts.sent,0);assert.equal(r.data.sendAllowed,false);assert.equal(calls,0);assert.ok(!r.data.nowUtc.startsWith('2099'));
 assert.equal((await req('GET')).code,405);assert.equal((await req('POST',{})).code,400);
 snapshot.hotelId='OTHER';assert.equal((await req('POST',{snapshot})).code,400);assert.equal(calls,0);
});

