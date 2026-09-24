(function (root) {
  'use strict';
  function alfredUrl(value, hosts = ['alfred.previo.app']) {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (/^[a-z0-9_-]{1,128}$/i.test(raw)) return 'https://alfred.previo.app/login/' + encodeURIComponent(raw);
    try {
      const url = new URL(raw);
      if (!['https:', 'http:'].includes(url.protocol) || !hosts.includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) return '';
      url.protocol = 'https:';
      return url.href;
    } catch { return ''; }
  }
  function parseLink(input, hosts) {
    const url = new URL(input, 'https://prototype.invalid');
    const p = url.searchParams;
    const hash = new URLSearchParams(url.hash.slice(1));
    const apartment = ['apt', 'apartment', 'apartment_no'].map(k => p.get(k)?.trim()).find(Boolean) || hash.get('apt')?.trim() || '';
    const flag = key => ['1', 'true', 'yes'].includes((p.get(key) || '').toLowerCase());
    // Generator emits unpaid=1 on its own: check-in is already complete.
    // A conflicting unpaid flag always hides the access code.
    const state = flag('unpaid') ? 'payment' : flag('done') ? 'ready' : 'checkin';
    const rawDoor = (p.get('door') || '').trim();
    const door = state === 'ready' && /^\d{4}$/.test(rawDoor) ? rawDoor : '';
    const requestedLang = (p.get('lang') || 'cs').toLowerCase();
    return { apartment: /^[\p{L}\p{N} _.-]{1,40}$/u.test(apartment) ? apartment : '', lang: requestedLang === 'cz' ? 'cs' : ['cs', 'en', 'de'].includes(requestedLang) ? requestedLang : 'cs', state, paid: state === 'ready' || (state === 'checkin' && flag('paid')), door, alfred: alfredUrl(p.get('alf'), hosts) };
  }
  const api = { parseLink, alfredUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HillsidePortal = api;
})(typeof window !== 'undefined' ? window : globalThis);
