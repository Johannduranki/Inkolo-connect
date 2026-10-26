# MariaDB-only original application

This contract covers Inkolo-connect, not the unfinished duranki-separated
migration. MariaDB is mandatory for every application store. Database failure
must stop startup; no file-backed authentication or persistence fallback exists.

## Secrets And Existing Accounts

Configure private DB credentials, ID_PEPPER, JWT_SECRET and MFA_ENCRYPTION_KEY.
MFA_ENCRYPTION_KEY must be the canonical base64 encoding of exactly 32 bytes.
Imported accounts require the SAME key bytes as before, supplied via environment,
not a keyfile. Never generate a new key to bypass a mismatch. Readiness metadata
is in MariaDB. Uploads remain private files and need persistent storage.

For a fresh synthetic database only, generate a key privately with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Do not paste secrets into chat or Git. Previously committed DB/JWT credentials
are compromised. Removing them does not erase history or rotate deployed values.
Arrange approved credential rotation and JWT invalidation privately. Preserve
identity peppers and MFA keys unless a compatible migration is approved.

## Run Locally

Copy deploy/local.env.example to a private file outside Git and fill all blanks.
Use a dedicated synthetic database and a free LOCAL_PORT (default 3000).

The preferred root launcher is `npm start -- --env-file /private/duranki-local.env`.
It validates configuration and builds before stopping its own app writer, then
starts migration/bootstrap and the API in order. A failed build leaves the old
API running; failed initialization keeps the new API stopped.
Alternatively set `DURANKI_ENV_FILE` and run `npm start`. The private file must
exist outside the checkout. Root `start:backend`, `start:frontend` and
`start-demo.cmd` are aliases for the complete Compose stack, not separate native
servers. No fallback or Windows database-service recovery is performed.
The equivalent direct Compose invocation is:

```sh
docker compose --env-file /private/duranki-local.env -f compose.local.yml up --build -d
docker compose --env-file /private/duranki-local.env -f compose.local.yml ps
```

Open http://localhost:3000/login (or the chosen port). The local stack builds
Angular and Express in Dockerfile.release, serves both on one origin, provisions
MariaDB, and uses its own internal network and named DB/upload volumes. No
external network or prebuilt Apache volume is needed. Only the loopback app port
is published. MariaDB stays on the internal service network; the app also joins
a Compose-managed bridge for host access. Keep payments disabled in local tests.
Development HTTP does not weaken production HTTPS safeguards.

The DB passes authenticated SELECT 1 before the one-shot migration service runs
`npm run migrate && npm run bootstrap`. The app waits for successful completion.
Bootstrap prepares empty stores, not demo identities. Register a synthetic member;
privileged account provisioning is a separately authorized operation.

To provision an administrator, first register a normal account. Stop API writers,
then run `npm run provision-admin -- --api-stopped` from the backend in a private
interactive terminal with the same database/key environment. Verify the owner's
identity and answer the prompts. This records an audit event, revokes old sessions
and requires MFA at the next login. There is no default administrator password.

On updates, stop app writers, rebuild the image and recreate the migration
service before starting the app. Never delete volumes to fix failed initialization.
Stop with `docker compose --env-file /private/duranki-local.env -f compose.local.yml down`
without -v to preserve local data.

## Existing Dev Server: Manual Preparation Required

The root docker-compose.yml preserves Apache's existing frontend volume, external
webnet and backend mapping 4001:3001. It does not build the frontend or provision
the existing reverse proxy. It now gates backend startup on DB health and the
same migration/bootstrap command. Use deploy/compose.env.example for a PRIVATE
interpolation file and pin DURANKI_IMAGE to a reviewed candidate.

For the existing HTTP dev/test server, explicitly set NODE_ENV=development and
FRONTEND_ORIGIN=http://app-dev.duranki.network in the private environment.
The root Compose default is production and requires an HTTPS origin; the HTTP
origin is intentionally rejected in production. Do not weaken that guard.
Production promotion must use NODE_ENV=production and exact HTTPS origins.

Keep existing project/volume mappings. On a populated MariaDB volume, initialization
environment variables do NOT create users or rotate passwords. Provision the
restricted non-root app user and grants through approved maintenance, without
deleting data. Do not publish the DB port. Preserve existing uploads and keys.

Before deploying this candidate: obtain approval, back up and restore-test the
database/uploads/secrets, stop writers, provide the matching MFA_ENCRYPTION_KEY,
and manually run migration/bootstrap using the candidate image and target DB
environment. Verify imported account readiness before starting the app. These
are DB writes; a GitHub push cannot perform this private cutover.
See [Imported accounts](IMPORTED_DATABASE_LOGIN.md).

The existing GitHub Actions workflow is unchanged: code goes to the dev/test
server, not production, and migrations/private imports are not automatic.
Production promotion and server/automation changes require explicit approval.

## Optional Combined Release

Dockerfile.release includes migration scripts and SQL schemas. deploy/compose.yml
uses separately managed MariaDB with /srv/duranki/production.env. After approval,
backup and stopping writers, set DURANKI_IMAGE to the reviewed immutable digest:

```sh
docker compose --env-file production.env -f compose.yml --profile maintenance run --rm migrate
```

deploy-release.sh replaces only the app image; it never executes migrations or
restores database state. Failed initialization blocks release. App rollback does
not undo database writes. Use backward-compatible migrations and a recovery plan.

## Required Verification

Run fresh and repeated initialization, imported-account preservation, registration,
password login, restart persistence, duplicate rejection, privileged MFA and tenant
isolation against synthetic MariaDB fixtures. Test unavailable DB, missing/wrong
key and failed migration startup. Verify uploads and all service stores.

Run focused tests and production build; verify Linux Node 22/stock Apache packaging,
direct routes/refreshes/assets/query strings, exact-origin CORS and HTTPS safeguards.
Historical local-store reports are retired, not MariaDB acceptance evidence.
No live login, private import or deployment is certified by these templates.

## Verified Locally: 2026-10-26

- 367 unit tests passed with zero failures or skips.
- 57 integration tests passed against a disposable Docker MariaDB 10.5.15,
  including registration, password login, MFA/recovery replay protection,
  private document ownership, restart persistence, payments, training, treasury
  and Heritage. Accounts, documents and provider responses were synthetic;
  no real payment or real-account password was tested.
- Fresh Compose database initialization and repeated bootstrap succeeded.
  The app health reports MariaDB for every store; the built login page rendered
  in the browser. A disconnected database returns health 503. Startup against
  an unavailable database exits with status 1 without a fallback.
- Backend Docker build and Linux Node 22 frontend production build passed.
  The frontend generated 52 static page entries. Existing bundle-size/CommonJS
  warnings and dependency-audit findings remain (backend: two high;
  frontend: one low, one moderate, five high).
- Release file preflight and pattern-based secret scan passed. The scan is not
  a guarantee that historic secrets are absent; rotate previously exposed values.
- No GitHub push, live-server change, private data import or production
  certification was performed. Existing GitHub workflows are unchanged.

Run unit tests from backend with `node --test --test-concurrency=1 test/*.test.js`.
For integration tests, use only an explicitly provisioned disposable loopback
Docker database named `duranki_test`, with DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
DB_NAME and the matching MFA_ENCRYPTION_KEY in your private environment. Set
MARIADB_HTTP_TEST=1 and MARIADB_INTEGRATION_TEST=1, run migrations/bootstrap,
stop other API writers, then run:

```sh
node --test --test-concurrency=1 integration/*.test.js
```

Integration tests create synthetic records and temporary tables; never point
them at development-server, production or personal databases.

Back up MariaDB consistently with matching protected environment secrets and
uploads. Retain old private backups as recovery evidence, never active fallback.
