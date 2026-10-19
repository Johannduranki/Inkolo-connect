# Local SQL And Frontend Acceptance - 18 October 2026

## Result

PASS for the scoped local acceptance below. Not approval for production or live
payments. Existing regression and restore suites were not repeated.

Isolated application: `http://127.0.0.1:4309`.
Separate synthetic MariaDB instance: loopback port 13308.
Fixture: `tmp/staging/run-bc9d3530-e346-4305-ab15-959307d59539`.
Seven synthetic accounts only; no live database connection was opened.

## Verified

- Application health reports MariaDB for authentication, platform, wallet,
  Treasury, Training, Cycle and Heritage. The supported SQL-document business
  routes remain in use; legacy relational identity routes were not enabled.
- HTTP password/MFA login, tenant A access, denial of tenant B staff access,
  member A community selection and denial of community B passed.
- Platform configured a free Job Search subscription and synthetic catalogue
  visibility. Member subscription persisted in the SQL platform document.
  Wallets, identities, tenant staff and provider grants stayed unchanged.
- Only disposable staging API 4309 was restarted. SQL document checksum and
  revision matched afterward; the same authenticated session, catalogue and
  pricing remained usable. Member pricing hid internal costs/revenue shares.
  Logout revoked the session and subsequent access returned 401.
- Browser: normal platform, tenant and provider password/MFA login succeeded.
  Platform administration listed both synthetic tenants/communities. Tenant
  administration listed only Tenant A and Community A. Provider role selection
  opened its scoped Community A document workspace and existing synthetic file.
- Browser: member community A displayed Job Search, Wallet and Loans with
  Available, Provider connection required and Not yet implemented statuses.
  Switching to community B displayed only Buy and Sell with Pricing required;
  switching back restored community A's list.
- All browser and acceptance-runner test sessions were signed out.

## Fixes Found During Acceptance

1. Async native-fetch catalogue updates did not schedule Angular rendering,
   leaving fallback Status unavailable text despite successful pricing loads.
   Added explicit change detection, latest-request protection and the shared
   authentication token accessor. Browser verification now shows Available.
2. Member header controls overflowed the observed browser width. Enabled
   wrapping and zero minimum sizing. The observed viewport no longer showed
   horizontal header overflow; this is not an exhaustive mobile layout audit.

Both changes are in source and the isolated frontend only. No live frontend
was replaced. The affected production build passed with the existing initial
bundle warning: 952.65 kB, above 500 kB warning and below 1 MB failure budget.

Final browser artifact inventory:
`tmp/sql-acceptance-fixed-frontend/candidate-manifest.json` (144 browser files).
SHA-256: `ff4e73f267e1881746895f85a0dc1023dcea49c3d4187452071af8d80675d9e8`.
Selected source inventory SHA-256:
`bcb072075a211d421d2415c807261a3b1036b6a7cb4a7bc6c9785eecfb39afdb`.
This supersedes the earlier frontend fingerprint for these changed pages.

## Evidence And Preservation

The fixture's protected `sql-isolated` folder contains `prepared.json`,
`acceptance-before.json`, `acceptance-after.json`, `member-catalogue.png` and
`provider-workspace.png`. Private credential/session files must not be shared.
The initial preparation stopped on an incorrect SQLite fixture filename; it
resumed after correction, verifying existing copied rows without deleting them.
Source SQLite records and the retained original fixture were preserved.

Only the new synthetic instance was initialized and granted a schema-scoped
DML application account. The live database, its credentials/network settings,
and all pre-existing services were untouched. Synthetic catalogue selection
used the existing availability endpoint; no Cycle provider credentials,
dispatch settings, real payments or payment-provider calls were configured.

## Boundaries

This closes the basic local SQL-backed application startup/login/scope/write/
restart and specified frontend journeys. It does not claim every page or every
business service is implemented or tested. The earlier five-module training
journey remains JSON/SQLite evidence, with separate existing SQL adapter tests;
the full training workflow was not repeated here.

Johann still owns deployment, MariaDB networking and Cycle Pay. Independent
full recovery, release rollback, credential/privacy closeout, target-host
acceptance and named production approvals remain in PRODUCTION_SIGNOFF.md.
Provider-dependent and explicitly unimplemented services are not approved for
sale or fulfilment by these local results.
