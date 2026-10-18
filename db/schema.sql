-- Single-user settings row (id is always 1)
CREATE TABLE IF NOT EXISTS user_settings (
    id       INTEGER PRIMARY KEY CHECK (id = 1),
    height   REAL    NOT NULL,
    weight   REAL    NOT NULL,
    age      INTEGER NOT NULL,
    gender   TEXT    NOT NULL,
    activity REAL    NOT NULL,
    target_weight REAL
);

CREATE TABLE IF NOT EXISTS foods (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    name        TEXT NOT NULL,
    unit        TEXT NOT NULL,
    kcal        REAL NOT NULL,
    protein     REAL NOT NULL,
    carbs       REAL NOT NULL,
    fat         REAL NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    last_amount REAL
);

-- food_id is a loose reference (not a FK): temporary entries use a synthetic
-- "temp_..." id with no matching food row, and deleting a food must not
-- touch historical entries, which store their own macro snapshot already.
CREATE TABLE IF NOT EXISTS diary_entries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    date           TEXT NOT NULL,
    food_id        TEXT,
    is_temporary   INTEGER NOT NULL DEFAULT 0,
    meal           TEXT NOT NULL DEFAULT 'snack',
    name           TEXT NOT NULL,
    raw_amount     REAL NOT NULL,
    display_amount TEXT NOT NULL,
    kcal           REAL NOT NULL,
    protein        REAL NOT NULL,
    carbs          REAL NOT NULL,
    fat            REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diary_date ON diary_entries(date);
CREATE INDEX IF NOT EXISTS idx_diary_food ON diary_entries(food_id);

-- One row per unlocked tier ("series:threshold"). Kept permanently: the stats that
-- earned a badge can later drop (targets change, entries get deleted), and earned
-- badges must never be revoked.
CREATE TABLE IF NOT EXISTS achievements (
    id          TEXT PRIMARY KEY,
    unlocked_at TEXT NOT NULL
);

-- One weigh-in per day; logging the same date again overwrites it
CREATE TABLE IF NOT EXISTS weight_log (
    date   TEXT PRIMARY KEY,
    weight REAL NOT NULL
);
