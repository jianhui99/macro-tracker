// What a hero looks like, reduced to coarse buckets. Pure (no DOM), so the server can share it: the guild list sends
// these traits instead of a member's height, weight and age, which stay private.
export const CLASSES = {
    '1.2': ['学者', 'menu_book', '久坐不动', '久坐不动（基本不运动）'],
    '1.375': ['旅人', 'hiking', '轻度活动', '轻度活动（每周运动 1-3 天）'],
    '1.55': ['冒险者', 'explore', '中度活动', '中度活动（每周运动 3-5 天）'],
    '1.725': ['战士', 'swords', '重度活动', '重度活动（每周运动 6-7 天）']
};

// One hero skin per level title
export const SKIN_COUNT = 30;

function number(value, min, max) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function avatarTraits(profile) {
    const height = number(profile.height, 100, 250);
    const weight = number(profile.weight, 20, 400);
    const age = number(profile.age, 10, 100);
    // Build compares weight with a BMI-22 frame for that height
    const build = height === null || weight === null ? 1 : Math.sqrt(weight / ((height / 100) ** 2 * 22));
    return {
        height: height === null ? 'normal' : height > 180 ? 'tall' : height < 160 ? 'short' : 'normal',
        build: build > 1.08 ? 'broad' : build < .94 ? 'slim' : 'normal',
        age: age === null || !Number.isInteger(age) ? 'neutral' : age < 18 ? 'young' : age < 50 ? 'adult' : 'mature',
        gender: ['male', 'female'].includes(profile.gender) ? profile.gender : 'neutral',
        job: Object.hasOwn(CLASSES, String(profile.activity)) ? String(profile.activity) : '',
        skin: Number.isInteger(profile.skin) && profile.skin >= 1 && profile.skin <= SKIN_COUNT ? profile.skin : 0
    };
}
