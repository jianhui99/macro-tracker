import { api } from './api.js';
import { $, reduceMotion } from './helpers.js';
import { lang, lookup } from './i18n.js';

const text = value => lang === 'en' ? lookup(value) ?? value : value;
const TASKS = [
    { id: 'targets', title: '认识今日目标', steps: [
        ['#hero-num', '剩余热量', '这里显示今天还剩多少热量预算，会随饮食记录更新。'],
        ['#chip-protein', '蛋白质目标', '除了热量，也要关注今天的蛋白质摄入。'],
        ['#day-stars', '今日星级', '记录饮食、热量达标和蛋白吃够，可以点亮今日星星。']
    ] },
    { id: 'meal', title: '记录第一餐', steps: [
        ['#meal-seg', '选择餐次', '先选择这笔饮食属于哪一餐。'],
        ['#food-list', '选择食物', '从背包选择食物；没有合适的食物时，也可以使用临时记录。'],
        ['#food-amount', '填写份量', '按旁边的单位填写实际吃下的份量，预览会自动计算营养。'],
        ['#go-food', '保存第一餐', '点击下方「去试试」结束讲解，再记录你实际吃过的食物。保存成功才会完成任务。']
    ] },
    { id: 'water', title: '记录一次饮水', steps: [
        ['#water-title', '今日饮水', '在这里查看已喝水量和今日目标。'],
        ['.water-actions', '添加饮水', '点击下方「去试试」后，选择实际喝下的水量，或填写自定义水量。保存成功才会完成任务。']
    ] },
    { id: 'growth', title: '认识成长系统', steps: [
        ['#chip-level', '等级与经验', '持续记录和达标可以积累经验，点击等级入口查看成长路线。'],
        ['.rail-item[data-page="achievements"]', '查看成就', '从这里查看已解锁的成就，以及下一个努力目标。']
    ] }
];

let checklist, tour, navigate, progress;
let pending = { completed: [] }, saving = Promise.resolve(), opening = false, hideTimer;

function failed() { $('onboarding-error').hidden = false; }

function hideChecklist() {
    if (document.querySelector('.driver-checklist')?.contains(document.activeElement)) {
        const button = $('open-onboarding');
        (button.getClientRects().length ? button : document.querySelector('.rail-item[aria-current="page"]'))?.focus();
    }
    checklist.hide();
}

function localizeChecklist() {
    document.querySelector('.driver-checklist-close-btn')?.setAttribute('aria-label', text('收起新手指南'));
    document.querySelectorAll('.driver-checklist-sr-only').forEach(el => {
        if (el.textContent) el.textContent = ` (${text('已完成')})`;
    });
}

function applyProgress(data) {
    progress = data;
    data.completed.forEach(id => checklist?.complete(id));
    localizeChecklist();
}

function saveProgress(change = {}) {
    pending = { ...pending, ...change, completed: [...new Set([...pending.completed, ...(change.completed ?? [])])] };
    saving = saving.then(async () => {
        const sent = pending;
        try {
            const data = await api('/api/onboarding', 'PATCH', sent);
            pending = { ...pending, completed: pending.completed.filter(id => !sent.completed.includes(id)) };
            if (sent.enabled) delete pending.enabled;
            if (sent.presented) delete pending.presented;
            $('onboarding-error').hidden = true;
            applyProgress(data);
            return data;
        } catch { failed(); return null; }
    });
    return saving;
}

function loadScript(name) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `/vendor/driver.js-1.10.2/${name}`;
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(new Error('guide_unavailable')); };
        document.head.append(script);
    });
}

async function startTask(task) {
    if (tour) return;
    clearTimeout(hideTimer);
    tour = true;
    checklist.close();
    navigate('diary');
    if (task.id === 'meal') $('tab-food').click();
    task.steps.forEach(([selector]) => {
        const panel = document.querySelector(selector)?.closest('.panel.is-collapsed');
        panel?.querySelector('.panel-toggle')?.click();
        panel?.classList.remove('is-expanding');
    });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (task.steps.some(([selector]) => !document.querySelector(selector)?.getClientRects().length)) {
        tour = null;
        failed();
        checklist.open();
        return;
    }
    const practice = task.id === 'meal' || task.id === 'water';
    tour = window.driver.js.driver({
        animate: !reduceMotion.matches, smoothScroll: false, stageRadius: 0,
        disableActiveInteraction: true, popoverClass: 'adventure-tour', showProgress: true,
        nextBtnText: text('下一步'), prevBtnText: text('上一步'),
        doneBtnText: text(practice ? '去试试' : '完成讲解'), closeBtnLabel: text('关闭讲解'),
        progressText: '{{current}} / {{total}}',
        steps: task.steps.map(([element, title, description]) => ({ element, popover: { title: text(title), description: text(description) } })),
        // onDestroyed is skipped if the first transition has not finished yet.
        onDestroyStarted: (_element, _step, { driver, reason }) => {
            driver.destroy();
            tour = null;
            if (reason === 'done' && !practice) void saveProgress({ completed: [task.id] });
            if (practice && reason === 'done') {
                $(task.id === 'meal' ? 'food-amount' : 'water-amount').focus({ preventScroll: true });
            } else {
                checklist.open();
                document.querySelector(`[data-item-id="${task.id}"]`)?.focus();
            }
        }
    });
    tour.drive();
}

async function ensureChecklist() {
    if (checklist) return;
    if (!window.driver?.js?.driver) await loadScript('driver.js.iife.js');
    if (!window.driverChecklist?.checklist) await loadScript('checklist.iife.js');
    checklist = window.driverChecklist.checklist({
        id: 'new-adventure', className: 'adventure-checklist', title: text('新手冒险'),
        description: text('四个小任务，开始你的健康冒险。'),
        launcherText: text('新手冒险'), progressText: '{{done}} / {{total}}',
        completeTitle: text('准备就绪！'), completeDescription: text('新手任务已完成，继续你的冒险吧。'),
        completeLauncherText: text('新手任务已完成'), completed: progress.completed,
        items: TASKS.map(task => ({ id: task.id, title: text(task.title), completeWhen: () => progress.completed.includes(task.id),
            action: () => { void startTask(task).catch(() => { tour = null; checklist.open(); failed(); }); } })),
        onEvent: ({ type }) => {
            if (type === 'opened') clearTimeout(hideTimer);
            if (type === 'closed' && progress.completed.length === TASKS.length && !tour) {
                hideTimer = setTimeout(hideChecklist, 0);
            }
            localizeChecklist();
        },
        onComplete: () => {
            checklist.open();
            hideTimer = setTimeout(hideChecklist, 3000);
        }
    });
}

async function openGuide() {
    if (opening || tour) return;
    opening = true;
    try {
        const data = await saveProgress({ enabled: true, presented: true });
        if (!data) return;
        await ensureChecklist();
        checklist.show();
        checklist.open();
        document.querySelector('.driver-checklist-item-trigger')?.focus();
    } catch { failed(); }
    finally { opening = false; }
}

async function refreshOnboarding() {
    if (!progress?.enabled || !checklist) return;
    try { applyProgress(await api('/api/onboarding')); } catch { failed(); }
}

async function initOnboarding(switchPage) {
    navigate = switchPage;
    opening = true;
    $('open-onboarding').disabled = true;
    $('open-onboarding').addEventListener('click', openGuide);
    $('retry-onboarding').addEventListener('click', openGuide);
    window.addEventListener('focus', () => { if (!tour) void refreshOnboarding(); });
    try {
        progress = await api('/api/onboarding');
        if (!progress.enabled) return;
        const data = await saveProgress();
        if (!data || data.completed.length === TASKS.length) return;
        await ensureChecklist();
        checklist.show();
        if (!data.presented) {
            checklist.open();
            void saveProgress({ presented: true });
        }
    } catch { failed(); }
    finally { opening = false; $('open-onboarding').disabled = false; }
}

export { initOnboarding, refreshOnboarding };
