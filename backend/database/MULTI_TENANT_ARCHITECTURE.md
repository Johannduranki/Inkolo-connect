# Duranki Multi-Tenant Database Architecture

Duranki is structured as:

`Duranki Platform -> Tenant -> Community -> Services -> Community Members / Users`

The database-level source of truth is the migration:

`backend/database/008_create_multi_tenant_core.sql`

## Core Tables

- `tenant`: one row per customer/organisation using Duranki.
- `community`: one row per community, always linked to `tenant.tenant_id`.
- `service`: central Duranki service catalogue.
- `tenant_service`: services Duranki has enabled for a tenant.
- `community_service`: services a community has enabled from the tenant's allowed services.
- `users`: global user identity table.
- `user_tenant_role`: tenant/global roles such as `DURANKI_ADMIN` and `TENANT_ADMIN`.
- `user_community_role`: community roles such as `COMMUNITY_ADMIN` and `COMMUNITY_MEMBER`.
- `transactions`: tenant/community/user/service transaction ledger for billing and revenue share.
- `revenue_share_rule`: configurable revenue split rules.

## Required ID Rules

Every important business record should carry these IDs where applicable:

- `tenant_id`
- `community_id`
- `user_id`
- `service_id`

`community_id` can be nullable for platform-level or tenant-level records, but it must never be used without the correct `tenant_id`.

## Service Validation

The database enforces the relationship:

`community_service -> tenant_service -> service`

A community service must reference a service that is already enabled for the same tenant. The backend should also check this before insert/update so users receive a friendly error message instead of a database error.

## Roles

Do not use the `users` table alone for permissions.

Use:

- `user_tenant_role` for Duranki and tenant administration.
- `user_community_role` for community-level access.

This allows one user to be a Duranki admin, a tenant admin, and a member of one or more communities later without redesigning the user table.

## Transactions And Revenue Share

All money movement should write to `transactions` with:

- `tenant_id`
- `community_id`
- `user_id`
- `service_id`
- `amount`
- `transaction_fee`
- `reference`
- `status`

Revenue split should be read from `revenue_share_rule`, not hard-coded into application logic. Rules can be platform-wide, tenant-specific, community-specific, service-specific, or a combination.
