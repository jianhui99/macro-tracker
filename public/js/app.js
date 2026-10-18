import { resetDiaryAnimation, renderFoodPicker, renderDiary, initDiary, setMeal, getDefaultMeal } from './diary.js';
import { hideFloatTip, showToast, initUi } from './ui.js';
import { renderWarehouse, initWarehouse } from './warehouse.js';
import { renderSummary, initSummary } from './summary.js';
import { renderAchievements, initAchievements, syncAchievements } from './achievements.js';
import { fillSettingsForm, fillCycleForm, renderWeights, initSettings } from './settings.js';
import { $, localDate } from './helpers.js';
import { state, loadState } from './state.js';
import { initApi } from './api.js';
import { initWater, fillCustomWater } from './water.js';
import { initQuote, loadQuote } from './quote.js';

// ── Navigation ──
function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('is-active', p.id === `page-${pageId}`));
    document.querySelectorAll('.rail-item').forEach(n => {
        if (n.dataset.page === pageId) n.setAttribute('aria-current', 'page');
        else n.removeAttribute('aria-current');
    });
    resetDiaryAnimation();
    hideFloatTip();
    if (pageId === 'diary')     { renderFoodPicker(); renderDiary(); }
    if (pageId === 'warehouse') renderWarehouse();
    if (pageId === 'summary')   renderSummary(true);
    if (pageId === 'achievements') renderAchievements();
    if (pageId === 'settings')  { fillSettingsForm(); fillCycleForm(); renderWeights(); }
    document.querySelector('main').scrollTop = 0;
}

function navigateToDay(dateStr) {
    $('diary-date').value = dateStr;
    switchPage('diary');
}

// ── Data export ──
function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `macro-tracker-${localDate()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('数据已导出');
}

initApi();
initDiary(() => switchPage('warehouse'));
initWater();
initWarehouse();
initSummary(navigateToDay);
initAchievements();
initSettings();
initQuote();
initUi();
document.querySelectorAll('.rail-item').forEach(btn =>
    btn.addEventListener('click', () => switchPage(btn.dataset.page)));
$('export-data').addEventListener('click', exportData);

async function init() {
    setMeal(getDefaultMeal());
    try {
        await loadState();
        $('diary-date').value = localDate();
        fillSettingsForm();
        fillCustomWater();
    } catch {
        $('diary-log').innerHTML = '<div class="empty">数据加载失败，请检查网络后刷新页面。</div>';
        return;
    }
    renderFoodPicker();
    renderDiary();
    syncAchievements();
    loadQuote();
}

init();
