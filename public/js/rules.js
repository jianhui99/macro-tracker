const DEFAULT_RULES = Object.freeze({ star: 10, water: 10, weigh: 5, bronze: 50, silver: 100, gold: 200, diamond: 400,
    levelBase: 100, levelStep: 25, kcalBelow: 300, kcalAbove: 50, proteinPercent: 100 });
let rules = { ...DEFAULT_RULES };
let rulesVersion = 0;
const RULE_LABELS = { star: '每颗星经验', water: '饮水达标经验', weigh: '每日称重经验', bronze: '青铜成就经验', silver: '白银成就经验', gold: '黄金成就经验', diamond: '钻石成就经验', levelBase: '首级升级经验', levelStep: '每级增加经验', kcalBelow: '热量允许低于目标 kcal', kcalAbove: '热量允许高于目标 kcal', proteinPercent: '蛋白达标比例 %' };
const ruleBounds = key => [(['levelBase', 'proteinPercent'].includes(key) ? 1 : 0), key === 'proteinPercent' ? 200 : 10000];
function validateRules(value) {
    if (!value || typeof value !== 'object' || Object.keys(value).length !== Object.keys(DEFAULT_RULES).length) return false;
    return Object.keys(DEFAULT_RULES).every(key => Number.isInteger(value[key]) && value[key] >= ruleBounds(key)[0] && value[key] <= ruleBounds(key)[1]);
}
function setRules(value, version = 0) {
    if (!validateRules(value)) throw new Error('invalid_rules');
    rules = { ...value };
    rulesVersion = version;
}
export { DEFAULT_RULES, rules, rulesVersion, validateRules, setRules, RULE_LABELS, ruleBounds };
