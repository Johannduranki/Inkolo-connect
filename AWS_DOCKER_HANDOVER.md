# Duranki Container Handover

The supported persistence engine is MariaDB. Provision a private MariaDB service
and restricted application account; do not substitute database-free demo mode.
This document does not authorize AWS provisioning or production deployment.

The existing dev/test workflow uses the root `Dockerfile`, a separate Apache
frontend, and backend port 3001 mapped to host 4001. Do not change that workflow
or its static-route packaging during an ordinary code release.

The optional `Dockerfile.release` builds a combined frontend/backend image on
port 3000. `deploy/compose.yml` is an operator-controlled template, not a
replacement for the existing workflow.

Read [MariaDB-only deployment](docs/MARIADB_ONLY.md) before configuring secrets,
running migrations/bootstrap or restoring imported accounts. Use private secret
management, exact HTTPS origins in production, tested backups and the matching
MFA encryption key. Keep one application writer until scaling is explicitly
verified. No account passwords or private data should be included in a handover.
