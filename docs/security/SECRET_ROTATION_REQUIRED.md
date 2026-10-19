# Secret Rotation Required

No secret values are included here.

- Cycle Pay live notification secret, paywall signing secret and API caller password were shown in an earlier user-supplied screenshot. Treat them as exposed and rotate with Cycle before any live collection. Do not reuse the screenshot values in source or examples.
- Review database, JWT, ID-pepper, local administrator, SMTP/cloud and deployment credentials against repository history and any past shared configuration. A pattern scan cannot certify generic passwords are absent. Rotate confirmed exposed credentials through their owner, not by guessing new values in code.
- A runtime personal-data JSON file was tracked; it is now removed from the Git index but retained locally. Review remote/history contents and access permissions. Untracking does not erase historical copies. Do not rewrite shared history without a coordinated repository-owner plan and backup.
- Audit all backups and server environment files for access control. Verify no secrets are embedded in CI artifacts or frontend bundles.
- JWT-key rotation invalidates sessions. ID-pepper rotation affects lookup identifiers and requires a migration. MFA and recurring-profile encryption-key rotation requires controlled re-encryption, not replacement/deletion. Preserve authorized recovery access.

No live credentials were rotated automatically in this hardening batch. Developer/operator action is required; never send passwords, private keys or authenticator codes in chat.
