# Staging Repair And Role Acceptance

Date: 2026-10-16. Updated rehearsal: http://127.0.0.1:4304.
Root: `tmp/staging/run-0f062d73-d559-4669-919e-5e7ee7702f5b`.
Process: 8480. Original rehearsal on 4303 remains running and unchanged.
This is synthetic JSON/SQLite staging, not production-equivalent MariaDB staging.

## Repairs

- Accounting has a guarded, lazy-loaded route instead of falling through to
  login. Existing server-backed records are displayed; a hard-coded financing
  repayment was removed. Entity choices come from returned accounting scopes.
  Snapshot reloads clear stale records and show persistent load failures.
  Unconnected posting, settlement and reconciliation operations remain blocked
  by the API; this does not certify an accounting system or bank integration.
- Treasury resolves current server-side identities, not a fixed demo admin ID.
  Platform Admin uses its existing role. Staff still require the current
  Treasury version claim and an allowed finance role; inactive users, revoked
  grants and stale claims fail closed. No grants were created or expanded.
- Member wallet 404s now show an unactivated-wallet state instead of producing
  unhandled errors. Other wallet failures show an unavailable state and clear
  old transaction data. No wallet was created, funded or charged.
- The role switcher lists only server-returned joined communities. Selection
  navigates to the selected member scope and the member API validates it.
  Service visibility now uses the returned tenant/community configuration
  intersection instead of browser-local admin configuration. Missing policy
  remains empty; this does not enable any services or change Cycle settings.
- Platform, member, provider and Accounting pages have accurate document titles.
- New standalone-dashboard responsive styles contain the admin select and use
  inherited header link contrast. They are loaded by the updated backend only;
  existing live public assets were not edited.
- Provider document table now contains its visually hidden download labels so
  those labels cannot widen the mobile page.

## Actual Browser Checks

All accounts used their existing synthetic passwords and existing authenticator
setup through the normal login and MFA pages. No injected session, MFA bypass,
credential reset or new permission grant was used.

| Identity | Check | Result |
| --- | --- | --- |
| Platform | MFA landing, Treasury and Accounting navigation | Passed |
| Platform | Member role and joined Community B selection | Passed; URL and selected label agree |
| Platform | Member console after wallet handling | No errors captured in the checked loads |
| Platform | Report header at 390px viewport | 375px client/content width; no document overflow |
| Tenant A | MFA landing | Only Tenant A in selector and staff table |
| Tenant A | Community reports | Only Community A, five members |
| Tenant A | Foreign Community B report URL | No B records; page selects authorized A instead |
| Tenant A | Treasury and Accounting | Denied; Accounting returns to member view |
| Tenant B | MFA landing | Only Tenant B in selector and staff table |
| Tenant B | Tenant A staff URL | Explicit denial, no staff records |
| Tenant B | Branding | A read-only; own Community B file input enabled; no upload |
| Provider A | MFA and assigned provider role | Only provider-stage-a / Tenant A / Community A |
| Provider A | Document list | Only existing staging-only.pdf for member 91004 / funeral-cover |
| Provider A | Authenticated document download | Completed to local Downloads; no upload or record mutation |
| Provider A | Billing and reporting tabs | Explicit Not connected statuses |
| Provider A | Tenant administration, community reports, Platform Admin | No access; admin route returns to member view |
| Provider A | 390px mobile document layout after repair | 375px client/content width; table scrolling contained |

Mobile evidence: `tmp/staging/evidence/provider-mobile-2026-10-16.jpg`.
The browser connection became unavailable while saving an additional final
desktop screenshot. The last tab state after that interruption is unverified;
the tests above were completed before it. Temporary viewport override had
already been reset. Original 4303 browser/session was not signed out.

## Verification And Preservation

- **318/318 tests pass**, no failures or skips, including new Treasury identity
  tests, guarded Accounting/template checks and member-configuration HTTP tests
  for the intersection, foreign scope denial, disabled tenant and missing policy.
- Build succeeds. Initial bundle 952.35 kB retains the existing 500 kB warning;
  Accounting is a separate 88.01 kB lazy chunk. Final main: main-HEBKQMIT.js.
- All **51 live SQL table counts/fingerprints unchanged** across this work.
- Both old/new staging platform JSON hashes are unchanged:
  `c1183aed55d57c1ad4b863052883c0d4445f43829cf61301df1b78e336358914`.
- Fork verified all six SQLite stores. Final read-only comparison confirmed
  exact logical row matches in Cycle (8 tables), Heritage (15), Training (4)
  and Treasury (7), with integrity checks passing in both original and copy.
  Authentication/session stores legitimately changed due to sign-in/out.
- Live API 32968, frontend 36200 and MariaDB 38260 retained their processes;
  staging 4300-4303 also retained theirs. New loopback listener 4304 is additive.
  No services were disabled, restarted or replaced.
- MariaDB network settings, Cycle configuration, credentials, prices, grants,
  memberships, subscriptions and business records were not changed.

## Remaining Acceptance Limits

These fixes are source/staging-only, not activated in the live backend or Angular
bundle. No production sign-off: payment-provider setup and real sandbox payment
acceptance, MariaDB staging/restore rehearsal, hosting/monitoring gates and the
broader security release register remain outstanding. Provider billing/reporting
are unimplemented integrations, not failed browser controls that can safely be
made to appear functional.

This pass was read-only for business data. Staff delegation/revocation, uploads,
posting and payments were not executed in the browser. Separate existing API
tests cover some of those security boundaries; they are not equivalent to
end-to-end browser acceptance. An unauthorized community report URL currently
falls back to an authorized community without normalizing the query string:
no cross-community records were exposed, but that navigation wording/URL remains
a usability follow-up. Empty synthetic configuration cannot prove every service
journey or all financial balances.
