-- Allow attachments to be created before a message exists (pending uploads).
-- The message_id gets set when the user sends the message.
ALTER TABLE attachments ALTER COLUMN message_id DROP NOT NULL;

-- Add ATTACH_FILES (bit 11 = 2048) to all existing @everyone roles.
-- Current default is VIEW_CHANNELS|SEND_MESSAGES|CONNECT_VOICE|SPEAK_VOICE = 771.
-- New default = 771 | 2048 = 2819.
UPDATE roles
SET bitset_permissions = (CAST(bitset_permissions AS BIGINT) | 2048)::TEXT
WHERE name = '@everyone';
