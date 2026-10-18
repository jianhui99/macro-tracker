-- One row per drink so a mistaken tap can be removed on its own. time is the client's local HH:MM.
CREATE TABLE IF NOT EXISTS water_log (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT,
    ml   REAL NOT NULL CHECK (ml > 0)
);
CREATE INDEX IF NOT EXISTS idx_water_date ON water_log(date);
