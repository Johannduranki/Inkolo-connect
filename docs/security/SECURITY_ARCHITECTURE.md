# Security Architecture

Assessment date: 2026-10-15. Status: staged hardening, NOT production certification.

## Runtime and trust boundaries

- Angular source, an older patched deployed Angular bundle, and standalone JavaScript pages comprise the client. Browser roles, tenant selection, local storage, amounts and service settings are untrusted inputs.
- Express in backend/src/app.js mounts authentication, platform, tenant access, branding, pricing, community registration/reports, treasury, accounting, Cycle Pay, training and heritage routers. API_SECURITY_MATRIX.md inventories literal routes and mounts; dynamic routes require further review.
- MariaDB holds native sessions, MFA, Treasury, Training, Cycle Pay and Heritage, plus transactional document storage for platform users/memberships/configuration and wallets. The document adapter enforces a single writer, serializes mutations and awaits commit before returning success; it is not a normalized multi-writer ledger. Preserved original files are recovery evidence, not active replicas. These repositories are not one distributed transaction boundary. Training locks programme rows; Cycle and Heritage use per-service SQL row locks around business validation, writes and audit.
- The local web proxy listens on loopback port 4200 and forwards APIs to port 3000. It is a development tool, not an internet-facing production proxy.
- Production deployment uses a non-root Node container, read-only root filesystem, persistent data/uploads, dropped capabilities and a loopback application port. Johann's actual Linux host, TLS endpoint and database grants were not available for inspection.

## Identity and authorization

One user may have multiple roles and memberships. Server-side roles and resource scope must authorize operations independently of the selected browser dashboard. Tenant staff grants are handled in tenant-access.js. Heritage, branding, training and pricing have scoped checks and existing negative tests. Legacy platform/provider routes still contain unresolved scope gaps (SEC-005/006).

New passwords use asynchronous Node scrypt (N=131072, r=8, p=1, random salt), with a bounded concurrent hashing workload. Imported bcrypt and legacy staff credentials remain compatible; new credentials never use legacy SHA-256. Privileged users require TOTP MFA. MFA secrets are AES-GCM encrypted; recovery codes are hashed, single-use; challenge attempts/expiry and TOTP replay checks already exist.

JWTs now use fixed HS256, issuer, audience, expiry and unique IDs. Access session registration awaits MariaDB persistence before token issuance; sessions expire after 30 minutes without qualifying activity and can be revoked. MFA verification uses per-user SQL locks to consume OTP steps/recovery codes atomically. MFA challenge tokens cannot authorize protected APIs. Storage outages fail closed with 503, not a misleading invalid-token 401. There is no refresh-token flow. Browser bearer-token storage remains an XSS risk; a cookie/BFF migration requires separate design and CSRF testing.

## Data and integrations

Sensitive documents now require authenticated ownership or platform administration. Only community logo image paths remain public. Legacy application files without recoverable ownership require administrator review. Upload signatures are checked, but signature checks are not malware scanning.

Cycle Pay uses hosted checkout, verified callbacks, idempotent fulfilment and encrypted recurring profile references. Card numbers/CVV must never enter Duranki logs or storage. Live configuration is deliberately absent pending developer configuration and credential rotation. A periodic recurring-billing worker exists; the single platform writer restriction still applies. Platform wallet credits use durable SQL document idempotency keys, while native SQL Cycle fulfilment records prevent duplicate allocation. Tests cover a wallet commit followed by a missing Cycle fulfilment commit. Deployed renewal code rechecks cancellation, membership and service availability after asynchronous programme checks and before dispatch.

Winston logs allowlisted metadata and request IDs, not arbitrary request bodies or exceptions. Production containers now log to stdout. No verified production email/SMS/WhatsApp delivery or password-recovery service was found in the reviewed runtime; do not advertise those as implemented security controls.

## Discovery limits

The repository, active module layout, deployment files, database access patterns and major security boundaries were mapped. Not every executable path, legacy snapshot or endpoint has been manually certified. The served bundle differs materially from Angular source; the updated dependency build was tested separately rather than replacing it and losing existing functionality. API and ASVS matrices explicitly retain review gaps.

References: [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/tree/v5.0.0), [OWASP Top 10](https://owasp.org/projects/top-ten), [NIST SSDF](https://csrc.nist.gov/pubs/sp/800/218/final).
