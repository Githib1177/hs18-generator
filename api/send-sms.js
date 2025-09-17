export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
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
    if (!LOGIN || !PASSWORD) {
      return res.status(500).json({ error: 'Missing env SMS_LOGIN / SMS_PASSWORD' });
    }

    const API_URL = 'https://api.smsbrana.cz/smsconnect/http.php';

    const norm = (n) => {
      let x = String(n).replace(/[()\-\s]/g, '');
      if (x.startsWith('00')) x = '+' + x.slice(2);
      if (!x.startsWith('+')) x = '+420' + x;
      return x;
    };

    const results = [];
    for (const number of to) {
      const body = new URLSearchParams();
      body.set('login', LOGIN);
      body.set('password', PASSWORD);
      body.set('to', norm(number));
      body.set('message', String(text).slice(0, 1000));
      body.set('sender', 'InfoSMS');   // <<< pevně nastavený odesílatel

      const r = await fetch(API_URL, {
        method: 'POST',
        body,
      });

      const responseText = await r.text();
      results.push({ to: norm(number), ok: r.ok, status: r.status, response: responseText });
    }

    return res.json({ ok: true, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
