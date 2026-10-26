# Imported MariaDB Accounts

The original private export stores accounts in the platform document in
duranki_platform_document / duranki_platform_chunk. Preserve its IDs, password
hashes, roles, consent records and related state; do not seed replacements.

Before an explicitly approved cutover:
- Restore into an isolated candidate database and take a verified rollback backup.
- Supply MFA_ENCRYPTION_KEY as canonical base64 of the original 32 key bytes.
  The authentication readiness checksum must match. No keyfile is read at runtime.
- Preserve the original ID_PEPPER and any separately required private account
  configuration. Never commit secrets or copy an entire local environment to a server.
- Stop writers and run the candidate's npm run migrate then npm run bootstrap.
  Bootstrap must preserve verified existing stores and reject inconsistent state.
- Resolve mixed/nonempty account sources through a reviewed migration; never
  delete tables or generate a key to bypass validation.

See [MariaDB-only deployment](MARIADB_ONLY.md). GitHub Actions deploys code only,
not private accounts, keys or schema migrations. Manual dev-server preparation
is required before this candidate starts; production promotion remains separate.

Verify synthetic registration/consent, duplicate rejection, password login,
restart persistence, tenant isolation and privileged MFA. Health alone does not
verify an account password. Real-account testing needs explicit authorization.
