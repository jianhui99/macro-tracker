// Applies the saved theme before first paint: a classic script in <head>, unlike the deferred modules.
// The 外观 control saves the choice and fires "themechange"; "system" follows the OS setting live.
(() => {
    const system = matchMedia('(prefers-color-scheme: light)');
    function apply() {
        let pref = 'dark';
        try { pref = localStorage.getItem('macro_tracker_theme') || 'dark'; } catch { /* storage unavailable */ }
        const light = pref === 'light' || (pref === 'system' && system.matches);
        document.documentElement.dataset.theme = light ? 'light' : 'dark';
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#F1E8D8' : '#110E18');
    }
    apply();
    // English pages stay hidden until i18n.js has translated the Chinese markup (it adds .i18n-ready)
    try { if (localStorage.getItem('macro_tracker_lang') === 'en') document.documentElement.lang = 'en'; } catch { /* storage unavailable */ }
    system.addEventListener('change', apply);
    document.addEventListener('themechange', apply);
})();
