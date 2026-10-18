import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import crypto from 'node:crypto';

// Load the unmodified server module without changing the project's module setup.
const server = await readFile(new URL('../api/history.js', import.meta.url), 'utf8');
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(server).toString('base64')}`);
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function element() {
  return {
    value: '', checked: false, textContent: '', style: {}, children: [], listeners: {},
    classList: { toggle() {} },
    set innerHTML(value) { this.children = []; this.html = value; },
    get innerHTML() { return this.html || ''; },
    appendChild(child) { this.children.push(child); },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    querySelector() { return this.tbody ||= element(); },
  };
}

test('history preserves reservation state and guest content across save/load/reopen', async t => {
  const env = { ...process.env };
  t.after(() => { process.env = env; });
  process.env.HISTORY_ACCESS_KEY = 'test-only';
  process.env.UPSTASH_REDIS_REST_URL = 'https://history.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-only';
  t.mock.method(Date, 'now', () => 1700000000000);
  let id = 0;
  t.mock.method(crypto, 'randomUUID', () => `test-${++id}`);
  const legacy = { id: 'legacy', ts: 1690000000000, guestName: 'Legacy', state: 'none', alf: 'old', apt: '2' };
  let stored = JSON.stringify([legacy]);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://history.invalid');
    const [command, key, value] = JSON.parse(options.body);
    assert.equal(key, 'hs18:message-history:v1');
    assert.ok(['GET', 'SET'].includes(command), 'No deletion or unexpected storage operation');
    if (command === 'SET') stored = value;
    return { ok: true, json: async () => ({ result: command === 'GET' ? stored : 'OK' }) };
  });
  async function request(method, body) {
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    await handler({ method, headers: { 'x-history-key': 'test-only' }, body }, response);
    assert.equal(response.code, 200);
    assert.equal(response.data.ok, true);
    return JSON.parse(JSON.stringify(response.data));
  }
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const targets = new Map();
  const context = vm.createContext({
    URL, URLSearchParams, Intl, Date,
    Event:class{}, document: { dispatchEvent(){}, getElementById: get, createElement: element, querySelectorAll: () => [], addEventListener() {} },
    alert(message) { assert.fail(message); },
    fetch: async (url, options) => {
      if(url==='/api/registry')return {ok:true,json:async()=>({ok:true,duplicate:false,reason:'test'})};
      if(url==='/api/guest-link'){
        const input=JSON.parse(options.body).urls;const urls={};
        for(const lang of ['cs','en','de']){const id=get('state').value.padEnd(22,'x');urls[lang]='https://hs18-generator.vercel.app/s/'+id+(lang==='cs'?'':'/'+lang);targets.set(urls[lang],input[lang]);}
        return {ok:true,json:async()=>({urls})};
      }
      assert.equal(url, '/api/history', 'Never send a real SMS or request the live portal');
      const data = await request(options.method, options.body && JSON.parse(options.body));
      return { ok: true, json: async () => data };
    },
  });
  context.window=context;context.hillsideWalletSync=async()=>{};
  // Execute the actual client script, including its event handlers and templates.
  vm.runInContext(script, context);
  await vm.runInContext('loadSharedHistory()', context);
  const cases = [
    ['none', false, false, 'Před příjezdem dokončete check-in všech hostů a platbu v Alfrédovi.'],
    ['paid', false, true, 'Platba je vyřízena. Zbývá online check-in všech hostů.'],
    ['unpaid', true, false, 'Check-in je hotový. Zbývá platba v Alfrédovi.'],
    ['done', true, true, 'Vše je připraveno. Přejeme příjemný pobyt.'],
  ];
  for (const [state, checkedIn, paid, message] of cases) {
    await t.test(state, async () => {
      get('guestName').value = 'Test Guest';
      get('alf').value = 'test-reservation';
      get('apt').value = '2';
      get('door').value = '123456';
      get('lang').value = 'cs';
      get('guestIsFemale').value = 'auto';
      context.inputState = state;
      vm.runInContext('setReservationState(inputState)', context);
      await get('btnBuild').listeners.click();
      const before = Object.fromEntries(['cs', 'en', 'de'].flatMap(lang =>
        ['sms', 'mail'].map(kind => [`${kind}_${lang}`, get(`${kind}_${lang}`).value])));
      await vm.runInContext('saveSuccessfulSend()', context);
      assert.equal(JSON.parse(stored)[0].state, state, 'Persisted state');
      const data = await request('GET');
      assert.equal(data.items[0].state, state, 'API read-back');
      vm.runInContext('setReservationState("none")', context);
      get('guestName').value = '';
      await vm.runInContext('loadSharedHistory()', context);
      get('historyTable').querySelector('tbody').children[0].listeners.click();
      assert.equal(get('state').value, state);
      assert.equal(get('checkinComplete').checked, checkedIn);
      assert.equal(get('paymentComplete').checked, paid);
      await get('btnBuild').listeners.click();
      for (const [key, expected] of Object.entries(before)) assert.equal(get(key).value, expected, key);
      assert.ok(get('sms_cs').value.includes(message));
      for (const lang of ['cs', 'en', 'de']) {
        const sms = get(`sms_${lang}`).value;
        const url = new URL(targets.get(sms.split('\n')[1]));
        for (const flag of ['paid', 'unpaid', 'done']) {
          assert.equal(url.searchParams.get(flag), flag === state ? '1' : null);
        }
        assert.equal(url.searchParams.get('door'), state === 'done' ? '123456' : null);
        if (state !== 'done') assert.ok(!sms.includes('123456'));
      }
      if (state === 'paid') {
        assert.match(get('mail_cs').value, /^Platba je vyřízena\./);
        assert.match(get('sms_en').value, /Payment is complete\./);
        assert.match(get('mail_en').value, /^Payment is complete\./);
        assert.match(get('sms_de').value, /Die Zahlung ist erledigt\./);
        assert.match(get('mail_de').value, /^Die Zahlung ist erledigt\./);
      }
      assert.deepEqual(data.items.find(item => item.id === 'legacy'), legacy, 'Do not infer or migrate old none records');
    });
  }
  assert.deepEqual(JSON.parse(stored).filter(item => item.guestName === 'Test Guest').map(item => item.state),
    ['done', 'unpaid', 'paid', 'none'], 'Dedupe keeps distinct states for the same reservation');
  for (const state of [undefined, 'unknown', null]) {
    const data = await request('POST', { guestName: 'Invalid state', state });
    assert.equal(data.items[0].state, 'none', 'Existing fallback remains intact');
  }
  assert.deepEqual(JSON.parse(stored).find(item => item.id === 'legacy'), legacy);
});
