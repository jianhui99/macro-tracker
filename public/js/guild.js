import { api } from './api.js';
import { titleOf } from './level.js';
import { renderAvatarTraits } from './avatar.js';
import { $, esc, fmt, fmtKg, fmtMonthDay, localDate } from './helpers.js';

// ── Guild ──
// Every invited adventurer is a member of the owner's guild. The server decides what each viewer may see:
// everyone gets level, join date, streak and medals; the leader (admin) also gets login names, activity and weight.
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
    return `<li class="guild-member${m.me ? ' is-me' : ''}" style="--i:${Math.min(i, 14)}">
        <span class="avatar-stage guild-avatar" aria-hidden="true"></span>
        <div class="gm-body">
            <div class="gm-name"><b translate="no">${esc(m.nickname || '· · ·')}</b>${m.leader ? '<span class="gm-tag">会长</span>' : ''}${m.me ? '<span class="gm-tag is-me">我</span>' : ''}</div>
            <small>Lv ${m.level} · ${titleOf(m.level)}</small>
            ${detailsHtml(m)}
        </div>
    </li>`;
}

async function loadGuild() {
    try {
        const { members } = await api('/api/guild');
        $('guild-count').textContent = `${members.length} 名冒险者`;
        $('guild-list').innerHTML = members.map(memberHtml).join('');
        $('guild-list').querySelectorAll('.guild-avatar').forEach((stage, i) => renderAvatarTraits(stage, members[i].avatar, members[i].nickname));
    } catch {
        $('guild-list').innerHTML = '<li class="empty">公会名单加载失败，请稍后再试。</li>';
    }
}

export { loadGuild };
