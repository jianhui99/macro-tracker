CREATE TABLE user_onboarding (
    user_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    presented INTEGER NOT NULL DEFAULT 0 CHECK (presented IN (0, 1)),
    targets INTEGER NOT NULL DEFAULT 0 CHECK (targets IN (0, 1)),
    meal INTEGER NOT NULL DEFAULT 0 CHECK (meal IN (0, 1)),
    water INTEGER NOT NULL DEFAULT 0 CHECK (water IN (0, 1)),
    growth INTEGER NOT NULL DEFAULT 0 CHECK (growth IN (0, 1))
);
