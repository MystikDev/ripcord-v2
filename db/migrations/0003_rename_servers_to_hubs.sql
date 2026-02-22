-- Rename "servers" to "hubs" throughout the schema
ALTER TABLE servers RENAME TO hubs;
ALTER TABLE server_members RENAME TO hub_members;

-- Rename server_id columns to hub_id
ALTER TABLE channels RENAME COLUMN server_id TO hub_id;
ALTER TABLE roles RENAME COLUMN server_id TO hub_id;
ALTER TABLE member_roles RENAME COLUMN server_id TO hub_id;
ALTER TABLE hub_members RENAME COLUMN server_id TO hub_id;

-- Rename indexes that referenced old names
ALTER INDEX IF EXISTS idx_server_members_user RENAME TO idx_hub_members_user;
