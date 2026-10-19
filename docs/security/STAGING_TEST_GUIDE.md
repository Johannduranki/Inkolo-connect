# Local Staging Test Guide

Updated 2026-10-16 (Africa/Johannesburg). Current results take precedence over earlier rehearsal notes.

## Open Staging

Open **http://127.0.0.1:4304/login** for the retained source-build rehearsal. Every HTML screen has a yellow **STAGING REHEARSAL** banner. The live platform remains at http://localhost:4200 and has not been replaced. Earlier rehearsals on 4300-4303 remain separate. This fork retains the original 4302 synthetic accounts and MFA setup; earlier 4300/4301 credentials differ.

This is a **local functional/security rehearsal**, not production-equivalent staging. It runs an isolated copy of application source with JSON/SQLite stores; it does not connect to live MariaDB. A separate encrypted base-table MariaDB restore drill has passed, but MariaDB-backed application staging and coordinated files/keys/off-host recovery remain required. Do not expose this HTTP rehearsal server to the network or enter real member information or card details.

Current snapshot:

`tmp/staging/run-0f062d73-d559-4669-919e-5e7ee7702f5b`

`tmp/staging/latest.json` identifies the retained primary snapshot. `running.json` inside each snapshot records its port and process; confirm process identity before maintenance rather than relying on an old PID. Primary staging binds only to 127.0.0.1:4304. New disposable write fixtures at 4305/4306 were prepared with `--keep-latest`, preserving this pointer. The browser-write fork preserved synthetic data via verified file copies and six SQLite online backups without stopping the source service.

The provider page now uses current server grants and scoped documents. Provider billing/invoicing and subscriber/network reporting explicitly remain **Not connected**, replacing demo values and simulated submissions. Member-document reload/download errors no longer leave stale records visible. Changes are not deployed live.

Latest verification: **327 tests** (319 regressions plus 8 integration tests against isolated restored SQL), **133 fresh synthetic HTTP write-flow checks**, and browser grant/upload/revocation checks passed. The earlier 40 read-only-business-data HTTP checks remain recorded for 4304. See [write and restore acceptance](STAGING_WRITE_AND_SQL_RESTORE_2026-10-16.md). Do not run `staging-permission-check.mjs` against retained 4304: it creates fixtures, revokes grants and expects fresh MFA setup. Use `node scripts/staging-workspace-check.mjs <snapshot-root>` for non-mutating business-data checks; normal login/MFA/logout still change authentication records.

Privileged platform, tenant and provider browser checks have been performed, including scoped listing/download, mobile logout, synthetic upload, self-permission denial, and immediate permission revocation. Full service/payment acceptance is not complete. Sign in on 4304 using each account's existing staging authenticator. Never use live passwords, real IDs/documents or bank cards here.

## Test Accounts

Random test passwords and synthetic telephone numbers are in `accounts.private.json` inside the snapshot. This directory has Windows permissions restricted to the current user, SYSTEM and Administrators. Credentials are not printed in this guide or copied from the live environment. Keep that file local and out of Git, release artifacts and screenshots.

| Account | Intended access |
|---|---|
| platform | Platform Admin and Member; both synthetic communities |
| tenant-a | Tenant A staff permissions; Community A membership |
| tenant-b | Tenant B staff permissions; Community B membership |
| member-a | Member of Community A only |
| member-b | Member of Community B only |
| multi-member | Member of Communities A and B, no admin permissions |
| provider-a | Provider access to funeral-cover documents in Tenant A / Community A only |

The four privileged test accounts were enrolled by the acceptance runner through the normal password, MFA setup and code-verification endpoints. There was no MFA exemption or fabricated verified token. Their test-only seeds/recovery codes are in the access-restricted `mfa.private.json` within this snapshot. For manual sign-in, add a separate staging authenticator entry using that file; never replace your live Duranki entry or paste codes into chat. All automated sessions were logged out. Synthetic numbers are not delivery destinations; no SMS/email acceptance is certified.

The original acceptance matrix revoked tenant-a/provider-a grants; after explicit approval both were restored in the retained fixture. One synthetic provider document and one private Heritage tree remain for inspection in 4304. Heritage is enabled only for synthetic communities. Separate 4305 retains its test revocations; 4306 retains a revoked tenant-a grant and the approved-then-revoked provider tenant grant, plus an additional synthetic upload. These disposable copies do not change 4304 permissions.

## Verified Automatically

- Ten staging checks pass: isolated storage health, visible banner, ordinary member rejection from admin/provider/foreign reports, single- and multi-community membership, logout revocation, revoked-session status rejection, and MFA enforcement for platform/tenant/provider accounts.
- Extended rehearsal: 133 HTTP checks pass, including normal privileged MFA, scoped staff/reports/branding, forbidden delegation, provider uploads/downloads, permission revocation, multi-community selection, Heritage privacy and payment fail-closed behaviour. Six subsequent checks verify the approved restoration of the two synthetic grants and session logout.
- Current suite: 327 tests pass, including isolated restored-SQL integration tests. Those SQL tests do not make the web rehearsal MariaDB-backed.
- Source-built login no longer exposes the legacy demo-user picker or asks returning users to resubmit names. Registration still has name and surname fields.
- Login desktop and 390px mobile checks show no horizontal overflow. The normal browser viewport was restored.
- Session-status changes reject revoked/idle sessions without extending idle time. The browser bridge ignores stale responses after a newer login, preserves a new MFA challenge, and does not log users out on transient network errors.
- Source role guards resolve the current server profile, ignore cached role assignments and avoid denied-member redirect loops. Rejected role updates do not change visible permissions; late responses cannot repopulate the directory after logout/user switching. These changes are in staging only.

## Manual Acceptance Checklist

Record account, page, expected result, actual result and a redacted screenshot for each check. Do not include passwords, recovery codes or authenticator QR images in screenshots.

1. Sign in as member-a. Verify only its memberships and allowed services are accessible. Direct navigation to administration must not reveal staff or member records.
2. Sign in as multi-member. Switch A to B and back; check that headings, service state and data all follow the selected community, including rapid switching.
3. Use the separate staging MFA entry for tenant-a. Verify Tenant A staff/report/branding controls; changing a URL to Tenant B must fail. Repeat from tenant-b in the opposite direction.
4. With tenant-a, try to grant a permission it does not hold or a global Platform Admin role. Both must be rejected. Use only staging accounts.
5. Use the separate staging MFA entry for provider-a. Review the synthetic document to test permitted downloads and deny foreign provider, service and community scope. Never upload a real ID or policy. The source provider dashboard now resolves current server grants; billing/reporting remain Not connected.
6. With platform, revoke a test tenant/provider grant, then check the previously signed-in account. Confirm protected API operations are denied and no records disappear. Record any stale UI controls separately from actual server access.
7. Test logout, browser refresh, back navigation, idle expiry and multiple tabs. A signed-out/revoked account must not retrieve fresh protected data.
8. Enable/configure services only in staging as needed, then test membership and Heritage scope switching. No live availability or pricing is copied. Empty/unconfigured screens are expected initially.
9. Keep real payment collection disabled. Record the expected not-configured response for paid services/top-ups; do not add provider credentials. Real Cycle sandbox acceptance belongs to the developer's later isolated integration environment.

Use this checklist for repeatable acceptance, not as a claim that every service journey is certified. Completed browser checks are recorded in the dated reports. Fresh source-build parity with all historical live UI patches and full configured service flows remain incomplete; do not promote this frontend to production yet.

## Reproduce And Maintain

From the repository root:

```powershell
npm --prefix frontend run build -- --output-path ../tmp/staging-build
node scripts/prepare-staging.mjs
$stage = (Get-Content tmp/staging/latest.json | ConvertFrom-Json).root
node (Join-Path $stage 'scripts/staging-server.mjs') 4300
```

Use an unused port between 4300 and 4399; never stop another listener to free a port. The launcher rejects live ports, strips inherited database/payment/Node-preload configuration, uses fresh secrets, and refuses linked data/source directories. Only installed dependency code is shared. No live environment files, uploads, database files, migration markers, sessions or encryption keys are copied.

In another terminal, run:

```powershell
$stage = (Get-Content tmp/staging/latest.json | ConvertFrom-Json).root
node (Join-Path $stage 'scripts/staging-check.mjs')
```

Normal login limits remain enabled. Repeated smoke runs can hit those limits; wait for the 15-minute window rather than weakening them.

`scripts/staging-permission-check.mjs` is copied into fresh snapshots for extended acceptance. It changes synthetic fixtures, including revoking grants, and stores private staging MFA credentials locally. It refuses a second run in the same snapshot. Do not run it where someone has added important testing records. Use `node scripts/prepare-staging.mjs --keep-latest` for a new disposable fixture without replacing the primary pointer. Grant restoration is separate and requires explicit approval.

For frontend-only source changes, rebuild to `tmp/staging-build`, then run `node scripts/refresh-staging-frontend.mjs`. This updates the latest staging frontend and its manifest without replacing accounts or storage. Backend changes require preparing a new snapshot; do not copy live data into it. Stop only a verified staging process, preserving its data directory for later inspection. Do not use generic commands that kill all Node processes.

## Live Activation Status And Developer Gates

The post-shutdown recovery activated saved backend fixes on the live API. This write/restore pass did not restart live services or replace the live Angular bundle. Source-build frontend changes remain in staging. See the current section of `SECURITY_RELEASE_STATUS.md` for activation details.

MariaDB network settings and all existing Cycle Pay configuration remain untouched. The 51-table encrypted SQL restore passed; full uploads/keys/off-host recovery did not form part of that drill. Developer gates still include MariaDB-backed application staging, production HTTPS/network policy, provider configuration and sandbox approval, repository history review, CI/rollback verification, monitoring and complete service acceptance. No production sign-off is implied.
