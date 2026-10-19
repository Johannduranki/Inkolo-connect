# Staging And Permission Handover

Updated 15 October 2026. Local safe testing pass completed; **production approval is still withheld**.

## Latest Source Repair

Latest staging is **http://127.0.0.1:4303/login**, snapshot `run-79df3a6c-4ce5-4441-873d-a86028b94061`. The same synthetic accounts/MFA and existing test records were retained from 4302 using six integrity-checked SQLite online backups; the original service/data remain untouched. This is not a production backup/restore certification.

The provider source page now uses authenticated grants/documents instead of a fixed provider and fake financial/network statistics. Unconnected billing/reporting show explicit statuses. Member-document reloads clear stale private data and use authenticated, local-only document downloads.

**308/308 regression/integration tests and 40 authenticated HTTP checks passed.** All 51 live SQL table counts/hashes still match. No services were stopped; MariaDB networking, Cycle configuration and the live bundle/backend remain unchanged. Privileged browser acceptance and provider-screen visual checks remain **pending staging sign-in**, not passed. The anonymous provider route correctly redirects to login. Details and current handoff: `STAGING_TEST_GUIDE.md`.

The sections below record the preceding 4302 acceptance pass. Its provider-source blocker is partially addressed above, but production provider billing/reporting integrations and browser acceptance remain open.

## Ready For Testing

- Latest rehearsal: http://127.0.0.1:4302/login. Live application: http://localhost:4200.
- Snapshot: `tmp/staging/run-b87d876c-a9a3-4e8b-b1bb-e6b19a7f4239`.
- Synthetic passwords: `accounts.private.json` in that access-restricted snapshot. Privileged staging MFA entries/recovery codes: `mfa.private.json`. Keep both local; they are not live credentials.
- Seven test accounts, two synthetic tenants/communities, a synthetic private document and a private Heritage tree are retained. The tested tenant/provider grants were restored with explicit approval. Automated sessions are signed out.
- Do not enter real member information or cards. This is loopback-only JSON/SQLite staging, not MariaDB staging. Real payments remain unavailable.

## Results

| Check | Result |
|---|---|
| Full regression and isolated SQL suite | 299 passed, zero failed/skipped |
| Extended authenticated staging matrix | 133 HTTP checks passed |
| Approved synthetic grant restoration | 6 follow-up checks passed |
| Live data preservation | All 51 SQL table row counts and hashes match exactly |
| Live API, frontend, MariaDB | Original processes still running; no restart |
| Live read-only smoke | 20 passed, 1 failed: broad MariaDB listener |
| Frontend source build | Pass; existing bundle-size warning |
| Backend production / full frontend npm audits | Zero known advisories |
| Release private-file preflight | Pass |
| Redacted secret-pattern scan | No matches in 771 paths / 31 commits; exclusions remain |

The extended matrix used normal MFA, not preverified sessions. It checked own-scope success and foreign-scope denial, current staff/provider permissions, protected files, revocation, Heritage privacy, multi-community reads and unconfigured payment rejection. No provider payment API was called and no payment settings changed.

Browser checks covered anonymous admin/member redirects, registration-only fields and desktop/mobile login layout. They do **not** establish that all privileged browser workflows pass.

## Fixes Ready In Staging

- Removed demo member/role defaults and trust in browser-persisted role assignments from the source role service.
- Guarded routes fetch the authenticated server profile before admitting a role. Denied users cannot enter an endless member-route redirect.
- Visible role changes wait for server success; rejection reports an error and leaves permissions unchanged.
- Logout/account changes clear role/directory state. Stale directory or role-update responses cannot populate another identity's screen.
- Removed administrative routing based on a legacy account number or a person's name.

These changes are in the refreshed staging source build only. The deployed Angular bundle was intentionally not replaced. The earlier session-status backend fix is also still staging-only. A live release requires approval and client-parity checks; no silent activation was performed.

## Remaining Gates

1. Manual privileged browser acceptance and historical-client parity. The source provider dashboard still hardcodes `sp-001` and contains demo presentation data, while its document API enforces real grants. It must be connected to authenticated provider scopes before production UI acceptance. Other older screens also need comparison against the deployed patches.
2. Complete tenant/provider endpoint coverage, historical scope mapping, credential recovery/legacy rehash and frontend XSS/CSP review. The current evidence does not close all High findings.
3. Provision separate MariaDB staging; verify an encrypted backup restore, failure recovery, ledger/reconciliation/multi-writer behaviour and deployment rollback. The local rehearsal is not a substitute.
4. Developer: inventory MariaDB clients and resolve broad network binding without disrupting legitimate consumers. **No network setting was changed.**
5. Developer: securely rotate/configure Cycle Pay credentials, recurring billing and callbacks; complete isolated provider sandbox acceptance. **Existing Cycle configuration was not changed.**
6. Production server HTTPS/TLS/firewall, centralized logging/alerts, repository-history review, repository protections and hosted CI/release evidence remain operator/developer tasks.

Full guide and manual checklist: `STAGING_TEST_GUIDE.md`. Detailed evidence: `SECURITY_TEST_RESULTS.md`. Finding register and activation boundaries: `SECURITY_RELEASE_STATUS.md`. Automated pass counts are not a whole-platform security score or production certificate.
