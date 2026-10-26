# Future authorized status SMS

`POST /api/manager-dispatch` uses the existing HttpOnly Wallet session. It does
not require another owner confirmation for an already authorized routine task.
The caller remains responsible for fresh reservation/contact/access verification,
individual bans, the manager's existing lease and evaluate/reserve/complete.
Never turn a login, MFA or tool approval rejection into `operatorConfirmed`.
The endpoint does not start a scheduler, read Booking or change reservations.

## Prepare (LINK_CREATE)

Send `action: "prepare"`, `operatorConfirmed: true` after those checks, plus:

- `alf`: verified Alfred code; `apt`: "1", "2" or "3".
- `state`: none / paid / unpaid / done, with existing meanings.
- `lang`: cs / en / de; `guestName`: the verified guest.
- `startsAt`, `expiresAt`: verified stay dates, ISO timestamps WITH timezone.
- `releaseAt`: authorized publication time for the code, not an invented arrival
  time. For an authorized done message whose code may already be shared, this is
  the current verified publication time; `startsAt` retains the real arrival.
  A genuinely future publication restriction must not be backdated to bypass it.
- For done only: `door`, `accessConfirmed: true` after the existing PIN checks.

The API checks the shared registry, creates/updates the same Wallet identity,
requires Google's successful response, embeds its signed token in all language
targets and creates a NEW immutable short link. Missing dates or Wallet failure
stop preparation. Existing shared short links are never edited.
Save returned `id`, `urls` and `walletState` with the original LINK_CREATE evidence.

## Send (SMS_SEND)

After the original SMS_SEND reserve and fresh recipient/content checks, send
`action: "send"`, saved `id`, `operatorConfirmed: true`, `to` (one verified
international phone), `text` (approved state template, ASCII, exact prepared URL
for the selected language). Preparation is usable for 15 minutes. There is no
browser `confirm()` in this path. The API checks the Wallet revision and validity
under its lock, then invokes the original SMS handler and shared atomic claim.
It persists the response before saving the existing shared history.

`status: "accepted"` means gateway acceptance, NOT handset delivery. Verify the
returned provider result/SMS identifier, `historySaved: true` and any registry
warning before local completion. Booking/portal/email remain independent.

## Interrupted result / missing history

Use `action: "status", id` to read without a send. `action: "reconcile", id`
can finish the history write from an already persisted successful receipt; it
never calls the SMS provider. Sending the same prepared ID again returns the
original receipt or blocks an uncertain attempt. A new preparation cannot bypass
the original shared stay/state claim. Do not delete claims or invent a new stay.
The existing separately authorized retry/reconciliation procedure remains the
only authority for a second attempt; this endpoint does not grant one.

No historical replay. No retroactive repair or resend to Plačková in this release.
Manual UI sending, manual repeat safeguards and existing short links stay valid.
The UI now stops instead of silently producing a new link without Wallet.
Preview cannot mutate through this endpoint or the Wallet provisioning endpoint.

## Validation

Install the pinned test dependency, then `node --test test/*.test.mjs`.
Tests replace Google, Redis and SMS with synthetic providers; no real guest send.
Publish only through current GitHub main and the existing deployment source gate.
