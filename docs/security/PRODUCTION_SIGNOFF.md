# Production Sign-off Handover

> Historical implementation/results below are not current acceptance. Local-store
> setup and migration instructions are retired. Follow [MariaDB-only setup](../MARIADB_ONLY.md).
> Preserve all existing security, privacy, authorization and payment-approval gates.
> Back up MariaDB, private uploads and matching MFA_ENCRYPTION_KEY before changes.


Updated 2026-10-18. Status: NOT APPROVED for production.
The 17 October closeout was documentation-only. On 18 October a source-only
tenant-role lifecycle fix was added with four new focused tests passing.
The approved activation subsequently started the already-stopped API with its
existing configuration. Four focused authenticated staging checks passed and
all 51 live SQL fingerprints matched. No live permissions, credentials or
configuration changed; MariaDB was not restarted. A subsequent staging browser
check confirmed Tenant Staff disappeared after revocation and profile refresh,
while Member access remained. Both sessions were signed out. Only the disposable
4307 tenant-a assignment was left revoked; original staging grants were unchanged.
The prior 327-test result is historical; the full suite was not repeated.

## Reuse Completed Evidence

The [2026-10-16 acceptance report](STAGING_WRITE_AND_SQL_RESTORE_2026-10-16.md)
records 319 regression tests, 8 restored-SQL integration tests, 133 synthetic
HTTP checks, browser permission/upload/revocation checks and a successful
encrypted 51-table SQL restore. All live fingerprints matched afterward.

Do not repeat these checks against the same unchanged candidate merely to
update a date. Evidence applies to the tested code and environment, not to
arbitrary later changes. For a new candidate, record its commit/artifact digest
and run only affected checks initially; the release owner decides the final
required regression coverage. No current runtime health is inferred here.

## Remaining Release Gates

Server setup, MariaDB network settings and Cycle Pay configuration are explicitly
reserved for Johann and his developer. Do not alter them as part of this handover.
Other engineering acceptance gaps in the table remain open, not completed by
this documentation closeout. They require a separately scoped implementation/
acceptance pass; existing passing tests are not proof those gaps are closed.

## Launch Scope Decision Required

The source catalogue explicitly marks Loans, Insurance, Education, POS,
Business Services and Projects as not implemented. Wallet funding/withdrawals,
Payments, VAS/Airtime/Utilities, Vuma/Internet, Funeral Cover and Referral rewards
still depend on provider work. Product/developer owners must either complete
and accept an intended launch service or explicitly exclude it from the launch
scope. No live service has been disabled to manufacture a passing result.

Remaining code/security review is not just server configuration: historical
scope mappings, outstanding endpoint authorization, cross-store reset/retention,
browser-token/XSS/script-CSP, legacy credential recovery and settlement review
still need resolution or documented owner-reviewed disposition. The local SQL
acceptance was scoped; it did not replay every business workflow, including
the full five-module training journey, against SQL. Use targeted affected
checks for the chosen release scope, not repetition of the entire passed suite.

## Frontend Follow-ups

- Tenant Staff role synchronization on assignment changes is now fixed in source:
  last revocation removes only that role, other active tenants retain it, and
  reactivation restores it. Four focused tests verify preservation and denial.
  This is activated in the local API and HTTP-verified in disposable staging,
  with browser-confirmed role removal after revocation/profile refresh on 4307.
  Browser reactivation was not repeated. Existing stale role records were
  not bulk-edited, and an already open client still needs its profile refreshed.
- Reproduce the earlier intermittent generic login failure with controlled
  autofill/manual input before attributing a cause; the final provider login
  succeeded. Do not reset credentials or weaken MFA to investigate.
  Latest platform/tenant/provider manual SQL-staging logins all succeeded;
  historical autofill failure remains unconfirmed, not an established fix.
- Confirm source/live frontend parity before deployment. A browser currently
  showing a different local port is not evidence of an approved release build.
  The source-built SQL staging candidate now passed the scoped platform, tenant,
  provider and member catalogue checks in SQL_FRONTEND_ACCEPTANCE_2026-10-18.md.
  It includes catalogue render/header fixes not deployed to the live frontend.

## Data-preserving Execution Rules

1. Use new isolated staging destinations; never overwrite live or retained
   rehearsal databases. Keep originals and restoration evidence intact.
2. Do not rerun migration/recovery provisioning or destructive synthetic test
   runners against the live database or the retained 4304 rehearsal.
3. Keep restored real data private and disconnected from application/payment
   dispatch. Use synthetic records for application and payment acceptance.
4. Use additive compatible migrations and a reviewed deployment window when
   required. Do not promise a zero-downtime migration without a tested method.
5. Never replace encryption keys, remove storage-mode markers, force demo
   fallback, or restore old financial data to make an error disappear.

## Decision Record

Latest scoped frontend candidate: `tmp/sql-acceptance-fixed-frontend/candidate-manifest.json`.
Browser inventory SHA-256: `ff4e73f267e1881746895f85a0dc1023dcea49c3d4187452071af8d80675d9e8`.
See [SQL/frontend acceptance](SQL_FRONTEND_ACCEPTANCE_2026-10-18.md) for current
evidence and limitations; the earlier build details below remain historical.

- Local frontend candidate: production build passed on 18 October; 146-file
  manifest in `tmp/release-candidate-20261018/candidate-manifest.json`.
  Frontend inventory SHA-256:
  `9ed31e9c0eaed920b537ac46a44d948a176195ab2351942b368ec676978b507d`.
  Selected source inventory SHA-256:
  `4da5072885cc61f7d98feba87c5d18008ccd360b93c459027058a5c16242be85`.
  The source inventory covers backend source/locks and frontend source/public/
  locks/config, not an entire deployment. This is not a clean-install
  reproducibility check, a backend artifact, or production approval.
- Build warning: initial bundle 952.49 kB exceeds 500 kB warning budget, remains
  below 1 MB failure budget. Record performance acceptance on the target host.
- Accepted full deployment commit/artifact digest: pending
- Evidence for remaining gates: pending
- Developer approval/name/date: pending
- Product acceptance/name/date: pending
- Operations recovery/rollback approval/name/date: pending
- Production decision: withheld until required gates are closed

## Completion Boundary

The 18 October build was isolated; no deployed frontend was replaced and no
service restarted. Existing passed suites were not repeated. Production
signoff cannot be completed using only this computer and saved test results.
Johann must provide the approved host and target-environment acceptance,
provider sandbox access, independent recovery destination and release owners.
Local SQL staging and the specified source-frontend login/catalogue/role journeys
are now accepted locally, not merely compiled. Broader feature parity and target
deployment acceptance remain open. The developer must also resolve or explicitly
review remaining audit findings before approval. Do not treat the older PDF
or any local passing result as authorization for live payments or deployment.

## Inputs Needed To Close External Gates

The developer/operator must supply an approved staging/production host and
domain, an independent recovery destination and protected key-recovery method,
repository/CI owner access, monitoring/backup destinations and the provider's
sandbox configuration/approval. Use secure credential delivery, not chat.
MariaDB network changes and Cycle configuration remain excluded from agent work.
These are real acceptance dependencies, not items that can be marked complete
from existing local unit-test results. Do not deploy the current dirty checkout
or describe the 18 October source patch as production activation.

Supporting references: [release status](SECURITY_RELEASE_STATUS.md),
[staging guide](STAGING_TEST_GUIDE.md),
[operations](SECURITY_OPERATIONS.md),
[rotation register](SECRET_ROTATION_REQUIRED.md).
