# Duranki service configuration

Only active Duranki platform administrators configure prices, plans, commissions
and service availability. Use Service configuration to assign catalogue services
to each tenant. Assignments have revision checks and an audit history.

Tenant workspace has an Assigned services link. Tenant staff can read only their
authorized tenant's assigned services. They cannot edit prices or assignments,
and internal costs, margin shares and Duranki commission settings are excluded.
Members must still belong to the selected community; subscriptions, readiness,
payment and provider-confirmation checks remain separate.

Duranki assignments are saved in the existing MariaDB platform document under
`durankiServiceAssignments`. No schema change or automation change is required.
Until a tenant's assignments are explicitly saved here, its existing
`cycleServiceAvailability.tenants[].serviceCodes` provides the starting list.
No tenant assignment means no services. An explicitly empty assignment stays
empty and does not fall back to the old list.

Historic tenant/community pricing overrides remain stored for audit purposes
but no longer determine new prices or service enablement. Existing agreements,
applications, balances and transaction records are not rewritten. Changing
assignments does not cancel billing agreements or issue refunds.

Community service lists no longer require separate enablement. Tenant/community
inactive status still blocks availability. An assignment alone does not activate
an unconfigured service or bypass subscription or payment requirements.
