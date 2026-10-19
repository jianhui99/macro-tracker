CREATE TABLE invitations (
    code_hash TEXT PRIMARY KEY,
    max_uses INTEGER NOT NULL CHECK (max_uses BETWEEN 1 AND 100),
    uses INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    nickname TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    disabled INTEGER NOT NULL DEFAULT 0,
    onboarded INTEGER NOT NULL DEFAULT 0,
    draft TEXT NOT NULL DEFAULT '{}',
    diary_sequence INTEGER NOT NULL DEFAULT 0,
    water_sequence INTEGER NOT NULL DEFAULT 0,
    invite_hash TEXT REFERENCES invitations(code_hash),
    created_at INTEGER NOT NULL
);
INSERT INTO accounts (id, nickname, role, onboarded, created_at)
VALUES ('owner', '冒险者', 'admin', 1, unixepoch());

CREATE TRIGGER consume_invitation BEFORE INSERT ON accounts WHEN NEW.id != 'owner'
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM invitations WHERE code_hash = NEW.invite_hash AND disabled = 0 AND uses < max_uses
    ) THEN RAISE(ABORT, 'invite_unavailable') END;
    UPDATE invitations SET uses = uses + 1 WHERE code_hash = NEW.invite_hash;
END;

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES accounts(id),
    csrf TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    authenticated_at INTEGER NOT NULL,
    admin_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE admin_gates (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL REFERENCES accounts(id),
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
);
CREATE TABLE game_rules (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, config TEXT NOT NULL);

CREATE TABLE user_settings_new (
    user_id TEXT PRIMARY KEY REFERENCES accounts(id),
    height REAL NOT NULL, weight REAL NOT NULL, age INTEGER NOT NULL, gender TEXT NOT NULL,
    activity REAL NOT NULL, target_weight REAL, water_target REAL, last_water_ml REAL, last_water_unit TEXT
);
INSERT INTO user_settings_new SELECT 'owner', height, weight, age, gender, activity, target_weight, water_target, last_water_ml, last_water_unit FROM user_settings;
DROP TABLE user_settings;
ALTER TABLE user_settings_new RENAME TO user_settings;

CREATE TABLE foods_new (
    user_id TEXT NOT NULL REFERENCES accounts(id), id TEXT NOT NULL,
    category TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL,
    kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, last_amount REAL, PRIMARY KEY (user_id, id)
);
INSERT INTO foods_new SELECT 'owner', * FROM foods;
DROP TABLE foods;
ALTER TABLE foods_new RENAME TO foods;

CREATE TABLE diary_entries_new (
    user_id TEXT NOT NULL REFERENCES accounts(id), id INTEGER NOT NULL,
    date TEXT NOT NULL, food_id TEXT, is_temporary INTEGER NOT NULL DEFAULT 0,
    meal TEXT NOT NULL DEFAULT 'snack', name TEXT NOT NULL, raw_amount REAL NOT NULL,
    display_amount TEXT NOT NULL, kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
    PRIMARY KEY (user_id, id)
);
INSERT INTO diary_entries_new SELECT 'owner', * FROM diary_entries;
DROP TABLE diary_entries;
ALTER TABLE diary_entries_new RENAME TO diary_entries;
CREATE INDEX idx_diary_date ON diary_entries(user_id, date);
CREATE INDEX idx_diary_food ON diary_entries(user_id, food_id);

CREATE TABLE achievements_new (
    user_id TEXT NOT NULL REFERENCES accounts(id), id TEXT NOT NULL, unlocked_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);
INSERT INTO achievements_new SELECT 'owner', * FROM achievements;
DROP TABLE achievements;
ALTER TABLE achievements_new RENAME TO achievements;

CREATE TABLE weight_log_new (
    user_id TEXT NOT NULL REFERENCES accounts(id), date TEXT NOT NULL, weight REAL NOT NULL,
    PRIMARY KEY (user_id, date)
);
INSERT INTO weight_log_new SELECT 'owner', * FROM weight_log;
DROP TABLE weight_log;
ALTER TABLE weight_log_new RENAME TO weight_log;

CREATE TABLE day_types_new (
    user_id TEXT NOT NULL REFERENCES accounts(id), id TEXT NOT NULL CHECK (id IN ('high', 'medium', 'low')),
    carbs_offset REAL NOT NULL, fat_offset REAL NOT NULL, PRIMARY KEY (user_id, id)
);
INSERT INTO day_types_new SELECT 'owner', * FROM day_types;
DROP TABLE day_types;
ALTER TABLE day_types_new RENAME TO day_types;

CREATE TABLE day_plan_new (
    user_id TEXT NOT NULL REFERENCES accounts(id), date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('high', 'medium', 'low')), PRIMARY KEY (user_id, date)
);
INSERT INTO day_plan_new SELECT 'owner', * FROM day_plan;
DROP TABLE day_plan;
ALTER TABLE day_plan_new RENAME TO day_plan;

CREATE TABLE water_log_new (
    user_id TEXT NOT NULL REFERENCES accounts(id), id INTEGER NOT NULL,
    date TEXT NOT NULL, time TEXT, ml REAL NOT NULL CHECK (ml > 0), PRIMARY KEY (user_id, id)
);
INSERT INTO water_log_new SELECT 'owner', * FROM water_log;
DROP TABLE water_log;
ALTER TABLE water_log_new RENAME TO water_log;
CREATE INDEX idx_water_date ON water_log(user_id, date);

UPDATE accounts SET diary_sequence = (SELECT COALESCE(MAX(id), 0) FROM diary_entries),
    water_sequence = (SELECT COALESCE(MAX(id), 0) FROM water_log) WHERE id = 'owner';
