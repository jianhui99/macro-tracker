import { state } from './state.js';

// ── Unit helpers (same parsing rules the server uses for cascades) ──
const unitBase = unit => parseFloat(unit) || 1;

const unitText = unit => unit.replace(/[0-9.]/g, '') || '单位';

function scaleFood(food, amount) {
    const k = amount / unitBase(food.unit);
    return { kcal: food.kcal * k, protein: food.protein * k, carbs: food.carbs * k, fat: food.fat * k };
}

// ── Diary: food picker ──
function groupFoodsByCategory() {
    const groups = {};
    state.foods.forEach(food => {
        const cat = food.category || '未分类';
        (groups[cat] ||= []).push(food);
    });
    return groups;
}

export { unitText, unitBase, groupFoodsByCategory, scaleFood };
