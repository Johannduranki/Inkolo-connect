# Local Docker Testing

Database-free demo images are no longer supported. The original application
requires MariaDB, real password authentication and privileged-account MFA.

Use synthetic accounts and documents in a dedicated test database. Never copy
real identity documents into test images or commit private environment files.

See [MariaDB-only deployment](docs/MARIADB_ONLY.md) for the current Docker
configuration, required secrets, migration/bootstrap ordering and safeguards.
Use compose.local.yml for the self-contained local frontend/backend/MariaDB build.
Start it with `npm start -- --env-file /private/duranki-local.env`, using a filled
copy of deploy/local.env.example outside the checkout. DURANKI_ENV_FILE is the
alternative to --env-file. The old start entry points now launch this same stack.
The root Compose file separately retains the existing Apache/backend deployment.
