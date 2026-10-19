import { resetDiaryAnimation, renderFoodPicker, renderDiary, initDiary, setMeal, getDefaultMeal } from './diary.js';
import { hideFloatTip, initUi } from './ui.js';
import { renderWarehouse, initWarehouse } from './warehouse.js';
import { renderSummary, initSummary } from './summary.js';
import { renderAchievements, initAchievements, syncAchievements } from './achievements.js';
import { fillSettingsForm, fillCycleForm, renderWeights, initSettings } from './settings.js';
import { $, localDate } from './helpers.js';
import { loadState } from './state.js';
import { initApi } from './api.js';
import { initWater, fillCustomWater } from './water.js';
import { initQuote, loadQuote } from './quote.js';
import { initLevel } from './level.js';
import { initBackup } from './backup.js';

// ── Navigation ──
// The page lives in the URL hash so a reload stays on it
function pageFromHash() {
    const id = location.hash.slice(1);
    return id && document.getElementById(`page-${id}`)?.classList.contains('page') ? id : 'diary';
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('is-active', p.id === `page-${pageId}`));
    document.querySelectorAll('.rail-item').forEach(n => {
        if (n.dataset.page === pageId) n.setAttribute('aria-current', 'page');
        else n.removeAttribute('aria-current');
    });
    history.replaceState(null, '', pageId === 'diary' ? location.pathname + location.search : `#${pageId}`);
}

function switchPage(pageId) {
    showPage(pageId);
    resetDiaryAnimation();
    hideFloatTip();
    if (pageId === 'diary')     { renderFoodPicker(); renderDiary(); }
    if (pageId === 'warehouse') renderWarehouse(true);
    if (pageId === 'summary')   renderSummary(true);
    if (pageId === 'achievements') renderAchievements();
    if (pageId === 'settings')  { fillSettingsForm(); fillCycleForm(); renderWeights(); }
    // Wide layouts scroll inside <main>; at phone width <main> is overflow: visible and the document scrolls
    document.querySelector('main').scrollTop = 0;
    window.scrollTo(0, 0);
}

function navigateToDay(dateStr) {
    $('diary-date').value = dateStr;
    switchPage('diary');
}

initApi();
initDiary(() => switchPage('warehouse'));
initWater();
initWarehouse();
initSummary(navigateToDay);
initAchievements();
initSettings();
initQuote();
initLevel();
initUi();
document.querySelectorAll('.rail-item').forEach(btn =>
    btn.addEventListener('click', () => switchPage(btn.dataset.page)));
initBackup();

async function init() {
    const startPage = pageFromHash();
    // Only the DOM here: page renderers need the loaded state
    showPage(startPage);
    setMeal(getDefaultMeal());
    try {
        await loadState();
        $('diary-date').value = localDate();
        fillSettingsForm();
        fillCustomWater();
    } catch {
        showPage('diary');
        $('diary-log').innerHTML = '<div class="empty">数据加载失败，请检查网络后刷新页面。</div>';
        return;
    }
    renderFoodPicker();
    renderDiary();
    if (startPage !== 'diary') switchPage(startPage);
    syncAchievements();
    loadQuote();
}

init();
