import { validateBackup } from '../../public/js/backup-format.js';
import { handleAuth, requireSession } from '../../lib/auth.js';
import { fail, json, rateLimit, readBody } from '../../lib/http.js';
import { saveProfile, validateProfile, validateEntry, validDate } from '../../lib/account.js';
import { handleAdmin, getRules } from '../../lib/admin.js';

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
function userToJson(u) {
    return { height: u.height, weight: u.weight, age: u.age, gender: u.gender, activity: u.activity, targetWeight: u.target_weight, waterTarget: u.water_target,
        lastWater: u.last_water_ml == null ? null : { ml: u.last_water_ml, unit: u.last_water_unit } };
}

const noContent = () => new Response(null, { status: 204 });
const DAY_TYPE_IDS = ['high', 'medium', 'low'];

// ── Full state bootstrap ──
async function getState({ db, userId }) {
    const [foods, entries, achievements, weights, user, dayTypes, dayPlan, water] = await db.batch([
        db.prepare('SELECT * FROM foods WHERE user_id = ?').bind(userId),
        db.prepare('SELECT * FROM diary_entries WHERE user_id = ? ORDER BY id').bind(userId),
        db.prepare('SELECT id, unlocked_at FROM achievements WHERE user_id = ?').bind(userId),
        db.prepare('SELECT date, weight FROM weight_log WHERE user_id = ? ORDER BY date').bind(userId),
        db.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(userId),
        db.prepare('SELECT id, carbs_offset AS carbs, fat_offset AS fat FROM day_types WHERE user_id = ?').bind(userId),
        db.prepare('SELECT date, type FROM day_plan WHERE user_id = ?').bind(userId),
        db.prepare('SELECT id, date, time, ml FROM water_log WHERE user_id = ? ORDER BY id').bind(userId)
    ]);

    const diary = {};
    for (const row of entries.results) {
        if (!diary[row.date]) diary[row.date] = [];
        diary[row.date].push(entryToJson(row));
    }
    const waterByDate = {};
    for (const { date, ...drink } of water.results) (waterByDate[date] ||= []).push(drink);

    return json({
        user: userToJson(user.results[0]),
        foods: foods.results.map(foodToJson),
        diary,
        achievements: Object.fromEntries(achievements.results.map(r => [r.id, r.unlocked_at])),
        weights: weights.results,
        dayTypes: Object.fromEntries(dayTypes.results.map(({ id, ...macros }) => [id, macros])),
        dayPlan: Object.fromEntries(dayPlan.results.map(r => [r.date, r.type])),
        water: waterByDate
    });
}

async function importState({ db, userId, body }) {
    try { validateBackup(body); } catch (err) { return json({ error: err.message }, 400); }
    const { user: u, foods, diary, achievements, weights, dayTypes, dayPlan, water } = body;
    const tables = [
        ['user_settings', 'height,weight,age,gender,activity,target_weight,water_target,last_water_ml,last_water_unit',
            [[u.height, u.weight, u.age, u.gender, u.activity, u.targetWeight ?? null, u.waterTarget ?? null, u.lastWater?.ml ?? null, u.lastWater?.unit ?? null]]],
        ['foods', 'id,category,name,unit,kcal,protein,carbs,fat,active,last_amount',
            foods.map(f => [f.id, f.category, f.name, f.unit, f.kcal, f.protein, f.carbs, f.fat, Number(f.active), f.lastAmount ?? null])],
        ['diary_entries', 'id,date,food_id,is_temporary,meal,name,raw_amount,display_amount,kcal,protein,carbs,fat',
            Object.entries(diary).flatMap(([date, entries]) => entries.map(e => [e.id, date, e.foodId ?? null, Number(e.isTemporary), e.meal, e.name, e.rawAmount, e.displayAmount, e.kcal, e.protein, e.carbs, e.fat]))],
        ['achievements', 'id,unlocked_at', Object.entries(achievements)],
        ['weight_log', 'date,weight', weights.map(w => [w.date, w.weight])],
        ['day_types', 'id,carbs_offset,fat_offset', Object.entries(dayTypes).map(([id, t]) => [id, t.carbs, t.fat])],
        ['day_plan', 'date,type', Object.entries(dayPlan)],
        ['water_log', 'id,date,time,ml', Object.entries(water).flatMap(([date, drinks]) => drinks.map(w => [w.id, date, w.time ?? null, w.ml]))]
    ];
    if (tables.reduce((sum, [, , rows]) => sum + rows.length, 0) > 50000) return json({ error: 'too_many_records' }, 413);
    const statements = tables.map(([table]) => db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId));
    const encoder = new TextEncoder();
    for (const [table, columns, rows] of tables) {
        const fields = columns.split(',').map((_, i) => `json_extract(value, '$[${i}]')`).join(',');
        const insert = db.prepare(`INSERT INTO ${table} (user_id,${columns}) SELECT ?,${fields} FROM json_each(?)`);
        let chunk = [], bytes = 2;
        for (const row of rows) {
            const encoded = JSON.stringify(row);
            const size = encoder.encode(encoded).length + 1;
            if (size > 1_999_998) return json({ error: '备份中有单条记录过大，未导入。' }, 400);
            // D1 limits each bound string to 2 MB; keep bulk inserts below that limit.
            if (chunk.length && bytes + size > 1_000_000) {
                statements.push(insert.bind(userId, `[${chunk.join(',')}]`));
                chunk = []; bytes = 2;
            }
            chunk.push(encoded); bytes += size;
        }
        if (chunk.length) statements.push(insert.bind(userId, `[${chunk.join(',')}]`));
    }
    statements.push(db.prepare(`UPDATE accounts SET
        diary_sequence = MAX(diary_sequence, (SELECT COALESCE(MAX(id), 0) FROM diary_entries WHERE user_id = ?)),
        water_sequence = MAX(water_sequence, (SELECT COALESCE(MAX(id), 0) FROM water_log WHERE user_id = ?)) WHERE id = ?`)
        .bind(userId, userId, userId));
    // Deletes and inserts must commit together, including every chunk of large backups.
    await db.batch(statements);
    return noContent();
}

// ── User settings ──
async function putUser({ db, userId, body }) {
    validateProfile(body);
    const { height, weight, age, gender, activity } = body;
    const targetWeight = body.targetWeight == null ? null : Number(body.targetWeight);
    if (targetWeight !== null && !(targetWeight >= 20 && targetWeight <= 400)) {
        return json({ error: 'targetWeight must be null or between 20 and 400' }, 400);
    }
    const waterTarget = body.waterTarget == null ? null : Number(body.waterTarget);
    if (waterTarget !== null && !(waterTarget >= 500 && waterTarget <= 10000)) {
        return json({ error: 'waterTarget must be null or between 500 and 10000' }, 400);
    }
    await db.prepare(`
        INSERT INTO user_settings (user_id, height, weight, age, gender, activity, target_weight, water_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET height = excluded.height, weight = excluded.weight,
            age = excluded.age, gender = excluded.gender, activity = excluded.activity,
            target_weight = excluded.target_weight, water_target = excluded.water_target
    `).bind(userId, height, weight, age, gender, activity, targetWeight, waterTarget).run();
    // The weight log is the source of truth for weight whenever it has entries
    return json(await syncSettingsWeight(db, userId));
}

// ── Foods (warehouse) ──
async function postFood({ db, userId, body }) {
    validateEntry(body, true);
    const { category, name, unit, kcal, protein, carbs, fat } = body;
    const row = await db.prepare(`
        INSERT INTO foods (user_id, id, category, name, unit, kcal, protein, carbs, fat, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1) RETURNING *
    `).bind(userId, crypto.randomUUID(), category, name, unit, kcal, protein, carbs, fat).first();
    return json(foodToJson(row), 201);
}

async function putFood({ db, userId, body, params: [id] }) {
    const existing = await db.prepare('SELECT id FROM foods WHERE user_id = ? AND id = ?').bind(userId, id).first();
    if (!existing) return json({ error: 'food not found' }, 404);

    validateEntry(body, true);
    const { category, name, unit, kcal, protein, carbs, fat } = body;
    // Cascade: recompute macros for every historical (non-temporary) entry referencing this food,
    // scaled by each entry's own raw_amount against the food's new base unit
    const baseAmount = parseFloat(unit) || 1;
    const unitText = unit.replace(/[0-9.]/g, '') || '单位';
    // A D1 batch is one transaction, so the food and its entries never drift apart
    const [foodResult, entriesResult] = await db.batch([
        db.prepare(`
            UPDATE foods SET category = ?, name = ?, unit = ?, kcal = ?, protein = ?, carbs = ?, fat = ?
            WHERE user_id = ? AND id = ? RETURNING *
        `).bind(category, name, unit, kcal, protein, carbs, fat, userId, id),
        db.prepare(`UPDATE diary_entries SET name = ?,
            display_amount = (CASE WHEN raw_amount = CAST(raw_amount AS INTEGER) THEN CAST(raw_amount AS INTEGER) ELSE raw_amount END) || ?,
            kcal = ? * (raw_amount / ?), protein = ? * (raw_amount / ?), carbs = ? * (raw_amount / ?), fat = ? * (raw_amount / ?)
            WHERE user_id = ? AND food_id = ? AND is_temporary = 0 RETURNING *`)
            .bind(name, unitText, kcal, baseAmount, protein, baseAmount, carbs, baseAmount, fat, baseAmount, userId, id)
    ]);

    return json({ food: foodToJson(foodResult.results[0]), updatedEntries: entriesResult.results.map(row => ({ ...entryToJson(row), date: row.date })) });
}

async function patchFoodActive({ db, userId, body, params: [id] }) {
    if (typeof body.active !== 'boolean') fail(400, 'invalid_entry');
    const row = await db.prepare('UPDATE foods SET active = ? WHERE user_id = ? AND id = ? RETURNING *')
        .bind(body.active ? 1 : 0, userId, id).first();
    if (!row) return json({ error: 'food not found' }, 404);
    return json(foodToJson(row));
}

async function deleteFood({ db, userId, params: [id] }) {
    await db.prepare('DELETE FROM foods WHERE user_id = ? AND id = ?').bind(userId, id).run();
    return noContent();
}

// ── Diary entries ──
async function postDiary({ db, userId, body }) {
    validateEntry(body);
    if (!validDate(body.date) || typeof body.isTemporary !== 'boolean') fail(400, 'invalid_entry');
    const { date, foodId, isTemporary, meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat } = body;
    if (!isTemporary && !await db.prepare('SELECT 1 FROM foods WHERE user_id = ? AND id = ?').bind(userId, foodId ?? '').first()) fail(404, 'food_not_found');
    const statements = [db.prepare('UPDATE accounts SET diary_sequence = diary_sequence + 1 WHERE id = ?').bind(userId), db.prepare(`
        INSERT INTO diary_entries (user_id, id, date, food_id, is_temporary, meal, name, raw_amount, display_amount, kcal, protein, carbs, fat)
        SELECT ?, diary_sequence, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM accounts WHERE id = ? RETURNING *
    `).bind(userId, date, foodId ?? null, isTemporary ? 1 : 0, meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat, userId)];
    if (!isTemporary && foodId) {
        statements.push(db.prepare('UPDATE foods SET last_amount = ? WHERE user_id = ? AND id = ?').bind(rawAmount, userId, foodId));
    }
    const [, inserted] = await db.batch(statements);
    return json(entryToJson(inserted.results[0]), 201);
}

async function putDiary({ db, userId, body, params: [id] }) {
    validateEntry(body);
    const { meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat } = body;
    const row = await db.prepare(`
        UPDATE diary_entries SET meal = ?, name = ?, raw_amount = ?, display_amount = ?, kcal = ?, protein = ?, carbs = ?, fat = ?
        WHERE user_id = ? AND id = ? RETURNING *
    `).bind(meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat, userId, id).first();
    if (!row) return json({ error: 'entry not found' }, 404);
    return json(entryToJson(row));
}

async function deleteDiary({ db, userId, params: [id] }) {
    await db.prepare('DELETE FROM diary_entries WHERE user_id = ? AND id = ?').bind(userId, id).run();
    return noContent();
}

// ── Weight log ──
// The latest weigh-in drives the daily targets, so every change re-syncs user_settings.weight
async function syncSettingsWeight(db, userId) {
    const [, user] = await db.batch([
        db.prepare(`
            UPDATE user_settings SET weight = (SELECT weight FROM weight_log WHERE user_id = ? ORDER BY date DESC LIMIT 1)
            WHERE user_id = ? AND EXISTS (SELECT 1 FROM weight_log WHERE user_id = ?)
        `).bind(userId, userId, userId),
        db.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(userId)
    ]);
    return userToJson(user.results[0]);
}

async function putWeight({ db, userId, body, params: [date] }) {
    const weight = Number(body.weight);
    if (!validDate(date) || !(weight >= 20 && weight <= 400)) {
        return json({ error: 'expected date YYYY-MM-DD and weight between 20 and 400' }, 400);
    }
    await db.prepare(`
        INSERT INTO weight_log (user_id, date, weight) VALUES (?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET weight = excluded.weight
    `).bind(userId, date, weight).run();
    return json({ entry: { date, weight }, user: await syncSettingsWeight(db, userId) });
}

async function deleteWeight({ db, userId, params: [date] }) {
    await db.prepare('DELETE FROM weight_log WHERE user_id = ? AND date = ?').bind(userId, date).run();
    return json({ user: await syncSettingsWeight(db, userId) });
}

// ── Water log ──
async function postWater({ db, userId, body }) {
    const { date, time = null, customUnit = null } = body;
    const ml = Number(body.ml);
    if (!validDate(date) || !(ml > 0 && ml <= 5000) || (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        || (customUnit !== null && !['ml', 'l'].includes(customUnit))) {
        return json({ error: 'expected date YYYY-MM-DD, ml between 0 and 5000, optional time HH:MM, optional customUnit ml or l' }, 400);
    }
    // A custom amount (customUnit set) is remembered for the next prefill; presets are not
    const statements = [db.prepare('UPDATE accounts SET water_sequence = water_sequence + 1 WHERE id = ?').bind(userId), db.prepare('INSERT INTO water_log (user_id, id, date, time, ml) SELECT ?, water_sequence, ?, ?, ? FROM accounts WHERE id = ? RETURNING id, time, ml').bind(userId, date, time, ml, userId)];
    if (customUnit) {
        statements.push(db.prepare('UPDATE user_settings SET last_water_ml = ?, last_water_unit = ? WHERE user_id = ?').bind(ml, customUnit, userId));
    }
    const [, inserted] = await db.batch(statements);
    return json(inserted.results[0], 201);
}

async function deleteWater({ db, userId, params: [id] }) {
    await db.prepare('DELETE FROM water_log WHERE user_id = ? AND id = ?').bind(userId, id).run();
    return noContent();
}

// ── Carb cycling ──
// carbs / fat are gram offsets from the auto-calculated plan
async function putDayTypes({ db, userId, body }) {
    const valid = DAY_TYPE_IDS.every(id => ['carbs', 'fat'].every(k => {
        const v = body[id]?.[k];
        return typeof v === 'number' && v >= -500 && v <= 500;
    }));
    if (!valid) return json({ error: 'expected { high, medium, low } each with carbs, fat offsets between -500 and 500' }, 400);

    const upsert = db.prepare(`
        INSERT INTO day_types (user_id, id, carbs_offset, fat_offset) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET carbs_offset = excluded.carbs_offset, fat_offset = excluded.fat_offset
    `);
    await db.batch(DAY_TYPE_IDS.map(id => upsert.bind(userId, id, body[id].carbs, body[id].fat)));
    return noContent();
}

async function putDayPlan({ db, userId, body, params: [date] }) {
    if (!validDate(date) || !DAY_TYPE_IDS.includes(body.type)) {
        return json({ error: 'expected date YYYY-MM-DD and type high, medium or low' }, 400);
    }
    await db.prepare(`
        INSERT INTO day_plan (user_id, date, type) VALUES (?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET type = excluded.type
    `).bind(userId, date, body.type).run();
    return noContent();
}

async function deleteDayPlan({ db, userId, params: [date] }) {
    await db.prepare('DELETE FROM day_plan WHERE user_id = ? AND date = ?').bind(userId, date).run();
    return noContent();
}

// ── Achievements ──
// Idempotent: a tier that is already unlocked keeps its original date
async function postAchievements({ db, userId, body }) {
    const { unlocks } = body;
    const valid = Array.isArray(unlocks) && unlocks.every(u =>
        typeof u?.id === 'string' && /^[a-z_]+:\d+(\.\d+)?$/.test(u.id) && u.id.length < 100 && validDate(u.date));
    if (!valid) return json({ error: 'unlocks must be [{ id, date: "YYYY-MM-DD" }]' }, 400);

    if (unlocks.length > 100) fail(400, 'too_many_records');
    if (unlocks.length) {
        await db.prepare("INSERT OR IGNORE INTO achievements (user_id, id, unlocked_at) SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.date') FROM json_each(?)").bind(userId, JSON.stringify(unlocks)).run();
    }
    return noContent();
}

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
// ponytail: per-isolate cache, so a cold isolate refetches; move to the Cache API if ZenQuotes starts rate-limiting
let quoteCache = null;

async function getQuote({ env }) {
    // Workers run in UTC, so the user's zone is configured explicitly to keep the local-midnight rollover
    const today = new Date().toLocaleDateString('sv', { timeZone: env.TIME_ZONE });
    const dayIndex = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86400000);
    const zh = ZH_QUOTES[dayIndex % ZH_QUOTES.length];
    if (quoteCache?.date === today) return json({ ...quoteCache.quote, zh });
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
        return json({ ...quoteCache.quote, zh });
    } catch (err) {
        console.error(`[quote] ZenQuotes fetch failed for ${today}: ${err.message}`);
        const fallback = FALLBACK_QUOTES[dayIndex % FALLBACK_QUOTES.length];
        return json({ ...fallback, source: 'local', zh });
    }
}

const ROUTES = [
    ['GET',    /^\/api\/state$/,                getState],
    ['POST',   /^\/api\/import$/,               importState],
    ['PUT',    /^\/api\/user$/,                 putUser],
    ['POST',   /^\/api\/foods$/,                postFood],
    ['PUT',    /^\/api\/foods\/([^/]+)$/,        putFood],
    ['PATCH',  /^\/api\/foods\/([^/]+)\/active$/, patchFoodActive],
    ['DELETE', /^\/api\/foods\/([^/]+)$/,        deleteFood],
    ['POST',   /^\/api\/diary$/,                postDiary],
    ['PUT',    /^\/api\/diary\/([^/]+)$/,        putDiary],
    ['DELETE', /^\/api\/diary\/([^/]+)$/,        deleteDiary],
    ['PUT',    /^\/api\/weights\/([^/]+)$/,      putWeight],
    ['DELETE', /^\/api\/weights\/([^/]+)$/,      deleteWeight],
    ['POST',   /^\/api\/water$/,                postWater],
    ['DELETE', /^\/api\/water\/([^/]+)$/,        deleteWater],
    ['PUT',    /^\/api\/day-types$/,            putDayTypes],
    ['PUT',    /^\/api\/day-plan\/([^/]+)$/,     putDayPlan],
    ['DELETE', /^\/api\/day-plan\/([^/]+)$/,     deleteDayPlan],
    ['POST',   /^\/api\/achievements$/,         postAchievements],
    ['GET',    /^\/api\/quote$/,                getQuote]
];

export async function onRequest({ request, env }) {
    const { pathname } = new URL(request.url);
    try {
        if (pathname.startsWith('/api/auth/')) return await handleAuth(request, env);
        if (pathname.startsWith('/api/admin/')) return await handleAdmin(request, env);
        const session = await requireSession(request, env.DB);
        const userId = session.id;
        if (pathname === '/api/rules' && request.method === 'GET') return json(await getRules(env.DB));
        let body = {};
        if (!['GET', 'HEAD'].includes(request.method)) {
            await rateLimit(env.DB, 'write', userId, 120, 60);
            body = await readBody(request, pathname === '/api/import' ? 8 * 1024 * 1024 : 65536);
        }
        if (pathname === '/api/profile' && request.method === 'PUT') return await saveProfile({ db: env.DB, body, session }, false);
        if (pathname === '/api/profile/complete' && request.method === 'POST') return await saveProfile({ db: env.DB, body, session }, true);
        if (!session.onboarded) fail(409, 'profile_required');
        for (const [method, pattern, handler] of ROUTES) {
            const match = pathname.match(pattern);
            if (!match || request.method !== method) continue;
            if (pathname === '/api/import') await rateLimit(env.DB, 'import', userId, 5, 3600);
            const response = await handler({ db: env.DB, env, body, userId, params: match.slice(1).map(decodeURIComponent) });
            response.headers.set('Cache-Control', 'no-store');
            return response;
        }
        return json({ error: 'not_found' }, 404);
    } catch (error) {
        if (error instanceof Response) return error;
        console.error('[api] request failed', request.method, pathname);
        return json({ error: 'internal_error' }, 500);
    }
}
