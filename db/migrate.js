// One-off import of a MacroTracker JSON export (produced by the app's "导出数据"
// button) into the SQLite database. Wipes and replaces all existing rows -
// intended for the initial migration off localStorage, not incremental sync.
//
// Usage: node db/migrate.js /path/to/macro-tracker-export.json

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { applySchema } = require('./schema');

const jsonPath = process.argv[2];
if (!jsonPath) {
    console.error('Usage: node db/migrate.js /path/to/export.json');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const dbPath = path.join(__dirname, 'macro-tracker.db');
const db = new DatabaseSync(dbPath);
applySchema(db);

db.exec('BEGIN');
try {
    db.exec('DELETE FROM achievements');
    db.exec('DELETE FROM weight_log');
    db.exec('DELETE FROM diary_entries');
    db.exec('DELETE FROM foods');
    db.exec('DELETE FROM user_settings');

    const u = data.user || { height: 183, weight: 91, age: 27, gender: 'male', activity: 1.55 };
    db.prepare(`
        INSERT INTO user_settings (id, height, weight, age, gender, activity, target_weight) VALUES (1, ?, ?, ?, ?, ?, ?)
    `).run(u.height, u.weight, u.age, u.gender, parseFloat(u.activity), u.targetWeight ?? null);

    const insertFood = db.prepare(`
        INSERT INTO foods (id, category, name, unit, kcal, protein, carbs, fat, active, last_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const f of data.foods || []) {
        insertFood.run(
            f.id, f.category || '未分类', f.name, f.unit,
            f.kcal, f.protein, f.carbs, f.fat,
            f.active === false ? 0 : 1, f.lastAmount ?? null
        );
    }

    const insertEntry = db.prepare(`
        INSERT INTO diary_entries (date, food_id, is_temporary, meal, name, raw_amount, display_amount, kcal, protein, carbs, fat)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let entryCount = 0;
    for (const [date, entries] of Object.entries(data.diary || {})) {
        for (const e of entries) {
            insertEntry.run(
                date, e.foodId ?? null, e.isTemporary ? 1 : 0, e.meal || 'snack',
                e.name, e.rawAmount, e.displayAmount, e.kcal, e.protein, e.carbs, e.fat
            );
            entryCount++;
        }
    }

    const insertAchievement = db.prepare('INSERT INTO achievements (id, unlocked_at) VALUES (?, ?)');
    for (const [id, unlockedAt] of Object.entries(data.achievements || {})) insertAchievement.run(id, unlockedAt);

    const insertWeight = db.prepare('INSERT INTO weight_log (date, weight) VALUES (?, ?)');
    for (const w of data.weights || []) insertWeight.run(w.date, w.weight);

    db.exec('COMMIT');
    console.log(`Migrated: 1 user profile, ${(data.foods || []).length} foods, ${entryCount} diary entries -> ${dbPath}`);
} catch (err) {
    db.exec('ROLLBACK');
    throw err;
}
