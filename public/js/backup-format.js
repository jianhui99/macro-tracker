function check(valid, label) {
    if (!valid) throw new Error(`备份中的${label}不完整或格式不正确，未导入。`);
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const number = (value, min, max = Infinity) => Number.isFinite(value) && value >= min && value <= max;
const positive = value => Number.isFinite(value) && value > 0;
const nullable = (value, valid) => value == null || valid(value);
const rowId = value => Number.isSafeInteger(value) && value > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const macros = value => ['kcal', 'protein', 'carbs', 'fat'].every(key => number(value[key], 0));

function unique(values, label) {
    check(new Set(values).size === values.length, `${label}（存在重复记录）`);
}

function validateBackup(data) {
    check(record(data), '文件内容');
    check(data.schemaVersion === undefined || data.schemaVersion === 1, '文件版本');
    const sections = ['user', 'foods', 'diary', 'achievements', 'weights', 'dayTypes', 'dayPlan', 'water'];
    check(sections.every(key => Object.hasOwn(data, key)), '数据分类');
    check(Object.keys(data).every(key => [...sections, 'schemaVersion', 'exportedAt'].includes(key)), '数据分类');

    const u = data.user;
    check(record(u), '个人设置');
    check(number(u.height, 100, 250) && number(u.weight, 20, 400)
        && Number.isInteger(u.age) && number(u.age, 10, 100)
        && ['male', 'female'].includes(u.gender) && positive(u.activity)
        && nullable(u.targetWeight, v => number(v, 20, 400))
        && nullable(u.waterTarget, v => number(v, 500, 10000)), '个人设置');
    check(nullable(u.lastWater, v => record(v) && positive(v.ml) && v.ml <= 5000 && ['ml', 'l'].includes(v.unit)), '上次饮水量');
    check(nullable(u.skin, v => Number.isInteger(v) && v >= 1 && v <= 30)
        && nullable(u.maxLevel, v => Number.isInteger(v) && v >= 1) && nullable(u.level, v => Number.isInteger(v) && v >= 1), '角色皮肤');

    check(Array.isArray(data.foods), '食物仓库');
    for (const f of data.foods) {
        check(record(f) && ['id', 'category', 'name', 'unit'].every(key => text(f[key]))
            && !['__proto__', 'constructor', 'prototype'].includes(f.id)
            && macros(f) && typeof f.active === 'boolean' && nullable(f.lastAmount, positive), '食物仓库');
    }
    unique(data.foods.map(f => f.id), '食物仓库');

    check(record(data.diary), '饮食日记');
    const entryIds = [];
    for (const [day, entries] of Object.entries(data.diary)) {
        check(date(day) && Array.isArray(entries), '日记日期');
        for (const e of entries) {
            check(record(e) && rowId(e.id) && nullable(e.foodId, text) && typeof e.isTemporary === 'boolean'
                && ['breakfast', 'lunch', 'pre_workout', 'post_workout', 'dinner', 'snack'].includes(e.meal)
                && text(e.name) && text(e.displayAmount) && positive(e.rawAmount) && macros(e), '饮食日记');
            entryIds.push(e.id);
        }
    }
    unique(entryIds, '饮食日记');

    check(Array.isArray(data.weights), '体重记录');
    check(data.weights.every(w => record(w) && date(w.date) && number(w.weight, 20, 400)), '体重记录');
    unique(data.weights.map(w => w.date), '体重日期');

    check(record(data.achievements), '成就');
    check(Object.entries(data.achievements).every(([id, day]) => /^[a-z_]+:\d+(\.\d+)?$/.test(id) && date(day)), '成就');

    const types = ['high', 'medium', 'low'];
    check(record(data.dayTypes) && Object.keys(data.dayTypes).length === types.length, '碳循环配置');
    check(types.every(id => record(data.dayTypes[id])
        && ['carbs', 'fat'].every(key => number(data.dayTypes[id][key], -500, 500))), '碳循环配置');
    check(record(data.dayPlan), '碳循环日程');
    check(Object.entries(data.dayPlan).every(([day, type]) => date(day) && types.includes(type)), '碳循环日程');

    check(record(data.water), '饮水记录');
    const waterIds = [];
    for (const [day, drinks] of Object.entries(data.water)) {
        check(date(day) && Array.isArray(drinks), '饮水日期');
        for (const w of drinks) {
            check(record(w) && rowId(w.id) && positive(w.ml) && w.ml <= 5000
                && nullable(w.time, v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)), '饮水记录');
            waterIds.push(w.id);
        }
    }
    unique(waterIds, '饮水记录');
    return data;
}

export { validateBackup };
