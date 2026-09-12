import crypto from 'node:crypto';

const HISTORY_KEY = 'hs18:message-history:v1';
const HISTORY_LIMIT = 20;

function send(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function authorize(req) {
  const expected = process.env.HISTORY_ACCESS_KEY;
  const supplied = req.headers['x-history-key'];
  return Boolean(expected && supplied && safeEqual(supplied, expected));
}

function redisConfig() {
  return {
    url:
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_KV_URL ||
      process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token:
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
  };
}

async function redis(command) {
  const { url, token } = redisConfig();
  if (!url || !token) throw new Error('Shared history storage is not configured');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || `Storage HTTP ${response.status}`);
  return data.result;
}

async function readHistory() {
  const raw = await redis(['GET', HISTORY_KEY]);
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function clean(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function normalizeEntry(body) {
  return {
    id: crypto.randomUUID(), ts: Date.now(),
    guestName: clean(body.guestName, 120),
    guestIsFemale: ['auto', 'female', 'male'].includes(body.guestIsFemale) ? body.guestIsFemale : 'auto',
    alf: clean(body.alf, 500), apt: clean(body.apt, 50), door: clean(body.door, 50),
    state: ['none', 'unpaid', 'done'].includes(body.state) ? body.state : 'none',
    phone: clean(body.phone, 300),
    lang: ['cs', 'en', 'de'].includes(body.lang) ? body.lang : 'cs',
    baseUrl: clean(body.baseUrl, 500),
  };
}

export default async function handler(req, res) {
  if (!authorize(req)) return send(res, 401, { ok: false, error: 'Neplatný přístupový klíč historie' });
  try {
    if (req.method === 'GET') return send(res, 200, { ok: true, items: await readHistory() });
    if (req.method === 'POST') {
      const entry = normalizeEntry(req.body || {});
      if (!entry.guestName && !entry.phone) return send(res, 400, { ok: false, error: 'Chybí jméno hosta nebo telefon' });
      const items = await readHistory();
      const dedupeKey = [entry.guestName, entry.alf, entry.apt, entry.state, entry.phone, entry.lang].join('|');
      const updated = [entry, ...items.filter(item =>
        [item.guestName, item.alf, item.apt, item.state, item.phone, item.lang].join('|') !== dedupeKey
      )].slice(0, HISTORY_LIMIT);
      await redis(['SET', HISTORY_KEY, JSON.stringify(updated)]);
      return send(res, 200, { ok: true, items: updated });
    }
    if (req.method === 'DELETE') {
      await redis(['DEL', HISTORY_KEY]);
      return send(res, 200, { ok: true, items: [] });
    }
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('[history] error:', error.message);
    return send(res, 500, { ok: false, error: 'Sdílenou historii se nepodařilo načíst nebo uložit' });
  }
}
