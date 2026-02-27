-- Add optional color column to roles for customizable role badge colors
ALTER TABLE roles ADD COLUMN color TEXT DEFAULT NULL;
