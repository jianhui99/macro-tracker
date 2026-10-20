-- Hero skins follow level titles. skin is the one the player picked (NULL wears the current level's);
-- max_level is the highest level ever reached, which only rises, so a skin stays unlocked if the level drops.
ALTER TABLE user_settings ADD COLUMN skin INTEGER CHECK (skin BETWEEN 1 AND 30);
ALTER TABLE user_settings ADD COLUMN max_level INTEGER NOT NULL DEFAULT 1 CHECK (max_level >= 1);
