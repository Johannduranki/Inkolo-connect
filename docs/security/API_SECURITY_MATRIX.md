# API Security Matrix

Latest evidence (2026-10-15): ride/reset/report checks below are now LIVE. `createApp` wraps protected authentication with account-keyed financial/write/report/search rate limits; provider notifications retain their independent route limit. Logout and presence are exempt from the new budgets. Fourteen protected API paths deny anonymous reads with 401/no-store in the live proxy smoke check. This is not proof of all role/tenant combinations. Proxy origin and browser-header protections have eight dedicated tests. Total suite: 266 passed. Existing generated line numbers can drift; unresolved rows below remain unverified.

Generated 2026-10-15T09:05:52.502Z. 171 literal route declarations in active backend/src JavaScript.

This is an inventory, NOT a completed endpoint authorization certification. Router paths are relative to mounts below. Dynamic routes and reverse-proxy paths require manual review. 'Review' means unverified, never pass. Named guards are evidence pointers, not authorization conclusions.

2026-10-15 ride/reset/report evidence (TESTED, NOT LIVE): ride-security.test.js covers shared active-community scope, private response projection, exact participants, strict inputs and queued revocation/availability/business checks. service-reset-security.test.js covers trusted actor/mode, denial before storage access, queued revocation, SQL rollback and shared-file preservation. legacy-admin-security.test.js includes the admin reset route. community-reports.test.js rejects changed grant, active status, role or parent tenant after awaited financial reads. 252 combined tests pass. No real rides or resets were executed. Cross-store reset atomicity, ride operational/retention checks and full browser parity remain open; activation awaits a separately approved API restart.

2026-10-15 agreement/legacy-admin evidence: agreement document/evidence routes require active ownership or platform administration and send restrictive private-download headers. Legacy global/KZNCC account creation/removal, profile changes and church branding/logo mutations recheck current authority inside the platform queue. agreement-security.test.js and legacy-admin-security.test.js cover denials, preserved document bytes, HTML/header injection containment, revocation and successful authorized operations. Deployed after an approved API-only restart. Service-reset operations, ride privacy, wider catalogue visibility and rate-limit coverage remain review items; the rows below are not a full certification.

2026-10-15 follow-up evidence (generated line numbers below can drift): wallet transfer now has tested payload-bound request idempotency and atomic SQL document persistence. Community members/contacts/conversations have deployed shared-membership and active-account checks using community-messaging-security.js; writes recheck inside the serialized mutation and reads require both message participants. community-messaging.test.js covers cross-tenant/community denial, aliases, inactive users, stale contacts and revocation. Rate-limit and broader privacy/audit coverage remain review items; no row is upgraded to fully certified solely from these tests.

| Method / router path | Source | Named guards | Roles | Tenant | Community | Ownership | Validation | Rate limiting | Sensitive data / audit |
|---|---|---|---|---|---|---|---|---|---|
| GET / | backend/src/accounting-api.js:75 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /scope-codes | backend/src/accounting-api.js:76 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /employees | backend/src/accounting-api.js:84 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /employees/bulk | backend/src/accounting-api.js:85 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /scope-codes | backend/src/accounting-api.js:89 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /api/auth/logout | backend/src/app.js:245 | requireAuth | Review | Review | Review | Review | Review | Review | Review |
| GET /private-downloads.js | backend/src/app.js:260 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /catalogue-status.js | backend/src/app.js:261 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /join-community | backend/src/app.js:262 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /dashboard/community-reports | backend/src/app.js:266 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /dashboard/service-pricing | backend/src/app.js:268 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /dashboard/branding | backend/src/app.js:271 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /dashboard/heritage | backend/src/app.js:274 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /heritage-cytoscape.js | backend/src/app.js:276 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /dashboard/treasury | backend/src/app.js:277 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /dashboard/users | backend/src/app.js:278 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /dashboard/tenant | backend/src/app.js:279 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /dashboard/cycle | backend/src/app.js:280 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /payments/cycle | backend/src/app.js:281 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /dashboard/services/:serviceCode | backend/src/app.js:286 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /two-factor | backend/src/app.js:288 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /api/health | backend/src/app.js:319 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /api/auth/register | backend/src/app.js:335 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /api/auth/login | backend/src/app.js:503 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /api/auth/me | backend/src/app.js:571 | requireAuth | Review | Review | Review | Review | Review | Review | Review |
| GET /api/subscriptions | backend/src/app.js:602 | requireAuth | Review | Review | Review | Review | Review | Review | Review |
| POST /api/subscriptions | backend/src/app.js:635 | requireAuth | Review | Review | Review | Review | Review | Review | Review |
| DELETE /api/subscriptions | backend/src/app.js:755 | requireAuth | Review | Review | Review | Review | Review | Review | Review |
| POST /api/applications/step-up-boost | backend/src/app.js:768 | requireAuth, validateUploadedFiles | Review | Review | Review | Review | Review | Review | Review |
| GET /images/:hash | backend/src/branding.js:34 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /directory | backend/src/branding.js:39 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET / | backend/src/branding.js:54 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PUT /:kind/:id | backend/src/branding.js:59 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET / | backend/src/community-registration.js:49 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST / | backend/src/community-registration.js:57 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET / | backend/src/community-reports.js:28 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /notifications | backend/src/cycle-api.js:13 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /requests | backend/src/cycle-api.js:21 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /billing | backend/src/cycle-api.js:22 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /billing | backend/src/cycle-api.js:28 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /subscriptions/:id/cancel | backend/src/cycle-api.js:32 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PUT /availability | backend/src/cycle-api.js:36 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /admin | backend/src/cycle-api.js:50 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /requests | backend/src/cycle-api.js:57 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /requests/:id/checkout | backend/src/cycle-api.js:68 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /public/:id | backend/src/heritage-api.js:15 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /access | backend/src/heritage-api.js:32 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /enrol | backend/src/heritage-api.js:33 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /invitations/:id/accept | backend/src/heritage-api.js:34 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /invitations/:id/decline | backend/src/heritage-api.js:35 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PUT /configuration | backend/src/heritage-api.js:36 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PUT /verifiers | backend/src/heritage-api.js:37 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /tree | backend/src/heritage-api.js:46 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /trees | backend/src/heritage-api.js:47 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /duplicates | backend/src/heritage-api.js:48 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /people | backend/src/heritage-api.js:49 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PUT /people/:id | backend/src/heritage-api.js:50 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /relationships | backend/src/heritage-api.js:51 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| DELETE /relationships/:id | backend/src/heritage-api.js:52 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /path | backend/src/heritage-api.js:53 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /people/:id/invitations | backend/src/heritage-api.js:54 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /claim | backend/src/heritage-api.js:61 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /people/:id/verification | backend/src/heritage-api.js:62 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /people/:id/verification | backend/src/heritage-api.js:63 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /leadership | backend/src/heritage-api.js:64 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /succession | backend/src/heritage-api.js:65 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /people/:id/documents | backend/src/heritage-api.js:67 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /documents/:id | backend/src/heritage-api.js:72 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /status | backend/src/mfa-api.js:17 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /setup | backend/src/mfa-api.js:35 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /verify | backend/src/mfa-api.js:39 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /businesses/mine | backend/src/platform-api.js:210 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /businesses | backend/src/platform-api.js:218 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /businesses/:businessId/bulk | backend/src/platform-api.js:259 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /profile | backend/src/platform-api.js:370 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PUT /profile | backend/src/platform-api.js:377 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /roles | backend/src/platform-api.js:406 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /admin/users | backend/src/platform-api.js:411 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| GET /admin/import-directory | backend/src/platform-api.js:415 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| GET /admin/users/:userId/profile | backend/src/platform-api.js:420 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| PUT /admin/users/:userId/profile | backend/src/platform-api.js:448 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| GET /admin/analytics | backend/src/platform-api.js:456 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| GET /admin/reports/paid-members | backend/src/platform-api.js:491 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| POST /admin/users | backend/src/platform-api.js:611 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| DELETE /admin/users/:userId | backend/src/platform-api.js:620 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| DELETE /admin/users/:userId/service-data | backend/src/platform-api.js:629 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| PUT /admin/users/:userId/roles | backend/src/platform-api.js:651 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| GET /kzncc-admin/users | backend/src/platform-api.js:669 | requireKznccAdmin | Review | Review | Review | Review | Review | Review | Review |
| POST /kzncc-admin/users | backend/src/platform-api.js:679 | requireKznccAdmin | Review | Review | Review | Review | Review | Review | Review |
| DELETE /kzncc-admin/users/:userId | backend/src/platform-api.js:689 | requireKznccAdmin | Review | Review | Review | Review | Review | Review | Review |
| GET /agreements/me | backend/src/platform-api.js:703 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /admin/users/:userId/agreements | backend/src/platform-api.js:711 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| GET /member-documents/me | backend/src/platform-api.js:719 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /admin/users/:userId/documents | backend/src/platform-api.js:728 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| GET /service-provider/documents | backend/src/platform-api.js:743 | requireServiceProvider | Review | Review | Review | Review | Review | Review | Review |
| POST /service-provider/documents | backend/src/platform-api.js:759 | requireServiceProvider, validateUploadedFiles | Review | Review | Review | Review | Review | Review | Review |
| GET /admin/churches | backend/src/platform-api.js:816 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| GET /admin/provider-grants | backend/src/platform-api.js:819 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| POST /admin/provider-grants | backend/src/platform-api.js:820 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| PUT /admin/churches/:churchId/branding | backend/src/platform-api.js:828 | requireAdminUser | Review | Review | Review | Review | Review | Review | Review |
| POST /admin/churches/:churchId/logo | backend/src/platform-api.js:866 | requireAdminUser, validateUploadedFiles | Review | Review | Review | Review | Review | Review | Review |
| GET /agreements/:agreementId/document | backend/src/platform-api.js:900 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /agreements/:agreementId/evidence | backend/src/platform-api.js:923 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /churches | backend/src/platform-api.js:950 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /churches/:churchId/branches | backend/src/platform-api.js:954 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /community/me/all | backend/src/platform-api.js:963 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /community/me | backend/src/platform-api.js:964 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PUT /community/me | backend/src/platform-api.js:978 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /community/members | backend/src/platform-api.js:1025 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /community/contacts | backend/src/platform-api.js:1050 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /community/contacts | backend/src/platform-api.js:1060 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /community/conversations/:otherUserId | backend/src/platform-api.js:1084 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /community/conversations/:otherUserId | backend/src/platform-api.js:1093 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /wallet | backend/src/platform-api.js:1117 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /wallet/top-up | backend/src/platform-api.js:1132 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /wallet/transfer | backend/src/platform-api.js:1136 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /wallet/cash-out | backend/src/platform-api.js:1195 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /referrals | backend/src/platform-api.js:1250 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /referrals | backend/src/platform-api.js:1263 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PATCH /referrals/:id | backend/src/platform-api.js:1290 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /marketplace/listings | backend/src/platform-api.js:1296 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /marketplace/listings | backend/src/platform-api.js:1300 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PATCH /marketplace/listings/:id | backend/src/platform-api.js:1337 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /marketplace/listings/:id/conversations | backend/src/platform-api.js:1350 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /marketplace/conversations | backend/src/platform-api.js:1385 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /marketplace/conversations/:id | backend/src/platform-api.js:1411 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /marketplace/conversations/:id/messages | backend/src/platform-api.js:1422 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /marketplace/conversations/:id/messages | backend/src/platform-api.js:1436 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /rides/available | backend/src/platform-api.js:1475 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /rides/offers/mine | backend/src/platform-api.js:1483 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /rides/offers | backend/src/platform-api.js:1490 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PATCH /rides/offers/mine | backend/src/platform-api.js:1555 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /rides/requests | backend/src/platform-api.js:1570 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /rides/requests | backend/src/platform-api.js:1583 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PATCH /rides/requests/:requestId | backend/src/platform-api.js:1625 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /properties/listings | backend/src/platform-api.js:1657 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /properties/listings | backend/src/platform-api.js:1661 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PATCH /properties/listings/:id | backend/src/platform-api.js:1731 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /properties/listings/:id/conversations | backend/src/platform-api.js:1756 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /properties/conversations | backend/src/platform-api.js:1795 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /properties/conversations/:id/messages | backend/src/platform-api.js:1828 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /properties/conversations/:id/messages | backend/src/platform-api.js:1852 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /jobs | backend/src/platform-api.js:1891 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /jobs | backend/src/platform-api.js:1895 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PATCH /jobs/:id | backend/src/platform-api.js:1928 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /heartbeat | backend/src/presence.js:29 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| DELETE /session | backend/src/presence.js:33 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /summary | backend/src/presence.js:34 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST / | backend/src/registration-check.js:15 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET / | backend/src/service-pricing.js:38 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| PUT /:code | backend/src/service-pricing.js:49 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET / | backend/src/tenant-access.js:73 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST / | backend/src/tenant-access.js:74 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /:tenantId/staff | backend/src/tenant-access.js:84 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /:tenantId/communities | backend/src/tenant-access.js:85 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /:tenantId/staff | backend/src/tenant-access.js:95 | save | Review | Review | Review | Review | Review | Review | Review |
| PUT /:tenantId/staff/:assignmentId | backend/src/tenant-access.js:96 | save | Review | Review | Review | Review | Review | Review | Review |
| GET /access | backend/src/trader-training.js:50 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /admin | backend/src/trader-training.js:51 | admin | Review | Review | Review | Review | Review | Review | Review |
| POST /programmes | backend/src/trader-training.js:52 | admin | Review | Review | Review | Review | Review | Review | Review |
| PUT /programmes/:id | backend/src/trader-training.js:53 | admin | Review | Review | Review | Review | Review | Review | Review |
| POST /programmes/:id/modules/:moduleId/attempts | backend/src/trader-training.js:54 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET / | backend/src/treasury-api.js:33 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /staff | backend/src/treasury-api.js:34 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /staff/:id/revoke | backend/src/treasury-api.js:53 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /scopes | backend/src/treasury-api.js:59 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /parties | backend/src/treasury-api.js:68 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /receipts | backend/src/treasury-api.js:78 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /payments | backend/src/treasury-api.js:84 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| POST /payments/:id/:action | backend/src/treasury-api.js:85 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |
| GET /payments/:id/instruction | backend/src/treasury-api.js:94 | inline/inherited; review | Review | Review | Review | Review | Review | Review | Review |

## Mounts
- backend/src/app.js:189: app.use(/api)
- backend/src/app.js:202: app.use(/api/cycle/notifications)
- backend/src/app.js:226: app.use(/api/community-registration)
- backend/src/app.js:228: app.use(/api/trader-training)
- backend/src/app.js:229: app.use(/api/branding)
- backend/src/app.js:230: app.use(/api/service-pricing)
- backend/src/app.js:233: app.use(/api/cycle)
- backend/src/app.js:235: app.use(/api/community-reports)
- backend/src/app.js:236: app.use(/api/tenant-access)
- backend/src/app.js:237: app.use(/api/presence)
- backend/src/app.js:243: app.use(/api/heritage)
- backend/src/app.js:244: app.use(/api/auth/mfa)
- backend/src/app.js:251: app.use(/api/treasury)
- backend/src/app.js:294: app.use(/uploads)
- backend/src/app.js:326: app.use(/api/auth/registration-check)
- backend/src/app.js:828: app.use(/api/platform)
- backend/src/app.js:832: app.use(/api)
- backend/src/platform-api.js:105: router.use(/accounting)
