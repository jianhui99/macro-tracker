import { api, errorMessage } from './api.js';
import { startI18n, toggleLang } from './i18n.js';
import { startPixelIcons } from './pixel-icons.js';
import { withBusy } from './ui.js';
import { $ } from './helpers.js';

startI18n();
startPixelIcons();
$('lang-toggle').addEventListener('click', toggleLang);
const params = new URLSearchParams(location.search);
const message = $('login-error');
function setMode(mode) {
    $('login-form').hidden = mode !== 'login';
    $('register-form').hidden = mode !== 'register';
    document.querySelectorAll('.title-menu [data-mode]').forEach(tab => tab.setAttribute('aria-pressed', tab.dataset.mode === mode));
    message.hidden = true;
    document.querySelector(`#${mode}-form input:not([value])`)?.focus();
}
if (params.get('error')) {
    message.textContent = errorMessage(params.get('error'));
    message.hidden = false;
    history.replaceState(null, '', location.pathname);
}
if (params.get('invite')) {
    $('register-form').elements.invite.setAttribute('value', params.get('invite'));
    setMode('register');
}
document.addEventListener('click', event => {
    const link = event.target.closest('[data-mode]');
    if (!link) return;
    event.preventDefault();
    setMode(link.dataset.mode);
});
for (const form of [$('login-form'), $('register-form')]) {
    form.addEventListener('submit', event => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(form));
        withBusy(event.submitter, async () => {
            await api(form.id === 'login-form' ? '/api/auth/login' : '/api/auth/register', 'POST', body);
            location.replace('/');
        }).catch(() => {});
    });
}
