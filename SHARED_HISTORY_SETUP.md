# Nastavení sdílené historie na Vercelu

Změny jsou určené pouze pro projekt `hs18-generator`. Projekt `hs18-generator-staging` se nemění.

## Potřebné služby

Ve Vercelu připojte k projektu `hs18-generator` integraci **Upstash Redis** z Marketplace. Vercel po připojení doplní přístupové proměnné. Kód podporuje obě běžná pojmenování:

- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, nebo
- `KV_REST_API_URL` + `KV_REST_API_TOKEN`.

Navíc vytvořte vlastní tajnou proměnnou:

- `HISTORY_ACCESS_KEY` – dlouhý náhodný klíč používaný obsluhou pro načtení historie.

Hodnoty patří pouze do Vercel Environment Variables a nesmějí se zapsat do GitHubu.

## Chování

- Aplikace ukládá pouze posledních 20 úspěšných odeslání.
- Historie je společná pro všechna zařízení, která znají `HISTORY_ACCESS_KEY`.
- Klíč se v prohlížeči drží pouze v `sessionStorage`, tedy do zavření karty/prohlížeče.
- Historie se uloží jen tehdy, když SMS brána potvrdí úspěch alespoň pro jedno číslo.
- Dosavadní historie ze staging domény je v jejím `localStorage` a automaticky se nepřenese.

## Kontrola po nasazení

1. Otevřít `hs18-generator` na prvním PC a zadat přístupový klíč.
2. Odeslat testovací SMS na vlastní číslo.
3. Ověřit, že se záznam objevil v historii.
4. Otevřít aplikaci na druhém PC, zadat stejný klíč a načíst historii.
5. Kliknout na řádek a ověřit kompletní předvyplnění formuláře.
