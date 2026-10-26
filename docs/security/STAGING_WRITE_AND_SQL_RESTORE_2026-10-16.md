# Staging Write Flows And SQL Restore Acceptance

## Retired Evidence

This report describes a superseded local-storage implementation and is retained
only as a retirement notice. Its old test counts, running URLs, migration tools
and acceptance claims do not certify the MariaDB-only candidate. Removed local
migration and staging commands must not be run or reconstructed for deployment.

Use [MariaDB-only setup and verification](../MARIADB_ONLY.md) for current commands.
Re-run synthetic registration, password login, restart persistence, privileged
MFA, tenant isolation, service persistence, uploads, failure-mode tests and
Linux/Apache routing before approval. Preserve private backups and existing
records; never weaken authentication or reset data to make checks pass.

No current live-account, database cutover, payment-provider or production
acceptance is claimed by this retired report. Production sign-off requires new
recorded evidence and explicit authorization.
