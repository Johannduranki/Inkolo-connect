# MariaDB Integration Tests

Run only against an explicitly disposable, migrated and bootstrapped MariaDB database. Never use a production database or real account data.

The converted `legacy-*.test.js` suites require these environment variables:

- `MARIADB_INTEGRATION_TEST=1`: explicit permission to create synthetic fixture tables.
- `DB_HOST`: `127.0.0.1`, `::1`, or `localhost` only.
- `DB_PORT`: the local test server's port (defaults to `3306`).
- `DB_NAME`: an alphanumeric/underscore name ending in `_test` or starting with `duranki_test`.
- `DB_USER` and `DB_PASSWORD`: credentials limited to the disposable test database.
- `NODE_ENV`: must not be `production`.

From `backend`, run:

```sh
node --test --test-timeout=60000 integration/legacy-*.test.js
```

These 46 tests preserve the former synchronous-store assertions using asynchronous MariaDB adapters. `isolated-stores.js` clones table definitions with `SHOW CREATE TABLE`, including foreign keys and checks, into randomly prefixed tables. It does not copy source data. Constraint names and referenced table names are rewritten for each fixture. Only synthetic reference catalogue data is seeded. Service write-lock metadata remains shared, so bootstrap must have initialized it.

Each fixture drops only its own recorded tables after validating their exact prefix and identifier shape. Shared application tables and other fixture prefixes are not cleanup targets. A forcibly terminated process can leave its prefixed tables behind; inspect their exact names before manually removing only that interrupted fixture.

The other `mysql-*.test.js` suites use their existing namespaced synthetic records and cleanup. Their connection settings also come from `DB_*`; do not assume the new fixture guard applies to those older harnesses.
