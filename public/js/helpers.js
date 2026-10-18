const $ = id => document.getElementById(id);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt  = n => Math.round(n).toLocaleString('en-US');

const fmt1 = n => String(Math.round(n * 10) / 10);

const fmtKg = n => String(Math.round(n * 100) / 100);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// toISOString() is UTC, which reports yesterday before 08:00 in UTC+8; always use local dates
const localDate = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseLocalDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

const fmtMonthDay = ds => {
    const d = parseLocalDate(ds);
    return `${d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日`;
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// ── Diary: date ──
const diaryDate = () => $('diary-date').value;

const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export { fmt1, fmtKg, localDate, parseLocalDate, $, fmt, fmtMonthDay, reduceMotion, diaryDate, esc, WEEKDAYS, ymd };
