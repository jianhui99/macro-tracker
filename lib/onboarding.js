import { fail, json } from './http.js';

const TASKS = ['targets', 'meal', 'water', 'growth'];

export async function getOnboarding({ db, userId }) {
    const row = await db.prepare('SELECT * FROM user_onboarding WHERE user_id = ?').bind(userId).first();
    return json({ enabled: !!row, presented: !!row?.presented, completed: TASKS.filter(id => row?.[id]) });
}

export async function patchOnboarding({ db, userId, body }) {
    if (Object.keys(body).some(key => !['enabled', 'presented', 'completed'].includes(key))
        || (body.enabled !== undefined && body.enabled !== true)
        || (body.presented !== undefined && body.presented !== true)
        || (body.completed !== undefined && (!Array.isArray(body.completed) || body.completed.length > TASKS.length
            || body.completed.some(id => !TASKS.includes(id))))) fail(400, 'invalid_onboarding');
    const completed = body.completed ?? [];
    const statements = [];
    if (body.enabled) statements.push(db.prepare('INSERT OR IGNORE INTO user_onboarding (user_id) VALUES (?)').bind(userId));
    // Each flag only rises, so another device cannot overwrite completed tasks.
    statements.push(db.prepare(`UPDATE user_onboarding SET
        presented = MAX(presented, ?), targets = MAX(targets, ?), growth = MAX(growth, ?),
        meal = MAX(meal, EXISTS (SELECT 1 FROM diary_entries WHERE user_id = ?)),
        water = MAX(water, EXISTS (SELECT 1 FROM water_log WHERE user_id = ?)) WHERE user_id = ?`)
        .bind(Number(!!body.presented), Number(completed.includes('targets')), Number(completed.includes('growth')), userId, userId, userId));
    await db.batch(statements);
    return getOnboarding({ db, userId });
}
