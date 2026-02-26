-- 0015_email_verification.sql
-- Adds plaintext email column for verification and transactional emails.
-- The existing email_hash column is retained for Gravatar lookups.

ALTER TABLE users ADD COLUMN email TEXT;

-- Partial unique index: only enforced for non-null emails so existing
-- users (who registered before email was required) are unaffected.
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
