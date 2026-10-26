# Duranki / Inkolo-connect

The original application uses Angular, Node.js/Express and MariaDB. This is not
the separate, unfinished duranki-separated architecture migration.

**Existing dev server:** Johann must complete the one-time
[MariaDB server setup](docs/JOHANN_MARIADB_DEV_SETUP.md). The unchanged GitHub
deployment does not perform database initialization or install private secrets.

## Development

1. Install Node.js and Docker with Compose, and start Docker.
2. Copy `deploy/local.env.example` to a private file outside this checkout.
3. Fill every required secret and select a free local port.
4. Run `npm start -- --env-file /private/duranki-local.env` from the repository root.

Alternatively, set `DURANKI_ENV_FILE` to that private file and run `npm start`.
The root `start:backend`, `start:frontend` and `start-demo.cmd` entry points all
launch the same complete Docker stack; do not run them as separate services.
The launcher has no secret defaults or native database fallback. Docker builds
the frontend/backend, provisions isolated MariaDB, and runs migration/bootstrap
before the app starts. Local host database-service recovery is not part of setup.

MariaDB is mandatory. Do not enable demo authentication or fall back to local
files. Sign in using an authorized account and password; privileged accounts
require MFA. Bootstrap must not create demo accounts.

### First Administrator

Register a normal member through the application and verify that password login
works. Independently verify the intended administrator's identity and account ID
using your authorized operator process. Registration does not itself prove identity,
and the first signup is never automatically promoted.

Stop all API instances, keep MariaDB running, then from `backend` in a private
interactive terminal run `npm run provision-admin -- --api-stopped`. Supply the
existing account ID, confirm its registered telephone, provide an operator label
for the audit record, and type the requested promotion confirmation. The CLI uses
the existing private DB configuration and matching `MFA_ENCRYPTION_KEY`; never
put passwords or keys in command arguments. For Docker, use an interactive
one-off backend container with the same private environment and database network
while the regular backend service is stopped.

The CLI creates no account, changes no password or encryption key, and grants
only `Platform Admin` to the selected active registered account. It records an
audit event and revokes that user's sessions and pending MFA challenges in the
same transaction. Restart the API and sign in again; normal privileged MFA
enrolment/verification is required. Existing MFA credentials are preserved.
Rerunning for an existing Platform Admin does not modify the account.

## Deployment And Data Safety

For the self-contained local Docker stack, fill a private copy of
`deploy/local.env.example`, then run:

```sh
docker compose --env-file /private/duranki-local.env -f compose.local.yml up --build -d
```

Open http://localhost:3000/login. This builds the frontend/backend and provisions
an isolated MariaDB. No demo account is seeded. Use synthetic registration.
MFA_ENCRYPTION_KEY is required canonical base64 of exactly 32 bytes.
Existing dev-server setup requires separately approved manual migration/bootstrap
and matching imported secrets before this candidate can start.

Read [MariaDB-only deployment](docs/MARIADB_ONLY.md) for Docker health checks,
migration ordering, required secrets, existing-volume handling and verification.
Read [Imported accounts](docs/IMPORTED_DATABASE_LOGIN.md) before importing private
accounts. Preserve matching encryption keys, identity peppers, uploads and backups.

The existing GitHub Actions workflow deploys code to the dev/test server; it does
not import private records or run migrations. Production promotion requires
separate authorization. Browser API calls use same-origin `/api`.

Historical deployment and acceptance reports are not current release sign-off.
