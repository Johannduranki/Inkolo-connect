# Imported MariaDB accounts

The original application's private database export stores accounts in the
`platform` document in `duranki_platform_document` / `duranki_platform_chunk`.
It is not a dump of the older relational `users` schema.

Backend startup now recognizes a populated, verified platform document when no
relational `users` table exists. It validates the document checksum and requires
demo identities to be disabled. Authentication, platform, wallet, treasury,
training, Cycle and heritage stores use MariaDB in this mode. The existing
platform account operations preserve IDs, password hashes, roles and related
records; registration writes back to the same MariaDB document.

## Dev-server prerequisites

- Restore the private export into a clean candidate database first. Importing on
  top of an older schema can leave both account formats present. Startup rejects
  that ambiguity instead of choosing an account set or deleting tables.
- Restore the matching private `backend/data/mfa.key` to the backend's existing
  data mount. The authentication migration checksum must match this key. Never
  generate a replacement key to bypass the check.
- Preserve the source ID pepper for legacy password hashes. If the original
  administrator's password is configured using `LOCAL_ADMIN_PASSWORD_HASH`,
  preserve that value privately as well. Do not put these values in GitHub.
- Keep server DB connection settings appropriate for its Docker network. Do not
  copy the local `.env` wholesale onto the server.
- An explicit non-MariaDB storage setting conflicts with a verified document
  import and stops startup. Review such a conflict rather than silently losing
  access to one storage source.
- Preserve existing data and a verified rollback backup throughout cutover.

The GitHub workflow is unchanged. It deploys code, not the private database,
encryption key or account configuration. It does not execute schema migrations.

## Verification

After the private import and backend deployment, `/api/health` should report
`accountStorage: "platform-document"` and MariaDB for the listed stores. This
does not alone verify an individual account's password or MFA.

Test a new synthetic account on the dev server: register with privacy consent,
sign in, restart the API, sign in again and verify saved details. Check duplicate
registration, wrong passwords, tenant permissions and privileged-account MFA.
Do not use or upload real identity documents for automated testing.

Conventional databases without a populated platform document retain the
relational login path. This change does not repair an incomplete relational
schema or transfer private records automatically.
