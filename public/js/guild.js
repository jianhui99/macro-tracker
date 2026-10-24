import { api } from './api.js';
import { titleOf } from './level.js';
import { renderAvatarTraits } from './avatar.js';
import { $, esc, fmt, fmtKg, fmtMonthDay, localDate } from './helpers.js';

// ── Guild ──
// Every invited adventurer is a member of the owner's guild. The server decides what each viewer may see:
// everyone gets level, join date, streak and medals; the leader (admin) also gets login names, activity and weight.
// Showcase adventurers, shown to every viewer and never stored. They carry only what any member may see,
// so the leader view shows no account, activity or weight rows for them.
const day = date => Date.parse(`${date}T12:00:00+08:00`) / 1000;
const hero = (job, gender, build, height, age, skin) => ({ job, gender, build, height, age, skin });
const DEMO_MEMBERS = [
    // { nickname: '燕麦战神', level: 12, joinedAt: day('2026-09-02'), streak: 41, medals: 26, avatar: hero('1.725', 'male', 'broad', 'tall', 'adult', 12) },
    { nickname: 'danny0423', level: 10, joinedAt: day('2026-09-08'), streak: 19, medals: 21, avatar: hero('1.55', 'male', 'slim', 'normal', 'adult', 10) },
    { nickname: 'chloe', level: 9, joinedAt: day('2026-09-15'), streak: 12, medals: 17, avatar: hero('1.725', 'female', 'normal', 'normal', 'adult', 9) },
    { nickname: 'yyyao', level: 7, joinedAt: day('2026-09-21'), streak: 8, medals: 12, avatar: hero('1.2', 'female', 'normal', 'short', 'young', 7) }
    // { nickname: '深蹲小王子', level: 6, joinedAt: day('2026-09-29'), streak: 5, medals: 9, avatar: hero('1.375', 'male', 'slim', 'tall', 'young', 6) },
    // { nickname: '低碳游侠', level: 5, joinedAt: day('2026-10-06'), streak: 3, medals: 6, avatar: hero('1.375', 'female', 'normal', 'normal', 'mature', 5) }
].map(m => ({ ...m, leader: false, me: false }));

function detailsHtml(m) {
    const item = (icon, text) => `<span><span class="ms" aria-hidden="true">${icon}</span>${text}</span>`;
    const leaderOnly = () => {
        const { first, latest, target } = m.weight;
        const weight = latest == null ? '暂无称重' : `${fmtKg(first)} → ${fmtKg(latest)} kg${target ? `，目标 ${fmtKg(target)} kg` : ''}`;
        return item('person', `<span translate="no">${esc(m.username || '')}</span>`)
            + item('event_available', m.lastActive ? `最近活跃 ${fmtMonthDay(m.lastActive)}` : '暂无记录')
            + item('monitor_weight', weight);
    };
    return `<div class="gm-meta">
        ${item('calendar_month', `${fmtMonthDay(localDate(new Date(m.joinedAt * 1000)))} 加入`)}
        ${item('local_fire_department', `连击 ${fmt(m.streak)} 天`)}
        ${item('military_tech', `${fmt(m.medals)} 枚勋章`)}
        ${'username' in m ? leaderOnly() : ''}
    </div>`;
}

function memberHtml(m, i) {
    // Another user's stored data: the server only accepts integer levels, but the markup never trusts that
    const level = Number.isInteger(m.level) && m.level >= 1 ? m.level : 1;
    return `<li class="guild-member${m.me ? ' is-me' : ''}" style="--i:${Math.min(i, 14)}">
        <span class="avatar-stage guild-avatar" aria-hidden="true"></span>
        <div class="gm-body">
            <div class="gm-name"><b translate="no">${esc(m.nickname || '· · ·')}</b>${m.leader ? '<span class="gm-tag">会长</span>' : ''}${m.me ? '<span class="gm-tag is-me">我</span>' : ''}</div>
            <small>Lv ${level} · ${esc(titleOf(level))}</small>
            ${detailsHtml(m)}
        </div>
    </li>`;
}

async function loadGuild() {
    try {
        const members = [...(await api('/api/guild')).members, ...DEMO_MEMBERS].sort((a, b) => b.level - a.level);
        $('guild-count').textContent = `${members.length} 名冒险者`;
        $('guild-list').innerHTML = members.map(memberHtml).join('');
        $('guild-list').querySelectorAll('.guild-avatar').forEach((stage, i) => renderAvatarTraits(stage, members[i].avatar, members[i].nickname));
    } catch {
        $('guild-list').innerHTML = '<li class="empty">公会名单加载失败，请稍后再试。</li>';
    }
}

export { loadGuild };
