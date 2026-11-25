/* Dashboard UI. Renders from G, routes clicks through data-a actions. */
const UI = { tab: 'clubhouse', rf: 'all', ff: 'top', tm: 'forty', rs: 'ovr', fa: 'ALL', faq: '', tTeam: 'PIT', send: [], get: [], retain: 0, cash: 0, theirRet: 0, tm2: 'forty', blk: 'all', pickTeam: null, dummy: false, sel: null, modal: null, queue: null, showNew: false, saved: '', relConfirm: null, trMsg: null };
const TABS = [['clubhouse', 'Clubhouse'], ['lineup', 'Lineup'], ['roster', 'Roster'], ['farm', 'Farm System'], ['fa', 'Free Agents'], ['trades', 'Trades'], ['block', 'Trade Block'], ['standings', 'Standings'], ['money', 'Finances'], ['trophies', 'Trophy Case']];
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tier = o => o >= 70 ? 4 : o >= 60 ? 3 : o >= 50 ? 2 : 1;
const ov = o => `<span class="ov t${tier(o)}">${o}</span>`;
const nm = p => `<button class="nm" data-a="card" data-id="${p.id}">${esc(p.name)}</button>`;
const tm = (a, txt) => { const c = typeof TEAM_TAG !== 'undefined' && TEAM_TAG[a]; return c ? `<span class="tm" style="--tb:${c.bg};--ts:${c.st};--tt:${c.fg}">${esc(txt || a)}</span>` : esc(txt || a || ''); };
const HAND = { L: 'left', R: 'right', S: 'both sides' };
const bt = p => `<span class="bt" data-tip="Bats ${HAND[p.b] || p.b}, throws ${HAND[p.t] || p.t}"><i class="h${p.b}">${p.b}</i>/<i class="h${p.t}">${p.t}</i></span>`;
const hand = p => isPit(p) ? `<span class="tag hd h${p.t}">${p.t}HP</span>` : `<span class="tag hd h${p.b}" data-tip="Bats ${HAND[p.b] || p.b}">${p.b === 'S' ? 'Switch' : p.b}</span>`;
const altTxt = p => (p.alts || []).length ? `<small class="alts">${p.alts.join(' ')}</small>` : '';
const posTxt = p => `${p.pos}${altTxt(p)}`;
const handMix = ps => { const n = { R: 0, L: 0, S: 0 }; ps.filter(Boolean).forEach(p => { n[isPit(p) ? p.t : p.b]++; }); return ['R', 'L', 'S'].filter(k => n[k]).map(k => `${n[k]} ${k}`).join(' · '); };
const FIT_TXT = { main: 'Main position', alt: 'Has played it', easy: 'Easy move', stretch: 'A stretch', bad: 'Out of position' };
function fitRow(p) {
  if (isPit(p)) return '';
  return `<div class="fits">${POS_H.filter(x => x !== 'DH').map(x => [x, posPen(p, x)]).sort((a, b) => a[1] - b[1]).slice(0, 6).map(([x, n]) => { const f = posFit(p, x); return `<span class="fit ${f}" data-tip="${FIT_TXT[f]}${n ? `: ${n} point${n > 1 ? 's' : ''} lower` : ''}">${x} ${p.ovr - n}</span>`; }).join('')}</div>`;
}
const heat = n => `<span class="heat" title="${n} rival suitors">${'●'.repeat(clamp(n || 0, 0, 6))}<u>${'●'.repeat(6 - clamp(n || 0, 0, 6))}</u></span>`;
const rec = t => `${t.w}-${t.l}`;
const fmt3 = x => isFinite(x) ? x.toFixed(3).replace(/^0/, '') : '.000';
const avg = s => s.AB ? fmt3(s.H / s.AB) : '---';
const ops = s => s.AB ? fmt3((s.H + s.BB) / (s.AB + s.BB) + (s.H + s.D + 3 * s.HR) / s.AB) : '---';
const era = s => s.O ? (s.ER / (s.O / 3) * 9).toFixed(2) : '---';
const ip = o => `${Math.floor(o / 3)}.${o % 3}`;
const toast = (title, body) => { const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<b>${esc(title)}</b>${esc(body || '')}`; $('#toast').appendChild(d); setTimeout(() => d.remove(), 4600); };
const blocked = () => G.pending || G.live || G.phone != null || G.draft || G.review || G.fired;

/* ---------- save ---------- */
const Store = {
  key: 'fo30-current', db: null, uid: null, busy: false, dirty: false, timer: 0, careers: {},
  pre() { return (window.FO_HOST && FO_HOST.prefix) || ''; },
  get(k) { try { return localStorage.getItem(this.pre() + k); } catch (e) { return null; } },
  put(k, v) { try { localStorage.setItem(this.pre() + k, v); return true; } catch (e) { return false; } },
  local() { return this.get(this.key); },
  index() { try { return JSON.parse(this.get('fo30-index') || '{}'); } catch (e) { return {}; } },
  meta() { const t = G.teams[G.me], h = G.history[G.history.length - 1]; return { team: G.me, at: G.savedAt || 0, gm: G.gm, year: G.year, phase: G.phase, rec: G.phase === 'offseason' ? (h ? `${h.w}-${h.l}` : '') : `${t.w}-${t.l}`, titles: G.titles || 0 }; },
  list() { const idx = this.index(); Object.entries(this.careers).forEach(([a, m]) => { if (!idx[a] || (m.at || 0) > (idx[a].at || 0)) idx[a] = Object.assign({}, m, { cloud: true }); }); return Object.values(idx).filter(m => m && m.team && TEAM_META[m.team]).sort((a, b) => (b.at || 0) - (a.at || 0)); },
  touch() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 1800); },
  async flush() {
    if (!G || UI.showNew || !G.me) return; G.savedAt = Date.now(); const json = serialize(), meta = this.meta();
    const ok = this.put(this.key, json) && this.put('fo30-c-' + G.me, json);
    if (ok) { const idx = this.index(); idx[G.me] = meta; this.put('fo30-index', JSON.stringify(idx)); }
    UI.saved = ok ? 'Saved in this browser' : 'Not saved';
    if (this.db && this.uid) {
      if (this.busy) { this.dirty = true; return; }
      this.busy = true;
      try {
        const body = await this.pack(json);
        if (body.length < (window.FO_HOST ? 1400000 : 250000)) { await this.db.doc(`data/users/${this.uid}/c_${G.me}`).set({ json: body, at: meta.at }); this.careers[G.me] = meta; await this.db.doc(`data/users/${this.uid}/index`).set({ careers: this.careers, current: G.me, at: meta.at }); UI.saved = window.FO_HOST ? FO_HOST.status() : 'Saved to your account'; }
      } catch (e) { /* the browser copy still holds the save */ }
      this.busy = false; if (this.dirty) { this.dirty = false; this.touch(); }
    }
    const f = $('#savefoot'); if (f) f.textContent = UI.saved;
  },
  async pack(json) {
    if (typeof CompressionStream === 'undefined') return json;
    const b = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); let out = '';
    for (let i = 0; i < b.length; i += 8192) out += String.fromCharCode(...b.subarray(i, i + 8192));
    return 'gz:' + btoa(out);
  },
  async unpack(t) {
    if (!t.startsWith('gz:')) return t;
    const b = Uint8Array.from(atob(t.slice(3)), c => c.charCodeAt(0));
    return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  },
  async loadCloud(a) {
    if (!this.db || !this.uid) return null;
    try { const s = await this.db.doc(`data/users/${this.uid}/c_${a}`).get(); const d = s.exists ? s.data() : null; return d && d.json ? await this.unpack(d.json) : null; } catch (e) { return null; }
  },
  async open(a) {
    const m = this.list().find(x => x.team === a), loc = this.get('fo30-c-' + a), locAt = (this.index()[a] || {}).at || 0;
    let s = loc; if (m && m.cloud && (m.at || 0) > locAt) s = (await this.loadCloud(a)) || loc;
    if (!s) return false;
    try { restore(s); return true; } catch (e) { return false; }
  },
  async cloud() {
    try {
      let db, uid;
      if (window.FO_HOST) { const h = await FO_HOST.connect(); if (!h) return; db = h.db; uid = h.uid; this.acct = h.label; }
      else {
        if (!window.claude || !window.claude.use) return;
        const [d, user] = await Promise.all([claude.use('db'), claude.use('user')]);
        if (!d || !user) return; db = d; uid = await user.id(); if (!uid) return;
      }
      this.db = db; this.uid = uid;
      const ix = await db.doc(`data/users/${uid}/index`).get(), d = ix.exists ? ix.data() : null;
      this.careers = (d && d.careers) || {};
      const cur = d && d.current, m = cur && this.careers[cur];
      if (m && (UI.showNew && UI.dummy || (m.at || 0) > (G.savedAt || 0))) { const s = await this.loadCloud(cur); if (s) { restore(s); UI.showNew = false; UI.dummy = false; UI.saved = 'Loaded from your account'; } }
      render();
    } catch (e) { /* keep playing from the browser copy */ }
  }
};

/* ---------- shell ---------- */
function render() {
  if (G.toast) { toast(G.toast.title, G.toast.body); G.toast = null; }
  renderTop(); renderSide();
  const v = { clubhouse: vClub, lineup: vLine, roster: vRoster, farm: vFarm, fa: vFA, trades: vTrade, block: vBlock, standings: vStand, money: vMoney, trophies: vTrophy }[UI.tab]();
  $('#view').innerHTML = v;
  const tick = G.radio.slice(0, 3).map(r => `${esc(r.who)}: “${esc(r.line)}”`).concat(G.news.slice(0, 7).map(n => esc(n.txt))).join('  ⚾  ');
  $('#ticker').innerHTML = `<span>${tick}  ⚾  ${tick}  ⚾  </span>`;
  renderModal(); Store.touch();
}
function renderTop() {
  const t = G.teams[ME], pay = payroll(), cap = OWNERS[G.owner].cap, place = divStandings(MY_LG, MY_DIV).findIndex(x => x.abbr === ME) + 1;
  const stage = G.phase === 'offseason' ? `Week ${G.week}/${G.weeks}` : G.phase === 'season' ? `Game ${G.day}/162` : G.po?.champ ? 'Season over' : ['Wild Card', 'Division Series', MY_LG + 'CS', 'World Series'][G.po?.round ?? 0];
  const c = (l, v, k = '') => `<div class="cell"><small>${l}</small><b class="${k}">${v}</b></div>`;
  let acts = '';
  if (UI.queue) acts = `<button class="btn" data-a="stop">Stop sim</button>`;
  else if (G.phase === 'offseason') acts = `<button class="btn go" data-a="week">Next week</button><button class="btn" data-a="toOD">Skip to Opening Day</button>`;
  else if (G.phase === 'season') acts = `<button class="btn go" data-a="liveGo">Play game</button><button class="btn" data-a="sim" data-n="1">Sim day</button><button class="btn" data-a="sim" data-n="7">Week</button>${G.day < DEADLINE ? '<button class="btn" data-a="simTo" data-n="' + DEADLINE + '">To deadline</button>' : ''}<button class="btn" data-a="simTo" data-n="162">To October</button>`;
  else if (G.phase === 'playoffs' && metsSeries()) acts = `<button class="btn go" data-a="liveGo">Play game</button><button class="btn" data-a="po">Sim game</button>`;
  else if (G.phase === 'playoffs') acts = `<button class="btn go" data-a="po">Continue</button>`;
  $('#top').innerHTML = `<div class="brand">${esc(TEAM.city)} Front Office</div><div class="board">
    ${c(G.year + (G.phase === 'offseason' ? ' hot stove' : ''), dateStr())}${c(stage === 'Season over' ? 'Status' : 'Stage', stage)}
    ${c(G.phase === 'offseason' ? `${G.year - 1 === 2026 ? '2026' : 'Last'} record` : 'Record', G.phase === 'offseason' ? lastRec() : rec(t), t.w >= t.l ? 'ok' : 'no')}
    ${G.phase === 'offseason' ? '' : c(`${MY_LG} ${MY_DIV}`, place + ordinal(place))}
    ${c('Payroll', money(pay), pay > cap ? 'no' : pay > CBT_LINE ? '' : 'ok')}${c('Slush fund', money(G.cash))}${c('Fans', Math.round(G.fans), G.fans >= 55 ? 'ok' : G.fans < 35 ? 'no' : '')}${c(esc(TEAM.jinx), Math.round(G.curse), G.curse <= 20 ? 'ok' : G.curse >= 50 ? 'no' : '')}${c('Owner trust', Math.round(G.trust), G.trust >= 50 ? 'ok' : G.trust < 25 ? 'no' : '')}
  </div><div class="acts">${acts}</div>`;
}
const ordinal = n => ['th', 'st', 'nd', 'rd'][n] || 'th';
const lastRec = () => { const h = G.history[G.history.length - 1]; return h ? `${h.w}-${h.l}` : `${G.teams[ME].w26}-${G.teams[ME].l26}`; };
function renderSide() {
  const iss = rosterIssues().length;
  $('#side').innerHTML = TABS.map(([k, l]) => `<button class="tab ${UI.tab === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}${k === 'trades' && G.inbox.length ? `<span class="pip">${G.inbox.length}</span>` : ''}${k === 'lineup' && iss ? `<span class="pip">!</span>` : ''}${k === 'block' && G.phase === 'season' && G.day >= DEADLINE - 14 && G.day < DEADLINE ? '<span class="pip">!</span>' : ''}</button>`).join('') +
    `<div class="foot"><div id="savefoot">${esc(UI.saved || 'Autosave on')}</div><button class="btn sm" style="margin-top:6px" data-a="newgame">New career</button><p style="margin-top:8px">Unofficial fan game. Not affiliated with MLB or any club. Ratings are invented.</p></div>`;
}

/* ---------- clubhouse ---------- */
function vClub() {
  const b = G.back, m = metsRatings(), iss = rosterIssues();
  const nextBox = (() => {
    if (G.phase === 'offseason') return `<div class="lbl">Hot stove <span>${G.weeks - G.week + 1} weeks to Opening Day</span></div><div class="stat"><span>Free agents left</span><b>${freeAgents().length}</b></div><div class="stat"><span>Best available</span><b>${freeAgents()[0] ? esc(freeAgents()[0].name) : 'Nobody'}</b></div><div class="stat"><span>Projected wins</span><b>${m.exp}</b></div>${G.r5Done !== G.year - 1 ? `<div class="stat"><span>Rule 5 draft (Week 3)</span><b>${roster().filter(r5Elig).length} prospects exposed</b></div>` : ''}<div class="row2" style="margin-top:6px"><button class="btn sm" data-a="tab" data-k="fa">Shop free agents</button><button class="btn sm" data-a="tab" data-k="trades">Work the phones</button></div>`;
    if (G.phase === 'season') { const x = G.day < 162 ? metsMatch(G.day) : null, l = G.log[G.log.length - 1], rot = healthyRotation(), sp = rot[(G.rotIdx || 0) % Math.max(1, rot.length)]; return `<div class="lbl">Next up <span>Game ${G.day + 1}</span></div>${x ? `<div style="font:400 28px/1.1 var(--display);text-transform:uppercase">${x.home ? 'vs' : '@'} ${tm(x.opp)} ${G.teams[x.opp].name}</div><div class="note">${rec(G.teams[x.opp])} · ${sp ? `${esc(sp.name)} (${sp.t}HP)` : 'TBD'} vs ${(() => { const op = probable(x.opp); return op ? `${esc(op.name)} (${op.t}HP)` : 'TBD'; })()}</div><div class="row2" style="margin-top:8px"><button class="btn go sm" data-a="liveGo">Play it live</button>${G.lastLive ? '<button class="btn sm" data-a="gdRecap">Last game recap</button>' : ''}<button class="btn sm" data-a="clutchToggle">Clutch moments: ${G.clutchOn ? 'on' : 'off'}</button></div>` : ''}${l ? `<div class="stat" style="margin-top:6px"><span>Last game</span><b style="color:var(--${l.u > l.t ? 'good' : 'bad'})">${l.u > l.t ? 'W' : 'L'} ${l.u}-${l.t} ${l.h ? 'vs' : '@'} ${l.o}</b></div>` : ''}<div class="stat"><span>Streak</span><b>${G.teams[ME].st > 0 ? 'W' + G.teams[ME].st : G.teams[ME].st < 0 ? 'L' + -G.teams[ME].st : '-'}</b></div><div class="stat"><span>Win pace</span><b>${G.log.length ? Math.round(G.teams[ME].w / G.log.length * 162) : m.exp}</b></div><div class="stat"><span>Trade deadline</span><b>${G.day < DEADLINE ? `${DEADLINE - G.day} games` : 'Passed'}</b></div>`; }
    const s = metsSeries(); return `<div class="lbl">Postseason</div>${s ? `<div style="font:400 26px/1.1 var(--display);text-transform:uppercase">${['Wild Card', 'Division Series', MY_LG + 'CS', 'World Series'][G.po.round]}</div><div class="stat"><span>${G.teams[s.a].name}</span><b>${s.wa}</b></div><div class="stat"><span>${G.teams[s.b].name}</span><b>${s.wb}</b></div><div class="note">First to ${s.need}. ${esc(G.po.lastLine || '')}</div>` : `<div class="note">The ${esc(TEAM.name)} are done for the year.</div>`}`;
  })();
  const east = divStandings(MY_LG, MY_DIV);
  const useLast = G.phase === 'offseason';
  const estRows = (useLast ? [...east].sort((a, b) => b.w26 - a.w26) : east).map((t, i, arr) => `<tr class="${t.abbr === ME ? 'me' : ''}"><td>${t.name}</td><td>${useLast ? t.w26 : t.w}</td><td>${useLast ? t.l26 : t.l}</td><td>${i === 0 ? '-' : useLast ? ((arr[0].w26 - arr[0].l26) - (t.w26 - t.l26)) / 2 : ((arr[0].w - arr[0].l) - (t.w - t.l)) / 2}</td></tr>`).join('');
  return `<div class="grid">
    <section class="c8"><article class="back"><div class="mast"><b>${esc(TEAM.paper)}</b><span>${esc(b.d)} · Late edition · 50¢</span></div><div class="kick">${esc(b.kicker)}</div><h2>${esc(b.head)}</h2><p>${esc(b.sub)}</p></article></section>
    <section class="panel c4">${nextBox}</section>
    <section class="panel c4"><div class="lbl">Team strength <span>20-80 scale</span></div>${meter('Lineup', m.lineAvg)}${meter('Rotation', m.rotAvg)}${meter('Bullpen', m.penAvg)}<div class="stat" style="margin-top:4px"><span>Projected wins</span><b style="font-size:24px;color:var(--warn)">${m.exp}</b></div><div class="note">White tick marks a league-average club.</div></section>
    <section class="panel c4">${payBlock()}</section>
    <section class="panel c4"><div class="lbl">${MY_LG} ${MY_DIV} <span>${useLast ? '2026 final' : G.year}</span></div><div class="table"><table><tr><th>Team</th><th>W</th><th>L</th><th>GB</th></tr>${estRows}</table></div></section>
    <section class="panel c8"><div class="lbl">Season so far <span>Games above .500</span></div>${paceChart()}</section>
    <section class="panel c4"><div class="lbl">Your desk</div>${deskBlock(iss)}</section>
    <section class="panel c6"><div class="lbl">${ME === 'BOS' ? 'Sports Talk 1912' : 'Sports Talk ' + esc(TEAM.city)} <span>The lines are open</span></div><div class="radio">${G.radio.slice(0, 3).map(r => `<div class="call"><b>${esc(r.who)}</b>“${esc(r.line)}”</div>`).join('')}</div></section>
    <section class="panel c6"><div class="lbl">Wire</div><div class="feed">${G.news.slice(0, 14).map(n => `<div><time>${esc(n.d)}</time><span>${esc(n.txt)}</span></div>`).join('')}</div></section>
  </div>`;
}
function meter(l, v) { return `<div class="meter"><span>${l}</span><div class="bar"><i style="width:${clamp((v - 30) / 45 * 100, 2, 100)}%"></i><em style="left:${(50 - 30) / 45 * 100}%"></em></div><b>${Math.round(v)}</b></div>`; }
function payBlock() {
  const pay = payroll(), cap = OWNERS[G.owner].cap, mx = Math.max(pay, cap, CBT_LINE) * 1.05, tax = taxBill(pay);
  return `<div class="lbl">Payroll <span>${esc(OWNERS[G.owner].name)}</span></div><div style="font:700 30px/1 var(--cond);color:${pay > cap ? 'var(--bad)' : 'var(--text)'}">${money(pay)}</div>
  <div class="bar" style="margin:12px 0 6px"><i style="width:${pay / mx * 100}%;background:${pay > cap ? 'var(--bad)' : 'var(--orange)'}"></i><em style="left:${CBT_LINE / mx * 100}%" data-tip="Tax line ${money(CBT_LINE)}"></em><em style="left:${cap / mx * 100}%;background:var(--warn)" data-tip="Owner budget ${money(cap)}"></em></div>
  <div class="stat"><span>Owner budget (yellow)</span><b>${money(cap)}</b></div><div class="stat"><span>Tax line (white)</span><b>${money(CBT_LINE)}</b></div><div class="stat"><span>Est. tax bill</span><b style="color:${tax ? 'var(--bad)' : 'var(--good)'}">${money(tax)}</b></div>`;
}
function deskBlock(iss) {
  const o = [];
  if (G.phase === 'season' && G.day >= DEADLINE - 14 && G.day < DEADLINE) o.push(`<div class="offer"><span><span class="tag warn">Deadline</span> ${DEADLINE - G.day} games until the July 31 deadline. Sellers are shopping ${onTheBlock().length} players.</span><button class="btn sm" data-a="tab" data-k="block">See the trade block</button></div>`);
  iss.forEach(x => o.push(`<div class="offer"><span><span class="tag bad">Fix</span> ${esc(x)}</span><button class="btn sm" data-a="autofix">Have the bench coach fix it</button></div>`));
  G.inbox.slice(0, 2).forEach(x => o.push(offerCard(x)));
  if (payroll() > OWNERS[G.owner].cap) o.push(`<div class="offer"><span><span class="tag warn">Budget</span> You're ${money(payroll() - OWNERS[G.owner].cap)} over the owner's number. Trust drops every month until it's fixed.</span></div>`);
  if (!o.length) o.push('<p class="note">Nothing urgent. Enjoy it while it lasts.</p>');
  return `<div style="display:flex;flex-direction:column;gap:7px">${o.join('')}</div>`;
}
function assetName(a) { if (a.startsWith('p:')) { const p = P(+a.slice(2)); return p ? `${p.name} (${p.pos}, ${p.ovr})` : 'Unknown'; } if (a.startsWith('i:')) return '$250K intl pool space'; const k = G.picks.find(z => z.id === a.slice(2)); return k ? `${k.year} ${k.orig} Comp Balance ${k.rd}` : 'Pick'; }
function offerCard(x) {
  return `<div class="offer"><span class="who-tag">${G.teams[x.team].name} on line one</span><span>“${esc(x.line)}”</span><span>You give <b>${esc(x.send.map(assetName).join(', '))}</b>. You get <b>${esc(x.get.map(assetName).join(', '))}</b>.</span><div class="row2"><button class="btn sm go" data-a="offerYes" data-id="${x.id}">Accept</button><button class="btn sm" data-a="offerEdit" data-id="${x.id}">Counter</button><button class="btn sm" data-a="offerNo" data-id="${x.id}">Hang up</button></div></div>`;
}
function paceChart() {
  if (!G.log.length) return `<p class="note" style="padding:26px 0;text-align:center">The chart starts on Opening Day. ${esc(VOICE())} has already drawn it going down.</p>`;
  let d = 0; const pts = G.log.map(x => (d += x.u > x.t ? 1 : -1)), W = 680, H = 170, L = 34, R = 10, T = 10, B = 22;
  const m = Math.max(6, ...pts.map(Math.abs)), step = m > 20 ? 10 : 5, top = Math.ceil(m / step) * step;
  const X = i => L + (i + 1) / 162 * (W - L - R), Y = v => T + (top - v) / (2 * top) * (H - T - B);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const ticks = []; for (let v = -top; v <= top; v += step) ticks.push(v);
  UI.chart = { pts, W, L, R };
  const c = pts[pts.length - 1] >= 0 ? 'var(--good)' : 'var(--bad)';
  return `<svg id="pace" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Games above .500 by game. Currently ${pts[pts.length - 1]}.">
    ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? '#ffffff88' : '#ffffff14'}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--cond)">${v > 0 ? '+' + v : v}</text>`).join('')}
    ${[[0, 'Apr'], [54, 'Jun'], [108, 'Aug'], [161, 'Sep']].map(([g, l]) => `<text x="${X(g)}" y="${H - 6}" text-anchor="${g === 161 ? 'end' : 'start'}" font-size="11" fill="var(--muted)" font-family="var(--cond)">${l}</text>`).join('')}
    <path d="${line} L${X(pts.length - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z" fill="${c}" opacity=".16"/><path d="${line}" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${X(pts.length - 1)}" cy="${Y(pts[pts.length - 1])}" r="4.5" fill="var(--orange)" stroke="var(--panel)" stroke-width="2"/></svg>`;
}

/* ---------- lineup ---------- */
const FIELD = { C: [200, 306], '1B': [292, 214], '2B': [250, 158], '3B': [108, 214], SS: [150, 158], LF: [70, 86], CF: [200, 44], RF: [330, 86], DH: [348, 298] };
function vLine() {
  const bench = active().filter(p => !isPit(p) && !G.lineup.some(s => s.id === p.id)).sort(rankBench);
  const pen = G.bullpen.map(P).filter(Boolean), sel = UI.sel;
  const isSel = (k, i) => sel && sel.k === k && sel.i === i ? 'sel' : '';
  const bat = G.lineup.map((s, i) => { const p = P(s.id), e = effOvr(p, s.pos), off = e < p.ovr; return `<div class="slot ${isSel('bat', i)}" draggable="true" data-a="pickSlot" data-k="bat" data-i="${i}"><span class="no">${i + 1}</span><span class="gr">⋮⋮</span><span class="who">${esc(p.name)}${hand(p)}${p.inj ? '<span class="tag bad">IL</span>' : ''}${off ? `<span class="tag warn">-${p.ovr - e}</span>` : ''}</span><select data-c="pos" data-i="${i}" aria-label="Position for ${esc(p.name)}">${POS_H.map(x => `<option value="${x}" ${x === s.pos ? 'selected' : ''}>${x} ${effOvr(p, x)}${x === p.pos ? ' ★' : (p.alts || []).includes(x) ? ' •' : ''}</option>`).join('')}</select>${ov(e)}</div>`; }).join('');
  const benchH = bench.map(p => `<div class="slot pit ${isSel('bench', p.id)}" draggable="true" data-a="pickSlot" data-k="bench" data-i="${p.id}"><span class="no" style="font-size:12px">${p.pos}</span><span class="gr">⋮⋮</span><span class="who">${esc(p.name)}${hand(p)}${altTxt(p)}</span>${ov(p.ovr)}</div>`).join('') || '<p class="note">Bench is empty.</p>';
  const rot = G.rotation.map((id, i) => { const p = P(id); return p ? `<div class="slot pit ${isSel('rot', i)}" draggable="true" data-a="pickSlot" data-k="rot" data-i="${i}"><span class="no">${i + 1}</span><span class="gr">⋮⋮</span><span class="who">${esc(p.name)}${hand(p)}${p.inj ? '<span class="tag bad">IL</span>' : ''}</span>${ov(p.ovr)}</div>` : ''; }).join('');
  const pens = pen.map((p, i) => `<div class="slot pit ${isSel('pen', i)}" draggable="true" data-a="pickSlot" data-k="pen" data-i="${i}"><span class="no" style="font-size:12px">${i === 0 ? 'CL' : i === 1 ? 'SU' : 'RP'}</span><span class="gr">⋮⋮</span><span class="who">${esc(p.name)}${hand(p)}${p.inj ? '<span class="tag bad">IL</span>' : ''}</span>${ov(p.ovr)}</div>`).join('');
  const m = metsRatings();
  const dots = G.lineup.map((s, i) => { const p = P(s.id), [x, y] = FIELD[s.pos], e = effOvr(p, s.pos); return `<g data-a="pickSlot" data-k="bat" data-i="${i}" style="cursor:pointer"><rect x="${x - 46}" y="${y - 15}" width="92" height="31" rx="5" fill="${isSel('bat', i) ? 'var(--orange)' : 'var(--deep)'}" stroke="${e < p.ovr ? 'var(--warn)' : '#ffffff55'}"/><text x="${x}" y="${y - 2}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--orange2)" font-family="var(--cond)">${s.pos} · ${e}</text><text x="${x}" y="${y + 11}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="var(--cond)">${esc(lastName(p.name).slice(0, 13))}</text></g>`; }).join('');
  return `<div class="ph"><div><h1>Lineup card</h1><p>Drag a player onto another to swap, or tap one and then the other. Yellow tags show the penalty for playing out of position. In each position menu, ★ is a player's main position and • marks positions they've played; the number is their rating there.</p></div><div class="acts"><button class="btn go" data-a="autoL">Bench coach, fill it out</button></div></div>
  <div class="grid"><section class="panel c4"><div class="lbl">Batting order <span>${handMix(G.lineup.map(x => P(x.id)))} · ${Math.round(m.lineAvg)} avg</span></div>${bat}<div class="lbl" style="margin-top:12px">Bench</div>${benchH}</section>
  <section class="panel c4"><div class="lbl">The field <span>Projected ${m.exp} wins</span></div><div class="fieldwrap"><svg viewBox="0 0 400 340" width="100%" role="img" aria-label="Defensive alignment"><path d="M200 335 L12 150 Q200 -60 388 150 Z" fill="#1d6a44"/><path d="M200 320 L100 215 L200 115 L300 215 Z" fill="#b58a56"/><path d="M200 292 L128 215 L200 142 L272 215 Z" fill="#247a4e"/><circle cx="200" cy="216" r="13" fill="#b58a56"/>${dots}</svg></div>
  <div style="margin-top:6px">${meter('Lineup', m.lineAvg)}${meter('Rotation', m.rotAvg)}${meter('Bullpen', m.penAvg)}</div></section>
  <section class="panel c4"><div class="lbl">Rotation <span>${handMix(G.rotation.map(P))} · ${Math.round(m.rotAvg)} avg</span></div>${rot}<div class="lbl" style="margin-top:12px">Bullpen <span>${handMix(pen)} · top spot closes</span></div>${pens}</section></div>`;
}
function swapSlots(a, b) {
  if (a.k === b.k && a.i === b.i) return;
  const L = G.lineup, id = x => x.k === 'bat' ? L[x.i].id : x.k === 'bench' ? x.i : x.k === 'rot' ? G.rotation[x.i] : G.bullpen.filter(i => P(i))[x.i];
  const hitters = ['bat', 'bench'], A = hitters.includes(a.k), B = hitters.includes(b.k);
  if (A !== B) { toast('Not that kind of swap', 'Hitters and pitchers stay in their own columns.'); return; }
  if (a.k === 'bat' && b.k === 'bat') { const t = L[a.i]; L[a.i] = L[b.i]; L[b.i] = t; }
  else if (a.k === 'bat' || b.k === 'bat') { const s = a.k === 'bat' ? a : b, o = a.k === 'bat' ? b : a; L[s.i].id = o.i; }
  else if (!A) {
    const ia = id(a), ib = id(b); const put = (x, v) => { if (x.k === 'rot') G.rotation[x.i] = v; else { const clean = G.bullpen.filter(i => P(i)); clean[x.i] = v; G.bullpen = clean; } };
    put(a, ib); put(b, ia);
  }
  refreshTeams();
}

/* ---------- roster ---------- */
function statCells(p) {
  const s = p.s;
  if (isPit(p)) return s && s.O ? `<td>${s.W}-${s.L}</td><td>${era(s)}</td><td>${ip(s.O)}</td><td>${s.PK}</td>` : `<td>-</td><td>-</td><td>-</td><td>-</td>`;
  return s && s.AB ? `<td>${avg(s)}</td><td>${ops(s)}</td><td>${s.HR}</td><td>${s.RBI}</td>` : `<td>-</td><td>-</td><td>-</td><td>-</td>`;
}
function vRoster() {
  const F = UI.rf; let list = roster(); if (F === 'all') list = fortyMan();
  if (F === 'hit') list = list.filter(p => !isPit(p) && p.level === 'MLB'); if (F === 'pit') list = list.filter(p => isPit(p) && p.level === 'MLB');
  if (F === 'mlb') list = list.filter(p => p.level === 'MLB'); if (F === 'aaa') list = list.filter(p => p.level === 'AAA');
  const by = { ovr: (a, b) => b.ovr - a.ovr, pot: (a, b) => b.pot - a.pot, age: (a, b) => a.age - b.age, sal: (a, b) => b.sal - a.sal, yrs: (a, b) => b.yrs - a.yrs, war: (a, b) => war(b) - war(a) }[UI.rs]; list.sort(by);
  const chips = [['all', '40-man'], ['mlb', 'Active 26'], ['hit', 'Hitters'], ['pit', 'Pitchers'], ['aaa', 'Optioned'], ['org', 'Whole org']].map(([k, l]) => `<button class="chip ${F === k ? 'on' : ''}" data-a="rf" data-k="${k}">${l}</button>`).join('');
  const isP = F === 'pit', isH = F === 'hit';
  const rows = list.map(p => `<tr class="row" data-a="card" data-id="${p.id}"><td>${nm(p)}${p.inj ? `<span class="tag bad">IL ${p.inj.g}</span>` : ''}${p.pr ? `<span class="tag">#${p.pr}</span>` : ''}${p.drafted ? '<span class="tag good">Drafted</span>' : ''}</td><td class="l">${posTxt(p)}</td><td class="l">${bt(p)}</td><td class="l">${levelTag(p)}</td><td>${p.age}</td><td>${ov(p.ovr)}</td><td>${p.pot > p.ovr ? p.pot : '-'}</td>${isH || isP ? statCells(p) : `<td>${p.s && (p.s.AB || p.s.O) ? war(p) : '-'}</td>`}<td>${p.level === 'FARM' ? 'MiLB' : money(p.sal)}</td><td>${p.yrs}</td></tr>`).join('');
  const heads = isP ? '<th>W-L</th><th>ERA</th><th>IP</th><th>K</th>' : isH ? '<th>AVG</th><th>OPS</th><th>HR</th><th>RBI</th>' : '<th data-a="rs" data-k="war">WAR</th>';
  return `<div class="ph"><div><h1>Roster</h1><p>${active().length}/26 active · ${fortyMan().length}/40 on the 40-man. Tap a player for their card.</p></div><div class="chips">${chips}</div></div>
  <section class="panel"><div class="table"><table><tr><th>Player</th><th class="l">Pos</th><th class="l">B/T</th><th class="l">Lvl</th><th data-a="rs" data-k="age">Age</th><th data-a="rs" data-k="ovr">OVR</th><th data-a="rs" data-k="pot">POT</th>${heads}<th data-a="rs" data-k="sal">Salary</th><th data-a="rs" data-k="yrs">Yrs</th></tr>${rows}</table></div></section>`;
}

/* ---------- farm system ---------- */
function vFarm() {
  const F = UI.ff, org = roster(), inAff = k => org.filter(p => p.level !== 'MLB' && affOf(p) === k);
  const tiles = AFF_ORDER.map(k => { const l = inAff(k), top = l.slice().sort((a, b) => (a.pr || 99) - (b.pr || 99) || b.pot - a.pot)[0]; return `<button class="afftile ${F === k ? 'on' : ''}" data-a="ff" data-k="${k}"><small>${AFF[k].l}</small><b>${AFF[k].n}</b><span>${l.length} players${top ? ` · ${esc(lastName(top.name))}` : ''}</span></button>`; }).join('');
  const list = (F === 'top' ? org.filter(p => p.pr).sort((a, b) => a.pr - b.pr) : F === 'r5' ? org.filter(r5Elig).sort((a, b) => (a.pr || 99) - (b.pr || 99) || b.pot - a.pot) : inAff(F).sort((a, b) => (a.pr || 99) - (b.pr || 99) || b.pot - a.pot || b.ovr - a.ovr));
  const rows = list.map(p => `<tr class="row" data-a="card" data-id="${p.id}"><td class="l">${p.pr ? '#' + p.pr : '-'}</td><td class="l">${nm(p)}${r5Elig(p) ? '<span class="tag bad" data-tip="Rule 5 eligible and unprotected">R5</span>' : ''}${p.note ? `<span class="tag" data-tip="${esc(p.note)}">Note</span>` : ''}</td><td class="l">${posTxt(p)}</td><td class="l">${bt(p)}</td><td class="l">${levelTag(p)}</td><td>${p.age}</td><td>${ov(p.ovr)}</td><td>${p.pot}</td><td>${p.eta || '-'}</td><td class="l note">${esc(p.l26 || 'New to the system')}</td></tr>`).join('');
  const title = F === 'top' ? 'MLB Pipeline Top 30' : F === 'r5' ? 'Rule 5 eligible, not on the 40-man' : `${AFF[F].n} · ${AFF[F].l}`;
  return `<div class="ph"><div><h1>Farm system</h1><p>${org.filter(p => p.level !== 'MLB').length} minor leaguers across six levels. Rosters as of ${ROSTER_ASOF}.</p></div><div class="chips"><button class="chip ${F === 'top' ? 'on' : ''}" data-a="ff" data-k="top">Top 30</button><button class="chip ${F === 'r5' ? 'on' : ''}" data-a="ff" data-k="r5">Rule 5 eligible</button></div></div>
  <div class="afftiles">${tiles}</div><section class="panel"><div class="lbl">${title} <span>${list.length} players</span></div><div class="table"><table><tr><th class="l">Rank</th><th class="l">Player</th><th class="l">Pos</th><th class="l">B/T</th><th class="l">Lvl</th><th>Age</th><th>OVR</th><th>POT</th><th>ETA</th><th class="l">2026</th></tr>${rows || '<tr><td colspan="10">Nobody here right now.</td></tr>'}</table></div></section>`;
}

/* ---------- free agents ---------- */
const gradeTag = g => `<span class="grade g${g[0]}">${g}</span>`;
function suitorTags(p) { const s = (p.mkt && p.mkt.suit) || []; return s.length ? `${s.slice(0, 3).map(t => tm(t)).join(' ')}${s.length > 3 ? ` <small class="note">+${s.length - 3}</small>` : ''}` : '<span class="note">Quiet</span>'; }
function faStatus(p) { const m = p.mkt; if (!m) return ''; const b = bestRival(p); return m.dl ? `<span class="tag warn">Decides Wk ${m.dl}</span>` : m.suit.length >= 4 && b ? '<span class="tag bad">Bidding war</span>' : !b ? '<span class="tag">No offers yet</span>' : ''; }
function vFA() {
  let list = freeAgents(); if (UI.fa === 'HIT') list = list.filter(p => !isPit(p)); else if (UI.fa !== 'ALL') list = list.filter(p => p.pos === UI.fa || (p.alts || []).includes(UI.fa));
  if (UI.faq) list = list.filter(p => p.name.toLowerCase().includes(UI.faq.toLowerCase()));
  freeAgents().forEach(p => { if (!p.mkt) marketFor(p); });
  const chips = ['ALL', 'SP', 'RP', 'HIT', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].map(k => `<button class="chip ${UI.fa === k ? 'on' : ''}" data-a="faf" data-k="${k}">${k === 'ALL' ? 'All' : k === 'HIT' ? 'Hitters' : k}</button>`).join('');
  const ex = p => p.exMet ? `<span class="tag good">Ex-${esc(TEAM.name)}</span>` : p.exTeam && TEAM_TAG[p.exTeam] ? ` <span data-tip="2026 club">${tm(p.exTeam)}</span>` : '';
  const rows = list.map(p => `<tr class="row" data-a="neg" data-id="${p.id}"><td>${nm(p)}${ex(p)}${p.qo ? '<span class="tag warn" data-tip="Turned down a qualifying offer: signing costs a draft pick">QO</span>' : ''}</td><td class="l">${posTxt(p)}</td><td class="l">${bt(p)}</td><td>${p.age}</td><td>${ov(p.ovr)}</td><td>${p.ask.yrs} yr</td><td>${money(p.ask.aav)}</td><td>${money(p.ask.aav * p.ask.yrs)}</td><td class="l">${p.mkt ? PRI_SHORT[p.mkt.pri] : ''}</td><td class="l">${suitorTags(p)}</td><td><button class="btn sm go" data-a="neg" data-id="${p.id}">Call agent</button></td></tr>`).join('');
  const big = freeAgents().slice().sort((a, b) => b.ask.aav * b.ask.yrs - a.ask.aav * a.ask.yrs).slice(0, 6).map(p => { const b = bestRival(p); return `<button class="bigfa" data-a="neg" data-id="${p.id}"><span><b>${esc(p.name)}</b> <small>${p.pos} · ${p.age} · asks ${p.ask.yrs}/${money(p.ask.aav * p.ask.yrs)}</small></span><span class="bf-r">${faStatus(p)} ${b ? `${tm(b.t)} <small>${b.o.yrs}/${money(b.o.aav * b.o.yrs)}</small>` : ''}</span></button>`; }).join('');
  const deals = (G.deals || []).slice(0, 14).map(d => `<div class="deal ${d.team === ME ? 'me' : ''}">${tm(d.team)}<span><b>${esc(d.name)}</b> <small>${d.pos}${d.real ? ` · ${esc(d.date)}` : d.wk ? ` · Wk ${d.wk}` : ''}</small></span><small>${d.yrs} yr, ${money(d.total)}${d.opt ? ', opt-out' : ''}</small>${gradeTag(d.g)}</div>`).join('') || '<p class="note">No deals yet this winter.</p>';
  const when = G.phase === 'offseason' ? `Week ${G.week} of ${G.weeks}${G.week === WM_WEEK ? ': the Winter Meetings, so expect a flurry of deals' : ''}. ` : '';
  return `<div class="ph"><div><h1>Free agents</h1><p>${freeAgents().length} available. ${when}Rival clubs raise their offers as the winter goes on, and a player signs when the best offer is good enough for what they care about.</p></div><input id="faq" type="text" placeholder="Search players" value="${esc(UI.faq)}" style="max-width:220px" aria-label="Search free agents"></div>
  <div class="grid" style="margin-bottom:12px"><section class="panel c7"><div class="lbl">Hot stove: biggest names left <span>Best rival offer</span></div><div class="bigfas">${big || '<p class="note">The market is picked clean.</p>'}</div></section>
  <section class="panel c5"><div class="lbl">Signings this winter <span>Deal grades</span></div><div class="deals">${deals}</div></section></div>
  <div class="chips" style="margin-bottom:10px">${chips}</div>
  <section class="panel"><div class="table"><table><tr><th>Player</th><th class="l">Pos</th><th class="l">B/T</th><th>Age</th><th>OVR</th><th>Ask</th><th>AAV</th><th>Total</th><th class="l">Wants</th><th class="l">Suitors</th><th></th></tr>${rows || '<tr><td colspan="11">Nobody fits that filter.</td></tr>'}</table></div></section>`;
}
function negModal(p) {
  if (!p.mkt) marketFor(p);
  const n = UI.modal, m = p.mkt, mx = m.pace === 'slow' ? 2 : 3, pat = p.neg ? p.neg.patience : mx, after = payroll() + n.aav * (1 - n.defer);
  const b = bestRival(p), score = offerValue(p, n, ME) / needOf(p);
  const vibe = score >= 1 ? 'Agent is leaning in' : score >= .95 ? 'In the ballpark' : score >= .85 ? 'Agent is sighing' : 'Agent is laughing';
  const old = p.exTeam && G.teams[p.exTeam];
  const fit = m.pri === 'win' ? `Your club projects to ${projWins(ME)} wins` : m.pri === 'role' ? (wouldStart(p, ME) ? 'You can promise an everyday job' : 'They would not start for you, which hurts') : m.pri === 'stage' ? (BIG_MARKETS.includes(ME) ? `${esc(TEAM.city)} is a big stage` : 'Not a big market, so you start behind') : m.pri === 'home' ? (p.exTeam === ME ? 'You are home for them' : `${old ? esc(old.city) : 'Their old club'} has the inside track`) : m.pri === 'years' ? 'Extra years count for a lot here' : 'The money talks loudest';
  const pace = m.pace === 'slow' ? ' This agent likes to wait out the market.' : m.pace === 'fast' ? ' This agent likes to close early.' : '';
  return `<div class="dlg"><div class="who-tag">On the phone with ${esc(m.agent)} for</div><h2>${esc(p.name)}</h2>
  <div><span class="tag">${posTxt(p)}</span><span class="tag">Age ${p.age}</span>${hand(p)}${p.qo ? '<span class="tag warn" data-tip="Turned down a qualifying offer. Signing costs a draft pick and $500K of pool space.">QO</span>' : ''} ${ov(p.ovr)} <span class="note" style="margin-left:6px">Asking ${p.ask.yrs} yr, ${money(p.ask.aav)}/yr${p.ask.opt ? `, opt-out after ${p.ask.opt}` : ''}</span></div>
  <div class="speech">${esc(n.msg || (b ? `We have ${m.suit.length} club${m.suit.length > 1 ? 's' : ''} in. Impress me.` : 'Nobody has made a real offer yet. Be the first.'))}</div>
  <div class="stat"><span>What matters most</span><b>${PRI[m.pri]}</b></div><div class="note">${fit}.${pace}${m.dl ? ` Wants to decide by Week ${m.dl}.` : ''}</div>
  <div class="stat"><span>Best offer on the table</span><b>${b ? `${tm(b.t)} ${b.o.yrs} yr, ${money(b.o.aav * b.o.yrs)}${b.o.opt ? ' + opt-out' : ''}` : 'None yet'}</b></div>
  <label class="field">Years <output id="o-y">${n.yrs}</output><input id="n-y" type="range" min="1" max="12" step="1" value="${n.yrs}"></label>
  <label class="field">Per year <output id="o-a">${money(n.aav)}</output><input id="n-a" type="range" min="${Math.max(.8, Math.round(p.ask.aav * .5 * 10) / 10)}" max="${Math.round(p.ask.aav * 1.6 * 10) / 10}" step="0.1" value="${n.aav}"></label>
  <div class="chips">${[0, 2, 3].map(k => `<button class="chip ${(n.opt || 0) === k ? 'on' : ''}" data-a="nopt" data-k="${k}">${k ? `Opt-out after yr ${k}` : 'No opt-out'}</button>`).join('')}<button class="chip ${n.ntc ? 'on' : ''}" data-a="nntc" aria-pressed="${!!n.ntc}">No-trade clause</button></div>
  <div class="chips"><button class="chip ${n.defer ? '' : 'on'}" data-a="defer" data-k="0">Pay it now</button><button class="chip ${n.defer === .25 ? 'on' : ''}" data-a="defer" data-k="0.25">${ME === 'BOS' ? 'Kick it down Storrow' : 'Kick the can'} (defer 25%)</button></div>
  <div class="stat"><span>Mood</span><b id="n-v">${vibe}</b></div><div class="stat"><span>Deal grade if signed</span><b id="n-g">${gradeTag(dealGrade(p, n))}</b></div><div class="stat"><span>Patience</span><b class="pat">${'●'.repeat(Math.max(0, pat))}${'○'.repeat(Math.max(0, mx - pat))}</b></div><div class="stat"><span>Payroll after signing</span><b id="n-p" style="color:${after > OWNERS[G.owner].cap ? 'var(--bad)' : 'var(--text)'}">${money(after)}</b></div>
  <p class="note">An opt-out or a no-trade clause makes your offer worth more to the player. Opt-outs can cost you the player early; no-trade clauses mean they can veto trades.</p>
  <div class="row2"><button class="btn go" data-a="offer" ${pat <= 0 ? 'disabled' : ''}>Make offer</button><button class="btn" data-a="close">Hang up</button></div></div>`;
}

/* ---------- trades ---------- */
function vTrade() {
  if (UI.tTeam === ME || !G.teams[UI.tTeam]) UI.tTeam = Object.keys(G.teams).find(a => a !== ME);
  const T = UI.tTeam, open = tradeOpen(), cash = UI.cash || 0, tr = UI.theirRet || 0, ev = (UI.send.length || UI.get.length || cash) ? evalTrade(T, UI.send, UI.get, UI.retain, cash, tr) : null;
  const opts = Object.values(G.teams).filter(t => t.abbr !== ME).sort((a, b) => a.city.localeCompare(b.city)).map(t => `<option value="${t.abbr}" ${t.abbr === T ? 'selected' : ''}>${t.city} ${t.name}</option>`).join('');
  const rtags = p => `${p.ntc ? '<em class="rt" title="Full no-trade clause">NTC</em>' : ''}${p.tenFive && !p.ntc ? '<em class="rt" title="10-and-5 rights">10-5</em>' : ''}${tradeBlock(p) ? `<em class="rt no">${p.drafted === G.year ? 'Draftee' : 'Jun 15'}</em>` : ''}${p.team !== ME && p.level !== 'FARM' && tradeVal(p, p.team) < -5 ? '<em class="rt dump" title="Overpaid: they would give up talent to move this contract">Dump</em>' : ''}`;
  const assetRow = (key, side, label, sub, o, p) => { const on = UI[side].includes(key), off = p && tradeBlock(p) && !on; return `<button class="asset ${on ? 'on' : ''}" data-a="asset" data-side="${side}" data-k="${key}" ${off ? `disabled title="${esc(p.name)} was ${esc(tradeBlock(p))}"` : ''}>${o != null ? ov(o) : '<span class="ov">PK</span>'}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}${p ? rtags(p) : ''}</span><small>${sub}</small></button>`; };
  const subOf = p => `${p.pos}${(p.alts || []).length ? '/' + p.alts.join('/') : ''} · ${isPit(p) ? p.t + 'HP' : 'Bats ' + p.b} · ${p.age} · ${p.level === 'FARM' ? levelTag(p) + (p.pr ? ' #' + p.pr : '') : money(p.sal) + '×' + p.yrs} · ${val$(tradeVal(p, T))}`;
  const pickRows = (owner, side) => G.picks.filter(k => k.owner === owner && tradeablePick(k)).map(k => assetRow('k:' + k.id, side, `${k.year} Comp Balance ${k.rd} (${k.orig})`, `Projected · ${val$(pickValue(k))}`)).join('');
  const poolRow = (owner, side) => { const n = UI[side].filter(a => a.startsWith('i:')).length, x = poolOf(owner); return `<div class="poolrow"><span>Intl pool space</span><button class="btn sm" data-a="pool" data-side="${side}" data-k="-1" aria-label="Remove $250K" ${n ? '' : 'disabled'}>−</button><b>${pool$(n * POOL_STEP)}</b><button class="btn sm" data-a="pool" data-side="${side}" data-k="1" aria-label="Add $250K">+</button><small>${pool$(x.left)} left</small></div>`; };
  const listOf = (team, sideArr, farm) => farm ? roster(team).filter(p => p.level === 'FARM' || sideArr.includes('p:' + p.id)).sort((a, b) => (a.pr || 99) - (b.pr || 99) || b.pot - a.pot) : roster(team).filter(p => p.level !== 'FARM' || sideArr.includes('p:' + p.id)).sort((a, b) => b.ovr - a.ovr);
  const mine = listOf(ME, UI.send, UI.tm === 'farm').map(p => assetRow('p:' + p.id, 'send', p.name, subOf(p), p.ovr, p)).join('') + (UI.tm === 'farm' ? '' : pickRows(ME, 'send'));
  const theirs = listOf(T, UI.get, UI.tm2 === 'farm').map(p => assetRow('p:' + p.id, 'get', p.name, subOf(p), p.ovr, p)).join('') + (UI.tm2 === 'farm' ? '' : pickRows(T, 'get'));
  const tabs = (k, v) => `<div class="chips" style="margin-bottom:8px"><button class="chip ${v === 'forty' ? 'on' : ''}" data-a="${k}" data-k="forty">40-man and picks</button><button class="chip ${v === 'farm' ? 'on' : ''}" data-a="${k}" data-k="farm">Minor leaguers</button></div>`;
  const taxNow = taxBill(payroll()), pl = arr => arr.filter(a => a.startsWith('p:')).map(a => P(+a.slice(2))).filter(p => p && p.level !== 'FARM');
  const inP = pl(UI.get).reduce((s, p) => s + p.sal * (1 - tr), 0), outP = pl(UI.send).reduce((s, p) => s + p.sal * (1 - UI.retain), 0), dPay = inP - outP + cash;
  const mode = teamMode(T), sell = sellerOf(T), modeTxt = { contender: 'Contending. Pays up for proven veterans.', rebuild: 'Rebuilding. Loves youth and cash, discounts anyone over 30.', middle: 'Stuck in the middle. Open to anything.' }[mode] + (sell && mode !== 'rebuild' ? ' Out of the race, so they are selling.' : '');
  const chipRow = (act, vals, cur, fmt) => `<div class="chips">${vals.map(v => `<button class="chip ${cur === v ? 'on' : ''}" data-a="${act}" data-k="${v}">${fmt(v)}</button>`).join('')}</div>`;
  return `<div class="ph"><div><h1>Trade machine</h1><p>${open ? 'Pick what you send and what you want, then watch the Trade-O-Meter.' : 'The deadline has passed. Trades reopen in the offseason.'}</p></div><select id="tteam" class="inp" aria-label="Trade partner">${opts}</select></div>
  ${G.inbox.length ? `<section class="panel" style="margin-bottom:12px"><div class="lbl">Incoming calls</div><div class="grid">${G.inbox.map(x => `<div class="c4">${offerCard(x)}</div>`).join('')}</div></section>` : ''}
  <div class="grid"><section class="panel c4"><div class="lbl"><span class="lt">${tm(ME)} ${esc(TEAM.name)} send</span> <span>${UI.send.filter(a => !a.startsWith('i:')).length} selected</span></div>${poolRow(ME, 'send')}${tabs('tm', UI.tm)}<div class="assets">${mine}</div></section>
  <section class="panel c4"><div class="lbl">Trade-O-Meter <span>${tm(T)} ${G.teams[T].name}${G.phase === 'season' ? ' · ' + rec(G.teams[T]) : ''}</span></div>
    <div class="gauge" role="img" aria-label="${ev ? esc(ev.label) : 'No deal on the table'}"><i style="left:${ev ? (ev.score + 1) * 50 : 50}%"></i></div>
    <div class="speech" style="margin-top:12px">${esc(UI.trMsg || (ev ? ev.label : 'Build a deal and their GM will react live.'))}</div>
    <div class="stat" style="margin-top:8px"><span>Value you send (their view)</span><b>${val$(ev ? ev.vs : 0)}</b></div><div class="stat"><span>Value you get (their view)</span><b>${val$(ev ? ev.vg : 0)}</b></div><div class="stat"><span>Your payroll change</span><b>${dPay >= 0 ? '+' : '-'}${money(Math.abs(dPay))}</b></div><div class="stat"><span>Luxury tax change</span><b>${(() => { const d = taxBill(payroll() + dPay) - taxNow; return (d >= 0 ? '+' : '-') + money(Math.abs(d)); })()}</b></div>
    <div class="note" style="margin:6px 0">${modeTxt}</div>
    <div class="lbl" style="margin:8px 0 5px">Take on salary: cash you send them</div>${chipRow('cash', [0, 2, 5, 10, 20, 30], cash, v => v ? '$' + v + 'M' : 'None')}
    <div class="lbl" style="margin:8px 0 5px">Eat salary on players you send</div>${chipRow('retain', [0, .25, .5, .75], UI.retain, v => v * 100 + '%')}
    <div class="lbl" style="margin:8px 0 5px">Ask them to eat salary on players you get</div>${chipRow('theirRet', [0, .25, .5], tr, v => v * 100 + '%')}
    <div class="row2" style="margin-top:10px"><button class="btn go" data-a="propose" ${open && ev && ev.ok ? '' : 'disabled'}>Make the trade</button><button class="btn" data-a="clearT">Clear</button><button class="btn" data-a="tab" data-k="block">Trade block</button></div>
    <p class="note" style="margin-top:10px">Values are surplus value: what a player should produce minus what they're owed. Taking on salary helps two ways: cash you send counts against your payroll this season and buys value (rebuilders love it), and players tagged Dump are overpaid, so their club gives up talent to unload them. Asking a club to eat salary makes your side cheaper but costs more in talent. Only Competitive Balance picks can be traded (2027 list projected). Free agents signed this winter can't be traded until June 15. No-trade clauses and 10-and-5 rights need the player's OK. Deadline: July 31.</p></section>
  <section class="panel c4"><div class="lbl"><span class="lt">${tm(T)} ${G.teams[T].name} send</span> <span>${UI.get.filter(a => !a.startsWith('i:')).length} selected</span></div>${poolRow(T, 'get')}${tabs('tm2', UI.tm2)}<div class="assets">${theirs}</div></section></div>`;
}

/* ---------- trade block ---------- */
function vBlock() {
  const all = onTheBlock(), F = UI.blk || 'all', list = F === 'all' ? all : all.filter(x => x.why === F), open = tradeOpen(), n = k => all.filter(x => x.why === k).length;
  const WHY = { rental: ['Rental', 'good', 'Expiring deal on a club that is selling'], vet: ['Veteran', '', 'A selling club is shopping this veteran'], dump: ['Salary dump', 'warn', 'Overpaid: the club would give up talent to move this contract'] };
  const when = G.phase === 'season' ? (G.day < DEADLINE ? `${DEADLINE - G.day} games to the July 31 deadline` : 'The deadline has passed') : 'Offseason: rebuilding clubs are listening';
  const sellers = new Set(all.filter(x => x.why !== 'dump').map(x => x.a)).size;
  const rows = list.slice(0, 150).map(x => { const p = x.p, t = G.teams[x.a], w = WHY[x.why]; return `<tr class="row" data-a="card" data-id="${p.id}"><td class="l">${nm(p)}<span class="tag ${w[1]}" data-tip="${esc(w[2])}">${w[0]}</span></td><td class="l">${posTxt(p)}</td><td class="l">${bt(p)}</td><td>${p.age}</td><td>${ov(p.ovr)}</td><td class="l">${tm(t.abbr)} <small class="note">${G.phase === 'season' ? rec(t) + (x.gb ? ` · ${x.gb} GB` : '') : t.w26 + '-' + t.l26}</small></td><td>${money(p.sal)} × ${p.yrs}</td><td>${val$(x.v)}</td><td>${open ? `<button class="btn sm go" data-a="blockOffer" data-id="${p.id}">Make an offer</button>` : ''}</td></tr>`; }).join('');
  return `<div class="ph"><div><h1>Trade block</h1><p>${when}. ${all.length} players available from ${sellers} selling clubs, plus contracts clubs want off the books. Value is what they think the player is worth; sellers discount expiring deals.</p></div></div>
  <div class="chips" style="margin-bottom:10px">${[['all', 'Everyone', all.length], ['rental', 'Rentals', n('rental')], ['vet', 'Veterans', n('vet')], ['dump', 'Salary dumps', n('dump')]].map(([k, l, c]) => `<button class="chip ${F === k ? 'on' : ''}" data-a="blk" data-k="${k}">${l} · ${c}</button>`).join('')}</div>
  <section class="panel"><div class="table"><table><tr><th class="l">Player</th><th class="l">Pos</th><th class="l">B/T</th><th>Age</th><th>OVR</th><th class="l">Club</th><th>Contract</th><th>Value</th><th></th></tr>${rows || '<tr><td colspan="9">Nobody on the block right now.</td></tr>'}</table></div></section>`;
}

/* ---------- standings ---------- */
function vStand() {
  const tbl = (lg, d) => `<section class="panel c4"><div class="lbl">${lg} ${d}</div><div class="table"><table><tr><th>Team</th><th>W</th><th>L</th><th>GB</th><th>Diff</th></tr>${divStandings(lg, d).map((t, i, a) => { const u = G.phase === 'offseason'; const w = u ? t.w26 : t.w, l = u ? t.l26 : t.l; return { t, w, l }; }).sort((x, y) => (y.w - y.l) - (x.w - x.l)).map((r, i, a) => `<tr class="${r.t.abbr === ME ? 'me' : ''}"><td>${tm(r.t.abbr)} ${r.t.name}</td><td>${r.w}</td><td>${r.l}</td><td>${i ? ((a[0].w - a[0].l) - (r.w - r.l)) / 2 : '-'}</td><td>${G.phase === 'offseason' ? '-' : (r.t.rs - r.t.ra > 0 ? '+' : '') + (r.t.rs - r.t.ra)}</td></tr>`).join('')}</table></div></section>`;
  return `<div class="ph"><div><h1>Standings</h1><p>${G.phase === 'offseason' ? 'Final 2026 records until Opening Day.' : 'Top three division winners and three wild cards per league make October.'}</p></div></div>
  ${G.po ? bracket() : ''}<div class="grid">${[MY_LG, MY_LG === 'AL' ? 'NL' : 'AL'].flatMap(lg => ['East', 'Central', 'West'].map(d => tbl(lg, d))).join('')}</div>`;
}
function bracket() {
  const po = G.po, names = ['Wild Card', 'Division Series', 'League Championship', 'World Series'];
  const sr = s => `<div class="series ${s.a === ME || s.b === ME ? 'm' : ''}"><span>${tm(s.a)} ${s.wa} - ${s.wb} ${tm(s.b)}</span>${s.w ? `<b>${tm(s.w)}</b>` : ''}</div>`;
  const rounds = [...po.past.filter(Boolean)]; if (!po.champ && !rounds.includes(po.series)) rounds.push(po.series);
  return `<section class="panel" style="margin-bottom:12px"><div class="lbl">Postseason bracket ${po.champ ? `<span>${G.teams[po.champ].city} ${G.teams[po.champ].name} win it all</span>` : ''}</div><div class="grid">${rounds.map((r, i) => `<div class="c3"><div class="who-tag" style="margin-bottom:5px">${names[i]}</div><div style="display:flex;flex-direction:column;gap:4px">${r.map(sr).join('')}</div></div>`).join('')}</div></section>`;
}

/* ---------- money and trophies ---------- */
function vMoney() {
  const yrs = [0, 1, 2, 3, 4].map(i => G.year + i), vals = yrs.map(y => payroll(y)), cap = OWNERS[G.owner].cap, mx = Math.max(...vals, cap, CBT_LINE) * 1.08, W = 520, H = 230, B = 24, T = 14, L = 40;
  const Y = v => T + (1 - v / mx) * (H - T - B), bw = 46, X = i => L + 16 + i * ((W - L - 20) / 5);
  const bars = vals.map((v, i) => `<g data-tip="${yrs[i]} commitments: ${money(v)}"><rect x="${X(i) - 8}" y="${T}" width="${bw + 16}" height="${H - T - B}" fill="transparent"/><path d="M${X(i)} ${H - B} V${Y(v) + 4} q0 -4 4 -4 H${X(i) + bw - 4} q4 0 4 4 V${H - B} Z" fill="var(--orange)"/><text x="${X(i) + bw / 2}" y="${Y(v) - 5}" text-anchor="middle" fill="var(--text)" font-size="13" font-weight="700" font-family="var(--cond)">${money(v)}</text><text x="${X(i) + bw / 2}" y="${H - 7}" text-anchor="middle" fill="var(--muted)" font-size="12" font-family="var(--cond)">${yrs[i]}</text></g>`).join('');
  const refLine = (v, c, l) => `<line x1="${L}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-dasharray="5 4"/><text x="${L - 4}" y="${Y(v) + 4}" text-anchor="end" fill="var(--muted)" font-size="11" font-family="var(--cond)">${l}</text>`;
  const top = roster().filter(p => p.sal > 3 && p.level !== 'FARM').sort((a, b) => b.sal - a.sal).slice(0, 12);
  const dead = G.dead.filter(d => d.thru >= G.year);
  return `<div class="ph"><div><h1>Finances</h1><p>The 2027 tax line is assumed at the 2026 figure of $244M because the labor deal is unsettled.</p></div></div><div class="grid">
  <section class="panel c7"><div class="lbl">Payroll commitments <span>Dashed: owner budget, tax line</span></div><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Payroll commitments by year">${refLine(cap, 'var(--warn)', 'Budget')}${refLine(CBT_LINE, '#ffffff', 'Tax')}${bars}<line x1="${L}" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="#ffffff55"/></svg></section>
  <section class="panel c5">${payBlock()}<div class="stat"><span>Slush fund</span><b>${money(G.cash)}</b></div></section>
  <section class="panel c7"><div class="lbl">Biggest contracts</div><div class="table"><table><tr><th>Player</th><th>Salary</th><th>Yrs</th><th>Through</th></tr>${top.map(p => `<tr class="row" data-a="card" data-id="${p.id}"><td>${nm(p)}</td><td>${money(p.sal)}</td><td>${p.yrs}</td><td>${G.year + p.yrs - 1}</td></tr>`).join('')}</table></div></section>
  <section class="panel c5"><div class="lbl">Dead money and deferrals</div><div class="table"><table><tr><th>Item</th><th>Per year</th><th>Thru</th></tr>${dead.map(d => `<tr><td style="white-space:normal">${esc(d.label)}</td><td>${money(d.amt)}</td><td>${d.thru}</td></tr>`).join('')}</table></div></section></div>`;
}
function vTrophy() {
  const got = Object.keys(G.trophies).length;
  return `<div class="ph"><div><h1>Trophy case</h1><p>${got} of ${TROPHIES.length} unlocked.</p></div></div><section class="panel" style="margin-bottom:12px"><div class="tgrid">${TROPHIES.map(([k, n, d]) => `<div class="trophy ${G.trophies[k] ? 'got' : ''}"><i>${G.trophies[k] ? '★' : '?'}</i><div><b>${n}</b><small>${d}${G.trophies[k] ? ` (${G.trophies[k]})` : ''}</small></div></div>`).join('')}</div></section>
  <section class="panel"><div class="lbl">Your tenure</div>${G.history.length ? `<div class="table"><table><tr><th>Year</th><th>W</th><th>L</th><th class="l">Result</th><th>Payroll</th><th>Grade</th><th class="l">Champion</th></tr>${[...G.history].reverse().map(h => `<tr><td>${h.year}</td><td>${h.w}</td><td>${h.l}</td><td class="l">${h.result}</td><td>$${h.payroll}M</td><td>${h.grade}</td><td class="l">${h.champ}</td></tr>`).join('')}</table></div>` : '<p class="note">Your first season is still ahead. No pressure. Everyone is watching.</p>'}</section>`;
}

/* ---------- modals ---------- */
function renderModal() {
  const el = $('#modal');
  if (G.pending && G.pending.clutch) { if (!Clutch.active()) openClutch(); return; }
  let h = '';
  if (G.fired) h = firedDlg();
  else if (UI.showNew) h = newDlg();
  else if (G.review) h = reviewDlg();
  else if (G.draft) h = draftDlg();
  else if (G.phone != null) h = phoneDlg();
  else if (UI.modal?.t === 'neg') { const p = P(UI.modal.id); h = p && p.team === 'FA' ? negModal(p) : ''; if (!h) UI.modal = null; }
  else if (UI.modal?.t === 'card') h = cardDlg(P(UI.modal.id));
  el.innerHTML = h ? `<div class="modal" role="dialog" aria-modal="true">${h}</div>` : '';
}
function openClutch() {
  const g = G.pending, c = g.clutch, o = G.teams[g.opp];
  $('#modal').innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="dlg wide"><div class="who-tag">${g.po ? 'October' : 'Clutch moment'} · ${g.home ? 'Bottom' : 'Top'} of the 9th · Two outs</div><h2>${esc(TEAM.name)} ${g.them - c.deficit}, ${esc(o.name)} ${g.them}</h2>
  <div class="pitchwrap"><canvas id="cl-cv" width="${Clutch.W}" height="${Clutch.H}" data-a="clSwing" aria-label="Pitch view"></canvas><div class="pside"><div id="cl-side"></div><button class="swing" id="cl-swing" data-a="clSwing">Throw pitch</button><p class="note">Swing when the ring closes on the ball, or press Space. Let balls go by.</p><button class="btn sm" data-a="clSkip">Sim this at-bat</button></div></div></div></div>`;
  Clutch.begin(g, r => { resolveClutch(r); render(); resume(); });
}
function teamPreview(a) {
  const rows = ORGS[a].map(unpackRow), r = TEAM_ROWS.find(x => x[0] === a), fin = TEAM_ROWS.filter(x => x[3] === r[3] && x[4] === r[4]).sort((x, y) => y[5] - x[5]).findIndex(x => x[0] === a) + 1;
  const pay = rows.filter(o => o.lv !== 'FARM').reduce((s, o) => s + (o.lv === 'AAA' && o.ct === 'pre' ? (o.sal || .8) * .3 : (o.sal || .8)), 0);
  const star = rows.filter(o => o.lv !== 'FARM').sort((x, y) => y.ovr - x.ovr)[0], pro = rows.filter(o => o.pr).sort((x, y) => x.pr - y.pr)[0];
  return `<div class="preview"><b>${tm(a)} ${esc(r[1] + ' ' + r[2])}</b><div class="note">2026: ${r[5]}-${r[6]}, ${fin}${ordinal(fin)} in the ${r[3]} ${r[4]} · ${esc(TEAM_META[a].park)}</div><div class="stat"><span>Best player</span><b>${esc(star.n)} (${star.pos}, ${star.ovr})</b></div><div class="stat"><span>Top prospect</span><b>${pro ? `${esc(pro.n)} (${pro.pos})` : '-'}</b></div><div class="stat"><span>Payroll</span><b>${money(pay)}</b></div><div class="stat"><span>Minor leaguers</span><b>${rows.filter(o => o.lv === 'FARM').length}</b></div></div>`;
}
function newDlg() {
  const own = UI.newOwner || 'steady', pick = UI.pickTeam || G.me || 'NYM', saves = Store.list(), nick = TEAM_ROWS.find(r => r[0] === pick)[2];
  const grid = ['AL', 'NL'].map(lg => ['East', 'Central', 'West'].map(dv => `<div class="dv">${lg} ${dv}</div>` + TEAM_ROWS.filter(r => r[3] === lg && r[4] === dv).map(r => `<button class="${pick === r[0] ? 'on' : ''}" style="--tb:${TEAM_TAG[r[0]].bg};--ts:${TEAM_TAG[r[0]].st};--tt:${TEAM_TAG[r[0]].fg}" data-a="pickTeam" data-k="${r[0]}" aria-pressed="${pick === r[0]}" title="${esc(r[1] + ' ' + r[2])}">${r[0]}<small>${r[5]}-${r[6]}</small></button>`).join('')).join('')).join('');
  const cont = saves.length ? `<div class="lbl" style="margin:0">Your careers <span>${Store.uid ? 'Saved to your account' : 'Saved in this browser'}</span></div><div class="careers">${saves.map(m => { const t = TEAM_ROWS.find(r => r[0] === m.team); return `<button class="asset" data-a="loadCareer" data-k="${m.team}"><span style="white-space:normal"><b>${tm(m.team)} ${esc(t[1] + ' ' + t[2])}</b><br><small>${esc(m.gm || 'GM')} · ${m.year}${m.phase === 'offseason' ? ' offseason' : ''}${m.rec ? ' · ' + m.rec : ''}${m.titles ? ` · ${m.titles} title${m.titles > 1 ? 's' : ''}` : ''}</small></span><b>Continue</b></button>`; }).join('')}</div>` : '';
  return `<div class="dlg wide"><div class="who-tag">Press conference · ${ROSTER_ASOF}</div><h2>Pick your club, GM</h2><p>All 30 clubs come with their real 40-man rosters and every minor leaguer in the system as of ${ROSTER_ASOF}. Your job is to win in October.</p>
  ${cont}<div class="lbl" style="margin:0">${saves.length ? 'Or start a new career' : 'Choose a club'}</div><div class="teamgrid" role="group" aria-label="Clubs">${grid}</div>${teamPreview(pick)}
  <label class="field">Your name on the door<input id="gmname" type="text" maxlength="28" value="${esc(UI.newName || '')}" placeholder="Rookie GM"></label>
  <div class="lbl" style="margin:0">Who signs your checks?</div><div style="display:flex;flex-direction:column;gap:5px">${Object.entries(OWNERS).map(([k, o]) => `<button class="asset ${own === k ? 'on' : ''}" style="grid-template-columns:minmax(0,1fr) auto" data-a="pickOwner" data-k="${k}"><span style="white-space:normal"><b>${o.name}</b><br><small>${o.blurb}</small></span><b>$${o.cap}M</b></button>`).join('')}</div>
  <div class="row2"><button class="btn go" data-a="start">Take the ${esc(nick)} job</button>${!UI.dummy && !G.fired ? '<button class="btn" data-a="closeNew">Back to my career</button>' : ''}</div>
  <p class="note">${Store.uid ? `Careers save to ${esc(Store.acct || 'your Claude account')}, one per club, so you can pick up on any device.` : 'Careers save in this browser, one per club.'}</p></div>`;
}
function phoneDlg() {
  const c = PHONE_CARDS[G.phone];
  return `<div class="dlg"><div class="who-tag">The phone is ringing · ${esc(c.who)}</div><h2>${esc(c.title)}</h2><p>${esc(c.body)}</p><div class="row2" style="flex-direction:column">${c.opts.map((o, i) => `<button class="btn" data-a="phone" data-i="${i}" ${o.cost && G.cash < o.cost ? 'disabled' : ''}>${esc(o.t)}</button>`).join('')}${c.opts.every(o => o.cost && G.cash < o.cost) ? '<button class="btn" data-a="phone" data-i="-1">Let it go to voicemail</button>' : ''}</div></div>`;
}
function draftDlg() {
  const d = G.draft;
  return `<div class="dlg wide"><div class="who-tag">${G.year} MLB Draft · Round ${d.rd}</div><h2>You're on the clock</h2><p class="note">Scouting grades are estimates. Some of these kids will fool you.</p><div class="table"><table><tr><th>Prospect</th><th class="l">Pos</th><th>Age</th><th>Scout grade</th><th class="l">Report</th><th></th></tr>${d.board.map((b, i) => `<tr><td><b>${esc(b.name)}</b><br><small class="note">${esc(b.from)}</small></td><td class="l">${b.pos}</td><td>${b.age}</td><td>${ov(clamp(b.est, 20, 80))}</td><td class="l">${esc(b.vibe)}</td><td><button class="btn sm go" data-a="draft" data-i="${i}">Draft</button></td></tr>`).join('')}</table></div></div>`;
}
function reviewDlg() {
  const r = G.review, mvp = r.mvp && P(r.mvp), cy = r.cy && P(r.cy), ch = G.teams[r.champ];
  return `<div class="dlg"><div class="who-tag">Owner's report card · ${r.year}</div><h2>${esc(r.result)}</h2><div style="display:flex;gap:14px;align-items:center"><div style="font:400 72px/1 var(--display);color:var(--orange)">${r.grade}</div><div><div style="font:700 24px var(--cond)">${r.w}-${r.l}, ${r.finish}${ordinal(r.finish)} in the ${MY_LG} ${MY_DIV}</div><div class="note">Owner trust ${r.dT >= 0 ? '+' : ''}${r.dT}. Slush fund +${money(r.rev)}.</div></div></div>
  ${mvp ? `<div class="stat"><span>Team MVP</span><b>${esc(mvp.name)} · ${avg(mvp.s)}, ${mvp.s.HR} HR, ${war(mvp)} WAR</b></div>` : ''}${cy ? `<div class="stat"><span>Best arm</span><b>${esc(cy.name)} · ${era(cy.s)} ERA, ${cy.s.PK} K</b></div>` : ''}<div class="stat"><span>World Series</span><b>${ch.city} ${ch.name}</b></div>
  <button class="btn go" data-a="nextYear">On to the ${r.year + 1} offseason</button></div>`;
}
function firedDlg() {
  const h = G.history, w = h.reduce((s, x) => s + x.w, 0), l = h.reduce((s, x) => s + x.l, 0);
  return `<div class="dlg"><article class="back" style="transform:none"><div class="mast"><b>${esc(TEAM.paper)}</b><span>Extra edition</span></div><h2>YOU'RE FIRED</h2><p>${esc(G.gm)} is out after ${h.length} season${h.length === 1 ? '' : 's'} and a ${w}-${l} record. ${esc(VOICE())} is taking full credit.</p></article><div class="stat"><span>Titles</span><b>${G.titles}</b></div><div class="stat"><span>Trophies</span><b>${Object.keys(G.trophies).length}</b></div><button class="btn go" data-a="newgame">Try again</button></div>`;
}
function r5Text(p) { if (p.r5 == null || p.team !== ME) return null; if (p.level !== 'FARM') return 'Protected on the 40-man'; return p.r5 <= r5Dec() ? (G.r5Done === r5Dec() ? 'Eligible. Went unpicked this winter.' : 'Eligible this December. Add to the 40-man to protect.') : `Eligible in December ${p.r5}`; }
function bioRows(p) { const r = [['Born', p.from && !p.fict ? p.from : null], ['Signed', p.draft], ['Acquired', p.acq], ['Rule 5', r5Text(p)]].filter(x => x[1]); return r.map(([k, v]) => `<div class="stat"><span>${k}</span><b class="bio">${esc(v)}</b></div>`).join('') + (p.note ? `<div class="speech" style="margin-top:6px">${esc(p.note)}</div>` : ''); }
function cardDlg(p) {
  if (!p) { UI.modal = null; return ''; }
  const bars = isPit(p) ? [['Stuff', p.stf], ['Control', p.ctl], ['Stamina', p.stm]] : [['Contact', p.con], ['Power', p.pow], ['Eye', p.eye], ['Speed', p.spd], ['Field', p.fld]];
  const t = p.team, s = p.s, line = s && (isPit(p) ? s.O : s.AB) ? (isPit(p) ? `${s.W}-${s.L}, ${era(s)} ERA, ${ip(s.O)} IP, ${s.PK} K${s.SV ? `, ${s.SV} SV` : ''}` : `${avg(s)} AVG, ${ops(s)} OPS, ${s.HR} HR, ${s.RBI} RBI, ${s.SB} SB`) : null;
  let acts = '';
  if (t === ME) {
    if (p.level === 'MLB') acts += `<button class="btn" data-a="lvl" data-k="AAA">Option to ${AFF.AAA.n}</button>`; else acts += `<button class="btn go" data-a="lvl" data-k="MLB">Call up to ${esc(TEAM.city)}</button>`;
    if (p.level === 'FARM') { const i = AFF_ORDER.indexOf(affOf(p)); acts += `<button class="btn" data-a="lvl" data-k="AAA">Add to 40-man</button>`; if (i > 0) acts += `<button class="btn" data-a="aff" data-k="-1">Move up to ${AFF[AFF_ORDER[i - 1]].n}</button>`; if (i < AFF_ORDER.length - 1) acts += `<button class="btn" data-a="aff" data-k="1">Send down to ${AFF[AFF_ORDER[i + 1]].n}</button>`; }
    if (tradeOpen()) acts += `<button class="btn" data-a="shop">Put in a trade</button>`;
    acts += UI.relConfirm === p.id ? `<button class="btn bad" data-a="release">${p.level === 'FARM' ? 'Confirm release' : `Confirm: eat ${money(p.sal * p.yrs)}`}</button>` : `<button class="btn" data-a="relAsk">Release</button>`;
  } else if (t === 'FA') acts = `<button class="btn go" data-a="neg" data-id="${p.id}">Call the agent</button>`;
  else if (tradeOpen()) acts = `<button class="btn go" data-a="tradeFor">Trade for this player</button>`;
  const club = t === 'FA' ? 'Free agent' : `${G.teams[t].city} ${G.teams[t].name}`;
  return `<div class="dlg wide"><div class="pdlg"><div class="card t${tier(p.ovr)}"><div class="in"><div class="cardtop"><div><div class="who-tag">${esc(club)}</div><h3>${esc(p.name)}</h3></div><div class="big">${p.ovr}</div></div><div><span class="tag">${p.pos}${(p.alts || []).length ? ' / ' + p.alts.join(', ') : ''}</span><span class="tag">Age ${p.age}</span><span class="tag hd h${p.b}">Bats ${p.b === 'S' ? 'switch' : p.b}</span><span class="tag hd h${p.t}">Throws ${p.t}</span></div>${fitRow(p)}${bars.map(([l, v]) => `<div class="rate"><span>${l}</span><div class="bar"><i style="width:${(v - 20) / 60 * 100}%"></i></div><b>${v}</b></div>`).join('')}<div class="note">Potential ${p.pot}${p.pr ? ` · Pipeline #${p.pr}` : ''}${p.eta ? ` · ETA ${p.eta}` : ''}${t !== 'FA' && p.level !== 'MLB' ? ` · ${esc(affLabel(p))}` : ''}${p.from && p.fict ? ` · From ${esc(p.from)}` : ''}</div></div></div>
  <div>${p.inj ? `<div class="speech">On the IL for ${p.inj.g} more games: ${esc(p.inj.why)}.</div>` : ''}<div class="stat"><span>Contract</span><b>${t === 'FA' ? `Asking ${p.ask.yrs}y, ${money(p.ask.aav)}` : p.level === 'FARM' ? `Minor league deal · ${p.yrs} yr` : `${money(p.sal)} × ${p.yrs} yr`}</b></div>${t !== 'FA' ? `<div class="stat"><span>Through</span><b>${G.year + p.yrs - 1}</b></div>` : ''}<div class="stat"><span>Trade value</span><b>${val$(tradeVal(p))} surplus</b></div>${p.ntc || p.tenFive || (t !== 'FA' && tradeBlock(p)) ? `<div class="stat"><span>Trade rules</span><b>${[p.ntc ? 'Full no-trade clause' : '', p.tenFive ? '10-and-5 rights' : '', t !== 'FA' && tradeBlock(p) ? (p.drafted === G.year ? 'Draftee: after the World Series' : 'Signed this winter: June 15') : ''].filter(Boolean).join(' · ')}</b></div>` : ''}${line ? `<div><div class="lbl" style="margin:4px 0">${G.year}</div>${line}</div>` : ''}${p.lines && p.lines.length ? `<div><div class="lbl" style="margin:4px 0">${p.level === 'MLB' || p.level === 'AAA' ? 'Recent minor league stats' : 'Real stats by level'}</div>${(p.level === 'FARM' ? [] : [p.l26]).concat(p.lines).filter(Boolean).slice(0, 5).map(l => `<div class="note">${esc(l)}</div>`).join('')}</div>` : p.l26 ? `<div><div class="lbl" style="margin:4px 0">2026 real stats</div><span class="note">${esc(p.l26)}</span></div>` : ''}${bioRows(p)}<div class="row2">${acts}<button class="btn" data-a="close">Close</button></div></div></div></div>`;
}

/* ---------- game loop ---------- */
function resume() { if (UI.queue && !blocked()) step(); else if (!UI.queue) render(); }
function step() {
  const q = UI.queue; if (!q) return;
  if (blocked()) { render(); return; }
  if (q.t === 'days') {
    if (G.phase !== 'season' || G.day >= q.to) { UI.queue = null; render(); return; }
    simDays(Math.min(3, q.to - G.day), q.to);
    if (G.phase !== 'season' || G.day >= q.to) UI.queue = null;
    if (blocked() || !UI.queue) { render(); return; }
    renderTop(); setTimeout(step, 28);
  } else if (q.t === 'weeks') {
    if (G.phase !== 'offseason') { UI.queue = null; render(); return; }
    advanceWeek();
    if (G.phase !== 'offseason') UI.queue = null;
    if (blocked() || !UI.queue) { render(); return; }
    renderTop(); setTimeout(step, 90);
  }
}
const ACT = {
  tab: e => { UI.tab = e.k; UI.sel = null; render(); window.scrollTo(0, 0); },
  week: () => { advanceWeek(); render(); }, toOD: () => { UI.queue = { t: 'weeks' }; step(); },
  sim: e => { UI.queue = { t: 'days', to: Math.min(162, G.day + +e.n) }; step(); }, simTo: e => { UI.queue = { t: 'days', to: +e.n }; step(); },
  stop: () => { UI.queue = null; render(); }, po: () => { poAdvance(); render(); },
  card: e => { UI.relConfirm = null; UI.modal = { t: 'card', id: +e.id }; renderModal(); }, close: () => { UI.modal = null; UI.relConfirm = null; render(); },
  neg: e => { const p = P(+e.id); if (!p || p.team !== 'FA') return; UI.modal = { t: 'neg', id: p.id, yrs: p.ask.yrs, aav: p.ask.aav, defer: 0, opt: p.ask.opt || 0, ntc: false, msg: '' }; renderModal(); },
  defer: e => { UI.modal.defer = +e.k; renderModal(); },
  nopt: e => { UI.modal.opt = +e.k; renderModal(); },
  nntc: () => { UI.modal.ntc = !UI.modal.ntc; renderModal(); },
  offer: () => {
    const m = UI.modal, p = P(m.id), r = negotiate(p, { yrs: m.yrs, aav: m.aav, defer: m.defer, opt: m.opt && m.opt < m.yrs ? m.opt : 0, ntc: m.ntc });
    if (r.kind === 'signed') { UI.modal = null; toast('Signed!', `${p.name}, ${m.yrs} yr, ${money(m.aav * m.yrs)}. Deal grade: ${r.g}.`); render(); return; }
    m.msg = r.msg; if (r.counter) { m.yrs = r.counter.yrs; m.aav = r.counter.aav; } renderModal();
  },
  ff: e => { UI.ff = e.k; render(); }, tm: e => { UI.tm = e.k; render(); }, aff: e => { const p = P(UI.modal.id), to = moveAff(p, +e.k); if (to) { addNews(`${p.name} reassigned to ${to}.`); toast('Farm move', `${p.name} is headed to ${to}.`); } render(); },
  rf: e => { UI.rf = e.k; render(); }, rs: e => { UI.rs = e.k; render(); }, faf: e => { UI.fa = e.k; render(); },
  pickSlot: e => { const k = { k: e.k, i: +e.i }; if (!UI.sel) UI.sel = k; else { swapSlots(UI.sel, k); UI.sel = null; } render(); },
  autoL: () => { rebalance(); autoLineup(); autoPitching(); refreshTeams(); UI.sel = null; toast('Lineup card filled', 'The bench coach used a very sharp pencil.'); render(); },
  autofix: () => { const n = rebalance(); autoLineup(); autoPitching(); refreshTeams(); n.forEach(addNews); toast('Roster fixed', n.length ? n[0] : 'Everything lines up.'); render(); },
  asset: e => { const a = UI[e.side], i = a.indexOf(e.k); if (i >= 0) a.splice(i, 1); else a.push(e.k); UI.trMsg = null; render(); },
  retain: e => { UI.retain = +e.k; UI.trMsg = null; render(); }, clearT: () => { UI.send = []; UI.get = []; UI.retain = 0; UI.cash = 0; UI.theirRet = 0; UI.trMsg = null; render(); },
  cash: e => { UI.cash = +e.k; UI.trMsg = null; render(); }, theirRet: e => { UI.theirRet = +e.k; UI.trMsg = null; render(); }, tm2: e => { UI.tm2 = e.k; render(); }, blk: e => { UI.blk = e.k; render(); },
  blockOffer: e => { const p = P(+e.id); if (!p) return; UI.tTeam = p.team; UI.get = ['p:' + p.id]; UI.send = []; UI.cash = 0; UI.theirRet = 0; UI.retain = 0; UI.trMsg = null; UI.tm2 = 'forty'; UI.tab = 'trades'; render(); window.scrollTo(0, 0); },
  pickTeam: e => { const n = $('#gmname'); if (n) UI.newName = n.value; UI.pickTeam = e.k; applyTheme(e.k); renderModal(); },
  loadCareer: async e => { const ok = await Store.open(e.k); if (ok) { UI.showNew = false; UI.dummy = false; UI.tab = 'clubhouse'; UI.send = []; UI.get = []; UI.cash = 0; UI.theirRet = 0; UI.modal = null; toast('Welcome back', `${TEAM.city} ${TEAM.name}, ${G.year}.`); } else toast('Could not load that career', 'The save was not found.'); render(); },
  closeNew: () => { UI.showNew = false; applyTheme(ME); render(); },
  pool: e => { const a = UI[e.side]; if (+e.k > 0) a.push('i:' + (G.tick++)); else { const i = a.map(x => x.startsWith('i:')).lastIndexOf(true); if (i >= 0) a.splice(i, 1); } UI.trMsg = null; render(); },
  propose: () => { const r = doTrade(UI.tTeam, UI.send, UI.get, UI.retain, UI.cash || 0, UI.theirRet || 0); if (r && r.refused) { UI.trMsg = `${r.refused.name} said no. They used their ${protTag(r.refused)} to block the deal. Ask again next week.`; render(); return; } if (r) { toast('Deal done!', G.back.sub); UI.send = []; UI.get = []; UI.retain = 0; UI.cash = 0; UI.theirRet = 0; UI.trMsg = null; UI.tab = 'clubhouse'; } render(); },
  offerYes: e => { const x = G.inbox.find(i => i.id === +e.id); if (!x) return; const r = doTrade(x.team, x.send, x.get, 0); G.inbox = G.inbox.filter(i => i.id !== x.id); const ok = r && !r.refused; toast(ok ? 'Deal done!' : 'Deal fell through', ok ? G.back.sub : r && r.refused ? `${r.refused.name} used their ${protTag(r.refused)}.` : 'They changed their mind.'); render(); },
  offerNo: e => { G.inbox = G.inbox.filter(i => i.id !== +e.id); render(); },
  offerEdit: e => { const x = G.inbox.find(i => i.id === +e.id); if (!x) return; UI.tTeam = x.team; UI.send = [...x.send]; UI.get = [...x.get]; G.inbox = G.inbox.filter(i => i.id !== x.id); UI.tab = 'trades'; render(); },
  phone: e => { const say = answerPhone(+e.i); if (say) toast('Done', say); render(); resume(); },
  draft: e => { const p = draftPick(+e.i); toast('Welcome to the system', `${p.name} joins the farm.`); render(); resume(); },
  nextYear: () => { beginOffseason(); UI.send = []; UI.get = []; UI.queue = null; UI.tab = 'clubhouse'; render(); },
  clSwing: () => Clutch.press(), clSkip: () => Clutch.autoPlay(),
  lvl: e => { const p = P(UI.modal.id), n = promote(p, e.k); n.slice(0, 2).forEach(x => toast('Roster move', x)); render(); },
  relAsk: () => { UI.relConfirm = UI.modal.id; renderModal(); }, release: () => { const p = P(UI.modal.id); releasePlayer(p); UI.modal = null; UI.relConfirm = null; toast('Released', `${p.name} is a free agent.`); render(); },
  shop: () => { const k = 'p:' + UI.modal.id; if (!UI.send.includes(k)) UI.send.push(k); UI.modal = null; UI.tab = 'trades'; render(); },
  tradeFor: () => { const p = P(UI.modal.id); if (UI.tTeam !== p.team) { UI.tTeam = p.team; UI.get = []; } const k = 'p:' + p.id; if (!UI.get.includes(k)) UI.get.push(k); UI.modal = null; UI.tab = 'trades'; render(); },
  pickOwner: e => { const n = $('#gmname'); if (n) UI.newName = n.value; UI.newOwner = e.k; renderModal(); },
  start: () => { const n = ($('#gmname')?.value || '').trim() || 'Rookie GM'; newGame({ gm: n, owner: UI.newOwner || 'steady', team: UI.pickTeam || G.me || 'NYM' }); UI.showNew = false; UI.dummy = false; UI.tab = 'clubhouse'; UI.send = []; UI.get = []; UI.cash = 0; UI.theirRet = 0; UI.tTeam = Object.keys(G.teams).find(a => a !== ME); render(); },
  newgame: () => { UI.showNew = true; UI.pickTeam = G.me; G.fired = false; UI.modal = null; UI.queue = null; if (G.pending) { G.pending = null; } render(); }
};
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  if (el.tagName === 'TR' && ev.target.closest('button,select')) return;
  if (ev.target.closest('select')) return;
  const d = el.dataset; if (ACT[d.a]) { ACT[d.a](d); }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'tteam') { UI.tTeam = t.value; UI.get = []; UI.theirRet = 0; UI.trMsg = null; render(); }
  if (t.dataset.c === 'pos') { const i = +t.dataset.i, np = t.value, o = G.lineup.find(s => s.pos === np), cur = G.lineup[i]; if (o) o.pos = cur.pos; cur.pos = np; refreshTeams(); render(); }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'faq') { UI.faq = t.value; const pos = t.selectionStart; render(); const n = $('#faq'); n.focus(); n.setSelectionRange(pos, pos); }
  if (t.id === 'n-y' || t.id === 'n-a') {
    const m = UI.modal, p = P(m.id); if (t.id === 'n-y') { m.yrs = +t.value; $('#o-y').textContent = m.yrs; } else { m.aav = +t.value; $('#o-a').textContent = money(m.aav); }
    const s = offerValue(p, m, ME) / needOf(p), after = payroll() + m.aav * (1 - m.defer); $('#n-v').textContent = s >= 1 ? 'Agent is leaning in' : s >= .95 ? 'In the ballpark' : s >= .85 ? 'Agent is sighing' : 'Agent is laughing'; const ng = $('#n-g'); if (ng) ng.innerHTML = gradeTag(dealGrade(p, m)); const pe = $('#n-p'); pe.textContent = money(after); pe.style.color = after > OWNERS[G.owner].cap ? 'var(--bad)' : 'var(--text)';
  }
});
document.addEventListener('keydown', ev => {
  if (Clutch.active() && (ev.code === 'Space' || ev.code === 'Enter')) { ev.preventDefault(); Clutch.press(); return; }
  if (ev.key === 'Escape' && UI.modal) ACT.close();
});
/* drag to swap lineup slots */
let dragSlot = null;
document.addEventListener('dragstart', ev => { const s = ev.target.closest?.('.slot'); if (!s) return; dragSlot = { k: s.dataset.k, i: +s.dataset.i }; try { ev.dataTransfer.setData('text/plain', 'slot'); ev.dataTransfer.effectAllowed = 'move'; } catch (e) { } });
document.addEventListener('dragover', ev => { const s = ev.target.closest?.('.slot'); if (s && dragSlot) { ev.preventDefault(); document.querySelectorAll('.slot.drop').forEach(x => x.classList.remove('drop')); s.classList.add('drop'); } });
document.addEventListener('drop', ev => { const s = ev.target.closest?.('.slot'); if (s && dragSlot) { ev.preventDefault(); swapSlots(dragSlot, { k: s.dataset.k, i: +s.dataset.i }); dragSlot = null; UI.sel = null; render(); } });
document.addEventListener('dragend', () => { dragSlot = null; document.querySelectorAll('.slot.drop').forEach(x => x.classList.remove('drop')); });
/* tooltips */
document.addEventListener('mousemove', ev => {
  const tip = $('#tip'); let txt = null;
  const svg = ev.target.closest?.('#pace');
  if (svg && UI.chart) { const r = svg.getBoundingClientRect(), c = UI.chart, x = (ev.clientX - r.left) / r.width * c.W, i = clamp(Math.round((x - c.L) / (c.W - c.L - c.R) * 162) - 1, 0, c.pts.length - 1), g = G.log[i]; if (g) txt = `Game ${i + 1}: ${g.u > g.t ? 'W' : 'L'} ${g.u}-${g.t} ${g.h ? 'vs' : '@'} ${g.o} (${c.pts[i] > 0 ? '+' : ''}${c.pts[i]})`; }
  else { const d = ev.target.closest?.('[data-tip]'); if (d) txt = d.dataset.tip; }
  if (txt) { tip.hidden = false; tip.textContent = txt; tip.style.left = Math.min(innerWidth - 250, ev.clientX + 12) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; } else tip.hidden = true;
});

/* ---------- boot ---------- */
function start(hotData) {
  const s = hotData?.save || Store.local();
  const fresh = () => { newGame({ team: 'NYM' }); UI.showNew = true; UI.dummy = true; };
  if (s) { try { restore(s); if (!G.teams || !G.players || (G.v || 1) < 3) throw 0; } catch (e) { fresh(); } } else fresh();
  render(); Store.cloud();
}
window.claude?.hot?.snapshot?.(() => ({ save: G ? serialize() : null }));
if (window.FO_HOST) FO_HOST.ready(start); else if (window.claude?.hot?.ready) window.claude.hot.ready(start); else start(window.claude?.hot?.data ?? {});
