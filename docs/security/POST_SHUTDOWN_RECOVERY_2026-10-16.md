# Post-Shutdown Recovery And Security Checks

Date: 2026-10-16. Production sign-off remains withheld.

## Service Recovery

The user authorized restoring all services and continuing staging/security checks.
MariaDB was already running. The API, frontend and saved staging HTTP listeners
were stopped before recovery; their saved directories remained present.

| Service | Port | New process | Result |
| --- | --- | --- | --- |
| Live API | 3000 | 44996 | Health 200; seven MariaDB storage adapters |
| Live frontend | 4200 | 8572 | Health 200 via API proxy |
| Prior staging | 4300 | 47584 | Health 200 |
| Prior staging | 4301 | 50816 | Health 200 |
| Prior staging | 4302 | 50720 | Health 200 |
| Prior staging | 4303 | 52560 | Health 200 |
| Current staging | 4304 | 51312 | Health 200; isolated JSON/SQLite |

Existing launch paths and configuration were used. Nothing was seeded, migrated,
reset or deleted. MariaDB network settings and Cycle configuration remain for the
developer. Hidden background processes were started; this is not installation of
an operating-system service supervisor or a diagnosis of the desktop shutdown.

Current staging: http://127.0.0.1:4304/login

Retained directory: `tmp/staging/run-0f062d73-d559-4669-919e-5e7ee7702f5b`.

## Repairs And Activation

- Community reports now normalize the URL and existing My payments link to the
  selected, server-authorized community and tenant. Alias resolution respects the
  filtered tenant. Empty authorized scopes clear invalid scope parameters and do
  not request a report. The source-served live script updates on reload; staging
  has the same fix. No payment settings or requests changed.
- Mobile member CSS no longer hides Sign out. Account controls wrap without page
  overflow. This Angular change is **source/staging only**, not in the live bundle.
- The restored frontend returned HTML for `/admin-responsive.css`. Added that
  existing source stylesheet to its previously absent deployed asset path, with
  matching SHA-256. The live response now has `text/css`. Saved a forwarding fix
  and test for the next normal proxy restart; no second restart was performed.
- Restarting the API activates saved backend changes, including current Treasury
  identity resolution and member service configuration. This does not constitute
  full authenticated live acceptance. The old live Angular bundle remains intact.

## Browser Acceptance

Existing synthetic accounts signed in through normal password and MFA forms.
No session injection, MFA reset, new credentials, grants or business writes.

| Check | Observed result |
| --- | --- |
| Tenant A staff editor | Only its existing scoped dashboard permissions; cancelled without saving |
| Tenant A requests Community B report | Report, selector, URL and payment link all use authorized Community A |
| Mobile member, 390px viewport | Sign out visible; client/content widths both 375px |
| Mobile logout then direct member URL | Returned to login |
| Provider role selection | Only Provider A / Tenant A / Community A workspace and existing authorized document |
| Provider billing/reporting tabs | Explicit Not connected states; no fabricated balances |
| Provider tenant administration | Access denied; no staff records |
| Provider community reports | No authorized reporting communities |
| Provider Platform Admin navigation | Redirected to member view |
| Provider logout then protected provider URL | Returned to login |

Temporary viewport override was reset. Provider and tenant test sessions were
signed out. The pre-existing live browser error page could not be inspected due
to browser URL policy; no workaround was attempted. HTTP health and live smoke
checks succeeded independently, but signed-in live browser acceptance is pending.

Browser evidence:
- `tmp/staging/evidence/report-scope-recovery-2026-10-16.png`
- `tmp/staging/evidence/mobile-signout-2026-10-16.png`

## Tests And Data Preservation

- Full regression/integration suite: **323 passed**, zero failed or skipped.
  Five added tests cover report navigation (3), stylesheet proxying (1) and mobile
  sign-out CSS/template availability (1).
- Existing authenticated staging workspace runner: **40 checks passed**; its
  platform business-record hash remained unchanged and runner sessions logged out.
- Live smoke: **20/21 pass**. The sole failed check is the broad MariaDB listener,
  deliberately left to the developer. No live payments or writes were tested.
- Backend production dependencies and full frontend dependency audits: zero
  known advisories. This does not certify the older deployed Angular bundle.
- Release private-file preflight passes. Redacted secret-pattern scan: 786 paths,
  31 commits, zero matches. Ignored/large files, generic passwords and historical
  binary/personal data remain outside its assurance.
- Build succeeds: initial bundle 952.49 kB, retaining the 500 kB budget warning.
  Staging main bundle: `main-Q2IBZJIQ.js`; Accounting remains a lazy chunk.
- `git diff --check` passes; the existing line-ending warning remains unrelated.
- All **51 live SQL table counts and hashes match** before startup and after
  checks. Evidence: `tmp/staging/evidence/recovery-sql-fingerprints-2026-10-16.json`.
  This verifies unchanged logical rows at those points, not a backup restore drill.

## Still Required

1. Complete safe staging write-flow browser acceptance for scoped delegation,
   revocation and document uploads in a separately disposable fixture; preserve
   the existing user's rehearsal grants and records. API tests do not replace it.
2. Exercise configured member service journeys; this synthetic fixture has empty
   service configuration and cannot certify all subscription/payment workflows.
3. Release the source-built Angular client only after parity review and an
   approved deployment/rollback plan. Mobile logout remains staged until then.
4. Production-equivalent MariaDB staging, encrypted backup/restore rehearsal,
   ledger/failure-injection checks, production hosting/TLS and monitoring remain.
5. Developer-owned MariaDB network/client inventory and Cycle credential rotation,
   configuration, callbacks, recurring billing and sandbox payment acceptance.
6. Complete the broader release register, historical privacy review and hosted CI
   gates. Provider billing/reporting integrations remain unimplemented.

No statement in this report grants production approval or marks deferred settings
as resolved. The earlier Johann summary PDF has not been regenerated in this pass.
