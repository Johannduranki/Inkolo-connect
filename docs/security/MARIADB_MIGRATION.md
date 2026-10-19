# MariaDB migration status

2026-10-15. Status: AUTHENTICATION, TREASURY, PLATFORM, WALLET, TRAINING, CYCLE PAY AND HERITAGE LIVE ON MARIADB.

Sessions, encrypted MFA credentials/challenges/audit, Treasury, Training, Cycle Pay and Heritage use native MariaDB adapters. Platform and wallet use a transactional MariaDB document adapter, not normalized user/wallet tables. The requested server stores now use SQL; this does not establish normalized multi-writer storage, production readiness or migration of browser-only configuration. Do not enable the incompatible legacy SQL business-route mode.

## Latest cutovers

- Cycle Pay and Heritage: operator-approved maintenance used local backup connection-repair-2026-10-15T12-32-39.495Z (32 files, six SQLite integrity checks) and hash-verified cold MariaDB backup mariadb-cold-20261015T123252107. Windows-approved -PrepareServiceSchemas added schemas 022/023, preserved the application credentials and restored MariaDB. No database was dropped or reset.
- Full row fingerprints of all 26 pre-existing application SQL tables were unchanged across schema preparation, isolated integration tests and migration. Cycle's eight source tables contained zero records; Heritage's 15 tables contained one catalogue record and no family data. Exact source/destination comparisons passed before and after commit; original SQLite sources were unchanged. Empty stores were not filled with invented records.
- Native Cycle transactions serialize payment checks, request/consent creation, callback events, subscription updates and fulfilment. Persisted period/key uniqueness and a shared SQL row lock prevent duplicate concurrent work. Wallet credit has its own durable SQL-document replay key, covering a failed Cycle commit after a successful wallet commit. This is an idempotent two-store operation, not a distributed atomic transaction. Unknown renewal results are held for review, not retried as a new charge.
- Heritage changes use a shared SQL transaction lock covering privacy/ownership checks, claim consumption, duplicate detection, ancestry validation and audit. Private profiles and documents remain protected; family relationships and leadership succession remain separate tables. Binary documents are compared byte-for-byte by migration verification.
- data/cycle-storage-mode.json and data/heritage-storage-mode.json select MariaDB and refuse an explicit stale-file fallback. Do not remove markers or rerun a historical migration after SQL accepts new records. Reconcile all post-cutover writes for any reverse migration.
- Both API/proxy health endpoints report all seven storage categories as mariadb. Authenticated Cycle and Heritage pages were verified. Existing settings were preserved: Cycle collection awaits developer/provider configuration, and Heritage is not enabled in the selected community. No live charge, enrolment, family record or permission was created by verification.
- Latest checks: 196 backend regressions plus 8 native SQL integration tests, 204 total, passed. Synthetic fixtures were cleaned up by their exact test IDs. These tests include concurrent callbacks/claims, wallet replay after a partial cross-store commit, privacy, ancestry cycles, audit rollback and private document downloads.

- Platform/wallet cutover used connection-repair-2026-10-15T11-22-54.465Z and verified cold backup mariadb-cold-20261015T112310971. Schema 020 stores the complete platform document in transactionally updated chunks with a SHA-256 checksum and revision guard. Every field was compared before and after commit; the source remained unchanged. Counts at cutover: 2,753 users, 2,753 profiles, 2,757 memberships, 1 wallet, 10 subscriptions and 2 direct messages.
- data/platform-storage-mode.json selects MariaDB. Original platform-store.json is now stale recovery evidence, NOT an active replica. Local-file backups alone no longer protect current users, memberships or wallet changes; back up MariaDB as well. Never remove the cutover marker or overwrite SQL from the old JSON snapshot.
- The adapter holds a dedicated MariaDB named lock and permits one platform writer. Mutations run sequentially, await commit and only then publish the cached state. Failed writes do not update the cache. An uncertain commit outcome, revision conflict or lost connection fails closed. Multiple API replicas are intentionally unsupported until normalized/multi-writer repositories are verified.
- Wallet transfers persist the request key, both balance updates and both ledger records in the same SQL document transaction. Replays return the original reference; reuse with different details is rejected. The deployed XHR bridge preserves a retry key after an uncertain response. This is not evidence of a complete external settlement or production ledger audit.
- User sign-in and platform dashboard were verified after cutover. The Training dashboard still displays the existing five-module draft, without invented funding amounts.
- Schema 021 and mysql-training-store.js are LIVE. Training migration used connection-repair-2026-10-15T12-05-58.330Z; all fields compared before and after commit: 1 programme, 0 attempts, 0 entitlements, 1 audit event. Source SQLite was unchanged. Unknown source fields/tables, orphan progress, conflicting destinations and changed snapshots cause migration refusal rather than silent loss.
- The operator approved the brief maintenance window. Windows-approved -PrepareTrainingSchema took SHA-256-verified cold backup mariadb-cold-20261015T120616716, preserved credentials and restored MariaDB. The API restarted successfully; both ports 3000 and 4200 report trainingStorage=mariadb. This was a brief maintenance interruption, not a zero-downtime migration.
- data/training-storage-mode.json selects native SQL. Do not remove it or fall back to stale SQLite after SQL accepts progress. Reverse migration must reconcile current programme, attempt, entitlement and audit records first. The native test covers sequential 100% completion, concurrent duplicate attempts, immutable published funding, revision conflicts, private answers and audit-failure rollback. It creates only isolated synthetic records and cleans them up.
- Asynchronous Training calls, renewal cancellation/access rechecks and community messaging scope enforcement are now deployed. Authenticated browser reload of /dashboard/trader-training succeeded after restart: the existing five-module draft remains, funding amounts are unset, and no grant eligibility/payment was invented.
- At the earlier Training cutover, 190 backend regressions and 6 MariaDB integration tests passed. The later Cycle/Heritage cutover and current test totals are listed above.

## Live native adapters

- Schema 018 and mysql-auth-store.js store sessions and MFA in InnoDB. Session issuance awaits persistence. Credential verification locks a per-user row; OTP steps and recovery codes are single-use under concurrent verification. Failed attempts are committed before rejection. Existing encrypted secrets and the original mfa.key were preserved exactly.
- Authentication migration used connection-repair-2026-10-15T10-05-10.062Z, verified every column before commit: 1 credential, 1 challenge, 24 audit events, 0 old active-session records. The member subsequently signed in successfully; live SQL has 1 active session and 1 enrolled credential. These counts are point-in-time evidence, not operational targets.
- Schema 019 and mysql-treasury-store.js cover scopes, stakeholders, receipts, payment allocation/approval/settlement, staff and audit. All writes await commit; audit and business records share transactions. Payment state changes lock the payment; unique receipt allocation and references prevent duplicate recording. The existing Treasury store was empty and remains empty. No real payment was executed.
- Treasury migration used connection-repair-2026-10-15T10-18-12.095Z; all seven application tables compared exactly. No data was deleted from original stores. SQL integration fixtures used unique synthetic IDs and were removed after the test.
- Treasury cutover cold backup: mariadb-cold-20261015T101825907, SHA-256 verified with restricted Windows ACLs. A later platform cutover backup is listed above. Neither is a completed full MariaDB restore drill.
- Runtime markers data/auth-storage-mode.json and data/treasury-storage-mode.json select the adapters. Startup verifies migration markers and the MFA key hash before listening. Explicit fallback to the old SQLite stores is refused after migration. NEVER delete these markers or restore old SQLite files as a shortcut: revoked sessions, OTP counters and financial state could regress. Reverse migration must reconcile all post-cutover writes first.
- API and proxy health report authenticationStorage=mariadb, treasuryStorage=mariadb, platformStorage=mariadb and walletStorage=mariadb. The storage=persistent-demo label is retained from the supported business-route mode, not a statement that platform data is still JSON or sample data. FORCE_DEMO_MODE remains true to keep these routes working.
- Authenticated browser verification: platform dashboard reload and Treasury dashboard succeeded after restart without re-enrolment. The unchanged platform file hash confirms 2,753 users, 2,757 memberships and 1 wallet retained. This is not verification of every service journey.
- Authentication storage failures return generic 503 rather than misclassifying valid tokens as expired; requests remain unauthorized during the failure. Invalid tokens still return 401 before querying storage.

## Verified copy

- Source: backend/data/backups/connection-repair-2026-10-15T09-47-40.855Z, captured with the API stopped and then restarted.
- Cold MariaDB backup: backend/data/backups/mariadb-cold-20261015T094717657, SHA-256 verified while MariaDB was stopped.
- Database: duranki_login, additive duranki_migration_* tables only. Existing unrelated databases were not changed.
- Run ID: 193b69a9ef7bce48a93eff5c7186b11ac467b20370c82b714f281527ff80677c.
- 8,302 platform values/records and 26 data/upload files copied transactionally. All unknown JSON fields, array order and empty-collection metadata retained. No filtering of inactive users or deduplication was performed.
- 2,753 users and 2,757 memberships preserved. Membership user references validated before copying.
- Each stored file reassembled from SQL chunks and SHA-256 compared; each JSON record compared with its original serialized value. Verification runs before commit and again after commit.
- Repeating the same migration verified the existing run without duplicating records.
- Environment credentials and encryption keys intentionally remain in protected host backups, not SQL archive tables. They are still required for recovery.

## Restore drill

The SQL copy was restored into a NEW isolated folder, backend/data/backups/sql-restore-1792057858079. Live files were never overwritten. SQLite WAL files were preserved with their databases, then all restored stores passed integrity checks and matched the backup's table names and row counts:

| Store | Tables | Rows |
|---|---:|---:|
| Cycle | 8 | 0 |
| Heritage | 15 | 1 |
| MFA | 3 | 25 |
| Sessions | 1 | 0 |
| Trader training | 4 | 2 |
| Treasury | 8 | 0 |

These are rows across ALL tables in each store, not member or subscription counts. This verifies recovery of this snapshot, not current browser state or a complete production failover. It is a point-in-time copy; new local writes after capture are not automatically mirrored to MariaDB.

## Live cutover blockers

Current databaseAvailable=true branches explicitly reject Cycle billing/allocations, Heritage, community enrolment, tenant staff, profile editing and other supported operations. Keep FORCE_DEMO_MODE true while the migrated repositories run behind these supported business routes. The label does not mean data is mocked or still stored in JSON/SQLite. Replacing the legacy business-route selector requires a separate parity change; do not flip it as a migration shortcut.

Remaining work: normalized platform repositories and multi-writer ledger, a complete MariaDB restore drill, browser-configuration reconciliation and full service/deployment acceptance. Preserve original stores until rollback and restore acceptance. No migration may be rerun from a stale snapshot after its SQL adapter accepts new writes. The broader security programme remains incomplete; see SECURITY_AUDIT.md.

Browser-only configuration, if present, is outside these server backups and needs separate reconciliation. The current startup schema/user-ID guard is not a substitute for service parity. Migration tooling intentionally does not drop or truncate any source tables.

## Tooling

Run from backend, with existing local credentials configured, without placing credentials on the command line:

```text
node scripts/migrate-local-snapshot.js data/backups/connection-repair-2026-10-15T09-47-40.855Z --verify-only
node scripts/verify-sql-restore.js data/backups/connection-repair-2026-10-15T09-47-40.855Z
```

The first command is read-only. The second creates a new isolated local restore folder. Do not rerun the elevated recovery/bootstrap script for routine migrations: its default mode provisions a new account. The explicitly selected -PrepareAuthSchema and -PrepareTreasurySchema modes preserve credentials, cold-back up the database, add only the reviewed schema and require Windows approval/service restart. Review obsolete recovery-created account grants with the operator before production. No application DDL privileges were granted.

Integration tests are explicit: node --test integration/*.test.js. They require a configured test-capable MariaDB instance with schemas 018 through 023 and create then clean up uniquely named synthetic records. Cycle network requests are stubbed and wallet fixtures are in memory. Do not run unrelated tests against production financial records. The migration CLI is scripts/migrate-service-storage.js <cycle|heritage> <verified-backup-directory> --api-stopped; use only in a reviewed maintenance window, never against a store already accepting SQL writes.

The schema runner now excludes archived pre-migration SQL and no longer records a partially failed DDL script as successfully applied. MariaDB DDL is not universally transactional: repair a failed schema migration before rerunning; never assume rollback solely from the data-copy transaction guarantees.
