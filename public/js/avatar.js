import { spriteRects } from './sprites.js';
import { esc } from './helpers.js';

export const CLASSES = {
    '1.2': ['学者', 'menu_book', '久坐不动', '久坐不动（基本不运动）'],
    '1.375': ['旅人', 'hiking', '轻度活动', '轻度活动（每周运动 1-3 天）'],
    '1.55': ['冒险者', 'explore', '中度活动', '中度活动（每周运动 3-5 天）'],
    '1.725': ['战士', 'swords', '重度活动', '重度活动（每周运动 6-7 天）']
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function number(value, min, max) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function avatarTraits(profile) {
    const height = number(profile.height, 100, 250);
    const weight = number(profile.weight, 20, 400);
    const age = number(profile.age, 10, 100);
    return {
        height: height === null ? 1 : clamp(height / 170, .85, 1.15),
        width: height === null || weight === null ? 1 : clamp(Math.sqrt(weight / ((height / 100) ** 2 * 22)), .85, 1.25),
        age: age === null || !Number.isInteger(age) ? 'neutral' : age < 18 ? 'young' : age < 50 ? 'adult' : 'mature',
        gender: ['male', 'female'].includes(profile.gender) ? profile.gender : 'neutral',
        job: Object.hasOwn(CLASSES, String(profile.activity)) ? String(profile.activity) : ''
    };
}

const PALETTE = { h: '#594139', H: '#8A6250', s: '#F4C59A', S: '#D89468', w: '#FFF1CF',
    c: '#8173C5', C: '#504482', l: '#B6A1E8', g: '#E8B04B', G: '#99632E', b: '#73503C', B: '#43302C',
    p: '#45415D', P: '#2D293D', a: '#C2D4DC', A: '#738FA2', r: '#AB657F' };
const COATS = { '1.2': ['#8173C5', '#504482', '#B6A1E8'], '1.375': ['#6C9B65', '#3B6246', '#ADD58A'],
    '1.55': ['#B78452', '#765036', '#E3B780'], '1.725': ['#9CB6C8', '#536D8A', '#D4E6EC'], '': ['#89839B', '#55506A', '#B9B1CB'] };

export const AVATAR_PARTS = {
    head: [
        '.....kkkkkk.....',
        '...kkHHhhhhkk...',
        '..kHHHhhhhhhhk..',
        '..kHHhhhhhhhhk..',
        '..khhhhkhhhhkk..',
        '..khhhksskhhsk..',
        '..khkksssskkSk..',
        '.kksssssssssSkk.',
        '.ksSssssssssSsk.',
        '..kSssssssssSk..',
        '..kSssssssssSk..',
        '...kSsskkssSk...',
        '....kkSSSSkk....',
        '......kssk......'
    ],
    body: [
        '.....kggggk.....',
        '...kkclwwlckk...',
        '..kclclwwlCcck..',
        '..kclccllCCcck..',
        '..kcckcgCCkcck..',
        '..kcckcgCCkcck..',
        '..ksskcgCCkssk..',
        '..ksskggggkssk..',
        '...kkcGggGCkk...',
        '...kcccCCCCPk...',
        '...kppkPPkkPk...',
        '...kppkPPkkPk...',
        '...kppkPPkkPk...',
        '...kbbkBBkkPk...',
        '..kbbbkBBBkkk...',
        '..kkkkkkkkkk....'
    ],
    cape: [
        '....kkkkkkkkkk....',
        '...krrrrrrrrrPk...',
        '...krrrrrrrrrPk...',
        '..krrrrrrrrrrPPk..',
        '..krrrrrrrrrrPPk..',
        '..krrrrrrrrrrPPk..',
        '.krrrrrrrrrrrPPPk.',
        '.krrrrrrrrrrrPPPk.',
        '.krrrrrrrrrrrPPPk.',
        'krrrrrrrrrrrrPPPPk',
        'krrrrrrrrrrrrPPPPk',
        'krrrrrrrrrrrrPPPPk',
        'kPPPPPPPPPPPPPPPPk',
        '.kkkkkkkkkkkkkkkk.'
    ],
    hat: [
        '........kk........',
        '.......kllk.......',
        '......klccCk......',
        '.....klcccCCk.....',
        '...kkccccCCCCkk...',
        '..kggggggggggggk..'
    ],
    helmet: [
        '.....kkkkkk.....',
        '...kkaaaggaAkk..',
        '..kaaAAggAAAak..',
        '..kaAAAggAAAAk..',
        '..kggggggggggk..'
    ],
    book: ['kkkkkk', 'kgwwwk', 'kgwGGk', 'kgwwwk', 'kgwGGk', 'kgwwwk', 'kGGGGk', '.kkkk.'],
    staff: ['..kkk..', '.klllk.', '.klwlk.', '.kllCk.', '..kgk..', '..kbk..', '..kbk..', '..kbk..', '..kbk..', '..kbk..', '..kbk..', '..kbk..', '..kbk..', '..kbk..', '..kkk..'],
    sword: ['...k...', '..kwk..', '..kwa..', '..kwa..', '..kwa..', '..kwa..', '..kak..', '..kak..', 'kkgggkk', '.kkgkk.', '..kbk..', '..kbk..', '..kgk..', '...k...'],
    shield: ['..kkkkk..', 'kkggaaakk', 'kggaaAAAk', 'kggagAAAk', 'kgagggAAk', 'kgaagAAAk', '.kaagAAk.', '.kaagAAk.', '..kaAAk..', '...kAk...', '....k....'],
    hand: ['.kkkk.', 'kssssk', 'kSsSsk', '.kkkk.'],
    backpack: ['..kkkkkkkkkkkkkkkkkk..', '.kbblbbbbbbbbbbbbBBBk.', 'kbblbbbbbbbbbbbbBBBBBk', 'kbgggbbbbbbbbbbbbgggBk', 'kbgggbbbbbbbbbbbbgggBk', 'kbgggbbbbbbbbbbbbgggBk', 'kbgggbbbbbbbbbbbbgggBk', 'kbgggbbbbbbbbbbbbgggBk', '.kBBBbbbbbbbbbbBBBBBk.', '..kkkkkkkkkkkkkkkkkk..']
};

// A container with data-pose="peek" gets the hero leaning over a card's top edge: the svg ends just below the
// chest line, the body is clipped there, and two hands overlap the edge (see .home-avatar in avatar.css)
export function renderAvatar(container, profile, nickname = '') {
    const t = avatarTraits(profile);
    const signature = JSON.stringify([t, nickname]);
    if (container.dataset.avatar === signature) return;
    container.dataset.avatar = signature;
    const [c, C, l] = COATS[t.job];
    const pal = { ...PALETTE, c, C, l, ...(t.age === 'mature' ? { h: '#9B9AA5', H: '#D3CED0' } : {}) };
    const pixels = (px, x, y, cls = '') => `<g transform="translate(${x} ${y})" class="${cls}">${spriteRects({ pal, px })}</g>`;
    // Add or remove whole grid cells so body proportions never stretch the pixels.
    const body = AVATAR_PARTS.body.flatMap((row, y) => {
        const adjusted = [...row].map((cell, x) => [5, 10].includes(x) ? t.width > 1.08 ? cell + cell : t.width < .94 ? '' : cell : cell).join('');
        return [5, 11].includes(y) ? t.height > 1.06 ? [adjusted, adjusted] : t.height < .94 ? [] : [adjusted] : [adjusted];
    });
    const bodyY = 35 - body.length;
    const headY = bodyY - 13;
    const hair = t.gender === 'female' ? pixels(['kk............kk', 'khk..........khk', 'khk..........khk', 'khk..........khk', 'khk..........khk', 'khhk........khhk', '.kkk........kkk.'], 8, headY + 8) : '';
    const gear = t.job === '1.2' ? pixels(AVATAR_PARTS.book, 7, bodyY + 5, 'avatar-gear') + pixels(AVATAR_PARTS.staff, 19, bodyY - 5, 'avatar-gear')
        : t.job === '1.725' ? pixels(AVATAR_PARTS.shield, 6, bodyY + 4, 'avatar-gear') + pixels(AVATAR_PARTS.sword, 19, bodyY - 3, 'avatar-gear')
        : t.job === '1.55' ? pixels(AVATAR_PARTS.sword, 19, bodyY - 3, 'avatar-gear') : '';
    const caption = `<div class="avatar-caption"><b translate="no"></b><span></span></div>`;
    const face = `${pixels(AVATAR_PARTS.head, 8, headY)}
            <g transform="translate(8 ${headY})">
                <g class="avatar-eyes"><path d="M5 8h2v2H5zm5 0h2v2h-2z" fill="#2A1B14"/><path d="M5 8h1v1H5zm5 0h1v1h-1z" fill="#FFF1CF"/></g>
                <path class="avatar-eyes-closed" d="M5 9h2v1H5zm5 0h2v1h-2z" fill="#2A1B14"/>
                ${t.age === 'young' ? '<path d="M3 10h2v1H3zm9 0h2v1h-2z" fill="#DF968C"/>' : ''}
            </g>
            ${t.job === '1.2' ? pixels(AVATAR_PARTS.hat, 7, headY - 3) : ''}
            ${t.job === '1.725' ? pixels(AVATAR_PARTS.helmet, 8, headY) : ''}`;
    if (container.dataset.pose === 'peek') {
        // The card edge sits two rows below the collar; one spare row above the hat leaves room to breathe
        const edge = bodyY + 2, top = edge - 19;
        container.innerHTML = `<svg class="avatar-art" viewBox="0 ${top} 32 21" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
        <g class="avatar-breathe">
            <svg y="${top}" width="32" height="${edge - top}" viewBox="0 ${top} 32 ${edge - top}">${hair}${pixels(body, (32 - body[0].length) / 2, bodyY)}</svg>
            ${face}
        </g>
        ${pixels(AVATAR_PARTS.hand, 7, edge - 2, 'avatar-hand')}${pixels(AVATAR_PARTS.hand, 19, edge - 2, 'avatar-hand')}
    </svg>${caption}`;
    } else {
        container.innerHTML = `<svg class="avatar-art" viewBox="0 0 32 40" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
        <path d="M8 35h16v1h4v2h-4v1H8v-1H4v-2h4z" fill="#B98D4A"/>
        <path d="M8 36h16v1h3v1H5v-1h3z" fill="#40354F"/>
        <g class="avatar-breathe">
            ${t.job === '1.55' ? pixels(AVATAR_PARTS.cape, 7, bodyY + 1, 'avatar-gear') : ''}
            ${t.job === '1.375' ? pixels(AVATAR_PARTS.backpack, 5, bodyY + 1) : ''}
            ${hair}
            ${pixels(body, (32 - body[0].length) / 2, bodyY)}
            ${face}
            ${gear}
        </g>
    </svg>${caption}`;
    }
    const name = nickname.trim() || '· · ·';
    const job = t.job ? CLASSES[t.job][0] : '等待选择职业';
    container.querySelector('b').textContent = name;
    container.querySelector('.avatar-caption span').textContent = job;
    if ('tip' in container.dataset) container.dataset.tip = esc(`${name} · ${job}`);
}
