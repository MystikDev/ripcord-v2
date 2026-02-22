-- 0009_hub_icon.sql
-- Add icon_url column to hubs table for hub brand icons.
-- NULL = no icon (use letter fallback in the UI).

ALTER TABLE hubs ADD COLUMN icon_url TEXT;
