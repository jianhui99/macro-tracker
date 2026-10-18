import { $ } from './helpers.js';
import { showToast } from './ui.js';

// ── Access key ──
const KEY_STORAGE = 'macro_tracker_api_key';

let apiKey = (() => { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } })();

const authHeaders = () => ({ Authorization: `Bearer ${apiKey}` });

let keyPrompt = null;

let resolveKeyPrompt = null;

// Concurrent 401s share one open dialog
function askForKey(rejected) {
    if (!keyPrompt) {
        $('key-error').hidden = !rejected;
        $('key-input').value = '';
        $('key-dialog').showModal();
        keyPrompt = new Promise(resolve => { resolveKeyPrompt = resolve; });
    }
    return keyPrompt;
}

function submitKey() {
    apiKey = $('key-input').value.trim();
    try { localStorage.setItem(KEY_STORAGE, apiKey); } catch { /* storage unavailable */ }
    $('key-dialog').close();
    keyPrompt = null;
    resolveKeyPrompt();
}

// ── API ──
async function api(url, method = 'GET', body) {
    const sentKey = apiKey;
    let res;
    try {
        res = await fetch(url, {
            method,
            headers: { ...authHeaders(), ...(body && { 'Content-Type': 'application/json' }) },
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (err) {
        console.error(`[api] ${method} ${url} network error`, err, body);
        showToast('连不上服务器，请检查网络', 'error');
        throw err;
    }
    if (res.status === 401) {
        // A key entered while this request was in flight may already be the right one
        if (apiKey === sentKey) await askForKey(Boolean(sentKey));
        return api(url, method, body);
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[api] ${method} ${url} -> ${res.status}`, text, body);
        showToast(`操作失败（${res.status}），数据未保存`, 'error');
        throw new Error(`${method} ${url} -> ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
}

function initApi() {
    // The app is unusable without a key, so Esc must not dismiss the dialog
    $('key-dialog').addEventListener('cancel', e => e.preventDefault());
    $('key-dialog').querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        submitKey();
    });
}

export { api, initApi, authHeaders };
