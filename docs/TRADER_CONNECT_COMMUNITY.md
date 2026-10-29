# Trader Connect community

The active hierarchy is Duranki -> Inkolo Connect -> Trader Connect.
Trader Connect is one community, not a tenant or a collection of regional
communities. Province/region and town/city are member address attributes.

Registration and profile editing save street address, town/city, province/region,
postal code and country to MariaDB. Regions are not guessed from names, postal
codes or IP addresses. Community reports offer region and town filters from the
saved profiles, including "Not provided" for incomplete historical addresses.
These filters do not change memberships, grants, prices or authorization.

## Existing records

On startup, the platform-document adapter applies `trader-community-v1` once,
inside the existing atomic MariaDB document update. It retains a configuration
snapshot in that same private database, never in Git. A failed write rolls back.
No database, account, balance, payment or training record is deleted.

- `tenant-inkolo` is the parent tenant, displayed as Inkolo Connect.
- `community-ilembe-traders` and `trader-ilembe` remain compatible identifiers
  for Trader Connect. Older regional community identifiers remain aliases.
- Active memberships are reparented; original identifiers remain recorded.
  Multiple historical memberships appear as one community in member navigation.
- Existing Trader tenant price overrides become community overrides. Existing
  explicit community prices take precedence. The original configuration is
  retained in the private migration snapshot.
- Existing course, wholesale and heritage storage namespaces retain their
  historical IDs. They are compatibility keys, not additional active tenants.
- Historical payment rows retain their original tenant and community IDs.
  Community reports include those historical rows without rewriting money.
- Legacy Trader staff permissions apply only to Trader Connect. They do not
  become tenant-wide Inkolo staff grants. Staff administration for Inkolo still
  requires an explicit Inkolo permission assignment.

The hierarchy does not require changes to GitHub Actions, Apache, Docker ports,
environment secrets or existing database migrations. Apply normal release
verification before a requested push. Registration, login, address persistence
and migration checks must use disposable synthetic data, never real ID documents.
