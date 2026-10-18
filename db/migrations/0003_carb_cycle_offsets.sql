-- Day types become carb/fat offsets from the auto-calculated plan, so they follow weight changes.
-- Protein and the base kcal always come from the auto plan. Replacing the table is safe:
-- 0002 only ever held its seeded defaults.
DROP TABLE IF EXISTS day_types;
CREATE TABLE day_types (
    id           TEXT PRIMARY KEY CHECK (id IN ('high', 'medium', 'low')),
    carbs_offset REAL NOT NULL,
    fat_offset   REAL NOT NULL
);

INSERT INTO day_types (id, carbs_offset, fat_offset) VALUES
    ('high',    45, -13),
    ('medium',   0,   0),
    ('low',    -70,  15);
