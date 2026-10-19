-- Additive storage expansion; preserves every existing credential.
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;
