import { groupFoodsByCategory } from './foods.js';
import { $, esc, fmt, fmt1 } from './helpers.js';
import { state } from './state.js';
import { showToast, showConfirm } from './ui.js';
import { api } from './api.js';
import { renderFoodPicker } from './diary.js';
import { syncAchievements } from './achievements.js';

let currentWarehouseEditId = null;

// ── Warehouse ──
// Collapsed category names live outside `state` so exports stay pure data
let collapsedCats = new Set();

function saveCollapsedCats() {
    try { localStorage.setItem('macro_tracker_collapsed', JSON.stringify([...collapsedCats])); } catch { /* storage unavailable */ }
}

// Set only for the render that expands a category, so its rows stagger in once
let expandingCat = null;

function toggleCategory(cat) {
    const expanding = collapsedCats.has(cat);
    expanding ? collapsedCats.delete(cat) : collapsedCats.add(cat);
    saveCollapsedCats();
    expandingCat = expanding ? cat : null;
    renderWarehouse();
    expandingCat = null;
}

function toggleAllCategories() {
    const allCats = Object.keys(groupFoodsByCategory());
    const anyExpanded = allCats.some(c => !collapsedCats.has(c));
    collapsedCats = anyExpanded ? new Set(allCats) : new Set();
    saveCollapsedCats();
    renderWarehouse();
}

// Item rarity by how often a food was logged, reusing the badge tiers
const RARITY = [[100, 'diamond', '传说'], [30, 'gold', '史诗'], [10, 'silver', '稀有'], [3, 'bronze', '优秀']];

function useCounts() {
    const counts = {};
    for (const entries of Object.values(state.diary)) for (const e of entries) counts[e.foodId] = (counts[e.foodId] || 0) + 1;
    return counts;
}

function rarityHtml(uses) {
    const [, tier, label] = RARITY.find(([min]) => uses >= min) || [];
    return tier ? `<span class="rarity r-${tier}" role="img" data-tip="${label} · 记录 ${uses} 次" aria-label="${label}，记录 ${uses} 次"></span>` : '';
}

function renderWarehouse() {
    const tbody = $('warehouse-table-body');
    const groups = groupFoodsByCategory();
    const keyword = $('warehouse-search').value.trim().toLowerCase();
    const activeCount = state.foods.filter(f => f.active !== false).length;
    $('warehouse-count').textContent = `${state.foods.length} 种，${activeCount} 种启用`;

    const counts = useCounts();
    let html = '';
    for (const cat in groups) {
        const foods = groups[cat].filter(f => !keyword || f.name.toLowerCase().includes(keyword) || cat.toLowerCase().includes(keyword));
        if (!foods.length) continue;
        // Searching shows every match regardless of collapse state
        const isCollapsed = !keyword && collapsedCats.has(cat);
        html += `
            <tr class="cat-row"><td colspan="8">
                <button class="cat-toggle" data-cat="${esc(cat)}" aria-expanded="${!isCollapsed}">
                    <span class="ms" aria-hidden="true">chevron_right</span>${esc(cat)} <small>${foods.length}</small>
                </button>
            </td></tr>`;
        if (isCollapsed) continue;
        for (const [i, food] of foods.entries()) {
            const isActive = food.active !== false;
            const name = esc(food.name);
            const id = esc(food.id);
            const enterAttr = cat === expandingCat ? ` style="--i:${Math.min(i, 12)}"` : '';
            html += `
                <tr class="w-row${isActive ? '' : ' is-off'}${enterAttr ? ' is-entering' : ''}"${enterAttr}>
                    <td class="w-name">${rarityHtml(counts[food.id] || 0)}<span class="w-title">${name}</span>${isActive ? '' : '<span class="tag">已停用</span>'}<span class="w-sub">${esc(food.unit)}</span></td>
                    <td class="w-unit">${esc(food.unit)}</td>
                    <td class="r w-kcal num">${fmt(food.kcal)}</td>
                    <td class="r w-m">${fmt1(food.protein)}</td>
                    <td class="r w-m">${fmt1(food.carbs)}</td>
                    <td class="r w-m">${fmt1(food.fat)}</td>
                    <td><label class="switch"><input type="checkbox" role="switch" ${isActive ? 'checked' : ''}
                        aria-label="在日记中启用 ${name}" data-food-id="${id}"><span></span></label></td>
                    <td><div class="w-actions">
                        <button class="icon-btn" data-action="edit" data-food-id="${id}" aria-label="编辑 ${name}"><span class="ms" aria-hidden="true">edit</span></button>
                        <button class="icon-btn danger" data-action="delete" data-food-id="${id}" aria-label="删除 ${name}"><span class="ms" aria-hidden="true">delete</span></button>
                    </div></td>
                </tr>`;
        }
    }

    if (!state.foods.length) {
        html = `<tr><td colspan="8"><div class="empty">仓库是空的。点上方「新建食品」，录入第一个常吃的食物。</div></td></tr>`;
        $('new-food').open = true;
    } else if (!html) {
        html = `<tr><td colspan="8"><div class="empty">没有匹配「${esc(keyword)}」的食品</div></td></tr>`;
    }
    tbody.innerHTML = html;

    const allCats = Object.keys(groups);
    const anyExpanded = allCats.some(c => !collapsedCats.has(c));
    $('collapse-all-btn').hidden = !allCats.length || !!keyword;
    $('collapse-all-icon').textContent = anyExpanded ? 'unfold_less' : 'unfold_more';
    $('collapse-all-label').textContent = anyExpanded ? '全部收起' : '全部展开';

    $('exist-categories').innerHTML = allCats.map(cat => `<option value="${esc(cat)}">`).join('');
}

async function addCustomFood() {
    const category = $('food-category').value.trim() || '未分类';
    const name     = $('food-name').value.trim();
    const unit     = $('food-unit').value.trim() || '100g';
    if (!name) { showToast('请填写食品名称', 'error'); $('food-name').focus(); return; }

    const food = await api('/api/foods', 'POST', {
        category, name, unit,
        kcal:    parseFloat($('food-kcal').value)    || 0,
        protein: parseFloat($('food-protein').value) || 0,
        carbs:   parseFloat($('food-carbs').value)   || 0,
        fat:     parseFloat($('food-fat').value)     || 0
    });
    state.foods.push(food);
    // Make sure the freshly added item is visible even if its category was collapsed
    collapsedCats.delete(category);
    saveCollapsedCats();
    $('warehouse-search').value = '';
    renderWarehouse();
    renderFoodPicker();
    ['food-name', 'food-unit', 'food-kcal', 'food-protein', 'food-carbs', 'food-fat'].forEach(id => { $(id).value = ''; });
    $('food-name').focus();
    showToast(`「${name}」已入库`);
}

function openWarehouseModal(foodId) {
    const food = state.foods.find(f => f.id === foodId);
    if (!food) return;
    currentWarehouseEditId = foodId;
    $('w-modal-cat').value     = food.category || '未分类';
    $('w-modal-name').value    = food.name;
    $('w-modal-unit').value    = food.unit;
    $('w-modal-kcal').value    = food.kcal;
    $('w-modal-protein').value = food.protein;
    $('w-modal-carbs').value   = food.carbs;
    $('w-modal-fat').value     = food.fat;
    $('warehouse-dialog').showModal();
}

function closeWarehouseModal() { $('warehouse-dialog').close(); }

async function saveWarehouseEdit() {
    const id = currentWarehouseEditId;
    const food = id && state.foods.find(f => f.id === id);
    if (!food) return;

    const name = $('w-modal-name').value.trim();
    if (!name) { showToast('名称不能为空', 'error'); return; }

    const { food: updatedFood, updatedEntries } = await api(`/api/foods/${encodeURIComponent(id)}`, 'PUT', {
        category: $('w-modal-cat').value.trim() || '未分类',
        name,
        unit:    $('w-modal-unit').value.trim() || '100g',
        kcal:    parseFloat($('w-modal-kcal').value)    || 0,
        protein: parseFloat($('w-modal-protein').value) || 0,
        carbs:   parseFloat($('w-modal-carbs').value)   || 0,
        fat:     parseFloat($('w-modal-fat').value)     || 0
    });
    Object.assign(food, updatedFood);

    // Server already recalculated every historical entry referencing this food; mirror those into local state
    for (const updated of updatedEntries) {
        const entry = (state.diary[updated.date] || []).find(e => e.id === updated.id);
        if (entry) Object.assign(entry, updated);
    }

    closeWarehouseModal();
    renderWarehouse();
    renderFoodPicker();
    showToast(updatedEntries.length ? `已保存，同步重算 ${updatedEntries.length} 条历史记录` : '已保存');
    syncAchievements();
}

async function deleteWarehouseItem(foodId) {
    const food = state.foods.find(f => f.id === foodId);
    if (!(await showConfirm(`删除「${food ? food.name : '此食品'}」？已记录的历史日记会保留。`))) return;
    await api(`/api/foods/${encodeURIComponent(foodId)}`, 'DELETE');
    state.foods = state.foods.filter(f => f.id !== foodId);
    renderWarehouse();
    renderFoodPicker();
    showToast('食品已删除', 'info');
}

async function toggleFoodActive(foodId, input) {
    const food = state.foods.find(f => f.id === foodId);
    if (!food) return;
    const nextActive = input.checked;
    try {
        const updated = await api(`/api/foods/${encodeURIComponent(foodId)}/active`, 'PATCH', { active: nextActive });
        food.active = updated.active;
    } catch {
        input.checked = !nextActive;
        return;
    }
    renderWarehouse();
    renderFoodPicker();
    showToast(food.active ? `「${food.name}」已启用` : `「${food.name}」已停用，不再出现在日记里`, food.active ? 'success' : 'info');
}

function initWarehouse() {
    $('warehouse-dialog').addEventListener('close', () => { currentWarehouseEditId = null; });

    try {
        collapsedCats = new Set(JSON.parse(localStorage.getItem('macro_tracker_collapsed') || '[]'));
    } catch { collapsedCats = new Set(); }

    $('warehouse-table-body').addEventListener('click', e => {
        const btn = e.target.closest('.cat-toggle');
        if (btn) toggleCategory(btn.dataset.cat);
    });
    $('warehouse-search').addEventListener('input', renderWarehouse);
    $('collapse-all-btn').addEventListener('click', toggleAllCategories);
    document.querySelector('.new-food-form').addEventListener('submit', e => { e.preventDefault(); addCustomFood(); });
    $('warehouse-dialog').querySelector('form').addEventListener('submit', e => { e.preventDefault(); saveWarehouseEdit(); });
    document.querySelector('[data-close-warehouse]').addEventListener('click', closeWarehouseModal);
    $('warehouse-table-body').addEventListener('click', e => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'edit') openWarehouseModal(btn.dataset.foodId);
        if (btn.dataset.action === 'delete') deleteWarehouseItem(btn.dataset.foodId);
    });
    $('warehouse-table-body').addEventListener('change', e => {
        if (e.target.matches('input[data-food-id]')) toggleFoodActive(e.target.dataset.foodId, e.target);
    });
}

export { renderWarehouse, initWarehouse };
