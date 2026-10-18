# Hillside Messenger release rules

Production is hs18-generator in falconis-projects-9c8c91c8.

- Fetch the current GitHub main before every change. Base changes on its latest commit and preserve concurrent work.
- Publish production through the connected GitHub main branch. Never deploy an old local directory, an old commit, or a prebuilt bundle to production.
- Vercel project Build Command must remain `node scripts/verify-deployment.mjs`. Do not override it in vercel.json, CLI flags, or deployment settings.
- The gate checks current main SHA and exact production source contents. A missing gate or unavailable source verification must fail the build and leave existing production online.
- Do not bypass the gate with a manual promotion, rollback, or alias change unless the user explicitly requests an emergency rollback to a named verified version.
- Preserve none/paid/unpaid/done semantics, short-link target snapshots, guest portal visibility, Wallet release rules, current registry and manual-send safeguards.
- Verify relevant tests before publishing. Do not send real SMS to test a release without explicit user authorization.

This is protection against accidental stale builds, not a restriction on a project owner's ability to deliberately change settings or promote an old deployment.
