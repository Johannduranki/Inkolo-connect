# Johann: MariaDB-only dev server setup

Target: **http://app-dev.duranki.network** (development/testing, not production).
This is a one-time manual setup for the MariaDB-only release. Do not edit GitHub
Actions, SSH/GHCR secrets, the Apache configuration, or the deployment script.

## What GitHub Does And Does Not Do

The unchanged workflow builds Angular and the backend image, uploads Angular to
the existing Apache container, then runs these commands in `$HOME/durankiDemo`:

```sh
docker compose pull backend
docker compose up -d --no-deps backend
```

It does **not** update the server Compose file, create a database, run migrations,
import records or install private secrets. The new backend will refuse startup
until the preparation below is complete. A push alone is not a working cutover.
Wait for the release workflow to finish before manual maintenance, and coordinate
so no other push/deployment runs during these steps. If that first workflow failed
before copying the frontend, rerun that same workflow after setup is complete.

## 1. Keep The Existing Server Layout

Use the deployment user's existing `$HOME/durankiDemo` directory and its current
Compose project. Do not replace the whole server Compose file with the repository
template: the server may have additional proxy settings, mounts and private keys.

Keep these unchanged:

- `durankidemo_mariadb`, its existing data volume and Docker network.
- `durankidemo_backend`, internal port **3001**, host mapping **4001:3001**.
- `durankidemo_frontend`, its Apache volume and `/usr/local/apache2/htdocs`.
- Backend image `ghcr.io/johannduranki/inkolo-connect:latest`, so future automatic
  deployments continue pulling new code. Do not permanently pin it to an old tag.
- Existing frontend/proxy `/api` routing, upload mounts and payment settings.

Keep private backups of the current Compose file, environment, database and uploads.
Never run `docker compose down -v`, delete volumes or remove database tables here.

## 2. Choose A Clean Dev Database

The owner approved a clean transition. The least disruptive approach is a new
empty database **inside the existing MariaDB container**, leaving the old database
available for recovery. The example name below is `durankidemo_core_mariadb`.
Existing accounts will not appear in this new database; register new test users.

Open a private administrative MariaDB session; enter the password at its prompt:

```sh
docker exec -it -e MYSQL_HISTFILE=/dev/null durankidemo_mariadb mysql -u root -p
```

Run the following after replacing the password placeholder privately:

```sql
CREATE DATABASE durankidemo_core_mariadb
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'duranki_dev_app'@'%' IDENTIFIED BY '<PRIVATE-NEW-PASSWORD>';
GRANT ALL PRIVILEGES ON durankidemo_core_mariadb.* TO 'duranki_dev_app'@'%';
```

The grant is limited to this database; do not grant global privileges or use root
for the API. If either name already exists, stop and inspect it; do not drop it or
silently reset its password. Database passwords in Compose do not change an
already-initialized MariaDB user's password.

If preserving/importing accounts instead, stop here and follow
[Imported database requirements](IMPORTED_DATABASE_LOGIN.md). Bootstrap does not
convert old relational accounts or overwrite nonempty uninitialized stores.

## 3. Set Private Backend Configuration

Store values in a server-only `.env` in the deployment directory, readable by the
deployment user only (`chmod 600 .env`). Never put this file in Git, email or chat.
Do not print `docker compose config`, container environment or secrets into a
shared log. The file must be available to the same user used by GitHub SSH.

Required values for this **HTTP dev server**:

| Variable | Value |
| --- | --- |
| NODE_ENV | development |
| PORT | 3001 |
| DB_HOST | db (the existing MariaDB Compose service name) |
| DB_PORT | 3306 (container port, not the host port) |
| DB_NAME | durankidemo_core_mariadb |
| DB_USER | duranki_dev_app |
| DB_PASSWORD | New application password from step 2 |
| ID_PEPPER | Private random secret, at least 32 characters |
| JWT_SECRET | Separate private random secret, at least 32 characters |
| MFA_ENCRYPTION_KEY | Canonical base64 encoding of 32 random bytes |
| FRONTEND_ORIGIN | http://app-dev.duranki.network |
| ALLOW_DEMO_AUTH | false |
| FORCE_DEMO_MODE | false |

For the new empty database only, generate each secret separately in a private
terminal with `openssl rand -base64 32`. Never regenerate the MFA key after users
enrol: changing it makes existing authenticator credentials unreadable. Imported
data requires its original MFA key and identity pepper. Rotate previously exposed
passwords/JWT secrets privately; removing them from current source does not erase
Git history. Production must use HTTPS and NODE_ENV=production, not these dev settings.

A `.env` file alone does not inject all values into the container. Update only the
existing **backend environment mapping** to reference them, removing conflicting
literal values while preserving unrelated provider settings:

```yaml
environment:
  NODE_ENV: ${NODE_ENV:?required}
  PORT: '3001'
  DB_HOST: db
  DB_PORT: '3306'
  DB_NAME: ${DB_NAME:?required}
  DB_USER: ${DB_USER:?required}
  DB_PASSWORD: ${DB_PASSWORD:?required}
  ID_PEPPER: ${ID_PEPPER:?required}
  JWT_SECRET: ${JWT_SECRET:?required}
  MFA_ENCRYPTION_KEY: ${MFA_ENCRYPTION_KEY:?required}
  FRONTEND_ORIGIN: ${FRONTEND_ORIGIN:?required}
  ALLOW_DEMO_AUTH: 'false'
  FORCE_DEMO_MODE: 'false'
  PLATFORM_STORAGE: mariadb
  AUTH_STORAGE: mariadb
  TREASURY_STORAGE: mariadb
  TRAINING_STORAGE: mariadb
  CYCLE_STORAGE: mariadb
  HERITAGE_STORAGE: mariadb
```

If FRONTEND_ORIGINS is also configured, reconcile it with the intended dev origin.
Keep all existing uploads on their persistent private mount. Registration identity
documents are in MariaDB; some other application uploads remain private files.
Do not remove those files or their mounts.

## 4. Initialize And Start The Candidate

Run as the existing deployment user, after the GitHub run has finished:

```sh
cd "$HOME/durankiDemo"
docker compose config --quiet
docker compose pull backend
docker compose stop backend
docker compose run --rm --no-deps backend sh -c 'npm run migrate && npm run bootstrap'
```

Proceed only if this exits **0** and reports **BOOTSTRAP_READY**. It creates the
schema and empty application stores, without sample accounts or default passwords.
If it fails, keep the backend stopped and investigate the sanitized error. Do not
delete readiness metadata or change keys to bypass a failure. MariaDB and Apache
remain running throughout; the backend does not manage the database container.

Then start only the backend:

```sh
docker compose up -d --no-deps backend
docker compose logs --tail=50 backend
curl --fail --silent --show-error http://127.0.0.1:4001/api/health
curl --fail --silent --show-error \
  -H 'Origin: http://app-dev.duranki.network' \
  http://app-dev.duranki.network/api/health
```

Health must return HTTP 200, `status: ok`, `accountStorage: platform-document`,
and **mariadb** for every storage field. A running/restarting container or a green
workflow alone is not sufficient. An unrelated Origin must remain rejected.

## 5. Verify Registration And Administrator Access

1. Open the dev URL, register a new synthetic test member and sign out.
2. Sign in using the same telephone/password. Check the profile and permissions.
3. Restart only backend and verify the same account still works.
4. For the authorized administrator, register a normal account first, then:

```sh
docker compose stop backend
docker compose run --rm --no-deps backend npm run provision-admin -- --api-stopped
docker compose up -d --no-deps backend
```

The private interactive command asks for the account ID, telephone confirmation
and operator, and requires independent owner verification. It audits the change,
revokes old sessions and requires MFA on the next sign-in. It never supplies a
default password. Do not promote an account solely because it has a familiar name.
If provisioning fails, investigate before proceeding; do not bypass MFA.

Verify direct page refreshes, registration, login/MFA, tenant isolation and upload
downloads. Use synthetic documents, never real IDs, for acceptance tests. Do not
test real payment collection as part of this setup.

## Future Updates And Recovery

Once the private setup is complete, normal main pushes use the existing GitHub
automation unchanged. Future schema-changing releases still require reviewed
manual migrations before activation; the workflow intentionally skips them.

Keep the previous image digest, private environment/configuration and database
backup together. Restoring an old image alone does not reverse a schema change.
Do not attempt rollback by enabling local/demo storage. Report only sanitized
error codes, health status and workflow links, never credentials or account data.
