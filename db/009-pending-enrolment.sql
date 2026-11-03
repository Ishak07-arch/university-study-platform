-- A NULL group is a signed-in account awaiting roster approval.
-- Retain existing foreign keys and assignments, including the isolated demo class.
ALTER TABLE users ALTER COLUMN group_id DROP NOT NULL;
