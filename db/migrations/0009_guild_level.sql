-- The guild lists each member's current level. Levels are computed on the client, which reports the current one
-- whenever it changes (max_level, the skin unlock record, still only rises).
ALTER TABLE user_settings ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1);
