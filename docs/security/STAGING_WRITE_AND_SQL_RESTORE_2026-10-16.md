# Staging Write Flows And SQL Restore Acceptance

Date: 2026-10-16. Production sign-off remains withheld.

## Scope And Preservation

- Primary rehearsal remains http://127.0.0.1:4304; `tmp/staging/latest.json` was not replaced.
- HTTP write tests used fresh synthetic fixture 4305, `run-93282b18-b73b-4a58-b310-5e941b980fa1`.
- Browser writes used disposable fork 4306, `run-b8589327-1786-48aa-a0c6-1bf0d22d833b`. Its six SQLite backups passed integrity checks before testing.
- No existing application service was stopped. Live MariaDB network settings, Cycle Pay configuration, real payments and live permissions were untouched.
- All 51 live SQL table counts and fingerprints matched before/after this pass. Primary 4304 platform data retained SHA-256 `c1183aed55d57c1ad4b863052883c0d4445f43829cf61301df1b78e336358914`.

## Verified Results

- 319 regression tests passed, plus all 8 SQL adapter integration tests against the isolated restored database: **327 tests total**.
- Fresh 4305 acceptance passed **133 HTTP checks**, including scoped staff/report access, forbidden delegation, document isolation, immediate revocation, Heritage privacy and payment fail-closed behavior. No external payment requests or credits were created.
- Provider browser login/MFA, scoped document upload and listing passed. The stored synthetic PNG hash matched its source; no real member document was used.
- Tenant staff could not change its own permissions: the server required another administrator.
- Platform-admin revocation removed report and overview access from an already signed-in tenant session.
- With explicit user approval, platform admin granted existing provider-a only Tenant A overview and Community reports. Browser login/MFA reached Tenant A overview and Community A reporting; staff-management controls were absent. Both permissions were then revoked and the same signed-in session immediately received access denials.
- The provider's original document permission remained working after the temporary tenant grant was revoked. All three browser test sessions were signed out afterward.
- Release preflight, syntax checks and diff checks passed. Redacted secret-pattern scan covered 790 paths and 31 commits with zero matches under its configured exclusions; this is not exhaustive secret certification.

Evidence is local under `tmp/staging/evidence/`: `provider-browser-upload-2026-10-16.png`, `tenant-self-permission-denied-2026-10-16.png`, `tenant-revocation-browser-2026-10-16.png`, and `provider-temporary-grant-revoked-2026-10-16.png`. The fresh fixture contains `permission-check.results.json`.

## Actual MariaDB Restore Drill

The new `backend/scripts/rehearse-online-sql-restore.js` captures an online InnoDB consistent read-only base-table snapshot, encrypts it with AES-256-GCM, and protects its key using current-user Windows DPAPI. It creates a separate MariaDB datadir on an unused test port, refuses nonempty restore destinations, verifies instance identity, restores through parameterized values, and checks schema, row counts, content hashes and table health.

Successful backup: `backend/data/backups/online-restore-049a93d8-a9fd-4fc7-abb9-a7eb7c66ed26`.

- Encrypted snapshot: 10,711,653 bytes; snapshot timestamp 2026-10-16T09:21:26.184Z.
- All **51 tables** restored and matched schema/count/content checks on dedicated port 13307.
- All 8 SQL adapter integration tests passed against that restored database. A second comparison confirmed all 51 restored tables unchanged afterward.
- Platform document checksum validated; restored records include 2,753 users and 2,757 memberships.
- The restore-test server was shut down after verification; its backup and restored files remain preserved. No application was connected to restored real data.
- Root, snapshot, key and restored files have restricted Windows ACLs. The initializer's extra ACL entries were removed; the final recursive check found zero unexpected allow entries.
- An initial failed format-v1 attempt is preserved separately at `online-restore-2837bf22-b4d4-4fd2-af76-5303b7edacdd` and is **not certified**. JSON/binary encoding and detached process handling were corrected before the successful v2 rehearsal; four regression tests cover the snapshot codec and restore guards.

Safe result metadata is in `restore-results.json`, `post-integration-check.json`, and `test-instance-closed.json`. Do not publish `runtime.private.json`, DPAPI key material, database files or recovered personal records.

## Open Limits And Next Gates

- This is base-table SQL recovery, not full disaster recovery. Uploads/files, external application keys, database users/grants, routines, events and triggers are outside this drill. DPAPI recovery is host/user-bound; independently recoverable off-host keys/backups remain necessary. Restored datadir files are ACL-restricted, not separately encrypted.
- Web rehearsal 4304 remains JSON/SQLite, not MariaDB-backed application staging. Full app acceptance with a separate synthetic MariaDB database is still required.
- Complete configured service/member journeys, payment-provider sandbox acceptance, source/deployed frontend parity, deployment rollback, TLS and monitoring gates remain open.
- Revoked accounts retain a Tenant Staff role label in the role switcher, although protected access is denied. Treat this as a remaining UI clarity issue, not evidence of retained permission.
- Two earlier browser login attempts failed generically before the same saved credentials worked. The final fresh provider login succeeded first time. Cause is not established; controlled manual/autofill retesting remains appropriate.
- Tenant-a and the temporary provider tenant grant remain revoked only in disposable 4306; fresh 4305 intentionally retains its matrix revocations. Original 4304 permissions and business records were not changed.
- MariaDB networking and all Cycle Pay settings remain developer-owned. No production readiness or real-payment certification is claimed.
