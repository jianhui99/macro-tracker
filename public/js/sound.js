// Game audio, synthesized with Web Audio so there are no sound files to load.
// Browsers only allow audio after a user gesture, so the context and the background loop start on the first tap or key.
const PREF_KEY = 'macro_tracker_sound';
const MUSIC_VOL = 0.32;
const SFX_VOL = 0.7;

let pref = 'all';
try { pref = localStorage.getItem(PREF_KEY) || 'all'; } catch { /* storage unavailable */ }

let ctx = null, sfxBus, musicBus, padBus, noiseBuf;

const hz = midi => 440 * 2 ** ((midi - 69) / 12);

function voice(dest, freq, t, dur, type = 'triangle', vol = 0.2, { attack = 0.005, to } = {}) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
}

// Band-passed white noise for swooshes, splashes and sparkle
function noise(t, dur, vol, from, to) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noiseBuf;
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
}

const arp = (t, notes, step, dur, type, vol) =>
    notes.forEach((n, i) => voice(sfxBus, hz(n), t + i * step, dur, type, vol));

const chord = (t, notes, dur, type, vol) =>
    notes.forEach(n => voice(sfxBus, hz(n), t, dur, type, vol, { attack: 0.02 }));

// [priority, play]: within a moment, a lower-priority sound is dropped so one action never stacks a pile of effects
const SOUNDS = {
    click:   [0, t => voice(sfxBus, 1400, t, 0.05, 'triangle', 0.12, { to: 900 })],
    tab:     [1, t => { voice(sfxBus, hz(76), t, 0.07, 'square', 0.04); voice(sfxBus, hz(83), t + 0.05, 0.1, 'square', 0.04); }],
    save:    [2, t => arp(t, [72, 76, 79], 0.07, 0.2, 'square', 0.05)],
    food:    [2, t => { voice(sfxBus, hz(83), t, 0.08, 'square', 0.06); voice(sfxBus, hz(88), t + 0.07, 0.3, 'square', 0.06); }],
    water:   [2, t => { voice(sfxBus, 280, t, 0.12, 'sine', 0.3, { to: 720 }); voice(sfxBus, 420, t + 0.1, 0.14, 'sine', 0.24, { to: 1050 }); noise(t, 0.25, 0.06, 1200, 400); }],
    delete:  [2, t => { noise(t, 0.24, 0.3, 2600, 300); voice(sfxBus, 330, t, 0.22, 'triangle', 0.14, { to: 110 }); }],
    error:   [3, t => { voice(sfxBus, 150, t, 0.12, 'square', 0.07); voice(sfxBus, 110, t + 0.13, 0.22, 'square', 0.07); }],
    over:    [3, t => [0, 0.17].forEach(d => voice(sfxBus, 233, t + d, 0.14, 'sawtooth', 0.06, { to: 210 }))],
    goal:    [3, t => arp(t, [72, 76, 79, 84], 0.08, 0.45, 'triangle', 0.16)],
    star:    [4, t => { arp(t, [88, 91, 95, 100], 0.06, 0.4, 'triangle', 0.1); noise(t, 0.45, 0.05, 6000, 10000); }],
    // Opening a medal: the flip whoosh, then a strike on landing that rings brighter and longer with each metal
    'medal-bronze':  [4, t => { noise(t, 0.35, 0.14, 700, 3000); voice(sfxBus, hz(67), t + 0.32, 0.5, 'square', 0.04); chord(t + 0.32, [67, 74], 0.6, 'triangle', 0.13); }],
    'medal-silver':  [4, t => { noise(t, 0.35, 0.14, 700, 4500); arp(t + 0.3, [79, 86], 0.06, 0.9, 'triangle', 0.11); voice(sfxBus, hz(91), t + 0.42, 0.9, 'sine', 0.06); }],
    'medal-gold':    [4, t => { noise(t, 0.35, 0.14, 700, 5500); arp(t + 0.28, [84, 88, 91], 0.06, 1, 'triangle', 0.1); chord(t + 0.46, [72, 96], 1.2, 'sine', 0.07); noise(t + 0.4, 0.6, 0.04, 6000, 9000); }],
    'medal-diamond': [4, t => { noise(t, 0.35, 0.14, 700, 6500); arp(t + 0.26, [91, 95, 98, 103, 107], 0.05, 1.4, 'sine', 0.09); chord(t + 0.5, [79, 86, 91], 1.6, 'triangle', 0.06); noise(t + 0.3, 1.2, 0.05, 8000, 12000); }],
    award:   [5, t => { arp(t, [67, 72, 76], 0.1, 0.16, 'square', 0.05); chord(t + 0.3, [72, 76, 79, 84], 0.9, 'triangle', 0.09); }],
    // The page tearing open: a low boom under a whoosh, a climbing arpeggio, then a held fanfare chord for the title
    chapter: [6, t => { noise(t, 0.7, 0.2, 300, 3200); voice(sfxBus, 70, t, 0.9, 'sine', 0.35, { to: 40 }); arp(t + 0.45, [60, 67, 72, 76, 79], 0.09, 0.3, 'square', 0.045); chord(t + 0.9, [72, 79, 84, 88], 2, 'triangle', 0.1); noise(t + 0.9, 1.4, 0.04, 5000, 9000); }],
    levelup: [6, t => { arp(t, [60, 64, 67, 72, 76, 79], 0.06, 0.18, 'square', 0.045); chord(t + 0.38, [84, 88, 91], 1.3, 'triangle', 0.1); noise(t + 0.38, 0.8, 0.04, 5000, 9000); }]
};

let last = { at: -1, pri: -1, name: '' };

function sfx(name) {
    if (!ctx || ctx.state !== 'running' || pref === 'off') return;
    const [pri, play] = SOUNDS[name];
    const now = ctx.currentTime;
    if (now - last.at < 0.15 && (pri < last.pri || name === last.name)) return;
    last = { at: now, pri, name };
    play(now + 0.01);
}

// ── Background loop ──
// A slow A-minor harp arpeggio over a bass and a filtered pad: Am F C G | Am F G E, eight eighth notes per bar
const BARS = [
    [45, [69, 72, 76, 81]], [41, [65, 69, 72, 77]], [48, [67, 72, 76, 79]], [43, [67, 71, 74, 79]],
    [45, [69, 72, 76, 81]], [41, [65, 69, 72, 77]], [43, [67, 71, 74, 79]], [40, [64, 68, 71, 76]]
];
const ARP = [0, 2, 1, 2, 3, 2, 1, 2];
const STEP = 60 / 76 / 2;

let musicTimer = null, nextStep = 0, nextAt = 0;

function playStep(i, t) {
    const [bass, tones] = BARS[i >> 3];
    const s = i & 7;
    if (s === 0) {
        tones.slice(0, 3).forEach(n => [-6, 6].forEach(cents =>
            voice(padBus, hz(n - 12) * 2 ** (cents / 1200), t, STEP * 8.5, 'sawtooth', 0.02, { attack: 0.9 })));
    }
    if (s === 0 || s === 4) voice(musicBus, hz(bass), t, STEP * 3.5, 'triangle', 0.13, { attack: 0.02 });
    voice(musicBus, hz(tones[ARP[s]]), t, STEP * 2.2, 'triangle', 0.05);
}

// Look-ahead scheduler: a coarse timer queues notes on the precise audio clock
function scheduleMusic() {
    while (nextAt < ctx.currentTime + 0.4) {
        playStep(nextStep, nextAt);
        nextAt += STEP;
        nextStep = (nextStep + 1) % (BARS.length * 8);
    }
}

function startMusic() {
    if (!ctx || musicTimer || pref !== 'all') return;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(0.0001, now);
    musicBus.gain.exponentialRampToValueAtTime(MUSIC_VOL, now + 2.5);
    nextAt = now + 0.1;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 100);
}

function stopMusic() {
    if (!musicTimer) return;
    clearInterval(musicTimer);
    musicTimer = null;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(musicBus.gain.value, now);
    musicBus.gain.linearRampToValueAtTime(0, now + 0.4);
}

function unlock() {
    if (!ctx) {
        ctx = new AudioContext();
        sfxBus = ctx.createGain();
        sfxBus.gain.value = SFX_VOL;
        sfxBus.connect(ctx.destination);
        musicBus = ctx.createGain();
        musicBus.connect(ctx.destination);
        padBus = ctx.createBiquadFilter();
        padBus.type = 'lowpass';
        padBus.frequency.value = 900;
        padBus.connect(musicBus);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        noiseBuf.getChannelData(0).forEach((_, i, data) => { data[i] = Math.random() * 2 - 1; });
    }
    // Mobile browsers can suspend the context again (calls, other apps), so every gesture re-checks
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    startMusic();
}

const soundPref = () => pref;

function setSoundPref(next) {
    pref = next;
    try { localStorage.setItem(PREF_KEY, next); } catch { /* storage unavailable */ }
    if (next === 'all') startMusic(); else stopMusic();
}

function initSound() {
    document.addEventListener('click', e => {
        unlock();
        const el = e.target.closest('button, a[href], summary, [role="button"], [data-level-open]');
        if (!el || el.disabled) return;
        sfx(el.matches('.rail-item, [role="tab"]') ? 'tab' : 'click');
    }, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('change', e => { if (e.target.closest('.seg')) sfx('tab'); }, true);
    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else ctx.resume();
    });
}

export { sfx, initSound, soundPref, setSoundPref };
