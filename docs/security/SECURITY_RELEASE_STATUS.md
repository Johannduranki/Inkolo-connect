# Security Release Status

Date: 2026-10-18. Decision: overall security programme INCOMPLETE, production sign-off withheld. Only the targeted activation checks below were performed today; earlier broad acceptance results remain historical.

## Additional Local Acceptance And Build - 2026-10-18

Handover closeout: the updated four-page report is
`output/pdf/Duranki-Security-Work-Report-Johann-2026-10-18-Updated.pdf`.
It supersedes the older report's pending SQL-staging statement and lists
unimplemented/provider-dependent launch services and remaining engineering,
recovery, repository and developer-owned infrastructure/payment gates.
This report update performed no application tests, runtime writes, deployments
or service changes. PDF layout checks are document QA, not application tests.

Subsequent SQL-backed and frontend acceptance passed on independent synthetic
ports 4309/13308, including restart persistence and platform/tenant/provider/
member browser journeys. Catalogue change detection and header wrapping fixes
were built and verified only in staging. See SQL_FRONTEND_ACCEPTANCE_2026-10-18.md
for exact scope and latest artifact fingerprint. This supersedes the earlier
statement below that basic local SQL application acceptance remained open.

The new disposable staging 4308 free-subscription/five-module training HTTP
journey passed, including exactly-once grant eligibility and unchanged wallets
and permissions. See APPLICATION_ACCEPTANCE_2026-10-18.md.
An isolated Angular production build passed without replacing any live files.
Its initial 952.49 kB bundle triggers the 500 kB warning, not the 1 MB error.
Source and 146-file frontend inventory fingerprints are recorded in
`tmp/release-candidate-20261018/candidate-manifest.json` and PRODUCTION_SIGNOFF.md.
No regression suite was repeated. This does not close frontend feature parity,
SQL-backed application acceptance, independent recovery, payment-provider or
infrastructure gates. No live data, network or provider configuration changed.

## Tenant Role Activation - 2026-10-18

Browser follow-up on disposable staging 4307: normal password/MFA sign-in for
tenant-a and platform; confirmed Tenant Staff appeared in the member switcher,
revoked the synthetic Tenant A assignment through the admin UI, then refreshed
the same tenant session. Tenant Staff disappeared and Member access remained.
Both sessions were signed out. Only this disposable grant remains revoked;
original staging/live permissions were untouched. No passed tests repeated.
Evidence: `tmp/staging/evidence/tenant-role-browser-2026-10-18.png`.
Browser reactivation was not repeated; its earlier HTTP evidence still applies.

- API port 3000 was already stopped when inspected. Started the existing API
  configuration (PID 44268), activating the saved tenant-role lifecycle fix.
  Health reports all seven stores using MariaDB. No existing service was stopped.
- MariaDB retained PID 7308. All 51 live SQL table fingerprints match before/after;
  backend environment hash and original staging platform hash are unchanged.
- Disposable staging 4307 (`run-aa047591-1fd7-4676-b79d-e2a9a7cf074f`) passed four
  new focused authenticated HTTP checks: initial role, immediate removal of role
  and tenant access in the same session, reactivation, and preservation of users,
  credentials and provider grants. Original test assignment restored; sessions
  logged out. No live permissions changed and no existing test suite repeated.
- Initial preservation assertion compared role ordering; adjusted it to compare
  sorted role sets after confirming roles were the only differing user field.
  The focused check then passed. No browser rendering acceptance is claimed.
- MariaDB networking and Cycle Pay configuration remain untouched. Existing
  stale live roles were not bulk-edited; clients need a refreshed profile.
- Evidence: `tmp/staging/evidence/tenant-role-activation-2026-10-18.json` and the
  new staging copy's `tenant-role-check.results.json`. Production gates remain.

## Tenant Role Lifecycle - 2026-10-18

- Source-only fix in tenant-access.js synchronizes Tenant Staff when assignments
  are saved: remove after last revocation, preserve for other active tenants,
  restore on reactivation. Other roles, credentials and provider grants remain.
- Four new focused tests passed in tenant-role-lifecycle.test.js; no previously
  passed suite was repeated. No database connection or live mutation was used.
- Not deployed or browser-accepted; no bulk cleanup of existing stale roles,
  API restart, service stop, MariaDB network or Cycle configuration change.
- External recovery/host/provider acceptance and named approvals remain blocked
  on developer/operator inputs listed in PRODUCTION_SIGNOFF.md.

## Minimal-credit Closeout - 2026-10-17

Prepared the consolidated [production sign-off handover](PRODUCTION_SIGNOFF.md)
with remaining gates, owners, acceptance criteria and data-preserving rollback
rules. Corrected stale deployment/operations references so completed migrations
and passed checks are not unnecessarily repeated. Documentation only: no tests
rerun, service changes, database writes or deployment. MariaDB networking and
Cycle Pay configuration remain reserved for the developer.

## Staging Writes And Isolated SQL Restore - 2026-10-16

- **327 tests passed**: 319 regression tests plus 8 SQL integration tests against
  an isolated restored database. Fresh synthetic staging passed 133 HTTP checks.
- Browser-verified provider upload, tenant self-permission protection, immediate
  tenant revocation, and an explicitly approved temporary provider tenant grant
  followed by revocation. Original provider document access remained intact.
- Encrypted online SQL backup restored all 51 tables into a separate MariaDB
  instance with matching schemas/counts/hashes. No app used the restored real
  data. The test database server was shut down; backup and restore files remain.
- All 51 live fingerprints and primary staging business data stayed unchanged.
  Existing services were not stopped; MariaDB networking and Cycle Pay settings
  remain untouched. Primary staging remains 4304; write fixtures are 4305/4306.
- Full files/keys/off-host recovery and MariaDB-backed application staging remain
  open, along with deployment, service and provider acceptance gates.
- Details: [Write-flow and restore acceptance](STAGING_WRITE_AND_SQL_RESTORE_2026-10-16.md).

## Post-Shutdown Recovery And Checks - 2026-10-16

- Restored live API 3000, frontend 4200 and existing isolated rehearsals 4300-4304.
  All seven HTTP health endpoints respond; all seven live data stores report MariaDB.
  MariaDB was already running and was not restarted or reconfigured.
- API startup loads the saved backend fixes. The deployed Angular bundle was not
  replaced. Added its missing standalone admin stylesheet without restarting it;
  the proxy forwarding fix is saved for its next normal restart.
- Fixed report selection/URL/payment-link scope alignment, including foreign-scope
  fallback, aliases and tenant filtering. This standalone script is served from
  source on live reload and was also refreshed in staging.
- Fixed mobile member Sign out visibility in the source build and staging only.
  Browser verified mobile logout/protected-route denial and tenant/provider scope
  boundaries, using existing synthetic MFA without changing grants or credentials.
- **323/323 tests pass**, **40 authenticated staging HTTP checks pass**, build passes
  with the existing size warning. Dependency audits report zero known advisories;
  release preflight and redacted pattern scan pass. Live smoke remains **20/21**:
  the developer-owned MariaDB listener is intentionally unchanged.
- All **51 live SQL table counts and hashes match** the pre-startup baseline.
  Staging business records are unchanged. Cycle configuration, grants and payments
  were not changed. Earlier source/staging-only activation statements below are
  historical; use this section for current activation status.
- Details and remaining gates: [Recovery acceptance](POST_SHUTDOWN_RECOVERY_2026-10-16.md).

## Staging Repairs And Tenant/Provider Browser Pass - 2026-10-16

- Updated isolated staging is **http://127.0.0.1:4304**. Original 4303 and all
  live services remain running. Six stores were verified during the synthetic
  fork; no live data was copied or activated.
- Repaired Accounting routing/data presentation, Treasury current-identity
  resolution, unhandled missing-wallet responses, joined-community selection,
  server-backed service visibility, document titles and mobile overflows.
- Actual MFA browser sessions verified both tenant scopes and Provider A.
  Cross-tenant staff access and unauthorized finance/admin/report pages are
  denied. Provider document listing/download works; billing/reporting truthfully
  remain Not connected. No business-data writes or permission changes occurred.
- **318/318 tests pass** and build passes with its existing warning. All 51
  live fingerprints unchanged; old/new staging business stores match. MariaDB
  networking and Cycle settings untouched. Source changes remain staging-only.
- See [repair acceptance](STAGING_REPAIR_ACCEPTANCE_2026-10-16.md) for the full
  browser matrix, preservation evidence, browser interruption and open limits.
  Production sign-off remains withheld.

## Privileged Platform Browser Pass - 2026-10-16

- User completed normal staging sign-in. Browser-confirmed platform landing,
  tenant A/B navigation, scoped staff editor, community report A/B/A filtering,
  user directory filtering, branding selection, service pricing, Cycle status,
  Training empty state, Heritage privacy/selection and role-switch round trip.
- Fixed staging role-select display and misleading empty-catalogue success text.
  **312/312 tests pass**; build passes with the existing size warning. Changes
  are in staging only, without live deployment or any service restart.
- Open findings: Accounting route redirects to login; synthetic Treasury
  identity is not resolved by its legacy local access path; shared report header
  overflows on mobile; member page logs minified errors and still lacks source
  multi-community selector parity. Separate tenant/provider browser acceptance
  remains pending. This pass does not certify write or payment workflows.
- All **51 live table fingerprints match** and staging platform JSON hash is
  unchanged. All live/staging listeners retain their processes. MariaDB network
  and Cycle configuration were untouched. Production sign-off remains withheld.
- Detailed evidence and limitations: [Privileged browser checks](PRIVILEGED_BROWSER_CHECKS_2026-10-16.md).

## Staging MFA Landing Repair - 2026-10-16

- Read-only staging audit confirmed successful recovery verification followed by a new login and rejected reuse of a consumed recovery code. No recovery code or MFA seed is included here.
- The rebuilt Angular routes lacked `/dashboard/platform-admin`, the platform administrator MFA destination. The wildcard returned the user to login after successful verification. Added an explicitly guarded Platform Admin route with a server-backed administration directory and links to the existing tenant, report, pricing, branding, Treasury, Cycle, Training and Heritage workspaces. The legacy browser-local tenant editor was not re-enabled.
- **310/310 regression/integration tests pass**, including destination routing/guard coverage and server-directory/error cleanup. Source build passes with the existing size warning. Updated only the frontend in the existing 4303 rehearsal; no server restart, database migration, live bundle activation, credential reset or configuration change.
- The first recovery code is consumed, as intended. Another normal sign-in using an unused recovery code is required for authenticated browser acceptance. No test runner logged in as the user's current staging identity during this repair; its challenge was not overwritten by automation. Privileged browser acceptance is still pending.

## Provider And Document Source Repair - 2026-10-15

- **308/308 tests pass**, no failures/skips. Nine new regressions cover provider workspace scoping, multi-provider grants, current grant/user/community status, query spoofing, frontend stale responses, scoped uploads, untrusted download URLs and member-document cleanup.
- Updated staging is **http://127.0.0.1:4303/login**, process 48096, snapshot `run-79df3a6c-4ce5-4441-873d-a86028b94061`. It preserves the previous rehearsal's synthetic identities, MFA configuration, restored grants, uploaded document and Heritage records. Six SQLite stores passed online-backup integrity checks. The original 4302 service and files remain intact; this is not a coordinated production backup or MariaDB restore drill.
- **40 additional authenticated HTTP checks pass** using existing test MFA, without changing business records or grants. Workspace metadata/files stay within current grants; member/tenant users cannot access the provider workspace; foreign private files remain hidden; tenant reporting remains scoped; unconfigured payments remain unavailable. All runner sessions logged out. The staging platform JSON hash is unchanged.
- Replaced the older source provider page's fixed `sp-001`, fake subscribers, random revenue counter and simulated invoice/publicity actions with an authenticated provider/document workspace. Billing and network/revenue reporting explicitly show **Not connected**; their actual integrations are still outstanding, not silently marked complete. No real service was disabled.
- Member document lists clear on identity changes, failed reloads and destruction; downloads use authenticated requests and reject non-local document URLs. No real documents were uploaded, edited or deleted.
- Browser verification confirms the anonymous provider route redirects to login on 4303. **Privileged browser acceptance and responsive provider-screen visual verification remain pending staging sign-in**; HTTP tests are not browser acceptance. A sign-in handoff was requested, with no bypass of MFA or injected browser session.
- All **51 live SQL table counts and hashes match exactly**. Live API 32968, frontend 36200, MariaDB 38260 and all prior staging listeners remain running. Health checks confirm all seven live stores still use MariaDB. No live bundle/backend activation, MariaDB network change or Cycle configuration change occurred.
- Source build and release preflight pass; the pre-existing bundle budget warning remains. These source changes are staging-only. The production gates and open finding classifications below remain in force.

## Extended Staging Acceptance - 2026-10-15

- Final suite: **299/299 passed**, no failures/skips (291 regressions and 8 isolated MariaDB integration tests). Ten new source-frontend tests cover cached-role spoofing, failed role updates, stale directory responses, identity changes, route guards and identity-based admin redirects.
- **133 HTTP acceptance checks passed** on a fresh isolated rehearsal at `http://127.0.0.1:4302/login`. Normal password login and MFA setup/verification were exercised for platform, both tenant staff accounts and the provider. Tests cover tenant/report/branding isolation, forbidden global role delegation, scoped uploads/downloads, immediate staff/provider revocation, multi-community selection, private Heritage data and unconfigured-payment failure without credits or requests.
- After explicit user approval, the two revoked synthetic grants were restored to their original scopes. **Six follow-up checks passed** for restored access, foreign-scope denial and logout revocation. No live grants changed. All synthetic records were preserved.
- Source-only fixes remove demo members and persisted role assignments from the role service, wait for server acceptance before changing visible roles, clear state on logout/identity changes, reject stale directory responses, and validate the current server profile in route guards. Name/numeric-ID-based admin routing was removed. These are in the staging build, **not the deployed live Angular bundle**.
- Browser checks verify anonymous admin/member route redirects, login/registration fields, and no horizontal overflow on desktop or 390px mobile. Privileged browser click-through and full deployed-client parity remain pending; the 133 checks are HTTP/API acceptance, not browser certification.
- All **51 live SQL table counts and hashes match exactly** before/after this pass. Live API 32968, frontend 36200 and MariaDB 38260 remained running and unchanged. MariaDB networking and Cycle Pay configuration were not touched. Live smoke stays 20/21, with only the developer-owned broad database listener failing.
- Backend production-dependency and full frontend dependency audits report zero known advisories. Release private-file preflight and the redacted pattern scan pass (771 working paths, 31 commits); exclusions remain. Source build succeeds with the existing bundle-size warning.
- No new live activation occurred. The earlier session-status backend fix also remains staging-only. JSON/SQLite staging is still not production-equivalent MariaDB staging, restore certification or a production sign-off. See `STAGING_ACCEPTANCE_2026-10-15.md` for handover and explicit remaining gates.

## Isolated Staging Preparation - 2026-10-15

- Local rehearsal is running at `http://127.0.0.1:4300/login`, process 41156, with a visible staging banner. Docker's Linux engine is unavailable, so this uses new JSON/SQLite stores, not MariaDB. It is not production-equivalent SQL staging or a restore certification.
- Seven synthetic accounts cover platform, two tenant staff scopes, two single-community members, a multi-community member and a scoped provider. Fresh passwords/secrets are access-restricted within the ignored staging directory; live accounts, secrets, uploads and database files were not copied. Privileged accounts retain normal MFA enrolment requirements. Payments are disabled in this independent rehearsal; existing Cycle configuration is unchanged.
- **289/289 tests pass**, zero failures/skips (281 regressions and 8 isolated MariaDB integrations). Ten staging HTTP checks pass. Source-built login no longer presents the legacy demo-user picker or asks returning users for names; responsive box sizing fixes desktop/mobile overflow. The deployed live Angular bundle was not replaced.
- New session-status checks enforce server-side revocation and idle expiry without keeping sessions alive. The browser bridge handles expired credentials, stale in-flight responses and transient outages. This backend change is tested and running in staging, **not yet activated in the live API**. The frontend bridge is served from source on reload; full status polling depends on future backend activation.
- All 50 non-session live table counts/hashes match before/after staging work; only the active session table hash changed. Live API 32968, frontend 36200 and MariaDB 38260 were not restarted or reconfigured. No live business records were edited or reset.
- Privileged browser acceptance still requires separate staging MFA enrolment. Full fresh-build/deployed-client parity and all existing production gates remain open. See `STAGING_TEST_GUIDE.md` for accounts, commands, boundaries and the manual test matrix.

## API Activation And Further Checks - 2026-10-15

- The user-approved API-only restart activated the previously staged enquiry/provider permission fixes. API process changed from 20608 to 32968 and reported healthy. MariaDB (38260) and frontend proxy (36200) retained their processes; no database/frontend restart occurred.
- Before/after SQL verification: **50 of 51 table counts and hashes match exactly**. Only `duranki_auth_session` changed hash, with its row count unchanged at four. Authenticated requests update `last_seen`; the open signed-in browser continued making requests. The snapshot tool does not retain row values, so the particular changed columns cannot be proven retrospectively. No business-data table differed, and the environment plus six storage-mode file hashes all matched. No migration, live record reset, payment, credential rotation or configuration change was performed.
- Signed-in platform overview loaded successfully after a browser reload, without a new login. Live smoke remains **20/21 passed**; the existing non-loopback MariaDB listener is the sole failed check and is explicitly left to the developer. All seven storage health checks pass. Cycle Pay settings remain unchanged.
- Final suite: **278/278 passed**, zero failures/skips (270 regressions and 8 MariaDB integrations). Three additional synthetic tests verify provider document-list scope filtering, query-parameter authority spoofing rejection, immediate revocation/reparenting effects, and matching private-download permissions while preserving member-owner access. They do not create live provider grants or upload real documents.
- Backend and frontend dependency audits each report zero known vulnerabilities. Release private-file preflight passes. Redacted secret-pattern scan covers 760 working paths and 31 commits with zero matches; its documented exclusions remain. Startup stderr contains only the existing Node module-type warning.
- Earlier TESTED/NOT ACTIVATED notes below are superseded for this batch. These checks do not close the unresolved High findings or constitute production sign-off. MariaDB host isolation and Cycle Pay configuration remain developer-owned; full deployed-client parity, approved provider journeys, history remediation, production TLS/monitoring and isolated restore validation remain open.

## Frontend And Permission Follow-Up - 2026-10-15

- Latest suite: **275/275 passed**, zero failures/skips (267 regression tests and 8 MariaDB integrations). Nine added tests cover enquiry creation, provider revocation/current community scope, queued document uploads and out-of-order Heritage community responses.
- Heritage clears the previous community's tree/details while loading and ignores superseded responses/errors. This public script is served from source and is available on page reload without a process restart. Live read-only checks confirmed community selection and the existing disabled-service configuration for ZUC and Traders KZN; no service settings changed.
- Backend changes are **TESTED, NOT ACTIVATED**: marketplace/property enquiries now resolve current listing status, owner and active participants inside the save queue; provider access resolves current actor and community scope; uploaded documents recheck authorization at commit. Rejected test uploads clean up their own temporary files without removing an existing document. Tests use synthetic records and an isolated temporary upload directory.
- Existing API, frontend and MariaDB processes were left running. No new restart was performed. Backend activation requires a separately approved maintenance/release window with before/after data/configuration verification. Earlier activated protections below remain live.
- Live tenant staff form exposes scoped permission choices, not platform-role assignment. The empty form was cancelled without submission. No real staff grants, memberships, document uploads, payment requests or business-data edits were made.
- Frontend build passes in `tmp/security-permission-build`, with the existing 500 kB bundle-budget warning. The deployed Angular bundle was not replaced. Reviewed sanitizer bypasses use a fixed local terms-slug map or fixed OpenStreetMap origin with encoded parameters; this limited review is not whole-client XSS certification.
- Read-only smoke remains **20/21 passed**: all seven MariaDB-backed storage health checks, 14 anonymous denials, malformed-token/CORS denial, static headers and least-privilege database grants pass. The broad database listener remains unresolved and explicitly assigned to the developer. MariaDB network settings and Cycle Pay configuration were left unchanged.
- SEC-005/006/009 remain partial: isolated permission tests and selected admin journeys do not certify live provider provisioning, every historical scope mapping, or all deployed session/logout paths. All other open gates below still apply.

## Completed And Verified

- Ride/request privacy, active community/participant access, queued permission checks and reset/report revalidation are live.
- Proxy destination pinning, generic connection errors, timeouts and baseline browser protections are live.
- Authenticated per-user financial/write/report/search limits are live; logout/presence remain available. No Cycle configuration was changed.
- 266 tests passed, zero failed: 258 regressions and 8 MariaDB integration tests. This pass adds 14 tests; the prior ride/reset/report batch added 24.
- All 51 SQL table fingerprints matched across both API activation checks. Environment/storage-mode hashes also matched. No database restart or live record deletion/reset/payment was performed.
- Signed-in platform administration, Cycle and ZUC community reports loaded after the user completed MFA. Cycle still has its original sandbox/collection-disabled configuration.
- Backend/frontend dependency audits each report zero known advisories. Isolated frontend build passes with the existing size-budget warning; deployed bundle preserved.
- Redacted pattern scan: 757 working paths and 31 Git commits, zero matches; this does not certify ignored files, generic passwords or historical personal data.
- Release private-file preflight passes. Active GitHub actions pinned to commits resolved from official v4 tags. GitHub/Bitbucket have dependency/history scans, regression tests and build gates; remote execution not performed.
- Read-only live smoke: 20 passed, 1 failed (MariaDB network binding). No real transactions or destructive checks used.

## Assessment Numbers

Before/after numerical security scores: not assessed; no justified whole-platform score exists. ASVS matrix evidence remains 6/217 applicable controls PASS (2.8%), not a compliance certification. New tests do not automatically certify additional ASVS controls.

Original findings: Critical 1, High 8, Medium 5, Low 1. This pass additionally discovered two High findings: proxy target handling (fixed) and broad database listener (open). Current open/partial findings: Critical 0, High 6, Medium 4, Low 1. Medium includes the previously undercounted host/TLS gap. Unassessed routes and infrastructure may contain additional findings.

Previous compatible dependency remediation updated Angular framework to 20.3.34 and CLI/build to 20.3.40 and removed the unused Webpack wrapper. This pass did not change dependency versions. The older served frontend is not certified by the clean source lockfile audit.

## Unresolved High Findings

| Finding | Why it cannot be closed in this pass | Required completion evidence |
|---|---|---|
| SEC-005 provider access | Backend scope tests exist, but real provider provisioning and delegated download journeys are not verified. Creating live grants for testing would expand access. | Isolated provider/tenant accounts and owner-approved provisioning; scoped positive/negative browser tests. |
| SEC-006 full tenant/community isolation | Legacy shared catalogues and historical records lack a fully verified visibility/scope mapping. Guessing mappings could leak or hide legitimate records. Reset also spans separate storage/file operations. | Reviewed historical mapping, endpoint-by-endpoint tests and a backed-up reset/retention transaction design. |
| SEC-007 financial persistence/reconciliation | Current single-writer SQL document locking is tested, not a normalized multi-writer ledger or full production settlement certification. | Reviewed ledger/reconciliation design, failure-injection tests, separate restore environment and approved sandbox provider acceptance. |
| SEC-008 historical personal-data exposure | Removing a file from the working index does not remove remote/history copies; pattern scans do not establish access history or all personal-data exposure. | Repository-owner access review and coordinated history remediation/rotation, with preserved recovery copy. |
| SEC-009 complete session/UI parity | Backend revocation works and current sign-in succeeds, but not every standalone/deployed client path has been verified against upgraded source. | Port historical client patches, full session/logout/role-switching regression matrix, then a verified client release. |
| SEC-017 broad MariaDB listener | Server listens on 0.0.0.0/::; user is unsure about other database clients. Changing host access without an inventory could disrupt them. | Host-owner client inventory, loopback/private-host restriction and external connectivity verification. No automatic network change made. |

## Other Open Gates

- Full deployed-client XSS/script-CSP review; complete authorization/rate-limit/audit matrix; legacy credential rehash/recovery and verified enrolment for hashless accounts.
- Johann's server/domain/SSH configuration, production HTTPS/TLS, firewall rules, encrypted backups and an isolated MariaDB restore drill have not been verified here.
- Central log collection, alert recipients, retention and tamper resistance require an operator-owned destination. Winston redaction is not a monitoring service.
- Pin remaining container digests and retired action references before reuse; configure repository protections, retained SBOM artifacts, SAST and CI integration-test infrastructure. No remote pipeline was executed.
- Cycle developer must rotate previously screenshot-exposed paywall/notification/API credentials, configure callbacks and recurring billing, and complete sandbox acceptance before live collection. Never paste credentials into reports or chat. Existing encryption keys must be preserved during any controlled rotation.

## Files And Checks

This pass: `backend/src/app.js`, `api-abuse-protection.js`, `backend/scripts/security-smoke.js`, `backend/package.json`, `scripts/local-demo-server.mjs`, `local-proxy-security.mjs`, two new security test files, `.github/workflows/release.yml`, `bitbucket-pipelines.yml` and the security documents. Prior pending fixes: ride-security/platform-api/user-reset/community-reports, their tests and the ride TypeScript model. No commit was made in the extensively modified shared worktree.

Run from backend: `npm test`, `npm run test:integration`, `node scripts/security-smoke.js`. From repository root: `node scripts/release-preflight.mjs`, `node tools/security-scan.mjs --history --check`. Build to an isolated directory; do not overwrite the deployed frontend until parity is proven.

Release checklist: resolve the open High findings above; validate host isolation/TLS and restore; configure/rotate Cycle only through the developer; verify all role/tenant journeys in staging; run hosted CI and retain artifacts; obtain production approval; deploy with a verified rollback and post-release checks. Documented gaps are not accepted risks or a claim of completion.
