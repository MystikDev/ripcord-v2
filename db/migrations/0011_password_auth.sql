-- Add optional password hash to users table.
-- NULL for passkey-only users; populated for password-registered users.
-- Uses argon2id format (starts with $argon2id$).
ALTER TABLE users ADD COLUMN password_hash TEXT;
