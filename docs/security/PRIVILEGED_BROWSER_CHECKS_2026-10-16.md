# Privileged Staging Browser Checks

Date: 2026-10-16. Scope: existing synthetic Platform Admin session at
http://127.0.0.1:4303. This is JSON/SQLite rehearsal, not production-equivalent
MariaDB staging or production sign-off.

## Browser-confirmed results

- The normal MFA sign-in now reaches the guarded platform landing. The server
  directory contains two synthetic tenants and two synthetic communities.
- Tenant A/B switching updates the URL, staff and community rows without stale
  records. Staff permission editing exposes scoped permissions; the form was
  cancelled without saving.
- Community report switching A -> B -> A displays five, four and five members.
  MemberBeta does not remain in A. Missing payment and service records are
  distinguished from unpaid balances, and sandbox receipts are excluded.
- User directory lists seven synthetic users. Community B filtering displays
  four. MemberBeta's profile editor was inspected and cancelled without saving.
- Branding lists exactly the two tenants and two communities; selecting
  Community B updates the entity label. No upload or save was attempted.
- Service pricing loads with explicit unconfigured/provider-required/not-yet-
  implemented statuses. No prices, splits or configuration were changed.
- Cycle Pay displays sandbox mode, collection disabled, missing configuration
  and zero requests. No payment request, provider call or setting change occurred.
- Training loads the platform configuration surface, with no eligible Trader
  Connect community or published programme in this fixture. No draft or grant
  was created. Empty-fixture checks do not certify the training/payment journey.
- Heritage A/B selection displays no accessible trees to this account; the
  other member's private tree is not listed. No tree, person or relationship
  was created. More complex Heritage journeys remain untested in the browser.
- Platform Admin -> Member -> Platform Admin navigation works without sign-out.
  This is a view switch, not a lower-privilege authorization test.
- Platform landing screenshot checked at normal width and 390px viewport;
  its mobile document width matches its client width. Temporary viewport
  override was reset.

## Regressions corrected in staging

1. Member view's native role select incorrectly displayed Platform Admin even
   when the active role label was Member. It now uses Angular's select control
   accessor so asynchronous options retain the actual active selection. Browser
   reload and both navigation directions verified. No roles or grants changed.
2. An empty service catalogue claimed all services were active. It now states
   that no additional services are available and distinguishes an empty active
   list from existing subscriptions. Browser-confirmed with zero subscriptions.

Source build passes (940.82 kB initial bundle; existing 500 kB budget warning).
312/312 regression/integration tests pass, zero failures/skips. Two new template
regression checks supplement actual browser verification; they are not a full
Angular browser test suite. Staging bundle: main-DTVUCD2Y.js. Only the existing
staging frontend was refreshed; no live Angular bundle activation or restart.

Screenshot: `tmp/staging/evidence/member-role-2026-10-16.jpg` (synthetic identity,
no credentials). The existing test accounts and MFA setup are preserved.

## Open findings and limits

- Accounting's advertised `/dashboard/accounting` destination falls through to
  login in the source-built rehearsal. Direct return to platform works with the
  same session: this is a missing route, not an expired login. Do not restore a
  legacy fake-data finance page merely to make the link succeed.
- Treasury denies this synthetic platform identity. In the local non-SQL path,
  `app.js` resolves Treasury through demo identities and Treasury-specific claims,
  not this synthetic platform account. Its financial workflows are NOT accepted
  by this pass. No grant, claims or authentication bypass was added.
- Shared Admin workspace select overflows the mobile community-report header:
  375px client width, 400px content width; select right edge 400px. The header
  also has inconsistent link contrast. Public shared assets are used by the live
  service; no live CSS change was made during this staging-only pass.
- Member page emits two minified console errors on load, including after the
  two display fixes. Their causes still need source-map/request-level diagnosis.
  A loaded page is not evidence that every request succeeded.
- Angular pages retain the login document title. Member community choices are
  not exposed in the source role selector; multi-community member navigation
  and full catalogue parity need further acceptance beyond admin report filters.
- Actual tenant/provider browser sessions are still outstanding. Existing
  authenticated HTTP tests cover these roles, but platform-admin inspection
  does not establish lower-privilege browser isolation. Provider billing and
  reporting remain explicitly not connected.
- No forms were saved, permissions changed, files uploaded, users enrolled,
  payments submitted or services activated/terminated. Those write workflows
  require separately scoped synthetic acceptance.

## Preservation checks

- All 51 live SQL table counts and SHA-256 fingerprints match before/after.
- Staging platform-store.json SHA-256 unchanged:
  `c1183aed55d57c1ad4b863052883c0d4445f43829cf61301df1b78e336358914`.
- Live API process 32968, frontend 36200, MariaDB 38260, and rehearsal processes
  41156/46648/43064/48096 remained listening on their original ports. No restart
  or service stop occurred. Staging authentication/session activity is expected;
  no claim is made that session files are byte-identical.
- MariaDB networking and all Cycle Pay configuration remain developer-owned
  and untouched. Existing release gates remain open.
