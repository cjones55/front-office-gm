/* Game day: the live game screen, manager moves, clutch-moment prompt, and box scores. Loads after ui.js. */
const GD = { mini: null, watch: false, timer: 0, pick: null, speed: 2, note: '', lastHr: -1 };
const SPEEDS = { 1: ['Slow', 1500], 2: ['Normal', 800], 3: ['Fast', 300] };
const renderModalBase = renderModal;
renderModal = function () {
  const el = $('#modal');
  if (G.fired || UI.showNew) { const p = G.pending; G.pending = null; renderModalBase(); G.pending = p; return; }
  if (G.live) { try { gdRender(); } catch (e) { console.error(e); el.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="dlg"><div class="who-tag">Game day</div><h2>The game feed hit a snag</h2><p>Sim the rest of this game and keep going.</p><button class="btn go" data-a="gdRescue">Sim the rest</button></div></div>`; } return; }
  if (G.pending && G.pending.clutch) { el.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${clutchDlg(G.pending)}</div>`; return; }
  if (UI.modal && UI.modal.t === 'recap') { if (G.lastLive) { el.innerHTML = `<div class="modal gdm" role="dialog" aria-modal="true" aria-label="Last game"><div class="gd">${recapHTML(G.lastLive)}<div class="gd-ctrl"><button class="btn go" data-a="close">Close</button></div></div></div>`; return; } UI.modal = null; }
  renderModalBase();
};
const ipStr = o => `${Math.floor(o / 3)}.${o % 3}`;

/* ---------- pieces ---------- */
function lsTable(x) {
  const away = x.home ? 'them' : 'us', home = x.home ? 'us' : 'them', n = Math.max(9, x.inn), ab = s => s === 'us' ? ME : x.opp;
  const cell = (s, i) => { const v = x.ls[s][i]; if (v != null) return v; if (x.over && s === home && i === n - 1 && x.score[home] > x.score[away]) return 'X'; return ''; };
  const row = s => `<tr class="${s === 'us' ? 'me' : ''}"><td class="l">${ab(s)}</td>${Array.from({ length: n }, (_, i) => `<td class="${x.cur === i && x.curS === s ? 'cur' : ''}">${cell(s, i)}</td>`).join('')}<td class="rt">${x.score[s]}</td><td>${x.hits[s]}</td><td>${x.err[s]}</td></tr>`;
  return `<div class="table"><table class="ls"><tr><th class="l"></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th class="rt">R</th><th>H</th><th>E</th></tr>${row(away)}${row(home)}</table></div>`;
}
function headHTML(L) {
  const wp = Math.round(wpUs(L) * 100), s = G.po ? metsSeries() : null, big = keyMoment(L);
  const tag = L.po ? `${['Wild Card', 'Division Series', MY_LG + 'CS', 'World Series'][G.po ? G.po.round : 0]}${s ? ` · Game ${s.wa + s.wb + 1}` : ''}` : `Game ${G.day + 1}`;
  const where = L.home ? TEAM.park : `at ${G.teams[L.opp].city}`;
  return `<div class="gd-top"><div><div class="who-tag">${tag} · ${esc(where)}${L.fromClutch ? ' · Clutch moment' : ''}</div>
    <div class="gd-score"><b>${tm(ME)} ${TEAM.name} ${L.score.us}</b><span>${tm(L.opp)} ${esc(G.teams[L.opp].name)} ${L.score.them}</span>${L.over ? `<em>Final${L.inn > 9 ? `/${L.inn}` : ''}</em>` : `<em>${L.top ? '▲' : '▼'} ${innOrd(L.inn)} · ${L.outs} out${L.outs === 1 ? '' : 's'}</em>`}${big ? '<em class="big">Big spot</em>' : ''}</div></div>
    <div class="wpb" data-tip="Chance the ${TEAM.name} win from here, based on the score, inning, outs, runners and the two teams' strength."><small>Win chance</small><div class="bar"><i style="width:${wp}%"></i></div><b>${wp}%</b></div></div>
    ${lsTable({ ls: L.ls, hits: L.hits, err: L.err, home: L.home, opp: L.opp, inn: L.inn, over: L.over, score: L.score, cur: L.over ? -1 : L.inn - 1, curS: batSide(L) })}`;
}
function diamond(L) {
  const b = L.bases, pos = [[150, 75], [100, 28], [50, 75]], nm = r => esc(lastName(P(r.id).name));
  return `<svg class="diamond" viewBox="0 0 200 150" role="img" aria-label="Runners: ${['first', 'second', 'third'].filter((_, i) => b[i]).join(', ') || 'none'}. ${L.outs} out.">
    <path d="M100 128 L150 78 L100 30 L50 78 Z" fill="none" stroke="#ffffff40" stroke-width="2"/>
    ${pos.map(([x, y], i) => `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" transform="rotate(45 ${x} ${y})" fill="${b[i] ? 'var(--orange)' : '#ffffff22'}" stroke="#fff8" stroke-width="1"/>${b[i] ? `<text x="${x}" y="${i === 1 ? y - 16 : y + 26}" text-anchor="middle" font-size="12" font-weight="700" font-family="var(--cond)" fill="var(--text)">${nm(b[i])}</text>` : ''}`).join('')}
    <path d="M92 124 h16 v6 l-8 8 l-8 -8 z" fill="#fff"/>
    ${[0, 1, 2].map(i => `<circle cx="${14 + i * 16}" cy="140" r="5.5" fill="${i < L.outs ? 'var(--bad)' : '#ffffff26'}"/>`).join('')}<text x="62" y="144" font-size="11" fill="var(--muted)" font-family="var(--cond)">OUTS</text></svg>`;
}
function todayLine(L, id) { const l = L.bl[id]; if (!l || !l.pa) return 'First trip up today'; const x = []; if (l.hr) x.push(l.hr > 1 ? `${l.hr} HR` : 'HR'); if (l.d + l.t) x.push(`${l.d + l.t} XBH`); if (l.rbi) x.push(`${l.rbi} RBI`); if (l.bb) x.push(`${l.bb} BB`); if (l.k) x.push(`${l.k} K`); return `Today ${l.h}-for-${l.ab}${x.length ? ', ' + x.join(', ') : ''}`; }
function seasonLine(p) { const s = p.s; if (p.team === ME && s && s.AB >= 10) return `${avg(s)}, ${s.HR} HR, ${ops(s)} OPS`; return `Con ${p.con} · Pow ${p.pow} · Eye ${p.eye} · Spd ${p.spd}`; }
function bodyHTML(L) {
  const b = curB(L), p = curP(L), ps = L.pst[p.id], fat = clamp(ps.pc / (pLimit(p, ps) + 25), 0, 1), d = onDeck(L), bs = batSide(L);
  const edge = plat(b, p), pl = edge > 0 ? 'Platoon edge to the hitter' : edge < 0 ? 'Same-side matchup favors the pitcher' : '';
  const groups = []; L.log.forEach(x => { if (x.k === 'inn' || !groups.length) groups.push({ h: x.k === 'inn' ? x.s : '', items: [] }); if (x.k !== 'inn') groups[groups.length - 1].items.push(x); });
  const feed = groups.slice(-5).reverse().map(g => (g.h ? `<div class="pi">${esc(g.h)}</div>` : '') + g.items.slice().reverse().map(x => `<div class="p-${x.k}">${esc(x.s)}</div>`).join('')).join('');
  return `<div class="gd-grid"><section class="panel gd-field">${diamond(L)}<div class="gd-match">
      <div class="mu"><small>At bat · ${tm(bs === 'us' ? ME : L.opp)}</small><b>${esc(b.name)} <span class="tag hd h${b.b}">${b.b === 'S' ? 'Switch' : 'Bats ' + b.b}</span></b><span>${todayLine(L, b.id)}</span><span>${seasonLine(b)}</span>${pl ? `<span class="note">${pl}</span>` : ''}</div>
      <div class="mu"><small>Pitching · ${tm(bs === 'us' ? L.opp : ME)}</small><b>${esc(p.name)} <span class="tag hd h${p.t}">${p.t}HP</span>${ps.tired ? '<span class="tag warn">Tired arm</span>' : ''}</b><span>${ps.pc} pitches · ${ipStr(ps.o)} IP, ${ps.h} H, ${ps.er} ER, ${ps.k} K</span><div class="bar" data-tip="Fatigue. Stuff and control fade once he passes his usual pitch count."><i style="width:${fat * 100}%;background:${fat > .78 ? 'var(--bad)' : fat > .6 ? 'var(--warn)' : 'var(--good)'}"></i></div></div>
      <div class="mu sm"><small>On deck</small><span>${esc(d.name)}</span></div></div></section>
    <section class="panel gd-pbp"><div class="lbl">Play-by-play <span>${GD.note ? esc(GD.note) : 'Newest first'}</span></div><div class="pbp" aria-live="polite">${feed}</div></section></div>${promptHTML(L)}${pickHTML(L)}`;
}
function promptHTML(L) {
  const q = L.prompt; if (!q) return '';
  if (q.t === 'pit') { const r = P(q.id), cur = curP(L); return `<div class="gd-prompt"><div><b>Bench coach:</b> ${esc(q.why)}. Bring in ${esc(r.name)} (${r.t}HP, stuff ${r.stf}, control ${r.ctl}${isTired(r) ? ', tired' : ''})?</div><div class="row2"><button class="btn go" data-a="gdYes">Bring him in</button><button class="btn" data-a="gdOther">Someone else</button><button class="btn" data-a="gdNo">Stay with ${esc(lastName(cur.name))}</button></div></div>`; }
  const ph = P(q.id), cur = curB(L);
  return `<div class="gd-prompt"><div><b>Bench coach:</b> ${esc(q.why)} Send him up?</div><div class="row2"><button class="btn go" data-a="gdYes">Pinch-hit ${esc(lastName(ph.name))}</button><button class="btn" data-a="gdOther">Someone else</button><button class="btn" data-a="gdNo">Let ${esc(lastName(cur.name))} hit</button></div></div>`;
}
function pickHTML(L) {
  if (!GD.pick) return ''; const T = L.T.us, p = curP(L), close = '<button class="btn sm" data-a="gdPick" data-k="">Close</button>';
  if (GD.pick === 'ph') {
    const list = T.bench.map(P).filter(x => x && !x.inj).sort((a, b) => batVal(b, p) - batVal(a, p));
    return `<div class="gd-pick"><div class="lbl">Pinch-hit for ${esc(curB(L).name)} <span>vs ${esc(p.name)}, ${p.t}HP</span></div>${list.length ? list.map(x => `<button class="asset" data-a="gdPH" data-id="${x.id}"><span><b>${esc(x.name)}</b> <small>${x.pos} · bats ${x.b} · Con ${x.con} · Pow ${x.pow} · Eye ${x.eye}</small></span><em class="rt ${plat(x, p) > 0 ? '' : 'no'}">${plat(x, p) > 0 ? 'Platoon edge' : 'Same side'}</em></button>`).join('') : '<p class="note">Nobody left on the bench.</p>'}${close}</div>`;
  }
  if (GD.pick === 'pr') {
    const i = [2, 1, 0].find(k => L.bases[k] && L.T.us.order.some(s => s.id === L.bases[k].id)), r = i != null ? P(L.bases[i].id) : null;
    const list = T.bench.map(P).filter(x => x && !x.inj).sort((a, b) => b.spd - a.spd);
    return `<div class="gd-pick"><div class="lbl">Pinch-run ${r ? `for ${esc(r.name)} (speed ${r.spd})` : ''}</div>${r && list.length ? list.map(x => `<button class="asset" data-a="gdPR" data-id="${x.id}" data-k="${i}"><span><b>${esc(x.name)}</b> <small>${x.pos} · Speed ${x.spd}</small></span><em class="rt">${x.spd > r.spd ? '+' + (x.spd - r.spd) : x.spd - r.spd}</em></button>`).join('') : '<p class="note">No runner to replace, or nobody on the bench.</p>'}${close}</div>`;
  }
  const ok = canPull(L, 'us'), cur = curP(L), list = T.pen.filter(id => !T.used.includes(id)).map(P).filter(x => x && !x.inj);
  const role = id => { const i = T.pen.indexOf(id); return i === 0 ? 'Closer' : i <= 2 ? 'Setup' : (P(id).stm || 0) >= 40 ? 'Long relief' : 'Middle relief'; };
  return `<div class="gd-pick"><div class="lbl">Go to the bullpen <span>${esc(cur.name)}: ${L.pst[cur.id].pc} pitches</span></div>${ok ? '' : `<p class="note">${esc(lastName(cur.name))} has to face three batters or finish the inning first. That's the three-batter minimum.</p>`}
    ${list.length ? list.map(x => `<button class="asset" data-a="gdPC" data-id="${x.id}" ${ok ? '' : 'disabled'}><span><b>${esc(x.name)}</b> <small>${role(x.id)} · ${x.t}HP · Stuff ${x.stf} · Control ${x.ctl}</small></span><em class="rt ${isTired(x) ? 'no' : ''}">${isTired(x) ? 'Tired' : 'Fresh'}</em></button>`).join('') : '<p class="note">The bullpen is empty.</p>'}${close}</div>`;
}
function ctrlHTML(L) {
  const bat = batSide(L) === 'us', T = L.T.us, wait = !!L.prompt, dis = wait ? 'disabled' : '';
  const s0 = canSteal(L, 0) && bat, s1 = canSteal(L, 1) && bat, onB = L.bases.some(Boolean);
  const mgr = bat ? `<button class="btn go" data-a="gdBat" ${dis}>Bat yourself</button><button class="btn" data-a="gdPick" data-k="ph" ${dis}>Pinch hit${T.bench.length ? ` (${T.bench.length})` : ''}</button>${onB ? `<button class="btn" data-a="gdPick" data-k="pr" ${dis}>Pinch run</button>` : ''}${s0 ? `<button class="btn" data-a="gdSteal" data-k="0" ${dis}>Steal 2nd · ${Math.round(stealOdds(L, 0) * 100)}%</button>` : ''}${s1 ? `<button class="btn" data-a="gdSteal" data-k="1" ${dis}>Steal 3rd · ${Math.round(stealOdds(L, 1) * 100)}%</button>` : ''}${onB && L.outs < 2 ? `<button class="btn" data-a="gdBunt" ${dis}>Bunt</button>` : ''}`
    : `<button class="btn go" data-a="gdPit" ${dis}>Pitch yourself</button><button class="btn" data-a="gdPick" data-k="pit" ${dis}>Pitching change</button><button class="btn" data-a="gdIBB" ${dis}>Intentional walk</button>`;
  return `<div class="gd-row"><button class="btn ${GD.watch ? '' : 'go'}" data-a="gdNext" ${dis}>Next batter</button><button class="btn" data-a="gdWatch" ${dis}>${GD.watch ? 'Pause' : 'Watch'}</button><button class="btn" data-a="gdHalf">Sim inning</button><button class="btn" data-a="gdEnd">Sim to end</button><span class="chips">${Object.entries(SPEEDS).map(([k, [n]]) => `<button class="chip ${GD.speed === +k ? 'on' : ''}" data-a="gdSpeed" data-k="${k}">${n}</button>`).join('')}</span></div>
    <div class="gd-row"><span class="who-tag">${bat ? 'You are batting' : 'You are in the field'}</span>${mgr}</div>`;
}
function wpChart(wp, tips) {
  const W = 520, H = 150, L = 34, R = 8, T = 10, B = 20, n = Math.max(2, wp.length), X = i => L + i / (n - 1) * (W - L - R), Y = v => T + (1 - v / 100) * (H - T - B);
  const pts = wp.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), bw = (W - L - R) / (n - 1);
  const hits = wp.map((v, i) => `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}" fill="transparent" data-tip="${esc(`${Math.round(v)}% · ${(tips && tips[i]) || ''}`)}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${TEAM.name} win probability through the game, ending at ${Math.round(wp[wp.length - 1])}%">
    ${[0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 50 ? '#ffffff55' : '#ffffff1a'}" ${v === 50 ? 'stroke-dasharray="4 4"' : ''}/><text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--cond)">${v}%</text>`).join('')}
    <polyline points="${pts}" fill="none" stroke="var(--orange2)" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${X(wp.length - 1)}" cy="${Y(wp[wp.length - 1])}" r="4" fill="var(--orange2)"/>
    <text x="${L}" y="${H - 4}" font-size="11" fill="var(--muted)" font-family="var(--cond)">First pitch</text><text x="${W - R}" y="${H - 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--cond)">Final</text>${hits}</svg>`;
}
function boxHTML(b) {
  return `<div class="gd-grid"><section class="panel"><div class="lbl">${TEAM.name} batting</div><div class="table"><table><tr><th class="l">Batter</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>K</th><th>HR</th></tr>${b.bat.map(r => `<tr><td class="l">${esc(r[0])} <small class="note">${esc(r[1])}</small></td>${r.slice(2).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</table></div></section>
    <section class="panel"><div class="lbl">${TEAM.name} pitching</div><div class="table"><table><tr><th class="l">Pitcher</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th><th>PC</th></tr>${b.pit.map(r => `<tr><td class="l">${esc(r[0])}${r[8] ? ` <span class="tag ${r[8] === 'L' ? 'bad' : 'good'}">${r[8]}</span>` : ''}</td>${r.slice(1, 8).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</table></div></section></div>`;
}
function recapHTML(s, noLs) {
  const won = s.us > s.them, o = G.teams[s.opp];
  return `<div class="gd-final"><div class="who-tag">${esc(s.d)} · ${s.home ? esc(TEAM.park) : 'at ' + esc(o.city)}${s.clutch ? ' · Clutch moment' : ''}${s.po ? ' · Postseason' : ''}</div>
    <h2 class="${won ? 'ok' : 'no'}">${won ? (s.walkoff ? 'Walk-off win' : 'Win') : 'Loss'}: ${TEAM.name} ${s.us}, ${esc(o.name)} ${s.them}${s.inn > 9 ? ` in ${s.inn}` : ''}</h2>
    ${noLs ? '' : lsTable({ ls: s.ls, hits: s.hits, err: s.err, home: s.home, opp: s.opp, inn: s.inn, over: true, score: { us: s.us, them: s.them }, cur: -1 })}
    <p class="note">W: ${esc(s.dec.w || '-')} · L: ${esc(s.dec.l || '-')}${s.dec.sv ? ' · SV: ' + esc(s.dec.sv) : ''}${s.user && (s.user.bat || s.user.pit) ? ` · You batted ${s.user.bat} time${s.user.bat === 1 ? '' : 's'} and pitched to ${s.user.pit} hitter${s.user.pit === 1 ? '' : 's'}` : ''}</p>
    <div class="gd-grid"><section class="panel"><div class="lbl">Win probability <span>${TEAM.name}</span></div>${s.wp && s.wp.length > 1 ? wpChart(s.wp, s.wpT) : '<p class="note">Not tracked for this game.</p>'}</section>
    <section class="panel"><div class="lbl">Stars</div>${s.stars.concat(s.arm).map(x => `<div class="stat"><span>${esc(x)}</span></div>`).join('') || '<p class="note">Quiet day at the plate.</p>'}<div class="lbl" style="margin-top:8px">Scoring plays</div>${s.big.map(x => `<div class="note">${esc(x)}</div>`).join('') || '<p class="note">None.</p>'}</section></div>
    ${s.box ? boxHTML(s.box) : ''}</div>`;
}
function clutchDlg(g) {
  const c = g.clutch, o = G.teams[g.opp], half = c.kind === 'save' ? (g.home ? 'Top' : 'Bottom') : (g.home ? 'Bottom' : 'Top');
  let body;
  if (c.kind === 'save') { const cl = healthyPen().find(p => !isTired(p)) || healthyPen()[0]; body = `The ${TEAM.name} lead ${g.us}-${g.them} going to the ${half.toLowerCase()} of the 9th. ${cl ? esc(cl.name) + ' is warm.' : ''} Take the ball and close it out yourself, or let the bullpen handle it.`; }
  else { const b = P(c.order[0]), cl = aiStaff(g.opp).pen[0], on = c.bases.filter(Boolean).length; body = `The ${TEAM.name} trail ${g.them}-${g.us} with ${on === 3 ? 'the bases loaded' : on === 2 ? 'two on' : 'a man on'} and ${c.outs} out${c.outs === 1 ? '' : 's'}. ${b ? esc(b.name) + ' is due up' : ''}${cl ? ` against ${esc(cl.name)}` : ''}.`; }
  return `<div class="dlg"><div class="who-tag">${g.po ? 'October' : 'Clutch moment'} · ${half} of the 9th vs ${esc(o.name)}</div><h2>${c.kind === 'save' ? 'Close it out?' : 'Rally time'}</h2><p>${body}</p>
    <div class="row2"><button class="btn go" data-a="clTake">Take over</button><button class="btn" data-a="clSim">Sim it</button></div>
    <button class="btn sm" data-a="clutchToggle">Stop pausing sims for clutch moments</button></div>`;
}

/* ---------- render and drive ---------- */
function gdRender() {
  const L = G.live, el = $('#modal');
  if (!el.querySelector('.gd-live')) el.innerHTML = `<div class="modal gdm" role="dialog" aria-modal="true" aria-label="Live game"><div class="gd gd-live"><div id="gd-head" class="gd-head"></div><div id="gd-body"></div><div id="gd-ctrl" class="gd-ctrl"></div></div></div>`;
  $('#gd-head').innerHTML = headHTML(L);
  const last = L.log.length - 1; if (L.log.slice(-3).some(x => x.k === 'hr') && last !== GD.lastHr) { GD.lastHr = last; const h = $('#gd-head'); h.classList.remove('flash'); void h.offsetWidth; h.classList.add('flash'); }
  if (L.over) { $('#gd-body').innerHTML = recapHTML(liveSummary(L), true); $('#gd-ctrl').innerHTML = `<div class="gd-row"><button class="btn go" data-a="gdDone">${G.phase === 'season' ? 'Back to the clubhouse' : 'Continue'}</button></div>`; return; }
  if (GD.mini) { $('#gd-ctrl').innerHTML = `<div class="gd-row"><span class="note">${GD.mini === 'bat' ? 'You are at the plate.' : 'You are on the mound.'} The rest of the game is waiting.</span></div>`; return; }
  $('#gd-body').innerHTML = bodyHTML(L); $('#gd-ctrl').innerHTML = ctrlHTML(L);
}
function stopWatch() { GD.watch = false; clearTimeout(GD.timer); }
function gdStep(mode) {
  const L = G.live; if (!L || L.over || GD.mini) return;
  GD.note = ''; if (mode !== 'pa') { L.prompt = null; GD.pick = null; stopWatch(); }
  const r = liveRun(L, mode); if (r === 'prompt') stopWatch();
  render();
}
function gdTick() {
  clearTimeout(GD.timer); const L = G.live;
  if (!GD.watch || !L || L.over || GD.mini) { GD.watch = false; if (L) render(); return; }
  if (L.prompt) { stopWatch(); render(); return; }
  const key = `key-${L.inn}-${L.top ? 1 : 0}-${L.outs}-${L.T[batSide(L)].idx}`;
  if (keyMoment(L) && !L.asked[key] && (batSide(L) === 'us' || L.inn >= 8)) { L.asked[key] = true; stopWatch(); GD.note = 'Big spot. Your call.'; render(); return; }
  const r = liveRun(L, 'pa'); if (r === 'prompt' || L.over) stopWatch();
  render(); if (GD.watch) GD.timer = setTimeout(gdTick, SPEEDS[GD.speed][1]);
}
function startMini(kind) {
  const L = G.live; if (!L || L.over || GD.mini || L.prompt) return;
  if ((kind === 'bat') !== (batSide(L) === 'us')) return;
  stopWatch(); GD.pick = null; GD.note = '';
  const r = preAB(L, false); if (r) { render(); return; }
  GD.mini = kind; render();
  const p = curP(L), ps = L.pst[p.id], o = { b: curB(L), p, pc: ps.pc, fat: fatigue(p, ps), tired: ps.tired, bases: L.bases.map(Boolean), outs: L.outs, fenway: (L.home ? ME : L.opp) === 'BOS', label: `${halfName(L)} · ${scoreLine(L)}` };
  (kind === 'bat' ? AtBat : Mound).mount($('#gd-body'), o, res => {
    GD.mini = null; const L2 = G.live; if (!L2) { render(); return; }
    if (res.sim) { const s = simPA(L2); s.pc = Math.max(res.pc + 1, pcFor(s.ev)); res = s; } else L2.user[kind]++;
    const lead0 = lead4(L2, 'us'), inn0 = L2.inn;
    livePA(L2, false, res);
    if (kind === 'pit' && !res.sim && L2.over && L2.score.us > L2.score.them && inn0 >= 9 && lead0 >= 1 && lead0 <= 3) L2.userSave = true;
    render();
  });
}
function prePlay(fn) { const L = G.live; if (!L || L.over || GD.mini || L.prompt) return; stopWatch(); GD.pick = null; const r = preAB(L, false); if (!r) fn(L); render(); }
Object.assign(ACT, {
  liveGo: () => { if (G.live) { render(); return; } UI.queue = null; const L = G.phase === 'season' ? liveStartDay() : G.phase === 'playoffs' ? liveStartPO() : null; if (!L) { render(); return; } GD.mini = null; GD.pick = null; GD.note = ''; GD.lastHr = -1; stopWatch(); render(); },
  gdNext: () => gdStep('pa'), gdHalf: () => gdStep('half'), gdEnd: () => gdStep('end'),
  gdWatch: () => { if (GD.watch) { stopWatch(); render(); return; } GD.watch = true; GD.note = ''; gdTick(); },
  gdSpeed: e => { GD.speed = +e.k; render(); },
  gdBat: () => startMini('bat'), gdPit: () => startMini('pit'),
  gdPick: e => { GD.pick = !e.k || GD.pick === e.k ? null : e.k; stopWatch(); render(); },
  gdPH: e => { if (doPinchHit(G.live, +e.id)) GD.pick = null; render(); },
  gdPR: e => { if (doPinchRun(G.live, +e.k, +e.id)) GD.pick = null; render(); },
  gdPC: e => { const L = G.live; if (L && canPull(L, 'us') && doPitchChange(L, +e.id)) { GD.pick = null; L.prompt = null; } render(); },
  gdSteal: e => { const L = G.live; if (!L || L.prompt) return; stopWatch(); doSteal(L, +e.k); render(); },
  gdBunt: () => prePlay(L => livePA(L, false, { ev: 'SH' })),
  gdIBB: () => prePlay(L => livePA(L, false, { ev: 'IBB' })),
  gdYes: () => { const L = G.live, q = L && L.prompt; if (!q) return; L.asked[q.key] = true; if (q.t === 'pit') doPitchChange(L, q.id); else doPinchHit(L, q.id); L.prompt = null; render(); },
  gdNo: () => { const L = G.live, q = L && L.prompt; if (!q) return; L.asked[q.key] = true; L.prompt = null; render(); },
  gdOther: () => { const L = G.live, q = L && L.prompt; if (!q) return; L.asked[q.key] = true; L.prompt = null; GD.pick = q.t === 'pit' ? 'pit' : 'ph'; render(); },
  gdDone: () => { stopWatch(); const L = G.live; if (!L || !L.over) return; const s = liveFinish(); if (s) toast(s.us > s.them ? (s.walkoff ? 'Walk-off!' : 'Win!') : 'Tough loss', `${TEAM.name} ${s.us}, ${G.teams[s.opp].name} ${s.them}`); render(); resume(); },
  gdRescue: () => { const L = G.live; stopWatch(); GD.mini = null; try { liveRun(L, 'end'); liveFinish(); } catch (e) { G.live = null; if (G.phase === 'season' || G.phase === 'playoffs') { const g = playMetsGame(L.opp, L.home, L.po); delete g.clutch; finishMetsGame(g); if (G.phase === 'season') endDay(); } } render(); resume(); },
  gdRecap: () => { UI.modal = { t: 'recap' }; renderModal(); },
  clTake: () => { const g = G.pending; if (!g) return; G.pending = null; G.live = liveFromClutch(g); GD.mini = null; GD.pick = null; GD.note = ''; render(); },
  clSim: () => { const g = G.pending; if (!g) return; G.pending = null; const L = G.live = liveFromClutch(g); liveRun(L, 'end'); const s = liveFinish(); if (s) toast(s.us > s.them ? 'Clutch moment: win!' : 'Clutch moment: loss', `${TEAM.name} ${s.us}, ${G.teams[s.opp].name} ${s.them}. ${s.big.length ? s.big[s.big.length - 1].replace(/^[TB]\d+: /, '') : ''}`); render(); resume(); },
  clutchToggle: () => { G.clutchOn = !G.clutchOn; toast(`Clutch moments ${G.clutchOn ? 'on' : 'off'}`, G.clutchOn ? 'Sims will pause for close games in the 9th.' : 'Sims will play straight through.'); if (G.pending && !G.clutchOn) { ACT.clSim(); return; } render(); },
  mgGo: () => Clutch.press(), mgSim: () => { if (AtBat.active()) AtBat.sim(); else Mound.sim(); }, mgSit: e => AtBat.sit(e.k), mgPow: () => AtBat.power(), mpSel: e => Mound.sel(e.k),
  mgDiff: e => { miniPref({ diff: e.k }); AtBat.refresh(); Mound.refresh(); }, mgSound: () => { miniPref({ sound: !miniPref().sound }); AtBat.refresh(); Mound.refresh(); }
});
const newgameBase = ACT.newgame; ACT.newgame = e => { stopWatch(); GD.mini = null; if (G) G.live = null; newgameBase(e); };
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.gd button, .mg button'); if (b) setTimeout(() => { if (document.activeElement === b) b.blur(); }, 0); }, true);
document.addEventListener('keydown', ev => {
  if (ev.defaultPrevented || !G || !G.live) return;
  if (ev.target.closest && ev.target.closest('input,textarea,select')) return;
  if (GD.mini) { if (Mound.active() && /^Digit[1-5]$/.test(ev.code)) Mound.sel(+ev.code.slice(5) - 1); if (AtBat.active() && ev.code === 'KeyP') AtBat.power(); if (AtBat.active() && /^Digit[1-4]$/.test(ev.code)) AtBat.sit(['any', 'FB', 'BR', 'OS'][+ev.code.slice(5) - 1]); return; }
  if ((ev.code === 'Space' || ev.code === 'Enter') && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) { ev.preventDefault(); if (G.live.over) ACT.gdDone(); else if (!G.live.prompt) ACT.gdNext(); }
});
