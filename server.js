const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { applySchema } = require('./db/schema');

const DB_PATH = path.join(__dirname, 'db', 'macro-tracker.db');
const db = new DatabaseSync(DB_PATH);
applySchema(db);

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

function getUser() {
    const u = db.prepare('SELECT * FROM user_settings WHERE id = 1').get();
    return { height: u.height, weight: u.weight, age: u.age, gender: u.gender, activity: u.activity, targetWeight: u.target_weight };
}

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// ── Full state bootstrap ──
app.get('/api/state', (req, res) => {
    const foods = db.prepare('SELECT * FROM foods').all().map(foodToJson);
    const entryRows = db.prepare('SELECT * FROM diary_entries ORDER BY id').all();

    const diary = {};
    for (const row of entryRows) {
        if (!diary[row.date]) diary[row.date] = [];
        diary[row.date].push(entryToJson(row));
    }

    const achievements = Object.fromEntries(
        db.prepare('SELECT id, unlocked_at FROM achievements').all().map(r => [r.id, r.unlocked_at]));
    const weights = db.prepare('SELECT date, weight FROM weight_log ORDER BY date').all()
        .map(r => ({ date: r.date, weight: r.weight }));

    res.json({ user: getUser(), foods, diary, achievements, weights });
});

// ── User settings ──
app.put('/api/user', (req, res) => {
    const { height, weight, age, gender, activity } = req.body;
    const targetWeight = req.body.targetWeight == null ? null : Number(req.body.targetWeight);
    if (targetWeight !== null && !(targetWeight >= 20 && targetWeight <= 400)) {
        return res.status(400).json({ error: 'targetWeight must be null or between 20 and 400' });
    }
    db.prepare(`
        INSERT INTO user_settings (id, height, weight, age, gender, activity, target_weight) VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET height = excluded.height, weight = excluded.weight,
            age = excluded.age, gender = excluded.gender, activity = excluded.activity,
            target_weight = excluded.target_weight
    `).run(height, weight, age, gender, activity, targetWeight);
    // The weight log is the source of truth for weight whenever it has entries
    res.json(syncSettingsWeight());
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

// ── Weight log ──
// The latest weigh-in drives the daily targets, so every change re-syncs user_settings.weight
function syncSettingsWeight() {
    const latest = db.prepare('SELECT weight FROM weight_log ORDER BY date DESC LIMIT 1').get();
    if (latest) db.prepare('UPDATE user_settings SET weight = ? WHERE id = 1').run(latest.weight);
    return getUser();
}

app.put('/api/weights/:date', (req, res) => {
    const { date } = req.params;
    const weight = Number(req.body.weight);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(weight >= 20 && weight <= 400)) {
        return res.status(400).json({ error: 'expected date YYYY-MM-DD and weight between 20 and 400' });
    }
    db.prepare(`
        INSERT INTO weight_log (date, weight) VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET weight = excluded.weight
    `).run(date, weight);
    res.json({ entry: { date, weight }, user: syncSettingsWeight() });
});

app.delete('/api/weights/:date', (req, res) => {
    db.prepare('DELETE FROM weight_log WHERE date = ?').run(req.params.date);
    res.json({ user: syncSettingsWeight() });
});

// ── Achievements ──
// Idempotent: a tier that is already unlocked keeps its original date
app.post('/api/achievements', (req, res) => {
    const { unlocks } = req.body;
    const valid = Array.isArray(unlocks) && unlocks.every(u =>
        typeof u?.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(u?.date ?? ''));
    if (!valid) return res.status(400).json({ error: 'unlocks must be [{ id, date: "YYYY-MM-DD" }]' });

    const insert = db.prepare('INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, ?)');
    for (const { id, date } of unlocks) insert.run(id, date);
    res.status(204).end();
});

// ── Quote of the day ──
// English comes from ZenQuotes, proxied because it sends no CORS headers; caching per local day
// means one upstream call a day (the free tier allows 5 requests / 30 s) and the same quote on every
// reload. Chinese rotates through a curated literary list: open Chinese quote APIs (e.g. Hitokoto)
// are user-submitted and mostly web-novel or meme lines.
const ZH_QUOTES = [
    { text: '黑夜给了我黑色的眼睛，我却用它寻找光明。', author: '顾城《一代人》' },
    { text: '草在结它的种子，风在摇它的叶子。我们站着，不说话，就十分美好。', author: '顾城《门前》' },
    { text: '从明天起，做一个幸福的人，喂马，劈柴，周游世界。', author: '海子《面朝大海，春暖花开》' },
    { text: '从前的日色变得慢，车，马，邮件都慢，一生只够爱一个人。', author: '木心《从前慢》' },
    { text: '岁月不饶人，我亦未曾饶过岁月。', author: '木心《云雀叫了一整天》' },
    { text: '一个人只拥有此生此世是不够的，他还应该拥有诗意的世界。', author: '王小波《万寿寺》' },
    { text: '你站在桥上看风景，看风景人在楼上看你。', author: '卞之琳《断章》' },
    { text: '人生最好的境界是丰富的安静。', author: '周国平《丰富的安静》' },
    { text: '慢慢走，欣赏啊！', author: '朱光潜《谈美》' },
    { text: '人是为活着本身而活着，而不是为了活着之外的任何事物所活着。', author: '余华《活着》' },
    { text: '在隆冬，我终于知道，我身上有一个不可战胜的夏天。', author: '加缪《重返蒂巴萨》' },
    { text: '我们必须想象西西弗是幸福的。', author: '加缪《西西弗神话》' },
    { text: '世界以痛吻我，要我报之以歌。', author: '泰戈尔《飞鸟集》' },
    { text: '生如夏花之绚烂，死如秋叶之静美。', author: '泰戈尔《飞鸟集》' },
    { text: '如果你因失去了太阳而流泪，那么你也将失去群星了。', author: '泰戈尔《飞鸟集》' },
    { text: '一个人可以被毁灭，但不能被打败。', author: '海明威《老人与海》' },
    { text: '生活总是让我们遍体鳞伤，但到后来，那些受伤的地方一定会变成我们最强壮的地方。', author: '海明威《永别了，武器》' },
    { text: '每一个不曾起舞的日子，都是对生命的辜负。', author: '尼采《查拉图斯特拉如是说》' },
    { text: '一个人知道自己为什么而活，就可以忍受任何一种生活。', author: '尼采《偶像的黄昏》' },
    { text: '世界上只有一种真正的英雄主义，那就是在认清生活的真相后依然热爱生活。', author: '罗曼·罗兰《米开朗琪罗传》' },
    { text: '生活不是我们活过的日子，而是我们记住的日子。', author: '马尔克斯《活着为了讲述》' },
    { text: '我们都生活在阴沟里，但仍有人仰望星空。', author: '王尔德《温德米尔夫人的扇子》' },
    { text: '万物皆有裂痕，那是光照进来的地方。', author: '莱昂纳德·科恩《颂歌》' },
    { text: '心有猛虎，细嗅蔷薇。', author: '萨松《于我，过去，现在以及未来》' },
    { text: '凡是过往，皆为序章。', author: '莎士比亚《暴风雨》' },
    { text: '假如生活欺骗了你，不要悲伤，不要心急！', author: '普希金《假如生活欺骗了你》' },
    { text: '生活是一种绵延不绝的渴望，渴望不断上升，变得更伟大而高贵。', author: '杜伽尔《蒂伯一家》' },
    { text: '风会熄灭蜡烛，却能使火越烧越旺。', author: '拉罗什福科《箴言集》' }
];
const FALLBACK_QUOTES = [
    { text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier' },
    { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
    { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
    { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
    { text: 'Take care of your body. It is the only place you have to live.', author: 'Jim Rohn' },
    { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant' },
    { text: 'Motivation is what gets you started. Habit is what keeps you going.', author: 'Jim Ryun' }
];
let quoteCache = null;

app.get('/api/quote', async (req, res) => {
    const today = new Date().toLocaleDateString('sv');
    // Local-day index, so both rotations switch at local midnight rather than UTC midnight
    const dayIndex = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86400000);
    const zh = ZH_QUOTES[dayIndex % ZH_QUOTES.length];
    if (quoteCache?.date === today) return res.json({ ...quoteCache.quote, zh });
    try {
        const upstream = await fetch('https://zenquotes.io/api/today', { signal: AbortSignal.timeout(5000) });
        if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
        const [first] = await upstream.json();
        if (!first?.q || !first?.a) throw new Error('unexpected payload');
        // Rate-limited calls still return 200, with the limit notice as the "quote"
        if (first.a === 'zenquotes.io') throw new Error(first.q);
        // Only pass through ZenQuotes-hosted author photos
        const image = typeof first.i === 'string' && first.i.startsWith('https://zenquotes.io/') ? first.i : null;
        quoteCache = { date: today, quote: { text: first.q, author: first.a, image, source: 'zenquotes' } };
        res.json({ ...quoteCache.quote, zh });
    } catch (err) {
        console.error(`[quote] ZenQuotes fetch failed for ${today}: ${err.message}`);
        const fallback = FALLBACK_QUOTES[dayIndex % FALLBACK_QUOTES.length];
        res.json({ ...fallback, source: 'local', zh });
    }
});

const PORT = process.env.PORT || 8877;
app.listen(PORT, () => {
    console.log(`MacroTracker server running at http://localhost:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
});
