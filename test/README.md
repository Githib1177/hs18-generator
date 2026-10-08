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
