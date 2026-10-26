# Security Operations

> Historical implementation/results below are not current acceptance. Local-store
> setup and migration instructions are retired. Follow [MariaDB-only setup](../MARIADB_ONLY.md).
> Preserve all existing security, privacy, authorization and payment-approval gates.
> Back up MariaDB, private uploads and matching MFA_ENCRYPTION_KEY before changes.


## Current Handover - 2026-10-17

Use [Production sign-off](PRODUCTION_SIGNOFF.md) for remaining gates and owners.
The latest recorded acceptance is 327 tests, 133 synthetic HTTP checks and a
verified isolated 51-table SQL restore on 2026-10-16; no tests were repeated for
this documentation update. Earlier counts and recovery commands below are
historical context, not instructions to reprovision migrated data. Full
files/keys/off-host recovery remains open. MariaDB networking and Cycle Pay
configuration must be handled by the developer, not changed automatically.

## Current Host Warning - 2026-10-15

Read-only smoke checks confirmed a non-root single-schema DML account, but MariaDB listens on all IPv4/IPv6 interfaces (port 3306), and the local application connection is not TLS-encrypted. The user does not know whether other network clients depend on the database. Before changing bind-address or firewall rules, the host owner must inventory those clients; then restrict to loopback or explicitly approved private hosts and verify connections. Listening beyond loopback is not proof of internet reachability. Do not change credentials, stop MariaDB or block unknown clients as an improvised fix. Repeat `node scripts/security-smoke.js` from backend; it deliberately exits nonzero while this isolation check fails.

The earlier local runtime pass activated ride/reset/report and proxy/abuse fixes with preservation checks. Its test count was 266; use the current handover above for newer evidence. Cycle Pay configuration remains developer-owned. Local process restarts do not constitute a production release or approve the older patched frontend bundle for public deployment.

## Deployment gate

- Resolve or obtain explicitly reviewed risk decisions for every open/partial High finding in SECURITY_AUDIT.md. This document is not risk acceptance.
- Local MariaDB credentials were recovered on 2026-10-15 using a dedicated loopback-only account with SELECT/INSERT/UPDATE/DELETE on duranki_login only. Sessions/MFA/Treasury/Training/Cycle/Heritage are native SQL, and platform/wallet use SQL document storage (see MARIADB_MIGRATION.md). FORCE_DEMO_MODE remains true solely to preserve the supported business-route implementation, not as an authentication fallback. Do not enable legacy SQL routes or horizontal scaling. Verify host TLS/network rules before production.
- Apply additive migration 016 in staging after a restore-tested backup. Test registration, existing imported login, MFA, logout, tenant switching and private documents.
- Configure HTTPS reverse proxy, HSTS after HTTPS validation, explicit origins, upload/body limits and request timeouts. Do not expose development port 4200 or the database publicly.
- Require strong independently generated JWT/pepper secrets. Keep environment files outside source control with restricted host ACLs. Preserve MFA/billing encryption keys during authorized rotations until data is safely re-encrypted.
- Keep all persistent stores on protected volumes. The SQL platform-document adapter remains single-writer. Do not horizontally scale wallet writers without the reviewed normalized database design. Local backup creation now enforces owner-only POSIX permissions or Windows ACLs limited to the current account, SYSTEM and administrators before copying files.
- Resolve source/deployed-bundle divergence before replacing the live client. Audit the actual released dependency artifact, not just a new lockfile.
- Run Bitbucket verification, dependency audit, secret scan, security tests and build; produce CycloneDX SBOMs. Deployment remains manually approved. GitHub and other deployment paths need equivalent gates.
- Review immutable CI action/image references, protected branches, deployment approvals, limited SSH keys and host-key pinning with the repository/server owner.

## Local recovery evidence

## Monitoring

Collect Winston JSON from container stdout into restricted centralized storage. Alert on authentication failures, MFA errors, authorization denials, webhook signature failures, reconciliation exceptions, role changes and excessive errors. Never enable body/token/password/card logging for diagnosis. Request IDs support correlation without exposing credentials.

Define log retention, tamper resistance, on-call ownership, backup retention and restore drills with the operator. They are not configured merely by application logging. Account-aware throttles are process-local; use a shared store before scaling replicas.

## Verification after release

Check health through the public TLS proxy, anonymous API denial, MFA and logout, session expiration, two tenants with distinct users, two communities, and owner/non-owner document requests. Confirm expected user/membership counts without exporting identities. Exercise payment flows only in Cycle sandbox until reconciliation and security review are signed off. Keep a compatible database/application rollback plan; never roll back to passwordless authentication.
