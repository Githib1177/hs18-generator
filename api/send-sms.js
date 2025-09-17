// /api/send-sms.js
export default async function handler(req, res) {
  // CORS / preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // GET – rychlá kontrola
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      info: "Použij POST { to: string[], text: string }",
      has_SMS_LOGIN: !!process.env.SMS_LOGIN,
      has_SMS_PASSWORD: !!process.env.SMS_PASSWORD,
      sender_used: process.env.SMS_SENDER || '(system number)'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { to, text } = req.body || {};
    if (!Array.isArray(to) || !to.length || !text) {
      return res.status(400).json({ error: 'Missing "to" (array) or "text"' });
    }

    const LOGIN = process.env.SMS_LOGIN;
    const PASSWORD = process.env.SMS_PASSWORD;
    const SENDER = (process.env.SMS_SENDER || '').trim(); // nech prázdné pro systémové číslo

    if (!LOGIN || !PASSWORD) {
      return res.status(500).json({ error: 'Missing env SMS_LOGIN / SMS_PASSWORD' });
    }

    const API_URL = 'https://api.smsbrana.cz/smsconnect/http.php';

    const normalize = (n) => {
      let x = String(n).replace(/[()\-\s]/g, '');
      if (x.startsWith('00')) x = '+' + x.slice(2);
      if (!x.startsWith('+')) x = '+420' + (x.startsWith('0') ? x.slice(1) : x);
      return x;
    };

    async function callBrana(params) {
      const body = new URLSearchParams(params);
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      });
      const text = await r.text();
      const m = text.match(/<err>(\d+)<\/err>/i);
      const err = m ? Number(m[1]) : null;
      return { ok: r.ok, status: r.status, body: text, err };
    }

    const results = [];
    for (const raw of to) {
      const number = normalize(raw);

      // 1) primárně: action=send_sms + number=...
      const base = {
        login: LOGIN,
        password: PASSWORD,
        action: 'send_sms',
        message: String(text).slice(0, 1000)
      };
      if (SENDER) base.sender = SENDER;

      let attempt = 1;
      let resp = await callBrana({ ...base, number });

      // 2) fallback: stejné, ale použij "to" místo "number"
      if (resp.err === 6) {
        attempt = 2;
        resp = await callBrana({ ...base, to: number });
      }

      results.push({
        to: number,
        attempt,
        status: resp.status,
        err: resp.err,
        response: resp.body,
        sent: {
          action: base.action,
          used_field: attempt === 1 ? 'number' : 'to',
          sender: SENDER || '(system number)'
        }
      });
    }

    return res.status(200).json({ ok: true, results });
  } catch (e) {
    console.error('send-sms error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
