const express = require('express');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'db', 'macro-tracker.db');
const db = new DatabaseSync(DB_PATH);
db.exec(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));

// Seed defaults on a brand-new database so the app works before any migration runs
db.exec(`
    INSERT OR IGNORE INTO user_settings (id, height, weight, age, gender, activity)
    VALUES (1, 183, 91, 27, 'male', 1.55)
`);
const foodCount = db.prepare('SELECT COUNT(*) AS n FROM foods').get().n;
if (foodCount === 0) {
    const DEFAULT_FOODS = [
        { id: "1",   category: "补剂",   name: "蛋白粉",          unit: "1 scoop", kcal: 122, protein: 24,  carbs: 3,    fat: 1.5 },
        { id: "2",   category: "蛋畜类", name: "鸡蛋 (A 牌大号)", unit: "1 粒",    kcal: 140, protein: 13,  carbs: 2.5,  fat: 8.5 },
        { id: "2_b", category: "蛋畜类", name: "鸡蛋 (B 牌普通)", unit: "1 粒",    kcal: 130, protein: 12,  carbs: 2.0,  fat: 7.8 },
        { id: "3",   category: "蛋畜类", name: "鸡胸肉",          unit: "100g",    kcal: 120, protein: 23,  carbs: 0,    fat: 1   },
        { id: "4",   category: "主食谷物",name: "米饭",           unit: "100g",    kcal: 120, protein: 2,   carbs: 25,   fat: 0.3 },
        { id: "5",   category: "主食谷物",name: "燕麦",           unit: "35g",     kcal: 133, protein: 4.3, carbs: 20.3, fat: 3.2 }
    ];
    const insert = db.prepare(`
        INSERT INTO foods (id, category, name, unit, kcal, protein, carbs, fat, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const f of DEFAULT_FOODS) insert.run(f.id, f.category, f.name, f.unit, f.kcal, f.protein, f.carbs, f.fat);
}

// ── Row <-> API shape mapping (keeps the frontend's `state` object unchanged) ──
function foodToJson(row) {
    return {
        id: row.id, category: row.category, name: row.name, unit: row.unit,
        kcal: row.kcal, protein: row.protein, carbs: row.carbs, fat: row.fat,
        active: !!row.active, lastAmount: row.last_amount
    };
}
function entryToJson(row) {
    return {
        id: row.id, foodId: row.food_id, isTemporary: !!row.is_temporary, meal: row.meal,
        name: row.name, rawAmount: row.raw_amount, displayAmount: row.display_amount,
        kcal: row.kcal, protein: row.protein, carbs: row.carbs, fat: row.fat
    };
}

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// ── Full state bootstrap ──
app.get('/api/state', (req, res) => {
    const user = db.prepare('SELECT * FROM user_settings WHERE id = 1').get();
    const foods = db.prepare('SELECT * FROM foods').all().map(foodToJson);
    const entryRows = db.prepare('SELECT * FROM diary_entries ORDER BY id').all();

    const diary = {};
    for (const row of entryRows) {
        if (!diary[row.date]) diary[row.date] = [];
        diary[row.date].push(entryToJson(row));
    }

    res.json({
        user: { height: user.height, weight: user.weight, age: user.age, gender: user.gender, activity: user.activity },
        foods,
        diary
    });
});

// ── User settings ──
app.put('/api/user', (req, res) => {
    const { height, weight, age, gender, activity } = req.body;
    db.prepare(`
        INSERT INTO user_settings (id, height, weight, age, gender, activity) VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET height = excluded.height, weight = excluded.weight,
            age = excluded.age, gender = excluded.gender, activity = excluded.activity
    `).run(height, weight, age, gender, activity);
    res.json({ height, weight, age, gender, activity });
});

// ── Foods (warehouse) ──
app.post('/api/foods', (req, res) => {
    const { category, name, unit, kcal, protein, carbs, fat } = req.body;
    const id = Date.now().toString();
    db.prepare(`
        INSERT INTO foods (id, category, name, unit, kcal, protein, carbs, fat, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, category, name, unit, kcal, protein, carbs, fat);
    res.status(201).json(foodToJson(db.prepare('SELECT * FROM foods WHERE id = ?').get(id)));
});

app.put('/api/foods/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM foods WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'food not found' });

    const { category, name, unit, kcal, protein, carbs, fat } = req.body;
    db.prepare(`
        UPDATE foods SET category = ?, name = ?, unit = ?, kcal = ?, protein = ?, carbs = ?, fat = ?
        WHERE id = ?
    `).run(category, name, unit, kcal, protein, carbs, fat, id);

    // Cascade: recompute macros for every historical (non-temporary) entry referencing this food,
    // scaled by each entry's own raw_amount against the food's new base unit
    const baseAmount = parseFloat(unit) || 1;
    const unitText = unit.replace(/[0-9.]/g, '') || '单位';
    const affected = db.prepare('SELECT * FROM diary_entries WHERE food_id = ? AND is_temporary = 0').all(id);
    const updateEntry = db.prepare(`
        UPDATE diary_entries SET name = ?, display_amount = ?, kcal = ?, protein = ?, carbs = ?, fat = ?
        WHERE id = ?
    `);
    const updatedEntries = [];
    for (const entry of affected) {
        const multiplier = entry.raw_amount / baseAmount;
        const next = {
            name, displayAmount: entry.raw_amount + unitText,
            kcal: kcal * multiplier, protein: protein * multiplier,
            carbs: carbs * multiplier, fat: fat * multiplier
        };
        updateEntry.run(next.name, next.displayAmount, next.kcal, next.protein, next.carbs, next.fat, entry.id);
        updatedEntries.push({ id: entry.id, date: entry.date, ...next });
    }

    res.json({ food: foodToJson(db.prepare('SELECT * FROM foods WHERE id = ?').get(id)), updatedEntries });
});

app.patch('/api/foods/:id/active', (req, res) => {
    const { id } = req.params;
    const { active } = req.body;
    const result = db.prepare('UPDATE foods SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    if (result.changes === 0) return res.status(404).json({ error: 'food not found' });
    res.json(foodToJson(db.prepare('SELECT * FROM foods WHERE id = ?').get(id)));
});

app.delete('/api/foods/:id', (req, res) => {
    db.prepare('DELETE FROM foods WHERE id = ?').run(req.params.id);
    res.status(204).end();
});

// ── Diary entries ──
app.post('/api/diary', (req, res) => {
    const { date, foodId, isTemporary, meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat } = req.body;
    const result = db.prepare(`
        INSERT INTO diary_entries (date, food_id, is_temporary, meal, name, raw_amount, display_amount, kcal, protein, carbs, fat)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, foodId ?? null, isTemporary ? 1 : 0, meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat);

    if (!isTemporary && foodId) {
        db.prepare('UPDATE foods SET last_amount = ? WHERE id = ?').run(rawAmount, foodId);
    }

    res.status(201).json(entryToJson(db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(result.lastInsertRowid)));
});

app.put('/api/diary/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'entry not found' });

    const { meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat } = req.body;
    db.prepare(`
        UPDATE diary_entries SET meal = ?, name = ?, raw_amount = ?, display_amount = ?, kcal = ?, protein = ?, carbs = ?, fat = ?
        WHERE id = ?
    `).run(meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat, id);

    res.json(entryToJson(db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(id)));
});

app.delete('/api/diary/:id', (req, res) => {
    db.prepare('DELETE FROM diary_entries WHERE id = ?').run(req.params.id);
    res.status(204).end();
});

const PORT = process.env.PORT || 8877;
app.listen(PORT, () => {
    console.log(`MacroTracker server running at http://localhost:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
});
