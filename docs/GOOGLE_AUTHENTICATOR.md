# Google Authenticator

## First sign-in

1. Sign in using your existing telephone number and password.
2. Privileged accounts are redirected to Google Authenticator setup. Normal Member / Community Member accounts are exempt. An account with any additional role must verify.
3. Choose Set up Google Authenticator. In the mobile Google Authenticator app, add an account and scan the QR code, or enter the setup key manually.
4. Enter the six-digit code. Setup becomes active only after successful verification.
5. Store the eight recovery codes privately in a password manager. Each works once. Confirm that they are saved, then continue.

On later logins, enter the current authenticator code or one unused recovery code. Never send your QR image, setup key, authenticator codes or recovery codes to support staff.

## Enforcement

- The backend looks up current roles, rather than trusting dashboard selectors. Local Treasury grants are included. Database mode checks user roles, tenant roles, community roles and service administrator assignments.
- Password authentication produces a ten-minute challenge, not an authorised API session. Old privileged sessions must sign in again. Ordinary access endpoints reject challenge tokens.
- Stored secrets are AES-256-GCM encrypted. Recovery codes are hashed. Failed attempts are limited, challenges expire, and authenticator time steps cannot be reused. Each new password login replaces an unfinished challenge.
- Treasury approval, reconciliation and staff-access changes require verification within the last ten minutes. Sign in again if this check expires.
- Older privileged accounts without usable stored password hashes cannot enrol. Password provisioning is required first; no default/demo password fallback is used for them.
- Local password support includes the previous peppered SHA-256 format for compatibility and current salted scrypt credentials. Migrating remaining legacy password hashes to a strong password KDF remains a production-hardening requirement.

## Operations

Persist and back up MariaDB MFA records together with the matching private MFA_ENCRYPTION_KEY environment secret (canonical base64 of exactly 32 bytes). No runtime keyfile is used. Losing or replacing the key makes existing authenticators unreadable. Never commit private backups or keys to Git.

MariaDB is the required MFA store. Multi-instance deployment still requires shared rate limiting and explicit acceptance; shared persistence alone does not approve scaling. See [MariaDB-only deployment](MARIADB_ONLY.md) for initialization and verification requirements.

There is deliberately no unauthenticated reset or administrator bypass. Lost-phone access uses recovery codes. If all recovery codes are lost, a separately audited identity-verification/reset process must be implemented before production rollout. Do not delete the MFA database as a reset procedure.

The restored Angular source and deployed bundle differ. `mfa-navigation.js` bridges the running bundle to `/two-factor`; server-side enforcement does not depend on that script. The source index and backend HTML fallback also load the bridge.

2FA does not replace role authorisation or a full security audit of the legacy platform. The existing dependency audit also reports advisories outside the new authenticator packages; those need a separate tested remediation.

Library documentation: https://github.com/yeojz/otplib and https://otplib.yeojz.dev/guide/v12-adapter
