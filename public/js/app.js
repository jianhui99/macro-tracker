import { resetDiaryAnimation, renderFoodPicker, renderDiary, initDiary, setMeal, getDefaultMeal } from './diary.js';
import { hideFloatTip, initUi } from './ui.js';
import { renderWarehouse, initWarehouse } from './warehouse.js';
import { renderSummary, initSummary } from './summary.js';
import { renderAchievements, initAchievements, syncAchievements } from './achievements.js';
import { fillSettingsForm, fillCycleForm, renderWeights, initSettings } from './settings.js';
import { $, localDate } from './helpers.js';
import { loadState } from './state.js';
import { api } from './api.js';
import { loadSession, initSession, expireSession } from './session.js';
import { initAccount } from './account.js';
import { setRules, rulesVersion, rules } from './rules.js';
import { initWater, fillCustomWater } from './water.js';
import { initQuote, loadQuote } from './quote.js';
import { initLevel } from './level.js';
import { initBackup } from './backup.js';
import { startI18n } from './i18n.js';
import { initSound } from './sound.js';

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

async function init() {
    const startPage = pageFromHash();
    // Only the DOM here: page renderers need the loaded state
    showPage(startPage);
    setMeal(getDefaultMeal());
    try {
        await loadState();
        document.body.removeAttribute('data-auth-loading');
        $('diary-date').value = localDate();
        fillSettingsForm();
        fillCustomWater();
    } catch {
        document.body.removeAttribute('data-auth-loading');
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

async function start() {
    const data = await loadSession();
    if (!data.account) return expireSession();
    if (!data.account.onboarded) return location.replace('/character.html');
    const config = await api('/api/rules');
    setRules(config.rules, config.version);
    const labels = { ok: `达标（目标 -${rules.kcalBelow} 至 +${rules.kcalAbove} kcal）`, over: `超标（高于 +${rules.kcalAbove}）`, under: `缺口过大（低于 -${rules.kcalBelow}）`, band: `达标区间（目标 -${rules.kcalBelow} 至 +${rules.kcalAbove}）` };
    document.querySelectorAll('[data-rule-label]').forEach(el => { el.textContent = labels[el.dataset.ruleLabel]; });
    $('reload-rules').addEventListener('click', () => location.reload());
    // First, so every module renders into an already-translated page and the observer catches the rest
    startI18n();
    initSession();
    initAccount();
    initDiary(() => switchPage('warehouse'));
    initWater();
    initWarehouse();
    initSummary(navigateToDay);
    initAchievements();
    initSettings();
    initQuote();
    initLevel();
    initUi();
    initSound();
    document.querySelectorAll('.rail-item').forEach(btn =>
        btn.addEventListener('click', () => switchPage(btn.dataset.page)));
    initBackup();

    await init();
    async function checkRules() {
        if (document.hidden) return;
        try {
            const config = await api('/api/rules');
            if (config.version !== rulesVersion) $('rules-update').hidden = false;
        } catch { /* The next focus or interval will retry. */ }
    }
    window.addEventListener('focus', checkRules);
    setInterval(checkRules, 60000);
}
start().catch(() => location.replace('/login.html?error=login_failed'));
