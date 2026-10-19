import { groupFoodsByCategory } from './foods.js';
import { $, esc, fmt, fmt1, reduceMotion } from './helpers.js';
import { state } from './state.js';
import { showToast, showConfirm, replay } from './ui.js';
import { api } from './api.js';
import { renderFoodPicker } from './diary.js';
import { syncAchievements } from './achievements.js';
import { spriteKey, spriteSvg } from './sprites.js';

let currentWarehouseEditId = null;

// ── Warehouse: inventory grid + item card ──
const ALL = '';
let activeCat = ALL;
let selectedId = null;
let renderedId = null;
let newFoodId = null;
let activeOnly = true;

// Below this width the item card is a bottom sheet opened by tapping a slot
const sheetMq = matchMedia('(max-width: 1100px)');

// Item rarity by how often a food was logged, reusing the badge tiers
const RARITY = [[100, 'diamond', '传说'], [30, 'gold', '史诗'], [10, 'silver', '稀有'], [3, 'bronze', '优秀'], [0, '', '普通']];

const MACROS = [['protein', 4, 'egg_alt', '蛋白', 'g'], ['carbs', 4, 'rice_bowl', '碳水', 'g'], ['fat', 9, 'water_drop', '脂肪', 'g']];

// The macro that supplies most of the item's energy tints the sprite's glow and picks it when no keyword matches
function mainMacro(food) {
    const [key] = MACROS.reduce((best, m) => food[m[0]] * m[1] > food[best[0]] * best[1] ? m : best);
    return food[key] > 0 ? key : 'kcal';
}

function slotIcon(food) {
    const macro = mainMacro(food);
    return `<span class="slot-icon" data-macro="${macro}" aria-hidden="true">${spriteSvg(spriteKey(food, macro))}</span>`;
}

function useCounts() {
    const counts = {};
    for (const entries of Object.values(state.diary)) for (const e of entries) counts[e.foodId] = (counts[e.foodId] || 0) + 1;
    return counts;
}

function slotHtml(food, uses, i) {
    const [, tier, label] = RARITY.find(([min]) => uses >= min);
    const isActive = food.active !== false;
    const cls = `slot${tier ? ` r-${tier}` : ''}${isActive ? '' : ' is-off'}${food.id === newFoodId ? ' is-new' : ''}`;
    return `
        <button type="button" class="${cls}" data-food-id="${esc(food.id)}" aria-pressed="${food.id === selectedId}" style="--i:${Math.min(i, 24)}"
            aria-label="${esc(food.name)}，${label}，${esc(food.unit)}${isActive ? '' : '，已停用'}">
            ${slotIcon(food)}
            <span class="slot-name">${esc(food.name)}</span>
            <span class="slot-qty">${esc(food.unit)}</span>
            <span class="ms slot-off" aria-hidden="true">ac_unit</span>
        </button>`;
}

function updateCount() {
    const activeCount = state.foods.filter(f => f.active !== false).length;
    $('warehouse-count').textContent = `${state.foods.length} 种，${activeCount} 种启用`;
}

// Foods in a tab that match the search box, in category order
function visibleFoods(cat) {
    const groups = groupFoodsByCategory();
    const keyword = $('warehouse-search').value.trim().toLowerCase();
    return (cat === ALL ? Object.values(groups).flat() : groups[cat] || [])
        .filter(f => !activeOnly || f.active !== false)
        .filter(f => !keyword || f.name.toLowerCase().includes(keyword) || (f.category || '未分类').toLowerCase().includes(keyword));
}

function renderWarehouse(entering = false) {
    const cats = Object.keys(groupFoodsByCategory());
    if (!cats.includes(activeCat)) activeCat = ALL;
    if (entering) $('item-card').classList.remove('is-open');
    updateCount();
    $('inv-tabs').innerHTML = [ALL, ...cats].map(cat => `
        <button type="button" class="mode-tab" role="tab" data-cat="${esc(cat)}" aria-selected="${cat === activeCat}" aria-controls="inv-grid">
            ${cat === ALL ? '<span class="ms" aria-hidden="true">inventory_2</span>全部' : esc(cat)}<small>${visibleFoods(cat).length}</small>
        </button>`).join('');
    $('exist-categories').innerHTML = cats.map(cat => `<option value="${esc(cat)}">`).join('');
    renderGrid(entering);
}

function renderGrid(entering = false) {
    const grid = $('inv-grid');
    const foods = visibleFoods(activeCat);
    if (!foods.some(f => f.id === selectedId)) selectedId = foods[0]?.id ?? null;
    const counts = useCounts();
    if (!state.foods.length) {
        grid.innerHTML = '<div class="empty">背包是空的。点上方「新建食物」，录入第一个常吃的食物。</div>';
        $('new-food').open = true;
    } else if (!foods.length) {
        const keyword = $('warehouse-search').value.trim();
        grid.innerHTML = `<div class="empty">${keyword ? `没有匹配「${esc(keyword)}」的${activeOnly ? '启用' : ''}食物` : '没有启用的食物'}</div>`;
    } else {
        grid.innerHTML = foods.map((food, i) => slotHtml(food, counts[food.id] || 0, i)).join('');
    }
    newFoodId = null;
    grid.classList.remove('is-entering');
    if (entering && !reduceMotion.matches) replay(grid, 'is-entering');
    renderItemCard(counts);
}

function renderItemCard(counts = useCounts()) {
    const card = $('item-card');
    const body = $('item-body');
    const food = state.foods.find(f => f.id === selectedId);
    const swapped = selectedId !== renderedId;
    renderedId = selectedId;
    card.classList.toggle('is-off', !!food && food.active === false);
    if (!food) {
        closeSheet();
        body.innerHTML = '<div class="empty">点选背包里的物品查看属性</div>';
        return;
    }

    const uses = counts[food.id] || 0;
    const [, tier, label] = RARITY.find(([min]) => uses >= min);
    const name = esc(food.name);
    const energy = MACROS.map(([key, k]) => food[key] * k);
    const total = energy.reduce((a, b) => a + b, 0);
    const pct = energy.map(e => total ? Math.round(e / total * 100) : 0);
    body.innerHTML = `
        <div class="item-head${tier ? ` r-${tier}` : ''}">
            <span class="slot" aria-hidden="true">${slotIcon(food)}</span>
            <div class="item-title">
                <h2 class="item-name">${name}</h2>
                <span class="item-rarity">${label} · 记录 ${uses} 次</span>
            </div>
        </div>
        <p class="item-meta">消耗品 · ${esc(food.category || '未分类')} · 基准分量 ${esc(food.unit)}<span class="tag item-off">已停用</span></p>
        <h3 class="item-sub">属性加成</h3>
        <ul class="item-stats">
            <li data-macro="kcal"><span class="ms" aria-hidden="true">bolt</span>热量<b class="num">+${fmt(food.kcal)}</b><small>kcal</small></li>
            ${MACROS.map(([key, , icon, text, unit], i) => `<li data-macro="${key}"><span class="ms" aria-hidden="true">${icon}</span>${text}<b class="num">+${fmt1(food[key])}</b><small>${unit}${total ? ` · ${pct[i]}%` : ''}</small></li>`).join('')}
        </ul>
        ${total ? `<div class="item-split" role="img" aria-label="能量来源：${MACROS.map(([, , , text], i) => `${text} ${pct[i]}%`).join('，')}">${MACROS.map(([key], i) => `<i data-macro="${key}" style="--w:${pct[i]}%"></i>`).join('')}</div>` : ''}
        <div class="item-actions">
            <label class="item-toggle">在日记中启用<span class="switch"><input type="checkbox" role="switch" ${food.active !== false ? 'checked' : ''}
                aria-label="在日记中启用 ${name}" data-food-id="${esc(food.id)}"><span></span></span></label>
            <button type="button" class="btn btn-ghost btn-sm" data-action="edit"><span class="ms" aria-hidden="true">edit</span>编辑</button>
            <button type="button" class="icon-btn danger" data-action="delete" aria-label="删除 ${name}"><span class="ms" aria-hidden="true">delete</span></button>
        </div>`;
    body.classList.remove('is-swapping');
    if (swapped && !reduceMotion.matches) replay(body, 'is-swapping');
}

function selectSlot(slot) {
    $('inv-grid').querySelectorAll('.slot').forEach(s => s.setAttribute('aria-pressed', String(s === slot)));
    selectedId = slot.dataset.foodId;
    renderItemCard();
    if (sheetMq.matches) {
        $('item-card').classList.add('is-open');
        document.querySelector('.item-close').focus();
    }
}

function closeSheet() {
    const card = $('item-card');
    if (!card.classList.contains('is-open')) return;
    card.classList.remove('is-open');
    const slot = [...$('inv-grid').children].find(s => s.dataset.foodId === selectedId);
    slot?.focus();
}

function selectCategory(cat) {
    activeCat = cat;
    // Patch the tabs in place so the underline slides instead of re-rendering
    $('inv-tabs').querySelectorAll('.mode-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.cat === cat)));
    renderGrid(true);
}

async function addCustomFood() {
    const category = $('food-category').value.trim() || '未分类';
    const name     = $('food-name').value.trim();
    const unit     = $('food-unit').value.trim() || '100g';
    if (!name) { showToast('请填写食物名称', 'error'); $('food-name').focus(); return; }

    const food = await api('/api/foods', 'POST', {
        category, name, unit,
        kcal:    parseFloat($('food-kcal').value)    || 0,
        protein: parseFloat($('food-protein').value) || 0,
        carbs:   parseFloat($('food-carbs').value)   || 0,
        fat:     parseFloat($('food-fat').value)     || 0
    });
    state.foods.push(food);
    // Open the new item's tab with it selected so it is visible right away
    activeCat = food.category || '未分类';
    selectedId = newFoodId = food.id;
    $('warehouse-search').value = '';
    renderWarehouse();
    renderFoodPicker();
    ['food-name', 'food-unit', 'food-kcal', 'food-protein', 'food-carbs', 'food-fat'].forEach(id => { $(id).value = ''; });
    $('food-name').focus();
    showToast(`「${name}」已放入背包`);
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
    if (!(await showConfirm(`删除「${food ? food.name : '此食物'}」？已记录的历史日记会保留。`))) return;
    await api(`/api/foods/${encodeURIComponent(foodId)}`, 'DELETE');
    closeSheet();
    const slot = [...$('inv-grid').children].find(s => s.dataset.foodId === foodId);
    if (slot && !reduceMotion.matches) {
        slot.classList.add('is-leaving');
        await new Promise(r => setTimeout(r, 200));
    }
    state.foods = state.foods.filter(f => f.id !== foodId);
    renderWarehouse();
    renderFoodPicker();
    showToast('食物已删除', 'info');
}

// Patches the slot and card in place so the switch thumb and the slot's frost fade animate
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
    input.checked = food.active;
    [...$('inv-grid').children].find(s => s.dataset.foodId === foodId)?.classList.toggle('is-off', !food.active);
    if (food.id === selectedId) $('item-card').classList.toggle('is-off', !food.active);
    updateCount();
    renderFoodPicker();
    showToast(food.active ? `「${food.name}」已启用` : `「${food.name}」已停用，不再出现在日记里`, food.active ? 'success' : 'info');
}

function initWarehouse() {
    $('warehouse-dialog').addEventListener('close', () => { currentWarehouseEditId = null; });
    $('inv-tabs').addEventListener('click', e => {
        const tab = e.target.closest('.mode-tab');
        if (tab && tab.dataset.cat !== activeCat) selectCategory(tab.dataset.cat);
    });
    $('inv-grid').addEventListener('click', e => {
        const slot = e.target.closest('.slot');
        if (slot) selectSlot(slot);
    });
    $('item-card').addEventListener('click', e => {
        if (e.target.closest('.item-close')) closeSheet();
        const btn = e.target.closest('button[data-action]');
        if (btn?.dataset.action === 'edit') openWarehouseModal(selectedId);
        if (btn?.dataset.action === 'delete') deleteWarehouseItem(selectedId);
    });
    $('item-card').addEventListener('change', e => {
        if (e.target.matches('input[data-food-id]')) toggleFoodActive(e.target.dataset.foodId, e.target);
    });
    document.querySelector('.item-scrim').addEventListener('click', closeSheet);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && $('item-card').classList.contains('is-open') && !document.querySelector('dialog[open]')) closeSheet();
    });
    $('warehouse-search').addEventListener('input', () => renderWarehouse());
    $('inv-filter').addEventListener('change', e => {
        activeOnly = e.target.value === 'active';
        renderWarehouse(true);
    });
    document.querySelector('.new-food-form').addEventListener('submit', e => { e.preventDefault(); addCustomFood(); });
    $('warehouse-dialog').querySelector('form').addEventListener('submit', e => { e.preventDefault(); saveWarehouseEdit(); });
    document.querySelector('[data-close-warehouse]').addEventListener('click', closeWarehouseModal);
}

export { renderWarehouse, initWarehouse };
