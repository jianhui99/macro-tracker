-- Carb-cycling day types. kcal is derived from the macros (4/4/9) on the client,
-- so it can never disagree with them.
CREATE TABLE IF NOT EXISTS day_types (
    id      TEXT PRIMARY KEY CHECK (id IN ('high', 'medium', 'low')),
    protein REAL NOT NULL,
    carbs   REAL NOT NULL,
    fat     REAL NOT NULL
);

-- A date with no row uses the auto-calculated target
CREATE TABLE IF NOT EXISTS day_plan (
    date TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('high', 'medium', 'low'))
);

INSERT INTO day_types (id, protein, carbs, fat) VALUES
    ('high',   171, 300, 50),
    ('medium', 171, 255, 63),
    ('low',    171, 185, 78);
