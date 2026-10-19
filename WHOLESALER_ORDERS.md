# Wholesaler Orders

Available within Buy and Sell and from the tenant/platform administration links.
Direct route: `/dashboard/wholesaler-orders` (administration: `?admin=1`).

## Administration

- Tenant administrators with `users.manage` manage their tenant only; platform administrators can choose a tenant.
- Create a wholesaler with its name, contact/ordering instructions and availability.
- Create product offers with ordering unit, unit price in ZAR, discount percentage, closing date, and either a minimum quantity or minimum order-value threshold.
- Confirm supplier account applications manually and record the actual supplier account reference before approving.
- Close a community group once its threshold is reached. This locks each participant's discounted quote. Create a new offer for the next campaign.
- Submit orders to the supplier outside the app, record the supplier order reference, then mark them fulfilled. Cancelling locked orders requires administrator handling and supplier coordination.

## Traders

- Buy and Sell must be enabled for both their tenant and joined community.
- All traders in eligible communities may browse normal prices without a subscription. Discount prices require an active, paid, live Cycle Pay Buy and Sell subscription for that tenant/community. Free, pending, expired or test subscriptions do not qualify. Individual orders check eligibility when placed; group orders check each participant again at closure. Historical locked prices remain unchanged.
- Apply for a wholesaler account, then order after manual approval.
- Choose an individual order or contribute to the community's pooled order for an offer.
- Discounts are calculated server-side in cents. Group totals are estimates until the administrator closes the group.
- Members see only their own applications and orders, plus anonymous group totals.

## Manual Fulfilment Boundary

This release does not open external supplier accounts automatically, reserve stock, dispatch orders, collect payments, or connect Makro, Shoprite or any other supplier. Administrators must confirm supplier acceptance, delivery, stock and final arrangements manually. There is no active supplier API configuration; integrations require developer implementation. Cycle Pay and MariaDB network settings are unchanged.

Orders, supplier accounts, offers and audit events use the existing platform SQL document adapter. No schema migration or existing-record rewrite is required. Offers cannot be repriced after receiving orders. Request IDs protect order retries against duplicates.

## Verification (2026-10-18)

- 11 focused wholesaler unit tests passed; the two threshold tests passed again after closed-group hardening.
- Angular production build passed (existing bundle-size warning remains).
- Isolated SQL staging: two synthetic traders, supplier approval, pooled discount, duplicate protection, manual submission/fulfilment, tenant boundaries, member privacy, and unchanged identity/wallet/permission records passed.
- Main API/frontend activation was user-approved. All seven SQL-backed services returned healthy after activation. Only the authentication-session table changed in the before/after SQL fingerprints; business tables were unchanged.

Supplier commercial terms and actual integration testing are not certified by these local checks.
