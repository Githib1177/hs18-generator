# History regression test

Run with Node.js 22 or newer; no dependencies or credentials are needed:

```sh
node --test test/history.test.mjs
```

The test runs the actual history API handler and the inline client script with
an in-memory Redis substitute and a minimal DOM. It covers all four states
(`none`, `paid`, `unpaid`, `done`) through client save, API read-back, history-row
click, and regeneration of Czech, English and German SMS/email content. It also
checks URL flags, withholding door codes until `done`, state-aware deduplication,
invalid-state fallback, and preservation of existing `none` entries.

Time and generated IDs are fixed. No network requests, SMS delivery, migrations
or deployments occur. This is a logic regression test, not a browser layout test.

The separate guest portal source was also checked at commit
`e447a7a847756e89abdea0236929d40d2396b5ce` in
`Githib1177/hillside18-guest-portal`: its real `portal.js` and `app.js` passed
an isolated runtime check of all 12 state/language combinations. In `paid`,
payment is complete, check-in remains pending, and the door code stays hidden.
That separate repository and its deployment were not changed.


# SMS registry regression tests

```sh
node --test test/registry.test.mjs test/manual-resend-client.test.mjs
```

The actual SMS and registry handlers run against a simulated provider and
in-memory Redis. No credentials or live services are required. Coverage includes
accepted messages, all-recipient rejection (credit/number errors), corrected
concurrent retries, partial acceptance, timeouts, malformed/HTTP responses,
unknown provider codes, legacy rejected locks, audit failures and claim races.
Manual confirmation stays single-use even when a repeat is rejected.

Only explicit rejection codes 1–13 for every recipient allow a normal retry.
Code -1 (message already exists), missing/new codes and incomplete outcomes stay
protected. Rejected audit entries are retained. Old rejected claims are released
only when their stored recipient results prove complete rejection, using an
atomic comparison of the claim and audit record. Any earlier success or
unresolved attempt still blocks normal sending. Both module entry points share
this state machine.

The full suite is `node --test test/*.test.mjs`; portal/Wallet DOM tests also
require `jsdom`. All transports in these tests are simulated.
