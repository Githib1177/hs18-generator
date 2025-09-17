// /api/ping.js
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(JSON.stringify({
    ok: true,
    method: req.method,
    note: "API funguje. Pokud tohle vidíš na /api/ping, routing je v pořádku."
  }));
}
