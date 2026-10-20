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
        job: Object.hasOwn(CLASSES, String(profile.activity)) ? String(profile.activity) : '',
        skin: Number.isInteger(profile.skin) && profile.skin >= 1 && profile.skin <= SKINS.length ? profile.skin : 0
    };
}

const PALETTE = { h: '#594139', H: '#8A6250', s: '#F4C59A', S: '#D89468', w: '#FFF1CF',
    c: '#8173C5', C: '#504482', l: '#B6A1E8', g: '#E8B04B', G: '#99632E', b: '#73503C', B: '#43302C',
    p: '#45415D', P: '#2D293D', a: '#C2D4DC', A: '#738FA2', r: '#AB657F', y: '#FFE38A', Y: '#FF9A3C',
    d: '#8C5A3C', D: '#5A3824', e: '#FFE38A', z: '#FFF1CF' };
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
    sword: ['...k...', '..kzk..', '..kza..', '..kza..', '..kza..', '..kza..', '..kak..', '..kak..', 'kkgggkk', '.kkgkk.', '..kbk..', '..kbk..', '..kgk..', '...k...'],
    shield: ['..kkkkk..', 'kkggaaakk', 'kggaaAAAk', 'kggagAAAk', 'kgagggAAk', 'kgaagAAAk', '.kaagAAk.', '.kaagAAk.', '..kaAAk..', '...kAk...', '....k....'],
    hand: ['.kkkk.', 'kssssk', 'kSsSsk', '.kkkk.'],
    // Skin pieces: d/D is the skin's cloth, a/A its metal and e its gem or highlight
    bandana: ['..kddddddddddkk.', '..kDDDDDDDDDDkdk', '.............kDk'],
    hood: ['.....kkkkkkkk.....', '...kkddddddddkk...', '..kddddddddddddk..', '.kdddddddddddddDk.', '.kddDkkkkkkkkDdDk.',
        '.kdDk........kDDk.', '.kdDk........kDDk.', '.kdDk........kDDk.', '.kddk........kDdk.', 'kdddk........kDddk', 'kkkkk........kkkkk'],
    cap: ['............kek.', '...kkkkkk..keek.', '..kddddddkkeek..', '.kddddddddddkk..', 'kkDDDDDDDDDDDDkk'],
    plume: ['.......kk.......', '......keek......', '......kek.......'],
    horns: ['kk................kk', 'kwk..............kwk', '.kwk............kwk.', '..kwk..........kwk..'],
    circlet: ['..kdddddeddddk..'],
    crown: ['...k...kk...k...', '..kek.keek.kek..', '..kdkkkddkkkdk..', '..kddddddddddk..', '..kDeDDeeDDeDk..'],
    laurel: ['.kk............kk.', 'kddk..........kddk', '.kddk........kddk.'],
    halo: ['.kkkkkkkk.', 'keeeeeeeek', '.kkkkkkkk.'],
    pauldronL: ['.kkk', 'kaaA', 'kAAk'],
    pauldronR: ['kkk.', 'Aaak', 'kAAk'],
    scarf: ['.kkkkkkkk.', 'kddddddddk', '.kDDdddDk.', '..kddk....', '..kDk.....'],
    wingL: ['kk.....', 'kwkk...', 'kwwwkk.', '.kwwwwk', '.kwwwwk', '..kwwwk', '...kwwk', '....kk.'],
    sparkle: ['.e.', 'eye', '.e.'],
    patch: ['eDe', 'DeD'],
    lantern: ['..kkk..', '.k...k.', 'kkgggkk', 'kYyyyYk', 'kyyYyyk', 'kYyyyYk', 'kkgggkk', '.kkkkk.'],
    coins: ['...kkk...', '..kgggk..', '.kgGgGgk.', 'kgggggggk', 'kGgGgGgGk', 'kkkkkkkkk'],
    scroll: ['.kkkkkkk.', 'kwwwrwwwk', 'kGwwrwwGk', '.kkkkkkk.'],
    backpack: ['..kkkkkkkkkkkkkkkkkk..', '.kbblbbbbbbbbbbbbBBBk.', 'kbblbbbbbbbbbbbbBBBBBk', 'kbgggbbbbbbbbbbbbgggBk', 'kbgggbbbbbbbbbbbbgggBk', 'kbgggbbbbbbbbbbbbgggBk', 'kbgggbbbbbbbbbbbbgggBk', 'kbgggbbbbbbbbbbbbgggBk', '.kBBBbbbbbbbbbbBBBBBk.', '..kkkkkkkkkkkkkkkkkk..']
};

// One skin per level title, from village rags up to legendary gear. A skin restyles clothes, headgear and extras;
// the class's weapons stay, since they show the daily activity level, but their material climbs with the skin:
// wood, rust and dull iron for the first titles, then steel trimmed in gold from Lv 5.
// coat: c/C/l, metal: a/A (also the shield), cloth: d/D, gem: e, cape: r, blade: z, trim: g/G (belt, collar, hilt);
// head replaces the class hat or helmet.
export const SKINS = [
    { coat: ['#8C7E68', '#5E5444', '#A89A82'], cloth: ['#6E5A42', '#4A3C2C'], gem: '#C4AE84', metal: ['#9A7650', '#664C32'], blade: '#B08A5A',
        trim: ['#7A6446', '#4E3E2A'], extras: ['patches'] },
    { coat: ['#7E6A50', '#544432', '#9E8A6C'], cloth: ['#6A4A34', '#463020'], gem: '#B49A72', metal: ['#8C6E58', '#5C4636'], blade: '#9C948A',
        trim: ['#7A6446', '#4E3E2A'], head: 'bandana', extras: ['patches'] },
    { coat: ['#5A7646', '#3A4E2E', '#86A06E'], cloth: ['#4E6438', '#324226'], metal: ['#8A6A48', '#5A442E'], blade: '#BEBAB0',
        trim: ['#8A6A44', '#5A4228'], head: 'hood' },
    { coat: ['#A0573A', '#683424', '#D88A5A'], cloth: ['#C0392B', '#7A2418'], gem: '#FFB347', metal: ['#A8ACB0', '#6A6E74'], blade: '#D8D8D0',
        trim: ['#B08850', '#6E5430'], head: 'bandana', extras: ['embers'] },
    { coat: ['#4F6FA8', '#2F4570', '#8FB0E0'], cloth: ['#3A4F80', '#243258'], gem: '#E84A4A', head: 'cap' },
    { coat: ['#3E8C8C', '#255A5A', '#7CC6C0'], cloth: ['#D04848', '#8A2C2C'], extras: ['scarf'] },
    { coat: ['#5A5568', '#3A3646', '#8C87A0'], cloth: ['#3E3A4C', '#26232F'], head: 'hood' },
    { coat: ['#7A8C3E', '#4E5A26', '#B8C870'], cloth: ['#5E7030', '#3A4A1C'], gem: '#F4F0D8', head: 'cap', cape: '#6E7E38' },
    { coat: ['#7C8794', '#4E5662', '#B4BEC8'], metal: ['#A8B2BC', '#66707C'], head: 'helmet', extras: ['pauldrons'] },
    { coat: ['#B0703A', '#704420', '#E0A060'], metal: ['#D08A4A', '#8A5226'], head: 'helmet', extras: ['pauldrons'] },
    { coat: ['#8C5A34', '#5A361C', '#C08A58'], metal: ['#D08A4A', '#8A5226'], gem: '#E8C060', head: 'plume', extras: ['pauldrons'], cape: '#8A3A2A' },
    { coat: ['#6B5A3A', '#43381F', '#A28E62'], cloth: ['#7A6440', '#4A3A22'], head: 'hood', cape: '#5A4A2E' },
    { coat: ['#6A4C9C', '#40296A', '#A88AD8'], cloth: ['#C8A040', '#8A6A20'], gem: '#7CF0E0', head: 'circlet', extras: ['sparkles'], aura: '#A070F0' },
    { coat: ['#B87A40', '#7A4A20', '#E8B070'], metal: ['#D8964E', '#905A2A'], gem: '#D83A3A', head: 'plume', extras: ['pauldrons'], cape: '#A83030' },
    { coat: ['#B8C4D0', '#6F7F90', '#E8F0F8'], metal: ['#D8E2EC', '#8A98A8'], head: 'helmet', extras: ['pauldrons'], cape: '#3A5AA8' },
    { coat: ['#9CB0A8', '#5E726A', '#D0E0D8'], cloth: ['#B8C8C8', '#708484'], head: 'hood', cape: '#4E6A60' },
    { coat: ['#4A5A9C', '#2A3466', '#9AAAE8'], cloth: ['#D8E0F8', '#8A98C8'], gem: '#F8F4C8', head: 'circlet', cape: '#26305E', extras: ['sparkles'], aura: '#A8C0FF' },
    { coat: ['#D8D0C0', '#9A8E78', '#F4EEE2'], metal: ['#E8E0CC', '#A89A78'], gem: '#E8B04B', head: 'plume', extras: ['pauldrons'], cape: '#F0EAD8' },
    { coat: ['#A8B4C4', '#5E6A7C', '#DCE6F0'], metal: ['#E0E8F0', '#8C9AAC'], gem: '#3A5AD8', head: 'plume', extras: ['pauldrons'], cape: '#2C4A9C' },
    { coat: ['#D8A838', '#8C6420', '#F8D878'], cloth: ['#F0C850', '#A07820'], gem: '#D83A3A', head: 'circlet', cape: '#B02A2A', aura: '#FFD25A' },
    { coat: ['#E8D8B0', '#A8946A', '#FFF4D8'], metal: ['#F0C850', '#A07820'], gem: '#FFFFFF', head: 'plume', extras: ['pauldrons'], cape: '#F4ECD8', aura: '#FFD25A' },
    { coat: ['#C04030', '#7A2418', '#F07850'], cloth: ['#F08A30', '#A04A18'], gem: '#FFD04A', head: 'bandana', extras: ['embers'], aura: '#FF6A2A' },
    { coat: ['#3C8C64', '#205A3C', '#78C89A'], metal: ['#5AA87A', '#2E6A48'], head: 'horns', extras: ['pauldrons'], aura: '#5AE09A' },
    { coat: ['#3A5AA8', '#203670', '#7A9AE0'], metal: ['#E8C060', '#A07C30'], gem: '#E8E8F8', head: 'plume', extras: ['pauldrons'], cape: '#2A3E80' },
    { coat: ['#C89A30', '#7C5A18', '#F0D070'], cloth: ['#F4CC4C', '#A47A1C'], gem: '#D83A3A', head: 'crown', cape: '#A82A3A', aura: '#FFD25A' },
    { coat: ['#5AA8D8', '#306A98', '#A8DCF8'], cloth: ['#E8F4FC', '#9CC0D8'], gem: '#FFFFFF', head: 'cap', extras: ['wings'], aura: '#A8E0FF' },
    { coat: ['#3A2A6A', '#20163E', '#7A6AC0'], gem: '#FFE88A', head: 'hat', extras: ['sparkles'], aura: '#B090FF' },
    { coat: ['#4A3A48', '#2A1E28', '#8A6A80'], metal: ['#C8A040', '#7A5A20'], head: 'horns', extras: ['pauldrons'], cape: '#A0202A', aura: '#FF4A4A' },
    { coat: ['#F0E6C8', '#B09A60', '#FFF8E8'], cloth: ['#E0C060', '#9A7A30'], gem: '#FFF2A0', head: 'laurel', extras: ['halo', 'wings'], aura: '#FFE070' },
    { coat: ['#7CD8E8', '#3A8CA8', '#C8F4FF'], cloth: ['#C8F4FF', '#5AB0C8'], gem: '#FFFFFF', head: 'crown', cape: '#3A9CC0', extras: ['sparkles'], aura: '#7CF0FF' }
];

// data-pose="sheet" widens the stage onto a stone floor with a lantern, a coin stack and a scroll (角色面板).
// A container with data-pose="peek" gets the hero leaning over a card's top edge: the svg ends just below the
// chest line, the body is clipped there, and two hands overlap the edge (see .home-avatar in avatar.css)
export function renderAvatar(container, profile, nickname = '') {
    const t = avatarTraits(profile);
    const signature = JSON.stringify([t, nickname]);
    if (container.dataset.avatar === signature) return;
    container.dataset.avatar = signature;
    const skin = SKINS[t.skin - 1] || {};
    const [c, C, l] = skin.coat || COATS[t.job];
    const [a, A] = skin.metal || [PALETTE.a, PALETTE.A];
    const [d, D] = skin.cloth || [PALETTE.d, PALETTE.D];
    const [g, G] = skin.trim || [PALETTE.g, PALETTE.G];
    const pal = { ...PALETTE, c, C, l, a, A, d, D, g, G, e: skin.gem || PALETTE.e, r: skin.cape || PALETTE.r, z: skin.blade || PALETTE.z,
        ...(t.age === 'mature' ? { h: '#9B9AA5', H: '#D3CED0' } : {}) };
    const sprite = (palette, px, x, y, cls = '') => `<g transform="translate(${x} ${y})" class="${cls}">${spriteRects({ pal: palette, px })}</g>`;
    const pixels = (px, x, y, cls = '') => sprite(pal, px, x, y, cls);
    const has = extra => skin.extras?.includes(extra);
    // Add or remove whole grid cells so body proportions never stretch the pixels.
    const body = AVATAR_PARTS.body.flatMap((row, y) => {
        const adjusted = [...row].map((cell, x) => [5, 10].includes(x) ? t.width > 1.08 ? cell + cell : t.width < .94 ? '' : cell : cell).join('');
        return [5, 11].includes(y) ? t.height > 1.06 ? [adjusted, adjusted] : t.height < .94 ? [] : [adjusted] : [adjusted];
    });
    const bodyY = 35 - body.length;
    const headY = bodyY - 13;
    const bodyX = (32 - body[0].length) / 2;
    const P = AVATAR_PARTS;
    const HEADGEAR = {
        bandana: () => pixels(P.bandana, 8, headY + 2), hood: () => pixels(P.hood, 7, headY - 1), cap: () => pixels(P.cap, 8, headY - 2),
        helmet: () => pixels(P.helmet, 8, headY), plume: () => pixels(P.plume, 8, headY - 3) + pixels(P.helmet, 8, headY),
        horns: () => pixels(P.horns, 6, headY - 2) + pixels(P.helmet, 8, headY), circlet: () => pixels(P.circlet, 8, headY + 3),
        crown: () => pixels(P.crown, 8, headY - 3), laurel: () => pixels(P.laurel, 7, headY + 2), hat: () => pixels(P.hat, 7, headY - 3)
    };
    const headgear = skin.head ? HEADGEAR[skin.head]()
        : t.job === '1.2' ? HEADGEAR.hat() : t.job === '1.725' ? HEADGEAR.helmet() : '';
    // Worn over the body; wings, halo and sparkles sit behind or around the whole figure
    const outfit = (has('pauldrons') ? pixels(P.pauldronL, bodyX + 1, bodyY + 1) + pixels(P.pauldronR, bodyX + body[0].length - 5, bodyY + 1) : '')
        + (has('scarf') ? pixels(P.scarf, bodyX + 3, bodyY) : '')
        + (has('patches') ? pixels(P.patch, bodyX + 4, bodyY + 4) + pixels(P.patch, bodyX + body[0].length - 6, body.length + bodyY - 5) : '');
    const wings = has('wings') ? pixels(P.wingL, bodyX - 5, bodyY - 2) + pixels(P.wingL.map(row => [...row].reverse().join('')), bodyX + body[0].length - 2, bodyY - 2) : '';
    const halo = has('halo') ? pixels(P.halo, 11, headY - 4) : '';
    const sparkle = (x, y, i) => `<g transform="translate(${x} ${y})"><g class="avatar-sparkle" style="animation-delay:${-i * .55}s">${spriteRects({ pal, px: P.sparkle })}</g></g>`;
    const sparkles = has('sparkles') || has('embers')
        ? [[2, headY + 1], [27, headY + 5], [3, bodyY + 5], [27, bodyY + 1]].map(([x, y], i) => sparkle(x, y, i)).join('') : '';
    const aura = skin.aura ? ` has-aura" style="--aura:${skin.aura}` : '';
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
            ${headgear}${halo}`;
    if (container.dataset.pose === 'peek') {
        // The card edge sits two rows below the collar; one spare row above the hat leaves room to breathe
        const edge = bodyY + 2, top = edge - 19;
        container.innerHTML = `<svg class="avatar-art${aura}" viewBox="0 ${top} 32 21" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
        <g class="avatar-breathe">
            <svg y="${top}" width="32" height="${edge - top}" viewBox="0 ${top} 32 ${edge - top}">${hair}${pixels(body, bodyX, bodyY)}${outfit}</svg>
            ${face}${sparkles}
        </g>
        ${pixels(AVATAR_PARTS.hand, 7, edge - 2, 'avatar-hand')}${pixels(AVATAR_PARTS.hand, 19, edge - 2, 'avatar-hand')}
    </svg>${caption}`;
    } else {
        const sheet = container.dataset.pose === 'sheet';
        const props = sheet ? `<path d="M-6 37h44v2H-6z" fill="#2D293D"/><path d="M-6 37h44v1H-6z" fill="#45415D"/>
        ${sprite(PALETTE, P.lantern, -6, 29, 'avatar-lantern')}${sprite(PALETTE, P.coins, 28, 31)}${sprite(PALETTE, P.scroll, 30, 34)}` : '';
        container.innerHTML = `<svg class="avatar-art${aura}" viewBox="${sheet ? '-6 0 44 40' : '0 0 32 40'}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
        <path d="M8 35h16v1h4v2h-4v1H8v-1H4v-2h4z" fill="#B98D4A"/>
        <path d="M8 36h16v1h3v1H5v-1h3z" fill="#40354F"/>
        ${props}
        <g class="avatar-breathe">
            ${wings}
            ${t.job === '1.55' || (skin.cape && t.job !== '1.375') ? pixels(P.cape, 7, bodyY + 1, 'avatar-gear') : ''}
            ${t.job === '1.375' ? pixels(P.backpack, 5, bodyY + 1) : ''}
            ${hair}
            ${pixels(body, bodyX, bodyY)}${outfit}
            ${face}
            ${gear}${sparkles}
        </g>
    </svg>${caption}`;
    }
    const name = nickname.trim() || '· · ·';
    const job = t.job ? CLASSES[t.job][0] : '等待选择职业';
    container.querySelector('b').textContent = name;
    container.querySelector('.avatar-caption span').textContent = job;
    if ('tip' in container.dataset) container.dataset.tip = esc(`${name} · ${job}`);
}
