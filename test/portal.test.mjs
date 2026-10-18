import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';import {randomUUID} from 'node:crypto';
const root=new URL('../guest-portal/',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');
test('guest portal keeps booking states, language switching, apt fallback and safe Wallet link',async()=>{
 const token=randomUUID()+'.'+'a'.repeat(43);let count=0;
 for(const lang of ['cs','en','de'])for(const flags of ['','paid=1','unpaid=1','done=1','unpaid=1&done=1'])for(const apartment of ['1','2','3','4']){
  const dom=new JSDOM(read('index.html'),{runScripts:'outside-only',url:`https://hillside18-guest-portal.vercel.app/?lang=${lang}&alf=DEMOHS&door=0258&${flags}#apt=${apartment}&wallet=${token}`});const w=dom.window;
  w.fetch=()=>{throw Error('No automatic guest request permitted');};w.matchMedia=()=>({matches:true});
  for(const file of ['config.js','portal.js','app.js','guest-wallet.js'])w.eval(read(file));
  const card=w.document.getElementById('hillside-wallet-save');assert.ok(card);assert.equal(new URL(card.querySelector('a').href).searchParams.get('token'),token);assert.equal(new URL(card.querySelector('a').href).hostname,'hs18-generator.vercel.app');
  assert.equal(w.document.getElementById('door-code').textContent.includes('0258'),flags==='done=1');assert.ok(w.document.getElementById('apartment').textContent.includes(apartment));
  w.document.querySelector('[data-lang="de"]').click();await new Promise(r=>setTimeout(r,0));assert.ok(w.location.hash.includes(token));assert.equal(w.document.getElementById('hillside-wallet-save').querySelector('a').getAttribute('aria-label'),'In Google Wallet speichern');
  dom.window.close();count++;
 }
 assert.equal(count,60);
});
