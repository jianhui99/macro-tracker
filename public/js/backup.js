import { $, localDate } from './helpers.js';
import { api } from './api.js';
import { showToast, withBusy } from './ui.js';
import { validateBackup } from './backup-format.js';

let pendingBackup = null;

async function exportData() {
    const btn = $('export-data');
    if (btn.disabled) return;
    await withBusy(btn, async () => {
        let data;
        try { data = await api('/api/state'); } catch { return; }
        const backup = { schemaVersion: 1, exportedAt: new Date().toISOString(), ...data };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `macro-tracker-${localDate()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('存档已保存');
    });
}

async function previewImport() {
    const input = $('import-file');
    const file = input.files[0];
    if (!file || $('import-data').disabled) return;
    await withBusy($('import-data'), async () => {
        try {
            let data;
            try { data = JSON.parse(await file.text()); }
            catch { showToast('无法读取 JSON 备份，请检查文件内容。', 'error'); return; }
            try { validateBackup(data); }
            catch (err) { showToast(err.message, 'error'); return; }
            pendingBackup = data;
            const count = groups => Object.values(groups).reduce((sum, rows) => sum + rows.length, 0);
            $('import-summary').textContent = `食物 ${data.foods.length} 种、饮食 ${count(data.diary)} 条、饮水 ${count(data.water)} 条、体重 ${data.weights.length} 条、成就 ${Object.keys(data.achievements).length} 项、碳循环日程 ${Object.keys(data.dayPlan).length} 天，以及个人设置和 3 种碳循环配置。`;
            $('import-error').hidden = true;
            $('import-dialog').showModal();
        } finally { input.value = ''; }
    });
}

async function importData() {
    const btn = $('confirm-import');
    if (!pendingBackup || btn.disabled) return;
    await withBusy(btn, async () => {
        $('cancel-import').disabled = true;
        $('import-error').hidden = true;
        try {
            await api('/api/import', 'POST', pendingBackup);
            pendingBackup = null;
            $('import-dialog').close();
            location.reload();
        } catch {
            $('import-error').textContent = '读取存档未确认成功。请检查网络并刷新页面核对数据后再试。';
            $('import-error').hidden = false;
        } finally { $('cancel-import').disabled = false; }
    });
}

function initBackup() {
    $('export-data').addEventListener('click', exportData);
    $('import-data').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', previewImport);
    const dialog = $('import-dialog');
    dialog.querySelector('form').addEventListener('submit', e => { e.preventDefault(); importData(); });
    $('cancel-import').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', e => { if ($('confirm-import').disabled) e.preventDefault(); });
    dialog.addEventListener('click', e => { if (e.target === dialog && !$('confirm-import').disabled) dialog.close(); });
    dialog.addEventListener('close', () => { pendingBackup = null; });
}

export { exportData, previewImport, importData, initBackup };
