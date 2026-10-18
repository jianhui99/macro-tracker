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

const json = (data, status = 200) => Response.json(data, { status });
const noContent = () => new Response(null, { status: 204 });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_TYPE_IDS = ['high', 'medium', 'low'];

// ── Full state bootstrap ──
async function getState({ db }) {
    const [foods, entries, achievements, weights, user, dayTypes, dayPlan, water] = await db.batch([
        db.prepare('SELECT * FROM foods'),
        db.prepare('SELECT * FROM diary_entries ORDER BY id'),
        db.prepare('SELECT id, unlocked_at FROM achievements'),
        db.prepare('SELECT date, weight FROM weight_log ORDER BY date'),
        db.prepare('SELECT * FROM user_settings WHERE id = 1'),
        db.prepare('SELECT id, carbs_offset AS carbs, fat_offset AS fat FROM day_types'),
        db.prepare('SELECT date, type FROM day_plan'),
        db.prepare('SELECT id, date, time, ml FROM water_log ORDER BY id')
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

// ── User settings ──
async function putUser({ db, body }) {
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
        INSERT INTO user_settings (id, height, weight, age, gender, activity, target_weight, water_target) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET height = excluded.height, weight = excluded.weight,
            age = excluded.age, gender = excluded.gender, activity = excluded.activity,
            target_weight = excluded.target_weight, water_target = excluded.water_target
    `).bind(height, weight, age, gender, activity, targetWeight, waterTarget).run();
    // The weight log is the source of truth for weight whenever it has entries
    return json(await syncSettingsWeight(db));
}

// ── Foods (warehouse) ──
async function postFood({ db, body }) {
    const { category, name, unit, kcal, protein, carbs, fat } = body;
    const row = await db.prepare(`
        INSERT INTO foods (id, category, name, unit, kcal, protein, carbs, fat, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) RETURNING *
    `).bind(Date.now().toString(), category, name, unit, kcal, protein, carbs, fat).first();
    return json(foodToJson(row), 201);
}

async function putFood({ db, body, params: [id] }) {
    const existing = await db.prepare('SELECT id FROM foods WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'food not found' }, 404);

    const { category, name, unit, kcal, protein, carbs, fat } = body;
    // Cascade: recompute macros for every historical (non-temporary) entry referencing this food,
    // scaled by each entry's own raw_amount against the food's new base unit
    const baseAmount = parseFloat(unit) || 1;
    const unitText = unit.replace(/[0-9.]/g, '') || '单位';
    const { results: affected } = await db.prepare(
        'SELECT * FROM diary_entries WHERE food_id = ? AND is_temporary = 0').bind(id).all();
    const updateEntry = db.prepare(`
        UPDATE diary_entries SET name = ?, display_amount = ?, kcal = ?, protein = ?, carbs = ?, fat = ?
        WHERE id = ?
    `);
    const updatedEntries = affected.map(entry => {
        const multiplier = entry.raw_amount / baseAmount;
        return {
            id: entry.id, date: entry.date, name, displayAmount: entry.raw_amount + unitText,
            kcal: kcal * multiplier, protein: protein * multiplier,
            carbs: carbs * multiplier, fat: fat * multiplier
        };
    });

    // A D1 batch is one transaction, so the food and its entries never drift apart
    const [foodResult] = await db.batch([
        db.prepare(`
            UPDATE foods SET category = ?, name = ?, unit = ?, kcal = ?, protein = ?, carbs = ?, fat = ?
            WHERE id = ? RETURNING *
        `).bind(category, name, unit, kcal, protein, carbs, fat, id),
        ...updatedEntries.map(e => updateEntry.bind(e.name, e.displayAmount, e.kcal, e.protein, e.carbs, e.fat, e.id))
    ]);

    return json({ food: foodToJson(foodResult.results[0]), updatedEntries });
}

async function patchFoodActive({ db, body, params: [id] }) {
    const row = await db.prepare('UPDATE foods SET active = ? WHERE id = ? RETURNING *')
        .bind(body.active ? 1 : 0, id).first();
    if (!row) return json({ error: 'food not found' }, 404);
    return json(foodToJson(row));
}

async function deleteFood({ db, params: [id] }) {
    await db.prepare('DELETE FROM foods WHERE id = ?').bind(id).run();
    return noContent();
}

// ── Diary entries ──
async function postDiary({ db, body }) {
    const { date, foodId, isTemporary, meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat } = body;
    const statements = [db.prepare(`
        INSERT INTO diary_entries (date, food_id, is_temporary, meal, name, raw_amount, display_amount, kcal, protein, carbs, fat)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
    `).bind(date, foodId ?? null, isTemporary ? 1 : 0, meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat)];
    if (!isTemporary && foodId) {
        statements.push(db.prepare('UPDATE foods SET last_amount = ? WHERE id = ?').bind(rawAmount, foodId));
    }
    const [inserted] = await db.batch(statements);
    return json(entryToJson(inserted.results[0]), 201);
}

async function putDiary({ db, body, params: [id] }) {
    const { meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat } = body;
    const row = await db.prepare(`
        UPDATE diary_entries SET meal = ?, name = ?, raw_amount = ?, display_amount = ?, kcal = ?, protein = ?, carbs = ?, fat = ?
        WHERE id = ? RETURNING *
    `).bind(meal, name, rawAmount, displayAmount, kcal, protein, carbs, fat, id).first();
    if (!row) return json({ error: 'entry not found' }, 404);
    return json(entryToJson(row));
}

async function deleteDiary({ db, params: [id] }) {
    await db.prepare('DELETE FROM diary_entries WHERE id = ?').bind(id).run();
    return noContent();
}

// ── Weight log ──
// The latest weigh-in drives the daily targets, so every change re-syncs user_settings.weight
async function syncSettingsWeight(db) {
    const [, user] = await db.batch([
        db.prepare(`
            UPDATE user_settings SET weight = (SELECT weight FROM weight_log ORDER BY date DESC LIMIT 1)
            WHERE id = 1 AND EXISTS (SELECT 1 FROM weight_log)
        `),
        db.prepare('SELECT * FROM user_settings WHERE id = 1')
    ]);
    return userToJson(user.results[0]);
}

async function putWeight({ db, body, params: [date] }) {
    const weight = Number(body.weight);
    if (!DATE_RE.test(date) || !(weight >= 20 && weight <= 400)) {
        return json({ error: 'expected date YYYY-MM-DD and weight between 20 and 400' }, 400);
    }
    await db.prepare(`
        INSERT INTO weight_log (date, weight) VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET weight = excluded.weight
    `).bind(date, weight).run();
    return json({ entry: { date, weight }, user: await syncSettingsWeight(db) });
}

async function deleteWeight({ db, params: [date] }) {
    await db.prepare('DELETE FROM weight_log WHERE date = ?').bind(date).run();
    return json({ user: await syncSettingsWeight(db) });
}

// ── Water log ──
async function postWater({ db, body }) {
    const { date, time = null, customUnit = null } = body;
    const ml = Number(body.ml);
    if (!DATE_RE.test(date ?? '') || !(ml > 0 && ml <= 5000) || (time !== null && !/^\d{2}:\d{2}$/.test(time))
        || (customUnit !== null && !['ml', 'l'].includes(customUnit))) {
        return json({ error: 'expected date YYYY-MM-DD, ml between 0 and 5000, optional time HH:MM, optional customUnit ml or l' }, 400);
    }
    // A custom amount (customUnit set) is remembered for the next prefill; presets are not
    const statements = [db.prepare('INSERT INTO water_log (date, time, ml) VALUES (?, ?, ?) RETURNING id, time, ml').bind(date, time, ml)];
    if (customUnit) {
        statements.push(db.prepare('UPDATE user_settings SET last_water_ml = ?, last_water_unit = ? WHERE id = 1').bind(ml, customUnit));
    }
    const [inserted] = await db.batch(statements);
    return json(inserted.results[0], 201);
}

async function deleteWater({ db, params: [id] }) {
    await db.prepare('DELETE FROM water_log WHERE id = ?').bind(id).run();
    return noContent();
}

// ── Carb cycling ──
// carbs / fat are gram offsets from the auto-calculated plan
async function putDayTypes({ db, body }) {
    const valid = DAY_TYPE_IDS.every(id => ['carbs', 'fat'].every(k => {
        const v = body[id]?.[k];
        return typeof v === 'number' && v >= -500 && v <= 500;
    }));
    if (!valid) return json({ error: 'expected { high, medium, low } each with carbs, fat offsets between -500 and 500' }, 400);

    const upsert = db.prepare(`
        INSERT INTO day_types (id, carbs_offset, fat_offset) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET carbs_offset = excluded.carbs_offset, fat_offset = excluded.fat_offset
    `);
    await db.batch(DAY_TYPE_IDS.map(id => upsert.bind(id, body[id].carbs, body[id].fat)));
    return noContent();
}

async function putDayPlan({ db, body, params: [date] }) {
    if (!DATE_RE.test(date) || !DAY_TYPE_IDS.includes(body.type)) {
        return json({ error: 'expected date YYYY-MM-DD and type high, medium or low' }, 400);
    }
    await db.prepare(`
        INSERT INTO day_plan (date, type) VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET type = excluded.type
    `).bind(date, body.type).run();
    return noContent();
}

async function deleteDayPlan({ db, params: [date] }) {
    await db.prepare('DELETE FROM day_plan WHERE date = ?').bind(date).run();
    return noContent();
}

// ── Achievements ──
// Idempotent: a tier that is already unlocked keeps its original date
async function postAchievements({ db, body }) {
    const { unlocks } = body;
    const valid = Array.isArray(unlocks) && unlocks.every(u =>
        typeof u?.id === 'string' && DATE_RE.test(u?.date ?? ''));
    if (!valid) return json({ error: 'unlocks must be [{ id, date: "YYYY-MM-DD" }]' }, 400);

    if (unlocks.length) {
        const insert = db.prepare('INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, ?)');
        await db.batch(unlocks.map(({ id, date }) => insert.bind(id, date)));
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

// Single shared key, set with `wrangler pages secret put API_KEY` (or .dev.vars locally)
function isAuthorized(request, env) {
    const encoder = new TextEncoder();
    const given = encoder.encode(request.headers.get('Authorization') ?? '');
    const expected = encoder.encode(`Bearer ${env.API_KEY}`);
    // timingSafeEqual throws on unequal lengths, and the key length is not worth hiding
    return given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected);
}

export async function onRequest({ request, env }) {
    const { pathname } = new URL(request.url);
    if (!env.API_KEY) {
        console.error('[api] API_KEY secret is not configured; refusing all requests');
        return json({ error: 'server not configured' }, 500);
    }
    if (!isAuthorized(request, env)) return json({ error: 'unauthorized' }, 401);

    for (const [method, pattern, handler] of ROUTES) {
        const match = pathname.match(pattern);
        if (!match || request.method !== method) continue;

        let body = {};
        if (request.headers.get('content-type')?.includes('application/json')) {
            try {
                body = await request.json();
            } catch {
                return json({ error: 'invalid JSON body' }, 400);
            }
        }
        try {
            return await handler({ db: env.DB, env, body, params: match.slice(1).map(decodeURIComponent) });
        } catch (err) {
            console.error(`[api] ${method} ${pathname} failed: ${err.message}`, body);
            return json({ error: 'internal error' }, 500);
        }
    }
    return json({ error: 'not found' }, 404);
}
