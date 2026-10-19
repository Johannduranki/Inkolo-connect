# Duranki: Deployment and Updates on Johann Evans's Server

Prepared 28 September 2026. Audience: Johann Evans and the Duranki developer.

> Status correction, 17 October 2026: this is a historical installation plan,
> not an executable current release checklist. Section 2 describes the old
> baseline; database migrations, password/MFA authentication and private-document
> permission work have since been implemented and tested. Do not repeat those
> migrations, replace data or run seed scripts from these historical assumptions.
> Use [Production sign-off](security/PRODUCTION_SIGNOFF.md) for remaining gates
> and [Security release status](security/SECURITY_RELEASE_STATUS.md) for evidence.
> Server/domain assumptions and deployment commands still require developer
> review against the actual target. Production approval remains withheld.

## 1. What this guide assumes

Johann supplies an Ubuntu Linux server with SSH/sudo access, a public IP address, and permission to run Docker. The actual server operating system and domain have not yet been confirmed. If this is Windows Server, cPanel, Plesk, or shared hosting, Johann must confirm Docker support and adapt the web-server setup before running these commands.

Use `app.example.com` below only as a placeholder. Replace it with the approved Duranki domain or subdomain everywhere. A separate marketing website can stay at the main domain.

Recommended starting arrangement:

```text
Users -> https://app.example.com -> Caddy HTTPS proxy
                                      |
                                      v
                              Duranki application :3000
                              Angular files + Node API
                                      |
                                      v
                              Private MySQL database
```

All three containers run on Johann's server. The frontend calls `/api` on the same domain. Users do not connect to port 3000 or the database directly. Angular does not require its development server on port 4200 in production.

Agree on capacity after measuring the application: CPU/RAM, SSD storage, upload growth, concurrent users, and backup retention. This single-server arrangement has downtime if the server fails; it is not high availability.

## 2. Current release status: complete these repairs first

**Do not publish the current local checkout as real financial software.** Logging in locally is now possible, but that does not establish production readiness.

The developer must complete and demonstrate the following before Step 7:

1. Recover and commit the complete source for the newer tenant, community, training, grant, accounting, and administration features. The local compiled frontend includes functionality absent from the restored source. Build a matching frontend and backend from a clean checkout, without relying on the existing `dist` directory.
2. Move authoritative tenant, community, role, wallet, accounting, and service records into the database. `backend/src/platform-api.js` currently uses `readPlatformState()` in many paths, even when a database is configured. Connecting MySQL alone does not migrate those features. Some tenant configuration also resides in browser storage.
3. Implement and test database-backed password authentication, password reset, administrator provisioning, and server-side tenant/community permissions. The restored database login path does not verify a password. The local admin PIN repair applies only to local demo authentication. Never expose that path publicly.
4. Replace local sample users and values through a reviewed data migration. Preserve any genuine records in a backup; do not blindly delete data. Do not run the current test-user seed script in production.
5. Verify that money-changing operations use database transactions and unique payment references; test duplicate payment rejection, reconciliation, and required provider integrations. A displayed payment instruction is not proof of a bank payment.
6. Protect identity documents and invoices with authenticated, authorised downloads. The restored application exposes `/uploads` as static files. Publicly accessible identity documents are not acceptable.
7. Test all SQL migrations on the selected database version. The existing migration runner treats duplicate-column errors as acceptable for an entire file, which may skip later statements. Correct that behavior and verify the resulting schema before marking migrations applied.
8. Configure Express proxy trust for the actual reverse-proxy topology and verify client-IP rate limiting. Trust only the known proxy path, and keep the application port private.
9. Ensure JSON demo seeding is disabled in production, in addition to setting the environment flags below. Verify a database outage causes startup to fail instead of switching to demo data.
10. Supply a tested, secure one-time production administrator creation command. The current `backend/scripts/seed-user.js` creates a test user, not a production administrator.

Acceptance evidence: fresh build, database migrations, successful and rejected logins, cross-tenant access rejection, service workflows, restart persistence, backup restoration, and payment tests where applicable.

This document is an installation plan, not a claim that those repairs or a server deployment have been completed.

## 3. Obtain the server and domain details

Johann should provide:

- Server OS/version, public IPv4 address, SSH user, and SSH-key access.
- Approved domain and DNS administrator contact.
- Existing websites, reverse proxy, and ports already in use.
- SMTP/email provider and payment-provider configuration, where required.
- Private Git repository access and a private container registry, if used.
- Backup destination, retention, recovery-time target, and person responsible for incidents.

Exchange credentials through a password manager or secure invitation. Do not include them in the repository or this guide.

## 4. Prepare the server once

Install Docker Engine and the Compose plugin using the official Ubuntu instructions: https://docs.docker.com/engine/install/ubuntu/

Verify:

```bash
docker --version
docker compose version
```

Use a controlled deployment account. Docker access effectively grants extensive control over the server. Keep SSH key-based and restrict SSH to administrator addresses where possible. Permit public HTTP/HTTPS on ports 80 and 443; do not publish ports 3000, 4200, or 3306. Do not replace an existing firewall or web server without reviewing the other sites on this server. Docker-published ports also require attention at the host/network firewall.

Create directories owned by the deployment account:

```bash
sudo mkdir -p /opt/duranki/{releases,config,backups}
sudo chown -R "$USER":"$USER" /opt/duranki
chmod 700 /opt/duranki/config /opt/duranki/backups
```

These are server paths; do not run the Linux commands in the Windows project terminal.

## 5. Prepare a reproducible application image

The developer builds one immutable image for each approved Git commit, for example `duranki:<full-commit-sha>`, and records the corresponding Git release tag. Keep the previous image.

The existing `Dockerfile.aws` is a starting point, not a finished production artifact. Before using it:

- Exclude every real `.env`, `.env.*`, upload folder, local data store, and credential file from the build context. The current ignore rules do not cover every possible environment filename.
- Use a supported, tested Node version compatible with Angular and the backend, and pin release images by digest.
- Build Angular from source during the image build, and install locked backend dependencies with `npm ci --omit=dev`.
- Run the application as a non-root user with permission to write its upload directory.
- Run migrations as an explicit release step, not automatically every time the application restarts. Change the image's startup command accordingly.
- Run the backend with `/app/backend` as its working directory. Current uploads resolve relative to that directory, so the correct upload mount is `/app/backend/uploads`, not `/app/uploads`.

For an approved clean source checkout, after those changes:

```bash
npm --prefix backend ci
npm --prefix backend test
npm --prefix frontend ci
npm --prefix frontend run build
RELEASE=$(git rev-parse HEAD)
docker build -f Dockerfile.aws -t "duranki:$RELEASE" .
```

Stop if a check fails. Do not substitute an older compiled frontend to make a release appear successful. Prefer building in CI and pulling the immutable image onto Johann's server. If building on the server, use a fresh release directory and allow adequate build memory.

## 6. Store production configuration separately

Create `/opt/duranki/config/app.env` with real values supplied securely:

```dotenv
NODE_ENV=production
PORT=3000
FRONTEND_ORIGIN=https://app.example.com
FRONTEND_ORIGINS=https://app.example.com
DB_HOST=db
DB_PORT=3306
DB_NAME=duranki
DB_USER=duranki_app
DB_PASSWORD=REPLACE_WITH_APP_DATABASE_PASSWORD
ID_PEPPER=REPLACE_WITH_RANDOM_SECRET
JWT_SECRET=REPLACE_WITH_DIFFERENT_RANDOM_SECRET
JWT_EXPIRES_IN=1h
ALLOW_DEMO_AUTH=false
FORCE_DEMO_MODE=false
```

Generate independent secrets using `openssl rand -hex 32`; store them securely. Preserve `ID_PEPPER`: changing it without a migration breaks identity/telephone lookups. Never copy local PINs, demo credentials, or `LOCAL_ADMIN_PASSWORD_HASH` into production. Add email/payment settings only after their integrations and exact configuration names are implemented.

Create `/opt/duranki/config/db.env`:

```dotenv
MYSQL_DATABASE=duranki
MYSQL_USER=duranki_app
MYSQL_PASSWORD=REPLACE_WITH_THE_SAME_APP_DATABASE_PASSWORD
MYSQL_ROOT_PASSWORD=REPLACE_WITH_A_DIFFERENT_ROOT_PASSWORD
```

Create `migration.env` with the same DB host/name and a separate schema-migration user/password provisioned by Johann. That user may change the schema; the runtime application user should only have the permissions required by the application. Initially the MySQL image grants its created user broad permissions within its database: narrow those after migrations. Do not use the root user for the running application.

```bash
chmod 600 /opt/duranki/config/*.env
```

Environment files are a practical single-server baseline, not an encrypted secret vault. Protect server access and backups. Docker secrets or a vault require application support for reading the mounted secret files; the current app reads environment variables.

## 7. Define the stack

After the release requirements are satisfied, Johann creates `/opt/duranki/compose.yaml` from this template. Replace the Caddy and MySQL image placeholders with tested, pinned image references. MySQL 8.4 is a candidate to validate, not a claim that all existing migrations support it.

```yaml
name: duranki
services:
  proxy:
    image: ${CADDY_IMAGE:?Set a tested Caddy image digest}
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app
  app:
    image: ${DURANKI_IMAGE:?Set the immutable application image}
    restart: unless-stopped
    working_dir: /app/backend
    command: ["node", "src/server.js"]
    env_file: ./config/app.env
    volumes:
      - uploads:/app/backend/uploads
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const b=await r.json();process.exit(r.ok && b.storage==='mariadb'?0:1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3
  db:
    image: ${MYSQL_IMAGE:?Set a tested MySQL image digest}
    restart: unless-stopped
    env_file: ./config/db.env
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "MYSQL_PWD=$$MYSQL_PASSWORD mysql -h 127.0.0.1 -u$$MYSQL_USER $$MYSQL_DATABASE -e 'SELECT 1' >/dev/null 2>&1"]
      interval: 10s
      timeout: 5s
      retries: 20
volumes:
  mysql_data:
  uploads:
  caddy_data:
  caddy_config:
```

The health endpoint currently uses the label `mariadb` for its database-connected mode, even with the MySQL client. That startup flag is not a live database query. Before release, enhance readiness to query the DB; also monitor failures after startup. Compose does not automatically restart a container merely because its health check becomes unhealthy.

Create `/opt/duranki/release.env`:

```dotenv
DURANKI_IMAGE=duranki:REPLACE_WITH_APPROVED_COMMIT_SHA
CADDY_IMAGE=REPLACE_WITH_TESTED_CADDY_IMAGE_AT_SHA256_DIGEST
MYSQL_IMAGE=REPLACE_WITH_TESTED_MYSQL_IMAGE_AT_SHA256_DIGEST
```

Create `/opt/duranki/config/Caddyfile`:

```caddyfile
app.example.com {
    reverse_proxy app:3000
}
```

Caddy can obtain and renew HTTPS certificates automatically when DNS and reachability are correct. If an existing proxy already owns ports 80/443, Johann should integrate this hostname into that proxy instead of starting a conflicting Caddy container. Keep certificate storage persistent.

## 8. Test on staging before publishing

Use a staging hostname, separate Compose project/directory, database, secrets, volumes, and provider sandbox credentials. Do not share production volumes with staging. A second stack on the same server needs routing through the existing proxy, not another competing port-80/443 binding.

Validate the intended deployment with an empty database and then with a representative anonymised upgrade backup. Test login, permissions, tenant switching, community services, uploads, invoices, wallet operations, and a restart. Confirm data survives and no demo fallback occurs. Test a wrong PIN and access to a different tenant's records.

Only approve a release after a backup has actually been restored in staging.

## 9. Connect DNS and start the first production release

1. Add an A record for `app.example.com` pointing to Johann's public IPv4. Only add AAAA if IPv6 is configured and reachable. Do not alter mail/MX records. Check any CAA restrictions with the DNS administrator.
2. Install the approved image on the server, either by pulling it from the private registry or building the approved clean commit.
3. Run the commands below from `/opt/duranki`. Every example deliberately uses the same project name and configuration paths so upgrades retain the same volumes.

```bash
cd /opt/duranki
dc() { docker compose -p duranki --env-file release.env -f compose.yaml "$@"; }
dc config --quiet
dc up -d db
dc ps
```

Wait until `db` is healthy. Johann provisions the migration credentials, then the developer runs the reviewed migrations explicitly:

```bash
dc run --rm --no-deps --env-from-file ./config/migration.env app npm run migrate
```

Check that the installed Compose version supports `run --env-from-file`. If not, use a dedicated migration service with `env_file: ./config/migration.env`; do not fall back to the runtime user without reviewing its grants.

Provision the first real administrator using the developer's completed production provisioning workflow from Step 2. Do not use the current local demo account or test seed script.

```bash
dc up -d app proxy
dc ps
dc logs --tail=100 app proxy
curl --fail https://app.example.com/api/health
```

Visit `https://app.example.com/login` and log in. Check a direct dashboard URL after refresh, HTTPS, service access, file downloads, email delivery, and data persistence. A green homepage alone is insufficient. The health response must not report `persistent-demo`.

## 10. Back up before accepting real data

Schedule backups of the database, uploads, protected configuration/secrets, and release/image references. Keep encrypted copies off the server. Agree on retention and regular restore testing with Johann.

For a maintenance-window backup, stop application writes first, leaving the DB running. The commands below assume the tested MySQL image contains `mysqldump` and the application image contains `tar`:

```bash
cd /opt/duranki
dc() { docker compose -p duranki --env-file release.env -f compose.yaml "$@"; }
umask 077
set -o pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
dc stop app
dc exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers --events --no-tablespaces "$MYSQL_DATABASE"' | gzip > "backups/$STAMP.sql.gz"
dc run --rm --no-deps app tar -czf - -C /app/backend/uploads . > "backups/$STAMP-uploads.tar.gz"
gzip -t "backups/$STAMP.sql.gz"
tar -tzf "backups/$STAMP-uploads.tar.gz" > /dev/null
cp release.env "backups/$STAMP-release.env"
dc start app
```

Run each step only if the previous one succeeds. If a backup fails, preserve the error, fix it, and decide whether to resume service; never continue an upgrade with an unverified backup. Compression checks detect corrupt archives, but only a restore test verifies recoverability. Also back up config/secrets through the protected backup system. Do not email them alongside this document.

Never use `docker compose down -v` for an update; it deletes the named volumes holding persistent data. Changing the Compose project name or DB passwords in a file does not migrate data or rotate existing database passwords.

## 11. The normal software update process

The repeatable process is: **change code -> test -> commit -> build a versioned image -> test staging -> back up production -> migrate -> deploy -> verify**.

Developer responsibilities:

1. Implement changes and tests locally; commit all required source and SQL migrations to Git.
2. Have changes reviewed, create a release tag, and build/publish the image for that exact commit. Keep secrets and local data out of Git and images.
3. Test the release in staging, including upgrading the old schema. Use backwards-compatible schema changes where possible. Record required settings, downtime, and rollback limits in release notes.
4. Give Johann the immutable image reference and migration instructions.

Johann's update steps:

1. Keep the current `release.env` as `previous-release.env`. Confirm the previous application image is still available.
2. Pull the new image in advance. Schedule a short maintenance window; stop all application/background writers.
3. Create and verify the coordinated database/upload backup above. For an update, keep the app stopped instead of running its final `dc start app` command.
4. Change only `DURANKI_IMAGE` in `release.env` to the approved image reference. Do not upgrade MySQL/Caddy as part of an unrelated app update.
5. Run the reviewed migration command from Step 9 and stop if it fails. MySQL DDL is not generally rolled back as one transaction; inspect partial changes before retrying.
6. Deploy and verify:

```bash
dc up -d --no-deps app
dc ps
dc logs --tail=100 app
curl --fail https://app.example.com/api/health
```

7. Confirm a real browser login and the workflows affected by the change. Reopen access and record the release time and backup reference.

This single-instance method has brief downtime. For zero-downtime updates, design separate application instances, readiness-based routing, and compatible database migrations first.

## 12. Roll back a failed release

If the database changes are backwards-compatible, restore the previous application image reference from `previous-release.env`, then run `dc up -d --no-deps app` and repeat the smoke tests.

If schema/data changes are incompatible, stop writes and restore the matching database and uploads into a separate recovery stack first. Verify the restored version before directing traffic to it. Do not blindly import over the live database. Restoring a backup discards later writes unless they are separately recovered and reconciled; obtain the business owner's decision before that step.

Keep the failed release's logs, migration status, image reference, and backup timestamps. Do not remove the previous images/volumes until the new release has been accepted.

## 13. Make future updates easy

After the first manual deployment and rollback have been tested, create a GitHub Actions pipeline that tests, builds, and publishes the versioned application image. Use a protected production environment with a release approval and narrowly scoped deployment credentials. Johann then deploys an approved image instead of copying files or editing code on the server.

Configure container-log rotation, disk-space monitoring, HTTPS expiry monitoring, application/database alerts, scheduled backups, and restore drills. Keep local development, staging, and production separate. Software updates must never overwrite production configuration or persistent volumes.

## 14. Handover checklist

- [ ] Johann has confirmed server OS, domain, IP, and existing proxy setup.
- [ ] Complete matching source is in Git and builds from a clean checkout.
- [ ] Production authentication, data storage, tenant isolation, and financial controls pass tests.
- [ ] Staging deployment and a backup restore pass.
- [ ] Production secrets, administrator provisioning, and DNS are ready.
- [ ] HTTPS, login, critical services, and restart persistence pass on the domain.
- [ ] Backups are stored off-server and monitoring reaches the responsible person.
- [ ] The next update and rollback procedures have been rehearsed.

## Official references

- Docker installation on Ubuntu: https://docs.docker.com/engine/install/ubuntu/
- Compose in production: https://docs.docker.com/compose/how-tos/production/
- Compose run options: https://docs.docker.com/reference/cli/docker/compose/run/
- Caddy automatic HTTPS: https://caddyserver.com/docs/automatic-https
- Caddy reverse proxy: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy

No server was accessed or deployed to when preparing this guide. Once Johann confirms the server and domain, the placeholders and templates can be converted into that server's tested deployment files.
