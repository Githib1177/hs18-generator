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
Supply a stable UUID `preparationId` from the original LINK_CREATE operation before the first call, with `sourceCheckedAt` from a real verification no older than120s. Persist it locally before network. The server checkpoints the intent before Wallet, then the Wallet revision before the immutable short link. Save returned `id`, `urls` and `walletState` with the original LINK_CREATE evidence.

## Send (SMS_SEND)

After the original SMS_SEND reserve and fresh recipient/content checks, send
`action: "send"`, saved `id`, `operatorConfirmed: true`, `to` (one verified
international phone), `text` (approved state template, ASCII, exact prepared URL
for the selected language). Include the original local `operationId`, `bindingHash`, and fresh `sourceCheckedAt`. Preparation older than15min requires a new actual source verification no older than120s; this does not create a new preparation. There is no
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
The existing local `retry-sms` / `owner-sms` procedure is the authority for another attempt. `work/messenger_workflow.py` in the manager builds the exact request from its guarded immutable local journal; never invent a proof. The authenticated API now supports these separately claimed attempts:

- `action: retry`, same prepared id, phone and text; `recheck` includes kind=local_sms_retry, local operationId, originalOperationId, bindingHash, fresh checkedAt, evidenceHash, noConfirmedSend=true. Positive original receipt blocks retry. Exactly one corrective remote claim exists per original stay/state across restarts/preparations. If original receipt is missing, wait120s after the original request before retrying to avoid overlapping requests.
- `action: owner-send`, the same binding plus recheck kind=owner_sms, specific grantId and expiresAt. Each new documented owner instruction permits one separately journaled attempt, including after a confirmed original. Replaying the same instruction cannot send again, nor restart the automatic budget.
- `status` / `reconcile` for a corrective attempt take attemptKind=retry or owner and grantId for owner. Reconcile only repairs history from a stored receipt; it never calls the SMS provider.
- `reconcile-prepare`, same stable preparation id, can read Google to recover positive evidence for an ambiguous original Wallet request. It never repeats PUT/SMS. If Wallet is confirmed and the link is missing, repeating prepare with the same id and fresh verified sources completes only the missing link. Existing shared snapshots cannot change.

The ordinary/manual SMS endpoint keeps its existing protections. Manager-only authorization is a server-side capability, never an HTTP body flag. No claim/history is deleted. Booking/portal/email remain independent.

No historical replay. No retroactive repair or resend to Plačková in this release.
Manual UI sending, manual repeat safeguards and existing short links stay valid.
The UI now stops instead of silently producing a new link without Wallet.
Preview cannot mutate through this endpoint or the Wallet provisioning endpoint.

## Validation

Install the pinned test dependency, then `node --test test/*.test.mjs`.
Tests replace Google, Redis and SMS with synthetic providers; no real guest send.
Publish only through current GitHub main and the existing deployment source gate.

# Read-only shared SMS registry (3 November 2026)

`GET /api/registry?id=<comId>&resId=<resId>&voucher=<voucher>&apt=<1|2|3>&arrival=<YYYY-MM-DD>&departure=<YYYY-MM-DD>` uses the existing HttpOnly Messenger session. It first verifies the exact current Previo hotel/stay binding and then reads every persisted registry event plus the four original phase claims. It performs only Redis GET/HVALS; no bootstrap, migration, claim, Wallet, link creation or SMS. No history key, Alfred code, PIN, guest name or phone is returned or required in the URL. The original POST registry check is unchanged; the read reuses the existing deployed function without adding a function or a paid plan.

The response is SMS evidence only, not verification of all communication channels. It reports recent legacy history as incomplete and preserves unknown/pending/rejected attempts. Empty results must not be treated as proof that no message ever existed before registry coverage. Check the original portal thread and canonical per-stay records separately before a welcome; retain the original reservation guards and atomic dispatch claims. A failed/unauthorized read is not empty history. Managers use the original service=messenger read-navigation/read-snapshot permit and never repeat a denied form write to obtain this result.

`historyCoverage` compares the actual current PMS `created` timestamp with a conservative verified production baseline (deployment f95c4e5 READY on 2 November 2026 at 19:16:50.175 UTC). For a newer reservation's current verified reference, `currentReferenceLifetimeCovered=true` means the older pre-registry legacy display is irrelevant to its SMS lifetime. No caller-supplied creation time is accepted. Unknown, older or future timestamps cannot establish coverage. Existing records/claims still take precedence and cannot authorize a repeat. `allChannelsVerified=false` describes the server's SMS-only scope; it is not a global stop after the manager has separately verified the original portal and email evidence. The history evidence hash binds the exact PMS identity, coverage and observation time. Default reservation lookup and Wallet inputs are unchanged.
