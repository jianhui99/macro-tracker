// ── Pixel-art food sprites ──
// Each sprite is a 16×16 grid; '.' is transparent and every other character is a palette key.
// Rows are drawn as merged same-colour runs so the SVG stays small and edges stay crisp.

const OUTLINE = '#2A1B14';

const SPRITES = {
    meat: {
        pal: { h: '#FFC58A', a: '#E0894A', b: '#C0602E', c: '#8E3F1F', w: '#F4EAD2', g: '#C9BC9C' },
        px: [
            '................',
            '.....kkkkk......',
            '...kkhhaaakk....',
            '..khhaaaaaabk...',
            '..khaaaaaaabk...',
            '.khaaaaaaabbck..',
            '.kaaaaaaaabbck..',
            '.kaaaaaaabbcck..',
            '.kbaaaaabbccck..',
            '..kbbbbbcccckk..',
            '...kccccckkwwk..',
            '....kkkkk.kwgk..',
            '..........kwgkk.',
            '.........kwwwgk.',
            '.........kwgggk.',
            '..........kkkk..'
        ]
    },
    pork: {
        pal: { h: '#F5A877', a: '#D9784A', b: '#A9502E', c: '#7A3420', w: '#F4EAD2', g: '#C9BC9C' },
        px: [
            '................',
            '......kkkk......',
            '....kkhhaakk....',
            '...khhaaaaabk...',
            '..khhaaaaaaabk..',
            '..khaaaaaaaabk..',
            '.kkhaaaaaaaabkk.',
            'kwwaaaaaaaabbwwk',
            'kggaaaaaaabbbggk',
            '.kkaaaaaaabbbkk.',
            '..kaaaaaabbbck..',
            '..kbaaaabbbcck..',
            '...kbbbbbbcck...',
            '....kkcccckk....',
            '......kkkk......',
            '................'
        ]
    },
    oats: {
        pal: { o: '#EBD3A2', f: '#C99A5B', B: '#5C5CD6', l: '#D69A5C', w: '#B5793F', W: '#8A5428' },
        px: [
            '................',
            '................',
            '.....kkkkkk.....',
            '...kkofooBokk...',
            '..koofooooofok..',
            '.kooofoBooofook.',
            '.kofoooooofoook.',
            'kkkkkkkkkkkkkkkk',
            'klwwwwwwwwwwwwWk',
            'klwwwwwwwwwwwwWk',
            '.klwwwwwwwwwwWk.',
            '.kwwwwwwwwwwwWk.',
            '..kWwwwwwwwwWk..',
            '...kWWWWWWWWk...',
            '....kkkkkkkk....',
            '................'
        ]
    },
    fish: {
        pal: { h: '#BFE6FF', b: '#5BA8E0', d: '#3A78B5', w: '#FFFFFF', f: '#F2A65A' },
        px: [
            '................',
            '................',
            '.....kkkkk......',
            '....kffffk......',
            '..kkkkkkkkk...kk',
            '.kbhhbbbbbbk.kfk',
            'kbwkbbbbbbbbbkfk',
            'kbkkbbbbbbbbbffk',
            'kbbbbbbbbbbbbffk',
            '.kddbbbbbbbbdkfk',
            '..kdddddddddkkfk',
            '...kkkkkkkkk..kk',
            '.....kffk.......',
            '......kk........',
            '................',
            '................'
        ]
    },
    egg: {
        pal: { w: '#FFFAF0', g: '#D9D0C0', y: '#FFC93C', h: '#FFF2A8', o: '#E8962A' },
        px: [
            '................',
            '................',
            '.....kkkkk......',
            '...kkwwwwwkk....',
            '..kwwwwwwwwwk...',
            '.kwwwwkkkkwwwk..',
            '.kwwwkyyyykwwk..',
            'kwwwkyhyyyykwwk.',
            'kwwwkyyyyyykwwk.',
            'kwwwkyyyyyokwwk.',
            '.kwwwkyyyookwwk.',
            '.kwwwwkkkkwwwk..',
            '..kwwwwwwwwwgk..',
            '...kkgwwwggkk...',
            '.....kkkkkk.....',
            '................'
        ]
    },
    milk: {
        pal: { w: '#FFFFFF', g: '#C9D3E0', b: '#4C8FE0', d: '#2F64B0' },
        px: [
            '................',
            '......kkkk......',
            '.....kwwwgk.....',
            '....kwwwwwgk....',
            '...kkkkkkkkkk...',
            '...kwwwwwwwgk...',
            '...kbbbbbbbdk...',
            '...kbwwbbbbdk...',
            '...kbwwwbbbdk...',
            '...kbbbbbbbdk...',
            '...kwwwwwwwgk...',
            '...kwwwwwwwgk...',
            '...kwwwwwwwgk...',
            '...kgggggggggk..',
            '...kkkkkkkkkk...',
            '................'
        ]
    },
    tofu: {
        pal: { h: '#FFFFFF', w: '#F3EEDF', g: '#D6CDB4', s: '#B5AA8C' },
        px: [
            '................',
            '................',
            '.....kkkkkkkkk..',
            '....khhhhhhhhgk.',
            '...khhhhhhhhggk.',
            '..kkkkkkkkkkgsk.',
            '..kwwwwwwwwkssk.',
            '..kwwwwwwwwkssk.',
            '..kwwwwwwwwkssk.',
            '..kwwwwwwwwkssk.',
            '..kwwwwwwwwkssk.',
            '..kgwwwwwwgksk..',
            '..kggggggggkk...',
            '..kkkkkkkkkk....',
            '................',
            '................'
        ]
    },
    rice: {
        pal: { w: '#FFFFFF', h: '#F0EBDD', r: '#D04A3E', R: '#8E2A24', p: '#F5D37A' },
        px: [
            '................',
            '................',
            '.....kkkkkk.....',
            '...kkwwwwwwkk...',
            '..kwwwhwwwwwwk..',
            '.kwwwwwwwwhwwwk.',
            '.kwwhwwwwwwwwhk.',
            'kkkkkkkkkkkkkkkk',
            'krrrrrrrrrrrrrRk',
            '.krrprrrprrrpRk.',
            '.krrrrrrrrrrrRk.',
            '..kRrrrrrrrrRk..',
            '...kRRRRRRRRk...',
            '....kkkkkkkk....',
            '....kRRRRRRk....',
            '....kkkkkkkk....'
        ]
    },
    noodle: {
        pal: { c: '#C58B4A', y: '#FFD45C', o: '#E8A23A', b: '#4C7FD0', B: '#2C5296', p: '#FFFFFF' },
        px: [
            '...........kk...',
            '..........kck.kk',
            '.........kck.kck',
            '........kck.kck.',
            '.......kck.kck..',
            '...kkkkckkkckkk.',
            '..kyoyyoyyoyyok.',
            '.kyyoyyoyyoyyyyk',
            'kkkkkkkkkkkkkkkk',
            'kbbbbbbbbbbbbbBk',
            '.kbbpbbbpbbbpBk.',
            '.kbbbbbbbbbbbBk.',
            '..kBbbbbbbbbBk..',
            '...kBBBBBBBBk...',
            '....kkkkkkkk....',
            '................'
        ]
    },
    bread: {
        pal: { h: '#F6C27A', a: '#DA8B3C', b: '#A35E22', s: '#F8DDA8' },
        px: [
            '................',
            '................',
            '................',
            '.....kkkkkk.....',
            '...kkhhhhaakk...',
            '..khhaaaaaaabk..',
            '.khaasaaasaaabk.',
            '.khassaassaasbk.',
            'kaaaaaaaaaaaabbk',
            'kaaaaaaaaaaabbbk',
            'kbaaaaaaaaabbbbk',
            'kbbbbbbbbbbbbbbk',
            '.kkkkkkkkkkkkkk.',
            '................',
            '................',
            '................'
        ]
    },
    corn: {
        pal: { y: '#FFD23F', h: '#FFF0A0', o: '#E09A1E', g: '#7CC35A', G: '#3F8A3A' },
        px: [
            '................',
            '..........kkk...',
            '.........kyyhk..',
            '........kyhyyyk.',
            '.......kyyyhyyk.',
            '......kyhyyyyok.',
            '.....kyyyhyyok..',
            '....kgyyyyyook..',
            '...kgGyyyyook...',
            '..kgGGkyyook....',
            '.kgGGk.kkkk.....',
            '.kgGk...........',
            'kgGk............',
            'kGk.............',
            '.k..............',
            '................'
        ]
    },
    potato: {
        pal: { h: '#E6B27A', a: '#C98B4F', b: '#96603A', s: '#6E4426' },
        px: [
            '................',
            '................',
            '................',
            '.....kkkkkk.....',
            '...kkaaaaaakk...',
            '..kahaaaaaaaak..',
            '.kahaasaaaaaabk.',
            '.kaaaaaaaasaabk.',
            'kaaaasaaaaaaabbk',
            'kaaaaaaaaaaabbk.',
            '.kbaaaaaasaabbk.',
            '.kbbaaaaaabbbk..',
            '..kkbbbbbbbkk...',
            '....kkkkkkk.....',
            '................',
            '................'
        ]
    },
    veg: {
        pal: { H: '#9BE07A', g: '#4CAF50', G: '#2E7D32', l: '#B5DD8A', L: '#7BB054' },
        px: [
            '................',
            '....kkk.kkk.....',
            '...kgggkgggk....',
            '..kgHggggHggk...',
            '.kgggggggggggk..',
            '.kgHgggHgggHgk..',
            '.kggggggggggGk..',
            '..kGgggggggGk...',
            '...kkkGlGkkk....',
            '.....klllk......',
            '.....kllLk......',
            '.....kllLk......',
            '....kllllLk.....',
            '....kkkkkkk.....',
            '................',
            '................'
        ]
    },
    fruit: {
        pal: { b: '#7A4A2A', l: '#6CC04A', r: '#E5483D', h: '#FF9A8A', R: '#A82A24' },
        px: [
            '.......kk.......',
            '.......kbk.kkk..',
            '........kbkllk..',
            '...kkkk.kbkkk...',
            '..krrrrkkkrrrk..',
            '.krhhrrrrrrrrRk.',
            '.krhrrrrrrrrrRk.',
            'krhrrrrrrrrrrrRk',
            'krrrrrrrrrrrrrRk',
            'krrrrrrrrrrrrRRk',
            'krrrrrrrrrrrrRRk',
            '.krrrrrrrrrrRRk.',
            '.kRrrrrrrrrRRRk.',
            '..kRRrrkkrRRRk..',
            '...kkkk..kkkk...',
            '................'
        ]
    },
    nuts: {
        pal: { b: '#6E4426', c: '#8A5A34', C: '#5E3A1E', a: '#D79A55', h: '#F2C489', d: '#A8692E' },
        px: [
            '................',
            '.......kk.......',
            '......kbk.......',
            '...kkkkbkkkkk...',
            '..kcCcCcCcCcCk..',
            '.kcCcCcCcCcCcCk.',
            '.kCCCCCCCCCCCCk.',
            '.kkkkkkkkkkkkkk.',
            '..kahaaaaaaadk..',
            '..khaaaaaaaadk..',
            '..kaaaaaaaaadk..',
            '...kaaaaaaadk...',
            '....kaaaaadk....',
            '.....kaaadk.....',
            '......kkkk......',
            '................'
        ]
    },
    oil: {
        pal: { R: '#C8433A', y: '#FFCF4A', h: '#FFF0A8', o: '#D99A1E', w: '#FFF8E8', g: '#8E7A5A' },
        px: [
            '......kkkk......',
            '......kRRk......',
            '......kkkk......',
            '......kyyk......',
            '.....kyyyok.....',
            '....kyhyyyok....',
            '...kyhyyyyyok...',
            '...kyhyyyyyok...',
            '...kwwwwwwwwk...',
            '...kwgwggwgwk...',
            '...kwwwwwwwwk...',
            '...kyhyyyyyok...',
            '...kyyyyyyyok...',
            '...koooooooook..',
            '...kkkkkkkkkk...',
            '................'
        ]
    },
    sauce: {
        pal: { R: '#D8402F', r: '#FF8A70', d: '#5A2A16', h: '#A8603A', D: '#3A1A0C', w: '#FFF6E4' },
        px: [
            '......kkkk......',
            '.....kRrRRk.....',
            '.....kRRRRk.....',
            '......kkkk......',
            '......kddk......',
            '......kdhk......',
            '.....kddhdk.....',
            '....kdddhddk....',
            '...kddddhdddk...',
            '...kwwwwwwwwk...',
            '...kwwRRRRwwk...',
            '...kwwRRRRwwk...',
            '...kwwwwwwwwk...',
            '...kddddhdddk...',
            '...kDDDDDDDDk...',
            '...kkkkkkkkkk...'
        ]
    },
    drink: {
        pal: { s: '#B8C4D6', C: '#5A3420', m: '#4AB3B0', h: '#A8EEEA', M: '#2E7F7C' },
        px: [
            '................',
            '.....s...s......',
            '......s...s.....',
            '.....s...s......',
            '..kkkkkkkkkkk...',
            '..kCCCCCCCCCk...',
            '..kmhmmmmmmMkkk.',
            '..kmhmmmmmmMk.k.',
            '..kmhmmmmmmMk.k.',
            '..kmmmmmmmmMkkk.',
            '..kmmmmmmmmMk...',
            '..kmmmmmmmmMk...',
            '...kMMMMMMMk....',
            '....kkkkkkk.....',
            '................',
            '................'
        ]
    },
    shake: {
        pal: { c: '#C08A52', C: '#8A5A2E', g: '#D8EEF5', p: '#A563E0', h: '#EBD6FF', P: '#6C3A9E' },
        px: [
            '......kkkk......',
            '......kcck......',
            '......kCCk......',
            '......kggk......',
            '.....kkggkk.....',
            '....kggggggk....',
            '...kphppppppk...',
            '..kphppppppppk..',
            '..kphppppppppk..',
            '..kpppppppppPk..',
            '..kpppppppppPk..',
            '..kPpppppppPPk..',
            '...kPPpppPPPk...',
            '....kkPPPPkk....',
            '......kkkk......',
            '................'
        ]
    },
    sweet: {
        pal: { h: '#F0C88A', a: '#D9A05B', b: '#A8723A', c: '#4A2A18' },
        px: [
            '................',
            '................',
            '.....kkkkkk.....',
            '...kkhhaaaaakk..',
            '..khhaacaaaaabk.',
            '.khaaaaaaaacaabk',
            '.khacaaaaaaaaabk',
            'kaaaaaaacaaaaabk',
            'kaaaaaaaaaaacabk',
            'kacaaaaaaaaaaabk',
            '.kaaaaacaaaaabk.',
            '.kbaaaaaaacabbk.',
            '..kbbaaaaabbbk..',
            '...kkbbbbbbkk...',
            '.....kkkkkk.....',
            '................'
        ]
    }
};

// First match wins, so specific words sit above the generic ones they contain
// (酱油 before 油, 蛋白粉 before 蛋, 牛油果 before 油/牛, 土豆 before 豆, 面包 before 面, 饼干 before 饼, 猪 before 肉).
const RULES = [
    ['sauce',  /酱(?!牛|鸭|肉|肘|猪|骨|鸡)|醋|蚝油|生抽|老抽|调味|鱼露|味噌/],
    ['shake',  /蛋白粉|乳清|增肌粉|奶昔|代餐|whey|protein/i],
    ['sweet',  /糖|巧克力|蛋糕|饼干|曲奇|冰淇淋|雪糕|布丁|甜品|零食|薯片/],
    ['nuts',   /坚果|杏仁|核桃|花生|腰果|榛子|开心果|瓜子|果仁|碧根果|夏威夷果|奇亚籽|亚麻籽/],
    ['fruit',  /牛油果|苹果|香蕉|橙|橘|柚|莓|桃|梨|葡萄|西瓜|哈密瓜|芒果|菠萝|猕猴桃|奇异果|柠檬|樱桃|荔枝|龙眼|枣|水果/],
    ['oil',    /黄油|(?<!牛)油(?!条|果)/],
    ['egg',    /蛋(?!白质)/],
    ['milk',   /奶|乳|芝士|奶酪/],
    ['fish',   /鱼|虾|蟹|贝|海鲜|三文|金枪|鳕|鱿|蚝|海参/],
    ['potato', /薯|土豆|芋|山药/],
    ['veg',    /菜|蔬|西兰花|花椰|菠菜|生菜|黄瓜|冬瓜|南瓜|苦瓜|丝瓜|番茄|西红柿|萝卜|菇|茄|椒|笋|芹|豆角|四季豆|荷兰豆|沙拉|洋葱|藕|木耳|海带/],
    ['tofu',   /豆/],
    ['bread',  /面包|吐司|馒头|包子|饼|贝果|三明治|汉堡|披萨|油条/],
    ['noodle', /面|粉丝|米粉|河粉|饺|馄饨|抄手/],
    ['corn',   /玉米/],
    ['oats',   /燕麦|麦片|谷物|格兰诺拉/],
    ['rice',   /饭|米|粥|谷|杂粮|藜麦|寿司/],
    ['pork',   /猪|火腿|培根|香肠|腊肉|排骨|五花/],
    ['meat',   /肉|鸡|鸭|鹅|牛|羊|排|腿|翅|肠/],
    ['drink',  /咖啡|茶|可乐|饮|汁|酒|苏打|矿泉水/]
];

const MACRO_FALLBACK = { protein: 'meat', carbs: 'rice', fat: 'oil', kcal: 'sweet' };

// The category sets the icon so every item filed together looks alike; the name only helps when the category says nothing
function spriteKey(food, macroKey) {
    for (const text of [food.category, food.name]) {
        const hit = text && RULES.find(([, re]) => re.test(text));
        if (hit) return hit[0];
    }
    return MACRO_FALLBACK[macroKey] || 'sweet';
}

function spriteRects({ pal, px }) {
    const colors = { k: OUTLINE, ...pal };
    let rects = '';
    px.forEach((row, y) => {
        for (let x = 0; x < row.length;) {
            const ch = row[x];
            let end = x + 1;
            while (row[end] === ch) end++;
            if (ch !== '.') rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${colors[ch]}"/>`;
            x = end;
        }
    });
    return rects;
}

function renderSprite(sprite) {
    return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${spriteRects(sprite)}</svg>`;
}

const cache = {};
function spriteSvg(key) {
    return cache[key] ||= renderSprite(SPRITES[key]);
}

export { SPRITES, spriteKey, spriteSvg, spriteRects };
