// /api/send-sms.js
export default async function handler(req, res) {
  // CORS / preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // GET – rychlý stav
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      info: "Použij POST { to: string[], text: string }",
      has_SMS_LOGIN: !!process.env.SMS_LOGIN,
      has_SMS_PASSWORD: !!process.env.SMS_PASSWORD,
      sender_used: process.env.SMS_SENDER || null
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { to, text } = req.body || {};
    if (!Array.isArray(to) || !to.length || !text) {
      return res.status(400).json({ error: 'Missing \"to\" (array) or \"text\"" });
    }

    const LOGIN = process.env.SMS_LOGIN;
    const PASSWORD = process.env.SMS_PASSWORD;
    const SENDER = process.env.SMS_SENDER || ""; // ← nastavíme ve Vercelu (např. "Info SMS")
    if (!LOGIN || !PASSWORD) {
      return res.status(500).json({ error: 'Missing env SMS_LOGIN / SMS_PASSWORD' });
    }

    const API_URL = 'https://api.smsbrana.cz/smsconnect/http.php';

    // normalizace čísel
    const normalize = (n) => {
      let x = String(n).replace(/[()\-\\s]/g, '');
      if (x.startsWith('00')) x = '+' + x.slice(2);
      if (!x.startsWith('+')) x = '+420' + (x.startsWith('0') ? x.slice(1) : x);
      return x;
    };

    const results = [];
    for (const raw of to) {
      const number = normalize(raw);

      const form = new URLSearchParams();
      form.set('login', LOGIN);
      form.set('password', PASSWORD);
      form.set('action', 'send_sms');     // povinné
      form.set('number', number);         // povinné
      form.set('message', String(text).slice(0, 1000));
      if (SENDER) form.set('sender', SENDER); // ← použijeme jen když je zadán

      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: form
      });

      const respText = await r.text();
      const m = respText.match(/<err>(\d+)<\/err>/i);
      const errCode = m ? Number(m[1]) : null;

      results.push({
        to: number,
        ok: r.ok,
        status: r.status,
        err: errCode,
        response: respText,
        sent: {
          action: 'send_sms',
          number,
          sender: SENDER || '(none)',
          message_len: String(text).length
        }
      });
    }

    return res.status(200).json({ ok: true, results });
  } catch (e) {
    console.error('send-sms error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
