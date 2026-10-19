# Treasury: initial local implementation

Open `/dashboard/treasury` using your signed-in Duranki platform administrator session.

## Workflow

1. Register tenant/community identifiers from the platform directory in Configuration.
2. Register the stakeholder, service ID, bank beneficiary reference and allocation percentage.
3. Record a receipt only after checking a bank/gateway statement. Enter the member ID, community, amount, date and unique external reference.
4. Filter community receipts. Select unallocated receipts for one stakeholder and create a payment draft.
5. A different authorised approver must approve the draft. The maker cannot approve their own payment.
6. Export the approved instruction, process it through the bank, then reconcile using its unique bank transaction reference and settlement date.

## Important limits before live use

- This is a manual treasury register, not an automatic feed from subscriptions, wallet or accounting. A subscription is not evidence of money received.
- No bank integration exists; exporting does not transfer funds. CSV instructions are not a bank-specific bulk upload format.
- Sign in again after this update. The password-verified platform administrator can assign an existing active user in Staff access as Treasury Operator or Treasury Approver, with a new password of at least 14 characters. This replaces that account's local sign-in password. The staff member signs in normally and opens `/dashboard/treasury`. Roles cover all communities. Reassignment or revocation invalidates previous Treasury sessions. Production MySQL identity integration is still pending; Treasury fails closed in database-auth mode.
- Community and member identifiers are manually registered, not yet enforced against the platform directory. Each receipt has one stakeholder allocation; multi-party distribution rules are not implemented.
- Amounts use integer ZAR cents. Allocation percentages are snapshotted on receipts; existing receipts are not repriced.
- No demo receipts are imported. Duplicate receipt references, payment allocations and settlement references are constrained in the database.
- Records are in `backend/data/treasury.sqlite` with WAL enabled. Back up using SQLite's online backup API, or stop the backend before copying the database and its WAL files. Do not delete the data directory or commit financial data.
- Production deployment, bank reconciliation imports, corrections/reversals, immutable audit storage and integration into the accounting general ledger remain required before using this for real disbursements.

## Verification

Run `node --test test/treasury.test.js` from the backend directory. Tests use in-memory databases, never live financial records.
