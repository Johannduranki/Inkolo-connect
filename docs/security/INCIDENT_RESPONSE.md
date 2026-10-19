# Incident Response

1. Assign an incident lead and record UTC timestamps, request IDs, affected tenant scopes and symptoms. Do not paste credentials or personal documents into tickets/chat.
2. Contain the affected interface at the reverse proxy or feature boundary. Preserve unrelated tenant operations where safe. For suspected wallet/payment fraud, pause collection/settlement and retain the original provider references; do not delete or fabricate transactions.
3. Revoke affected sessions; disable confirmed compromised accounts through authorized administration. Rotate exposed signing/API secrets with the responsible provider. Coordinate MFA/billing encryption-key rotation with re-encryption to avoid making stored records unreadable.
4. Preserve protected logs and a consistent database/storage snapshot using approved access-controlled procedures. Hash forensic artifacts, restrict access, and record custody. Never commit an incident snapshot to Git.
5. Investigate account actions, authorization boundaries, provider callback signatures, replay/idempotency markers and deployment changes. Treat client-side claims and payment return URLs as untrusted evidence.
6. Repair and test with synthetic data in an isolated environment. Reconcile monetary records against authoritative Cycle/bank records before restoring collections.
7. Restore service gradually, verify tenant isolation and backups, monitor recurrence, and document root cause and regression tests.
8. Have the designated privacy/legal owner assess applicable notification obligations. No notification deadline is asserted here without jurisdiction-specific legal review.

Open ownership questions: incident lead, on-call contact, provider escalation channel, privacy officer, evidence retention and server administrator contacts must be assigned before production.
