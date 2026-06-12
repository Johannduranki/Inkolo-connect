<<<<<<< HEAD
# Inkolo-connect
Webapp
=======
# Inkolo Connect ID Login Module

A standalone authentication prototype using:

- Angular and TypeScript for the frontend
- Node.js and Express for the API
- MariaDB/MySQL for persistence
- JWT bearer tokens for authenticated API requests

The prototype authenticates a user using an ID number only. For production,
add a second factor such as a password, one-time PIN, or platform SSO.

## 1. Create the database

Run `backend/database/001_create_users.sql` in MariaDB:

```powershell
mysql -u root -p < backend/database/001_create_users.sql
```

## 2. Configure the API

Copy `backend/.env.example` to `backend/.env` and replace `ID_PEPPER` and
`JWT_SECRET` with different long random values.

## 3. Install dependencies

```powershell
npm.cmd run install:all
```

If npm reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, configure npm to trust your
organization's root CA certificate instead of disabling SSL verification:

```powershell
npm.cmd config set cafile "C:\path\to\organization-root-ca.pem"
```

Ask your network or IT administrator for the correct PEM certificate path.

## 4. Add a test user

The default test ID is `9001015009087`:

```powershell
npm.cmd --prefix backend run seed
```

To use another numeric ID:

```powershell
npm.cmd --prefix backend run seed -- 1234567890
```

The raw ID number is not stored in the database. The API stores an HMAC hash
and the final four digits for display.

## 5. Run the module

Start the API:

```powershell
npm.cmd run start:backend
```

In another terminal, start Angular:

```powershell
npm.cmd run start:frontend
```

Open `http://localhost:4200` and sign in with the seeded ID.

## API endpoints

- `GET /api/health`
- `POST /api/auth/login` with `{ "idNumber": "9001015009087" }`
- `GET /api/auth/me` with `Authorization: Bearer <token>`
# Inkolo Connect platform

## Local services

- Angular frontend: `http://127.0.0.1:4200`
- Node.js API: `http://127.0.0.1:3000`
- Health check: `http://127.0.0.1:3000/api/health`

The Angular development server proxies `/api` requests to the Node.js API.

## Persistent storage

The API first attempts to connect to MariaDB using `backend/.env`. When MariaDB
is unavailable and `ALLOW_DEMO_AUTH=true`, the platform uses the durable
server-side file:

`backend/data/platform-store.json`

Unlike the original in-memory demo, this data survives backend restarts. It
stores profiles, role assignments, churches, member communities, contacts,
direct messages, wallets, referrals, marketplace listings, and job listings.

## MariaDB setup

Install and start MariaDB, create the configured database, then run the SQL
files in `backend/database` in numeric order:

1. `001_create_users.sql`
2. `002_add_membership.sql`
3. `003_create_service_subscriptions.sql`
4. `004_create_service_applications.sql`
5. `005_create_platform_tables.sql`

Update `backend/.env` with the MariaDB host, port, username, password, and
database name before restarting the API.

## Community communication API

Authenticated members can:

- search members in their selected church community by name or telephone;
- add community contacts;
- read a one-to-one conversation;
- send persistent direct messages.

The Angular My Community screen uses these API endpoints directly.
>>>>>>> 97ac217 (webapp)
