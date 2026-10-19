# Security Test Results

## Provider Workspace And Member Documents - 2026-10-15

- Full suite: **308 passed**, zero failed/skipped. Added three HTTP workspace-route tests and six source frontend regressions. A test-harness-only cross-VM object-prototype mismatch in RxJS `forkJoin` was corrected before the final green run.
- New read-only-business-data staging acceptance runner: **40 passed**, normal password plus existing MFA, own-scope documents/downloads, foreign-scope/member/tenant denials, report isolation, unconfigured-payment status and logout revocation. No grants, business records or payment settings changed; the platform JSON hash matches before/after.
- New source provider page removes fixed provider identity, demo network/users/revenue and browser-only invoice/publicity actions. The server returns only current assigned scopes and authorized documents from one state read. Uploads send explicit provider/tenant/community/service scope; download URLs must be local member-document paths. Billing/reporting are marked Not connected, not claimed as implemented.
- Private member documents clear on identity changes, denied reloads and destruction; authenticated downloads report errors. Late responses cannot cross identities. No live documents touched.
- New isolated copy at 4303 retains 4302 synthetic data/MFA with six integrity-checked online SQLite backups. All older listeners remain active. This is a synthetic per-store fork, not a coordinated MariaDB restore exercise.
- Browser: anonymous `/dashboard/service-provider-user` redirects to login. Privileged provider/admin browser journeys and responsive provider visual QA are **pending the staging sign-in handoff**. HTTP results must not be represented as UI results.
- Live API/frontend/MariaDB PIDs unchanged; all seven live storage health checks remain MariaDB-backed. All 51 live SQL table counts and hashes match exactly. MariaDB network and Cycle configuration unchanged.
- Frontend build, release preflight and diff whitespace checks pass (existing bundle-size and unrelated CRLF warnings remain). No live source bundle/API activation performed.

## Extended Permission Rehearsal - 2026-10-15

**299/299 automated tests pass**, zero failures/skips: 291 regressions and 8 isolated SQL integrations. Ten added tests execute transpiled source role-service/route-guard code with controlled HTTP responses: forged local role caches, empty initial member directory, current server role selection, failed/successful role saves, stale directory/save responses after identity changes, denial after a newer directory failure, server profile validation, denied-member redirect loop prevention and removal of name/ID-based admin navigation.

The fresh rehearsal `run-b87d876c-a9a3-4e8b-b1bb-e6b19a7f4239` passes **133 HTTP acceptance checks**. These use seven synthetic users, actual password authentication, normal MFA enrolment/verification for four privileged users, isolated JSON/SQLite stores, one synthetic PDF and one private Heritage tree. Cross-tenant reporting/staff/branding denials, unsupported delegation, document scope and revocation, member ownership, multi-community reads and payment fail-closed behaviour pass. Logout invalidates both identity and MFA-status requests. No external payment call was attempted. The result file is `permission-check.results.json` inside that snapshot.

After the user explicitly approved restoring the two test grants, six follow-up checks confirmed restored own-scope access, foreign-scope denial and logout revocation. `fixture-restoration.json` records this separately; do not combine it with the 133 into a rerun of the full matrix. All test records remain, and MFA seeds/recovery codes stay only in the access-restricted `mfa.private.json` file. No credentials are in this report.

The first intermediate rehearsal stopped on an incorrect test expectation (403 instead of the deliberate private-download 404). The application correctly concealed the document's existence. The expectation was corrected from inspected server code and the full matrix reran on a fresh snapshot; neither access checks nor MFA were weakened.

Browser checks confirm anonymous `/dashboard/admin-user` and `/dashboard/member` redirect to login, login omits registration-only names, registration restores those fields, and no horizontal overflow at desktop/390px mobile widths. Authenticated privileged browser journeys remain unverified. The source provider dashboard still contains hardcoded provider/demo presentation; it is not covered by the passing document API matrix and remains a frontend-parity blocker.

Source build passes (`main-BCGV2KOD.js`) with the existing 500 kB budget warning. Live assets/processes are preserved. All 51 live SQL fingerprints match exactly across this work. Read-only live smoke remains 20 passed/1 failed (MariaDB broad binding); no network settings changed. Backend production-only and full frontend npm audits report zero advisories. Private-file preflight and the redacted pattern scan pass (771 paths, 31 commits), not a guarantee about excluded/ignored files or historical personal data.

## Staging And Session Checks - 2026-10-15

289 tests pass, zero failures/skips (281 regressions and 8 MariaDB integrations). Eleven added tests cover staging environment/fixture isolation, safe port/key requirements, staging identification, expired-session browser handling and races, session-status idle/revocation checks, and source-login privacy/MFA handoff. Staging separately passes ten HTTP acceptance checks. Its stores are isolated JSON/SQLite, not the live MariaDB database.

The staging source build passes with the existing bundle-size warning. Browser inspection found and fixed a legacy demo-account picker and login width overflow in source; the final login has no horizontal overflow at desktop and 390px mobile widths. Registration name fields remain visible only in registration mode. Privileged browser journeys are pending staging MFA enrolment, not claimed passed.

No live API/frontend/MariaDB restart occurred. The new MFA-status backend check is staged, not live. The original 50 non-session SQL table fingerprints match across this work; session timestamp activity changes the session hash. MariaDB network settings and Cycle Pay configuration remain developer-owned and untouched. See `STAGING_TEST_GUIDE.md` for limitations and reproducible commands.

## Activated Permission Fixes - 2026-10-15

**278/278 automated tests pass**, zero failures/skips (270 regressions and 8 MariaDB integrations). Three new isolated provider-document endpoint/download-policy tests cover cross-provider, cross-tenant, cross-service and unscoped records; forged query authority; revoked grants and changed community parents; and legitimate member-owned file access. No live grants or records were modified by these tests.

The user-approved API-only restart has activated the prior permission fixes. MariaDB and the frontend retained their original processes. All 50 non-session SQL table fingerprints match before/after; the session table hash changed while its count stayed at four, consistent with the authenticated browser updating last-seen timestamps. Row snapshots were not retained, so exact changed columns were not verified. Environment/storage-mode hashes match. Signed-in platform overview works after reload. Live smoke is 20 passed/1 failed, with only the known broad MariaDB listener unresolved and left for the developer. Cycle Pay configuration is unchanged.

Both dependency audits report zero known vulnerabilities; release preflight and the redacted pattern scan pass (760 working paths, 31 commits). The existing module-type warning remains. This section supersedes the prior NOT ACTIVATED status; broader unresolved gates remain in `SECURITY_RELEASE_STATUS.md`.

## Frontend And Permission Follow-Up - 2026-10-15

**275/275 tests pass**, zero failures/skips: 267 regressions plus 8 MariaDB integrations. The nine added tests exercise both marketplace/property enquiry routes with synthetic users, stale/deactivated provider actors and changed community scope, real multipart upload validation in an isolated OS temporary directory, and the real Heritage loading functions with controlled out-of-order responses. Rejected uploads preserve previously accepted files. No live records or grants are used as test fixtures.

Frontend compilation succeeds at `tmp/security-permission-build`; the existing bundle-size warning remains. Live admin and tenant-staff navigation/form inspection passed without saving; Heritage community switching respects the existing disabled-service configuration. The Heritage response-race fix is served on page reload. Backend changes are staged and tested, **not yet activated**; no API, frontend or database restart occurred in this follow-up.

Live read-only smoke: **20 passed, 1 failed**, unchanged broad MariaDB binding. Network isolation and Cycle Pay configuration are explicitly left for the developer. No provider settings, production payments, business records or memberships changed. Whitespace check passes. Historical sections below describe earlier batches, not activation of this follow-up. Full provider/tenant/session browser coverage and remaining release gates are recorded in `SECURITY_RELEASE_STATUS.md`.

## Final Local Pass - 2026-10-15

266/266 automated tests passed (258 regressions, 8 MariaDB integrations); zero failures/skips. Fourteen new tests cover proxy target pinning, authentication/body preservation, generic failures, timeouts, static headers and authenticated per-user rate limits. Presence and logout are exempt from those new limits. `npm test` now selects only terminating regression tests; SQL tests use `npm run test:integration`.

The pending ride/reset/report changes and the new API/proxy protections are LIVE. API/proxy were briefly restarted with operator authorization; MariaDB stayed running. All 51 SQL table counts/hashes matched exactly across each activation, and environment/storage marker hashes matched. Later user sign-in legitimately changes session/MFA state and is not part of that exact comparison. No live business records were created, reset or deleted for testing.

Live read-only smoke: 20/21 checks pass. All 14 protected paths deny anonymous access with 401/no-store; malformed tokens and foreign CORS origins are rejected. API storage health, static browser headers and non-root single-schema DML grants pass. The failed check is loopback-only MariaDB binding: listeners are 0.0.0.0 and ::. User is unsure about other network clients, so host isolation is unresolved, not silently marked passed. The local database connection has no TLS. Run `node scripts/security-smoke.js` from backend to repeat these non-destructive checks.

After the user completed MFA, the platform dashboard, Cycle dashboard and ZUC community report loaded successfully. Cycle still shows sandbox, collection disabled/not configured, exactly as before. No provider settings or payment requests were submitted. Browser checks do not certify every service journey or every role combination.

Backend and frontend npm audit each report zero advisories. Frontend release build succeeded in `tmp/security-final-build`, preserving deployed assets; its existing 500 kB initial-bundle budget warning remains. Release private-file preflight and changed-file whitespace checks pass. Remote GitHub/Bitbucket runs, Docker release execution and production infrastructure were not tested. The historical NOT LIVE notes below refer to earlier stages and are superseded here.

Date: 2026-10-15. Scope: isolated tests and static/build checks; no destructive production testing and no real payment executed.

## Latest Permission And Privacy Checks

252 tests passed, zero failed (244 regressions and 8 MariaDB integration tests). The ride/reset/report batch adds 24 tests for community-scoped ride browsing, minimal response fields, participant-only requests, current active-account/membership/business checks, strict location/seat inputs, duplicate pending requests, terminal pickup redaction, explicit reset authority, queued revocation, shared-file preservation and report access revoked during financial reads. Tests use isolated records; no real service reset, ride request or payment was executed. Frontend TypeScript no-emit compilation passes.

Activation status for this batch: TESTED, NOT LIVE. No API restart has been performed; current API and frontend health checks pass with all seven storage areas on MariaDB. Cycle Pay configuration is untouched. A separate operator-approved API-only restart and before/after SQL/configuration fingerprints are required to activate these changes. Existing services remain running on the previously activated code.

## Earlier Activated Batches

Latest combined run: 228 tests passed, zero failed (220 regressions and 8 MariaDB integration tests). Fifteen new agreement/legacy administration tests cover active-owner/platform-admin access, denial of legacy/scoped roles, unchanged archived HTML with restrictive headers, safe download names, escaped new terms, queued administrator revocation, current target classification, session revocation and successful authorized operations. Synthetic account removal and logo upload tests use isolated in-memory records; cleanup removes only files belonging to those test requests.

Agreement/administration activation: operator approved an API-only restart. All 51 SQL table counts/hashes matched exactly before and after restart, as did environment and storage-mode marker hashes. API and frontend health endpoints report all seven MariaDB-backed storage areas healthy. MariaDB and the frontend were not restarted. The authenticated Cycle dashboard reloaded with sandbox/collection-disabled settings unchanged. No live accounts, consent records, branding or financial data were modified by the checks.

Previous combined run: 213 tests passed, zero failed (205 regressions and 8 MariaDB integration tests). Nine additional tests covered queued tenant/branding authorization, concurrent directory creation, parent-scope changes, new staff password policy, injected hashes, preservation of existing credentials, and actor/target revalidation after Treasury password hashing. Prior checks cover native Cycle concurrent callbacks, payload-bound replay keys, encrypted profiles, cancellation, unknown renewal outcomes, sandbox isolation and wallet replay after partial cross-store persistence. Native Heritage tests cover privacy, scoped reads, concurrent duplicate creation, stale edits, ancestry cycles, single-use concurrent claims, separate succession, evidence bytes, verification permissions and rollback. Migration tests reject unknown fields/tables and compare binary data across drivers. Queued administrator revocation, marketplace/property message permissions and Windows backup ACL inheritance are tested. Existing authentication/MFA, Treasury, Training, platform document, wallet and community-isolation checks continue to pass. Synthetic SQL records were removed by exact run IDs.

Staff/branding activation: operator approved an API-only restart; MariaDB and the frontend proxy stayed running. Both health endpoints report all seven storage areas as MariaDB. Before/after fingerprints match exactly for 50 of 51 SQL tables, including all platform/wallet, Cycle and Heritage data. The authentication session table changed during browser activity with its three-row count unchanged; this is not claimed as an exact match. Environment configuration and all storage-mode marker hashes are unchanged. Authenticated Cycle, tenant staff, Treasury and branding screens load after restart; both staff password forms expose minlength=15 and maxlength=1024. No credentials, grants, logos, payments or live financial records were submitted through the browser. Cycle remains sandbox/collection disabled with developer configuration outstanding, as before.

MariaDB recovery: dedicated non-root connection verified. A staging copy retains 8,302 platform records/values and 26 files; SQL round-trip restore of six SQLite stores passed integrity and table/row-count comparisons. Native sessions/MFA/Treasury/Training/Cycle/Heritage and transactional platform/wallet document storage are LIVE on MariaDB. Both API and proxy health checks pass. The user's actual MFA sign-in and Cycle/Heritage dashboards were verified after cutover; collection/enablement settings were not altered. All 26 pre-existing SQL table fingerprints matched before/after the latest maintenance. Source Cycle tables were empty; Heritage had one catalogue record, copied exactly. Platform cutover retained 2,753 users, 2,757 memberships and 1 wallet. Original migrated files are recovery-only. See MARIADB_MIGRATION.md for backups and remaining work.

Training schema 021 and the migration were activated during the operator-approved maintenance window. Native integration testing passed before migration and again after activation. Both health endpoints report trainingStorage=mariadb; authenticated browser reload displays the original five-module draft. The migration verified 1 programme and 1 audit record, with no attempts or entitlements. Messaging and renewal hardening are deployed; no real messages or payments were submitted for testing.

Baseline: 147 backend tests passed, zero failed. Added security-hardening.test.js covers password hashing/missing credentials, ownership and mass assignment, invalid tokens, global role escalation, unsafe production configuration, upload signatures, private document ownership and session expiry/revocation. MFA integration fixture now issues the strict token contract, not a permissive legacy token.

Existing tests also cover tenant scope, member/admin restrictions, MFA replay/expiry, safe logs, branding upload validation, treasury maker-checker, Cycle callback/amount/idempotency protections, heritage privacy and training grants. These are not a substitute for every endpoint's authorization tests.

Commands:

```text
cd backend
node --test test/*.test.js
node --test integration/*.test.js
cd ../frontend
node node_modules/typescript/bin/tsc --project tsconfig.app.json --noEmit
npm run build -- --output-path ../tmp/security-build
cd ..
node tools/security-inventory.mjs
node tools/security-scan.mjs --history
```

The first sandboxed HTTP test run encountered Windows localhost EACCES; rerunning with approved localhost access passed. Do not use bare node --test: a pre-existing preview-server file is not a terminating test.

TypeScript compilation passed. Production build passes to an isolated directory; existing deployed assets are preserved. The build reports an initial-bundle size warning, not a compilation failure. Known Node SQLite/module-format warnings remain.

Dependency scans: backend 0 advisories; frontend 52 initially, 26 after the first compatible update, 11 after matching Angular patch installation, then 0 after replacing the unused Webpack wrapper. No --force or --legacy-peer-deps was used.

Latest redacted pattern scan reviewed 757 working paths and 31 reachable Git commits with no pattern matches. The earlier tracked runtime JSON finding was removed from the working index without deleting the file. The scanner does not prove absence of generic passwords, ignored-file exposures, personal data in history or historical binary secrets. Its error handling suppresses captured Git contents.

Data check before activation: 2,753 users; 2,757 memberships; 1 wallet; 0 member-document records. No real record deletion, payment, financial reconciliation or user-role mutation was performed by these tests.

Still required: normalized multi-writer platform/ledger repositories, complete authenticated service journeys, every matrix row's scope tests, real infrastructure TLS/MariaDB backup restore evidence, deployed-client parity, credential rotation and Cycle sandbox end-to-end tests. Treasury's live dashboard was checked read-only; actual financial transactions were not executed. Do not label unperformed checks as passed.
