import { api } from './api.js';

let state = { user: { height: 183, weight: 91, activity: 1.55, age: 27, gender: 'male' }, foods: [], diary: {}, achievements: {}, weights: [] };

// ── State ──
async function loadState() {
    state = await api('/api/state');
}

export { state, loadState };
