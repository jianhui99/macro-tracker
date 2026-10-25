import { fail, json } from './http.js';

export function validateProfile(body) {
    const { height, weight, age, gender } = body;
    const activity = Number(body.activity);
    if (!Number.isFinite(height) || height < 100 || height > 250 || !Number.isFinite(weight) || weight < 20 || weight > 400
        || !Number.isInteger(age) || age < 10 || age > 100 || !['male', 'female'].includes(gender)
        || ![1.2, 1.375, 1.55, 1.725].includes(activity)
        || (body.targetWeight != null && (!Number.isFinite(body.targetWeight) || body.targetWeight < 20 || body.targetWeight > 400))
        || (body.waterTarget != null && (!Number.isFinite(body.waterTarget) || body.waterTarget < 500 || body.waterTarget > 10000))) fail(400, 'invalid_profile');
}

export async function saveProfile({ db, body, session }, complete) {
    const nickname = body.nickname;
    if (typeof nickname !== 'string' || nickname.trim().length > 40 || ((complete || session.onboarded) && !nickname.trim())) fail(400, 'invalid_nickname');
    if (!complete) {
        if (session.onboarded) {
            await db.prepare('UPDATE accounts SET nickname = ? WHERE id = ?').bind(nickname.trim(), session.id).run();
        } else {
            const draft = Object.fromEntries(['nickname', 'height', 'weight', 'age', 'gender', 'activity', 'targetWeight', 'waterTarget']
                .filter(key => ['string', 'number'].includes(typeof body[key]) || body[key] === null).map(key => [key, body[key]]));
            await db.prepare('UPDATE accounts SET nickname = ?, draft = ? WHERE id = ?').bind(nickname.trim(), JSON.stringify(draft), session.id).run();
        }
        return json({ ok: true });
    }
    if (session.onboarded) fail(409, 'profile_exists');
    validateProfile(body);
    const foods = [
        ['1', '补剂', '蛋白粉', '1 scoop', 122, 24, 3, 1.5],
        ['2', '蛋类', '鸡蛋 (A 牌大号)', '1 粒', 140, 13, 2.5, 8.5],
        ['2_b', '蛋类', '鸡蛋 (B 牌普通)', '1 粒', 130, 12, 2.0, 7.8],
        ['3', '肉类', '鸡胸肉', '100g', 120, 23, 0, 1],
        ['4', '饭类', '米饭', '100g', 120, 2, 25, 0.3],
        ['5', '燕麦类', '燕麦', '35g', 133, 4.3, 20.3, 3.2]
    ];
    await db.batch([
        db.prepare(`INSERT INTO user_settings (user_id, height, weight, age, gender, activity, target_weight, water_target)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(session.id, body.height, body.weight, body.age, body.gender, Number(body.activity), body.targetWeight ?? null, body.waterTarget ?? null),
        ...foods.map(row => db.prepare('INSERT INTO foods (user_id, id, category, name, unit, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(session.id, ...row)),
        ...[['high', 45, -13], ['medium', 0, 0], ['low', -70, 15]].map(row => db.prepare('INSERT INTO day_types VALUES (?, ?, ?, ?)').bind(session.id, ...row)),
        db.prepare("UPDATE accounts SET nickname = ?, onboarded = 1, draft = '{}' WHERE id = ?").bind(nickname.trim(), session.id),
        db.prepare('INSERT INTO user_onboarding (user_id) VALUES (?)').bind(session.id)
    ]);
    return json({ ok: true });
}

export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function validateEntry(body, food = false) {
    const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
    const base = parseFloat(body.unit);
    if (!text(body.name, 200) || !['kcal', 'protein', 'carbs', 'fat'].every(key => Number.isFinite(body[key]) && body[key] >= 0 && body[key] <= 100000)
        || (food && (!text(body.category, 100) || !text(body.unit, 32) || (!Number.isNaN(base) && (!Number.isFinite(base) || base <= 0))))
        || (!food && (!['breakfast', 'lunch', 'pre_workout', 'post_workout', 'dinner', 'snack'].includes(body.meal)
            || (body.foodId != null && !text(body.foodId, 256))
            || !Number.isFinite(body.rawAmount) || body.rawAmount <= 0 || body.rawAmount > 100000 || !text(body.displayAmount, 100)))) fail(400, 'invalid_entry');
}
