# Local Application Acceptance - 18 October 2026

## Scope and Result

PASS: a new authenticated HTTP workflow on disposable synthetic staging at
127.0.0.1:4308. This is JSON/SQLite application integration, not production
approval, browser acceptance, or MariaDB-backed application acceptance.
Previously passed regression, security and restore suites were not rerun.

Runner: `scripts/staging-application-acceptance.mjs`.
Evidence: `tmp/staging/run-ce699d7c-1211-425c-ba2f-b9c864e4166c/application-acceptance.results.json`.

| Journey | Expected and observed |
| --- | --- |
| Free-service configuration and subscription | Platform configured Training and Grant Distribution as free; member subscribed through HTTP. Both returned active subscriptions with zero amount. |
| Programme publication | Platform published five lessons with configured funding; tenant staff publication returned 403. Member received the available first lesson without answer keys, and no locked lesson content. |
| Eligibility controls | Unrelated member returned 403; skipping the first module returned 409; a quiz below 100% unlocked nothing. |
| Completion and replay | Five sequential 100% passes unlocked R100, R200, R300, R400 and R500 respectively: R1,500 total eligibility. Replaying the first pass retained exactly five entitlements. All remained ELIGIBLE, not paid. |
| Data boundaries | Wallets, wallet transactions, platform transactions, users, tenant staff and provider grants matched their initial fixture values. Test sessions were signed out. |

## Preservation

The retained synthetic staging fixture was forked; six storage backups were
verified by the existing fork tool. Only the new copy received a synthetic
Trader Connect community and membership before startup. Original staging and
live records were not edited. Existing services were not stopped. No migration,
MariaDB network change, Cycle Pay configuration or real payment was performed.
The new synthetic server and its evidence are retained on port 4308.

## What Remains

Do not repeat these unchanged local checks just to update dates. Johann's
release candidate still needs SQL-backed application acceptance and production
frontend/artifact parity. The end-to-end member catalogue and membership
experience must be accepted on that candidate. Existing catalogue tests are
useful evidence, but not a replacement for that acceptance.

Server deployment, MariaDB networking and Cycle Pay sandbox/production setup
remain explicitly with Johann. Provider-dependent payments, recurring billing,
settlement and reconciliation cannot be signed off from this free-service test.
Independent full recovery, credential/privacy closeout, release rollback and
named approvals remain as detailed in `PRODUCTION_SIGNOFF.md`.
