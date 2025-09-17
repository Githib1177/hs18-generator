// /api/send-sms.js
export default async function handler(req, res) {
  // CORS preflight (neškodí)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Povolená jen metoda POST
  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(405).send(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  try {
    const { to, text } = req.body || {};
    if (!Array.isArray(to) || !to.length || !text) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(400).send(JSON.stringify({ error: 'Missing "to" (array) or "text"' }));
    }

    const LOGIN = process.env.SMS_LOGIN;
    const PASSWORD = process.env.SMS_PASSWORD;
    if (!LOGIN || !PASSWORD) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(500).send(JSON.stringify({ error: 'Missing env SMS_LOGIN / SMS_PASSWORD' }));
    }

    const API_URL = 'https://api.smsbrana.cz/smsconnect/http.php';

    // Jednoduchá normalizace čísel
    const norm = (n) => {
      let x = String(n).replace(/[()\-\s]/g, '');
      if (x.startsWith('00')) x = '+' + x.slice(2);
      if (!x.startsWith('+')) x = '+420' + (x.startsWith('0') ? x.slice(1) : x);
      return x;
    };

    const results = [];
    for (const raw of to) {
      const number = norm(raw);

      const body = new URLSearchParams();
      body.set('login', LOGIN);
      body.set('password', PASSWORD);
      body.set('action', 'send_sms');
      body.set('number', number);
      body.set('message', String(text).slice(0, 1000));
      // Pokud chceš posílat Unicode, odkomentuj:
      // body.set('data_code', 'ucs2');

      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      });

      const rawResp = await r.text();
      results.push({ to: number, ok: r.ok, status: r.status, response: rawResp });
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(JSON.stringify({ ok: true, results }));
  } catch (e) {
    console.error('send-sms error', e);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(500).send(JSON.stringify({ error: 'Server error' }));
  }
}
