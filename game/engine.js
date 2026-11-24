/* Game engine: league state, season sim, contracts, trades, playoffs. No DOM in this file. */
const CBT_LINE = 244, LG_RPG = 4.4, RPW = 0.0617, DEADLINE = 112, JUNE15 = 72, DRAFT_DAY = 97, PATRIOTS_DAY = 22, ASG_DAY = 94;
const OWNERS = {
  hedge: { name: 'The Hedge Fund Guy', cap: 310, patience: 1.3, cash: 40, blurb: 'Deep pockets. Forgives almost anything for a ring.' },
  steady: { name: 'The Family Trust', cap: 270, patience: 1, cash: 25, blurb: 'Will spend, but expects a plan and a winning record.' },
  nephew: { name: 'The Nephew Who Inherited It', cap: 225, patience: 0.7, cash: 10, blurb: 'Hard mode. A $225M budget, and you are already over it.' }
};
const POS_H = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const AFF_ORDER = ['AAA', 'AA', 'A+', 'A', 'FCL', 'DSL'], AI_FARM = 34, CASH_MAX = 30;
let G = null;

/* ---------- helpers ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const poisson = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
const money = x => '$' + (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10) + 'M';
const lastName = n => { const b = n.replace(/ (Jr\.|II|III)$/, '').split(' '); return b[b.length - 1]; };
const isPit = p => p.pos === 'SP' || p.pos === 'RP';
const affOf = p => p.level === 'MLB' ? null : p.level === 'AAA' ? 'AAA' : AFF[p.aff] ? p.aff : 'A';
const levelTag = p => p.level === 'MLB' ? (p.team === 'FA' ? 'FA' : p.team) : affsOf(p.team)[affOf(p)].s;
const affLabel = p => p.level === 'MLB' ? 'majors' : (affsOf(p.team)[affOf(p)] || {}).n || 'the farm';
const P = id => G.players[id];
const roster = (t = ME) => Object.values(G.players).filter(p => p.team === t);
const blankS = () => ({ G: 0, AB: 0, H: 0, D: 0, HR: 0, R: 0, RBI: 0, BB: 0, K: 0, SB: 0, GS: 0, O: 0, ER: 0, PK: 0, PBB: 0, PH: 0, W: 0, L: 0, SV: 0 });

function addP(o) {
  const id = G.nid++;
  const p = Object.assign({ id, alts: [], inj: null, level: 'MLB', ctype: 'g', pot: o.ovr }, o);
  G.players[id] = p; return p;
}
function genRatings(pos, ovr) {
  const j = s => clamp(Math.round(ovr + gauss() * s), 20, 80);
  if (pos === 'SP' || pos === 'RP') return { stf: j(6), ctl: j(6), stm: pos === 'SP' ? j(5) : ri(20, 28) };
  return { con: j(7), pow: j(8), eye: j(7), spd: j(9), fld: j(8) };
}
function marketAAV(ovr) { const x = Math.max(ovr - 42, 0); return Math.max(0.8, 0.8 + x * x * 0.055); }
function genAsk(p) {
  let yrs = p.age <= 28 ? ri(4, 7) : p.age <= 31 ? ri(3, 5) : p.age <= 34 ? ri(1, 3) : 1;
  if (p.ovr < 50) yrs = Math.min(yrs, 2);
  return { yrs, aav: Math.round(marketAAV(p.ovr) * rnd(0.9, 1.08) * 10) / 10 };
}

/* ---------- new game ---------- */
function newGame({ gm = 'Rookie GM', owner = 'steady', team = ME || 'BOS' } = {}) {
  setTeam(team);
  const O = OWNERS[owner];
  G = { v: 3, me: ME, gm, owner, year: 2027, phase: 'offseason', week: 1, weeks: 12, day: 0, players: {}, nid: 1, teams: {}, lineup: [], rotation: [], bullpen: [],
    fans: 38, trust: 60, curse: 25, cash: O.cash, buff: 0, buffG: 0, dev: 0, news: [], radio: [], inbox: [], clutchOn: true, clutchCD: 6, clutchWins: 0, trophies: {}, history: [],
    dead: [], rivalW: 0, r5Done: 0,
    picks: [], log: [], po: null, pending: null, phone: null, draft: null, review: null, fired: false, used: [], titles: 0, back: null, drafted: [], tick: 0 };
  TEAM_ROWS.forEach(([abbr, city, name, lg, div, w26, l26]) => { G.teams[abbr] = { abbr, city, name, lg, div, w26, l26, w: 0, l: 0, rs: 0, ra: 0, st: 0, wv: (w26 - 81) * 0.62, form: 0 }; });
  Object.keys(ORGS).forEach(abbr => {
    const mine = abbr === ME; let rows = ORGS[abbr].map((r, i) => Object.assign(unpackRow(r), { src: abbr + ':' + i }));
    if (!mine) { const farm = rows.filter(o => o.lv === 'FARM').sort((a, b) => (a.pr || 99) - (b.pr || 99) || b.pot - a.pot).slice(0, AI_FARM); rows = rows.filter(o => o.lv !== 'FARM').concat(farm); }
    rows.forEach(o => {
      const isP = o.pos === 'SP' || o.pos === 'RP', r = o.r || [], lv = o.lv || 'FARM';
      const rat = r.length >= (isP ? 3 : 5) ? (isP ? { stf: r[0], ctl: r[1], stm: r[2] } : { con: r[0], pow: r[1], eye: r[2], spd: r[3], fld: r[4] }) : genRatings(o.pos, o.ovr);
      addP(Object.assign({ name: o.n, pos: o.pos, alts: o.alts || [], age: o.age, b: o.b, t: o.t, ovr: o.ovr, pot: o.pot, sal: o.sal ?? 0.8, yrs: o.yrs ?? clamp(27 - o.age, 1, 6), ctype: o.ct || 'pre', l26: o.l26 || (o.lines || [])[0], lines: o.lines, level: mine || lv === 'FARM' ? lv : 'MLB', aff: o.aff, team: abbr, s: mine ? blankS() : undefined, from: o.from_, draft: o.draft, acq: o.acq, note: o.note, r5: o.r5, src: o.src }, o.pr ? { pr: o.pr, fv: o.fv, eta: o.eta } : {}, rat));
    });
  });
  FA_ROWS.split('\n').forEach(line => {
    const [name, pos, alts, age, b, t, ovr, yrs, total, ex] = line.split('|');
    const o = +ovr;
    addP(Object.assign({ name, pos, alts: alts ? alts.split(',') : [], age: +age, b, t, ovr: o, pot: o + (age < 28 ? 3 : 0), sal: 0, yrs: 0, team: 'FA', level: 'MLB', ask: { yrs: +yrs, aav: Math.round(total / yrs * 10) / 10 }, exTeam: ex || undefined, exMet: !!ex && ex === ME, heat: Math.max(1, Math.round((o - 42) / 4)) }, genRatings(pos, o)));
  });
  const nk = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), ntc = new Set(NTC_FULL.map(nk)), tf = new Set(TEN_FIVE.map(nk)), fa = new Set(SIGNED_WINTER.map(nk));
  Object.values(G.players).forEach(p => { if (p.team === 'FA' || p.level !== 'MLB') return; const k = nk(p.name); if (p.ovr >= 52 && ntc.has(k)) p.ntc = true; if (p.ovr >= 52 && tf.has(k)) p.tenFive = true; if (fa.has(k)) p.fa = 2027; });
  Object.keys(G.teams).forEach(poolOf);
  seedPicks(2027); seedPicks(2028);
  Object.values(G.teams).forEach(t => { const a = aiTotals(t.abbr); t.h0 = a.h; t.p0 = a.p; });
  refreshTeams(); autoLineup(); autoPitching();
  const fin = TEAM_ROWS.filter(r => r[3] === MY_LG && r[4] === MY_DIV).sort((a, b) => b[5] - a[5]).findIndex(r => r[0] === ME) + 1;
  setBack(`NEW SHERIFF IN ${TEAM.city.toUpperCase()}`, `${G.gm} takes over a ${TEAM.w26}-${TEAM.l26} ${TEAM.name} club. Payroll: ${money(payroll())}.`, 'Front office shakeup');
  addNews(`Welcome to ${TEAM.park}. The 2026 ${TEAM.name} went ${TEAM.w26}-${TEAM.l26} and finished ${fin}${['th', 'st', 'nd', 'rd'][fin] || 'th'} in the ${MY_LG} ${MY_DIV}.`);
  const locked = roster().filter(p => p.level !== 'FARM' && p.ctype === 'g' && p.yrs >= 4).sort((a, b) => b.sal - a.sal).slice(0, 2), best = roster().filter(p => p.pr).sort((a, b) => a.pr - b.pr)[0];
  addNews(locked.length ? `${locked.map(p => p.name).join(' and ')} ${locked.length > 1 ? 'are' : 'is'} locked up long term. The rest is on you.` : 'Nobody is locked up long term. A blank canvas, or a bare cupboard.');
  if (best) addNews(`Top prospect: ${best.name} (${best.pos}, ${affLabel(best)}), MLB Pipeline No. ${best.pr} in the system.`);
  sayRadio('meh');
  return G;
}
function makeProspect(level, age, ovr, pot, team = ME) {
  const pos = pick(['SP', 'SP', 'RP', 'C', 'SS', '2B', '3B', '1B', 'LF', 'CF', 'RF']);
  const p = addP(Object.assign({ name: pick(FIRST) + ' ' + pick(LAST), pos, age, b: pick(['R', 'L', 'R', 'S']), t: pick(['R', 'R', 'L']), ovr, pot, sal: 0.8, yrs: 6, ctype: 'pre', team, level, aff: age <= 18 ? 'DSL' : age <= 19 ? 'FCL' : age <= 21 ? 'A' : 'A+', r5: G.year - 1 + (age >= 19 ? 3 : 4), from: pick(HOMETOWNS), fict: true, s: team === ME ? blankS() : undefined }, genRatings(pos, ovr)));
  return p;
}
function makeDepth(hitter) {
  const pos = hitter ? pick(POS_H.filter(x => x !== 'DH')) : pick(['RP', 'RP', 'SP']), ovr = ri(38, 44);
  return addP(Object.assign({ name: pick(FIRST) + ' ' + pick(LAST), pos, age: ri(27, 33), b: pick(['R', 'L']), t: pick(['R', 'L']), ovr, pot: ovr, sal: 0.8, yrs: 1, ctype: 'pre', team: ME, level: 'AAA', from: pick(HOMETOWNS), fict: true, s: blankS() }, genRatings(pos, ovr)));
}
function seedPicks(y) { Object.keys(G.teams).forEach(a => { [1, 2].forEach(rd => G.picks.push({ id: `${y}-${a}-${rd}`, year: y, rd, orig: a, owner: a })); const cb = cbRound(a, y); if (cb) G.picks.push({ id: `${y}-${a}-${cb}`, year: y, rd: cb, orig: a, owner: a }); }); }
function oldPickValue(k) { const t = G.teams[k.orig]; const wins = t.w + t.l > 20 ? t.w / (t.w + t.l) * 162 : 81 + t.wv; const base = k.rd === 1 ? 26 + (81 - wins) * 0.7 : 7; return Math.round(Math.max(k.rd === 1 ? 12 : 4, base) * (k.year > G.year ? 0.92 : 1)); }

/* ---------- news ---------- */
function dateStr() {
  if (G.phase === 'offseason') { const d = new Date(G.year - 1, 10, 23 + (G.week - 1) * 7); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  if (G.phase === 'season') { const d = new Date(G.year, 2, 26 + Math.floor(G.day * 1.135)); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  return 'October';
}
function addNews(txt) { G.news.unshift({ d: dateStr(), txt }); G.news.length = Math.min(G.news.length, 40); }
function sayRadio(mood) { const k = mood || moodKey(); G.radio.unshift({ who: pick(CALLERS), line: pick(RADIO[k]) }); G.radio.length = Math.min(G.radio.length, 6); }
function moodKey() { return G.fans >= 75 ? 'great' : G.fans >= 55 ? 'good' : G.fans >= 35 ? 'meh' : 'bad'; }
function setBack(head, sub, kicker) { G.back = { head, sub, kicker: kicker || 'Back page', d: dateStr() }; }
function headline(kind, name, sub) { const h = pick(HEADLINES[kind]).replace(/\{L\}/g, name ? lastName(name).toUpperCase() : TEAM.short); setBack(h, sub, { sign: 'Free agency', bigsign: 'Free agency', trade: 'Trade wire', hot: 'On a roll', cold: 'Free fall', walkoff: 'Clutch', choke: 'Heartbreak', injury: 'Injury report', champ: 'World Series', miss: 'Season over', rival: 'Rivalry', rivalloss: 'Rivalry', deadline: 'Trade wire' }[kind]); }
function award(k) { if (G.trophies[k]) return; G.trophies[k] = G.year; const t = TROPHIES.find(x => x[0] === k); if (t) { G.toast = { title: 'Trophy unlocked: ' + t[1], body: t[2] }; addNews('Trophy case: ' + t[1] + '.'); } }
function adj(fx) {
  if (fx.fans) G.fans = clamp(G.fans + fx.fans, 0, 100);
  if (fx.trust) G.trust = clamp(G.trust + fx.trust, 0, 100);
  if (fx.curse) G.curse = clamp(G.curse + fx.curse, 0, 100);
  if (fx.cash) G.cash = Math.round((G.cash + fx.cash) * 100) / 100;
  if (fx.buff) { G.buff = fx.buff; G.buffG = 6; }
  if (fx.dev) G.dev += fx.dev;
  if (fx.prospect) { const p = makeProspect('FARM', ri(19, 24), ri(30, 44), ri(50, 76)); addNews(`${p.name} (${p.pos}) joins the farm system out of nowhere.`); }
}

/* ---------- roster math ---------- */
const active = () => roster().filter(p => p.level === 'MLB' && !p.inj);
const fortyMan = () => roster().filter(p => p.level !== 'FARM');
/* Moving a player off their main position costs rating points. Moves down the
   defensive spectrum (SS to 2B or 3B, CF to a corner) are easy; moves up are hard.
   Good fielders lose less, poor fielders more. Positions a player has really
   played (alts) cost almost nothing, and 20 starts somewhere new (40 at catcher)
   make it one of their positions. */
const POS_MOVE = {
  SS: { '2B': 2, '3B': 3, '1B': 5, LF: 6, RF: 6, CF: 7 },
  '2B': { SS: 6, '3B': 4, '1B': 4, LF: 6, RF: 6, CF: 8 },
  '3B': { '1B': 2, '2B': 5, SS: 7, LF: 5, RF: 5, CF: 9 },
  '1B': { '3B': 8, LF: 6, RF: 6, '2B': 10, SS: 14, CF: 12 },
  CF: { LF: 1, RF: 2, '1B': 6, '2B': 9, '3B': 9, SS: 12 },
  LF: { RF: 3, CF: 6, '1B': 4, '3B': 9, '2B': 10, SS: 14 },
  RF: { LF: 2, CF: 6, '1B': 4, '3B': 8, '2B': 10, SS: 14 },
  C: { '1B': 5, '3B': 8, LF: 8, RF: 8, '2B': 11, CF: 12, SS: 14 },
  DH: { '1B': 6, LF: 8, RF: 8, '3B': 12, '2B': 14, CF: 16, SS: 18 }
};
function posPen(p, pos) {
  if (!p || isPit(p)) return p && p.pos === pos ? 0 : 50;
  if (p.pos === pos) return 0;
  if (pos === 'DH') return 2;
  const f = clamp(p.fld || 50, 20, 80);
  if ((p.alts || []).includes(pos)) return f >= 55 ? 0 : f >= 35 ? 1 : 2;
  if (pos === 'C') return 30;
  const base = (POS_MOVE[p.pos] || POS_MOVE.DH)[pos] ?? 12;
  return clamp(Math.round(base * (1 + (50 - f) / 60)), 1, 25);
}
function posFit(p, pos) { const n = posPen(p, pos); return p.pos === pos ? 'main' : (p.alts || []).includes(pos) ? 'alt' : n <= 4 ? 'easy' : n <= 9 ? 'stretch' : 'bad'; }
function effOvr(p, pos) {
  if (!p) return 20;
  if (isPit(p)) return p.pos === pos ? p.ovr : 20;
  return p.ovr - posPen(p, pos);
}
function learnPositions() {
  gameLineup().forEach(({ p, pos }) => {
    if (!p || isPit(p) || pos === 'DH' || pos === p.pos || (p.alts || []).includes(pos)) return;
    p.pg = p.pg || {}; p.pg[pos] = (p.pg[pos] || 0) + 1;
    if (p.pg[pos] >= (pos === 'C' ? 40 : 20)) { p.alts = [...(p.alts || []), pos]; delete p.pg[pos]; addNews(`${p.name} has started enough games at ${pos} to call it a second position.`); }
  });
}
function gameLineup() {
  const used = new Set(), res = [];
  G.lineup.forEach(s => { const p = P(s.id); if (p && p.team === ME && p.level === 'MLB' && !p.inj) used.add(p.id); });
  G.lineup.forEach(s => {
    let p = P(s.id);
    if (!p || p.team !== ME || p.level !== 'MLB' || p.inj) {
      p = active().filter(x => !isPit(x) && !used.has(x.id)).sort((a, b) => effOvr(b, s.pos) - effOvr(a, s.pos))[0] || p; if (p) used.add(p.id);
    }
    res.push({ p, pos: s.pos });
  });
  return res;
}
function healthyRotation() { const r = G.rotation.map(P).filter(p => p && p.team === ME && p.level === 'MLB' && !p.inj); if (r.length < 5) active().filter(p => p.pos === 'SP' && !r.includes(p)).sort((a, b) => b.ovr - a.ovr).forEach(p => { if (r.length < 5) r.push(p); }); if (r.length < 5) active().filter(p => isPit(p) && !r.includes(p)).sort((a, b) => b.ovr - a.ovr).forEach(p => { if (r.length < 5) r.push(p); }); return r; }
function healthyPen() { const rot = new Set(healthyRotation().map(p => p.id)); const b = G.bullpen.map(P).filter(p => p && p.team === ME && p.level === 'MLB' && !p.inj && !rot.has(p.id)); active().filter(p => isPit(p) && !rot.has(p.id) && !b.includes(p)).sort((x, y) => y.ovr - x.ovr).forEach(p => b.push(p)); return b; }
function metsRatings() {
  const L = gameLineup();
  const H = L.reduce((s, x) => s + (effOvr(x.p, x.pos) - 40) * 0.22, 0);
  const rot = healthyRotation(), W = [1, 1, 1, .9, .8];
  const rw = rot.slice(0, 5).reduce((s, p, i) => s + (p.ovr - 40) * 0.2 * W[i], 0);
  const pen = healthyPen(), PW = [.5, .35, .25, .15, .12, .1, .08];
  const pw = pen.slice(0, 7).reduce((s, p, i) => s + (p.ovr - 40) * 0.2 * PW[i], 0);
  const Pt = rw + pw, off = LG_RPG + (H - 26) * RPW, def = LG_RPG - (Pt - 19) * RPW;
  return { H, Pt, rw, pw, off, def, exp: Math.round(81 + (off - def) * 16.2), lineAvg: L.reduce((s, x) => s + effOvr(x.p, x.pos), 0) / 9, rotAvg: rot.slice(0, 5).reduce((s, p) => s + p.ovr, 0) / Math.max(1, rot.slice(0, 5).length), penAvg: pen.slice(0, 7).reduce((s, p) => s + p.ovr, 0) / Math.max(1, pen.slice(0, 7).length) };
}
function aiTotals(a) { let h = 0, p = 0; roster(a).forEach(x => { if (x.level === 'FARM') return; const w = Math.max(0, x.ovr - 44) * 0.2; if (isPit(x)) p += w * (x.pos === 'RP' ? 0.35 : 1); else h += w; }); return { h, p }; }
function refreshTeams() {
  const list = Object.values(G.teams).filter(t => t.abbr !== ME);
  list.forEach(t => { const a = aiTotals(t.abbr); t.dH = clamp((a.h - t.h0) * 0.65, -7, 7); t.dP = clamp((a.p - t.p0) * 0.65, -7, 7); });
  const mh = list.reduce((s, t) => s + t.dH, 0) / list.length, mp = list.reduce((s, t) => s + t.dP, 0) / list.length;
  list.forEach(t => { t.off = LG_RPG + (t.wv / 2 + t.dH - mh + t.form / 2) * RPW * 1.0; t.def = LG_RPG - (t.wv / 2 + t.dP - mp + t.form / 2) * RPW * 1.0; });
  const m = metsRatings(); G.teams[ME].off = m.off; G.teams[ME].def = m.def;
}
function payroll(y = G.year, tax = false) {
  const off = y - G.year;
  const pl = roster().filter(p => p.yrs > off && p.level !== 'FARM').reduce((s, p) => s + (p.level === 'AAA' && p.ctype === 'pre' ? p.sal * .3 : p.sal), 0);
  const d = G.dead.filter(x => x.from <= y && x.thru >= y && !(tax && x.noTax) && !x.noTax).reduce((s, x) => s + x.amt, 0);
  return pl + d;
}
function taxBill(pay = payroll()) { const o = pay - CBT_LINE; if (o <= 0) return 0; return Math.min(o, 20) * .5 + Math.max(0, Math.min(o - 20, 20)) * .62 + Math.max(0, Math.min(o - 40, 20)) * .95 + Math.max(0, o - 60) * 1.1; }

function rankBench(a, b) { return b.ovr - a.ovr; }
function rebalance() {
  const notes = [], locked = new Set([...G.lineup.map(s => s.id), ...G.rotation, ...G.bullpen.slice(0, 1)]);
  let act = active(), guard = 0;
  while (act.length > 26 && guard++ < 30) {
    const hit = act.filter(p => !isPit(p)), pit = act.filter(isPit), pool = hit.length > 13 ? hit : pit.length > 13 ? pit : act;
    const drop = pool.filter(p => !locked.has(p.id)).sort((a, b) => a.ovr - b.ovr)[0] || pool.sort((a, b) => a.ovr - b.ovr)[0];
    drop.level = 'AAA'; notes.push(`${drop.name} optioned to ${AFF.AAA.n}`); act = active();
  }
  guard = 0;
  while (act.length < 26 && guard++ < 30) {
    const needHit = act.filter(p => !isPit(p)).length < 13;
    const pool = roster().filter(p => (p.level === 'AAA' || p.level === 'FARM') && !p.inj && isPit(p) !== needHit).sort((a, b) => (b.level === 'AAA') - (a.level === 'AAA') || b.ovr - a.ovr);
    let up = pool[0];
    if (!up) { up = makeDepth(needHit); notes.push(`${up.name} signed off the scrap heap`); } else notes.push(`${up.name} called up`);
    up.level = 'MLB'; act = active();
  }
  guard = 0;
  while (fortyMan().length > 40 && guard++ < 20) {
    const drop = roster().filter(p => p.level === 'AAA').sort((a, b) => (a.ovr + a.pot * .3) - (b.ovr + b.pot * .3))[0]; if (!drop) break; drop.level = 'FARM'; drop.aff = 'AAA'; notes.push(`${drop.name} outrighted off the 40-man`);
  }
  repair(); refreshTeams();
  return notes;
}
function repair() {
  const pool = () => active().filter(p => !isPit(p));
  const seen = new Set();
  G.lineup = G.lineup.filter(s => { const p = P(s.id); const ok = p && p.team === ME && p.level === 'MLB' && !isPit(p) && !seen.has(p.id); if (ok) seen.add(p.id); return ok; });
  POS_H.filter(pos => !G.lineup.some(s => s.pos === pos)).forEach(pos => {
    const c = pool().filter(p => !seen.has(p.id)).sort((a, b) => effOvr(b, pos) - effOvr(a, pos))[0];
    if (c) { seen.add(c.id); G.lineup.push({ id: c.id, pos }); }
  });
  G.rotation = G.rotation.filter(id => { const p = P(id); return p && p.team === ME && p.level === 'MLB'; });
  active().filter(p => p.pos === 'SP' && !G.rotation.includes(p.id)).sort(rankBench).forEach(p => { if (G.rotation.length < 5) G.rotation.push(p.id); });
  active().filter(p => isPit(p) && !G.rotation.includes(p.id)).sort(rankBench).forEach(p => { if (G.rotation.length < 5) G.rotation.push(p.id); });
  G.bullpen = G.bullpen.filter(id => { const p = P(id); return p && p.team === ME && p.level === 'MLB' && !G.rotation.includes(id); });
  active().filter(p => isPit(p) && !G.rotation.includes(p.id) && !G.bullpen.includes(p.id)).sort(rankBench).forEach(p => G.bullpen.push(p.id));
}
function autoLineup() {
  const hit = active().filter(p => !isPit(p)), used = new Set(), slots = [];
  ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B', 'DH'].forEach(pos => {
    const c = hit.filter(p => !used.has(p.id)).sort((a, b) => (effOvr(b, pos) + ((b.pos === pos) ? .5 : 0)) - (effOvr(a, pos) + ((a.pos === pos) ? .5 : 0)))[0];
    if (c) { used.add(c.id); slots.push({ id: c.id, pos }); }
  });
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) { const a = P(slots[i].id), b = P(slots[j].id); if (effOvr(a, slots[j].pos) + effOvr(b, slots[i].pos) > effOvr(a, slots[i].pos) + effOvr(b, slots[j].pos)) { const t = slots[i].id; slots[i].id = slots[j].id; slots[j].id = t; } }
    hit.filter(h => !slots.some(s => s.id === h.id)).forEach(h => { if (effOvr(h, slots[i].pos) > effOvr(P(slots[i].id), slots[i].pos)) slots[i].id = h.id; });
  }
  const obp = s => { const p = P(s.id); return p.eye * .6 + p.con * .4; }, slg = s => { const p = P(s.id); return p.pow * .7 + p.con * .3; };
  const remaining = [...slots], order = [];
  const take = fn => { remaining.sort((a, b) => fn(b) - fn(a)); order.push(remaining.shift()); };
  take(s => obp(s) + P(s.id).spd * .25); take(obp); take(s => obp(s) * .5 + slg(s) * .6); take(slg); while (remaining.length) take(s => P(s.id).ovr);
  G.lineup = order;
}
function autoPitching() {
  const pit = active().filter(isPit), sp = pit.filter(p => p.pos === 'SP').sort(rankBench).slice(0, 5);
  pit.filter(p => !sp.includes(p)).sort(rankBench).forEach(p => { if (sp.length < 5) sp.push(p); });
  G.rotation = sp.map(p => p.id);
  G.bullpen = pit.filter(p => !sp.includes(p)).sort((a, b) => ((b.pos === 'RP') - (a.pos === 'RP')) || b.ovr - a.ovr).map(p => p.id);
}
function rosterIssues() {
  const out = [], act = active();
  if (act.length !== 26) out.push(`Active roster has ${act.length} players. It needs 26.`);
  if (fortyMan().length > 40) out.push(`40-man roster has ${fortyMan().length} players. The limit is 40.`);
  if (G.lineup.length < 9) out.push('The batting order has an empty spot.');
  const bad = G.lineup.filter(s => { const p = P(s.id); return !p || p.inj || p.level !== 'MLB'; });
  if (bad.length) out.push(`${bad.length} lineup spot${bad.length > 1 ? 's are' : ' is'} held by an injured or demoted player.`);
  if (G.rotation.length < 5) out.push('The rotation needs five starters.');
  return out;
}

/* ---------- schedule and game sim ---------- */
const TEAM_IDS = TEAM_ROWS.map(r => r[0]);
function dayPairs(day) {
  const series = Math.floor(day / 3), r = series % 29, flip = series >= 29, rest = TEAM_IDS.slice(1);
  const rot = [TEAM_IDS[0], ...rest.slice(r), ...rest.slice(0, r)], out = [];
  for (let i = 0; i < 15; i++) { const a = rot[i], b = rot[29 - i]; out.push(((r + i) % 2 === 0) !== flip ? [a, b] : [b, a]); }
  return out;
}
function metsMatch(day) { const m = dayPairs(day).find(x => x.includes(ME)); return { home: m[0] === ME, opp: m[0] === ME ? m[1] : m[0] }; }
const scoreRuns = l => poisson(Math.max(.5, l) * Math.exp(gauss() * .32 - .05));
function aiGame(h, a) {
  const H = G.teams[h], A = G.teams[a];
  let hr = scoreRuns(H.off * A.def / LG_RPG + .1), ar = scoreRuns(A.off * H.def / LG_RPG - .05);
  while (hr === ar) { if (Math.random() < .53) hr++; else ar++; }
  return { hr, ar };
}
function record(t, rs, ra) { const T = G.teams[t]; T.rs += rs; T.ra += ra; if (rs > ra) { T.w++; T.st = T.st > 0 ? T.st + 1 : 1; } else { T.l++; T.st = T.st < 0 ? T.st - 1 : -1; } }
function playMetsGame(opp, home, po) {
  const m = metsRatings(), o = G.teams[opp], rot = healthyRotation();
  G.rotIdx = ((G.rotIdx || 0)) % Math.max(1, rot.length);
  const st = rot[G.rotIdx] || rot[0]; G.rotIdx++;
  const sAdj = (st.ovr - m.rotAvg) * .05, b = G.buffG > 0 ? G.buff : 0, curseDrag = (G.curse - 30) * .0012;
  const uL = m.off * o.def / LG_RPG + (home ? .1 : -.05) + b * .1 - curseDrag, tL = o.off * (m.def - sAdj) / LG_RPG + (home ? -.05 : .1) - b * .05 + curseDrag;
  let us = scoreRuns(uL), them = scoreRuns(tL);
  while (us === them) { if (Math.random() < (home ? .53 : .47)) us++; else them++; }
  if (G.buffG > 0) G.buffG--;
  const g = { opp, home, us, them, st: st.id, po: !!po };
  const d = them - us;
  if (G.clutchOn && d !== 0 && d >= -3 && d <= 3 && (d > 0 || Math.random() < .45) && (po ? Math.random() < .8 : (G.clutchCD <= 0 && Math.random() < .3))) {
    G.clutchCD = 14; g.clutch = clutchSetup(g);
  } else if (G.clutchCD > 0) G.clutchCD--;
  return g;
}
function clutchSetup(g) {
  const d = g.them - g.us, L = gameLineup(), start = ri(0, 3);
  const bases = d === 1 ? [true, true, false] : d === 2 ? [true, true, false] : d === 3 ? [true, true, true] : [false, true, false];
  return { deficit: d, bases, outs: 2, order: L.slice(start).concat(L.slice(0, start)).map(x => x.p.id), idx: 0, inning: g.po ? 9 : ri(8, 9) === 8 ? 9 : 9 };
}
function resolveClutch(result) {
  const g = G.pending; if (!g) return;
  g.us = g.them - g.clutch.deficit + result.runs;
  if (g.us === g.them) { if (Math.random() < .55) g.us++; else g.them++; }
  const batter = P(result.batter);
  if (g.us > g.them) {
    G.clutchWins++; award('walkoff'); if (result.slam) award('salami'); if (G.clutchWins >= 5) award('ko');
    adj({ fans: g.po ? 6 : 3, trust: 1, curse: -2 });
    if (batter) { headline('walkoff', batter.name, `${batter.name} delivers with two outs and the ${TEAM.name} beat the ${G.teams[g.opp].name} ${g.us}-${g.them}.`); if (!g.home && /WALK-OFF/.test(G.back.head)) G.back.head = 'NINTH-INNING MAGIC'; }
    sayRadio('great');
  } else {
    adj({ fans: -1 }); if (batter && g.po) headline('choke', batter.name, `The rally dies with the tying run on base against the ${G.teams[g.opp].name}.`);
  }
  delete g.clutch; G.pending = null;
  finishMetsGame(g);
  if (G.phase === 'season') endDay();
}
function applyBox(g) {
  const L = gameLineup(), lines = [];
  L.forEach(({ p }) => {
    if (!p) return; const s = p.s || (p.s = blankS()); s.G++; const pa = ri(3, 5); const line = { id: p.id, AB: 0, H: 0, HR: 0, BB: 0, K: 0, D: 0 };
    for (let i = 0; i < pa; i++) {
      const bb = clamp(.08 + (p.eye - 50) * .0026, .03, .2), k = clamp(.23 - (p.con - 50) * .0035, .08, .36), hr = clamp(.031 + (p.pow - 50) * .0012, .005, .08), r = Math.random();
      if (r < bb) { line.BB++; continue; } line.AB++;
      if (r < bb + k) { line.K++; continue; }
      if (r < bb + k + hr) { line.H++; line.HR++; continue; }
      if (Math.random() < clamp(.285 + (p.con - 50) * .0026, .2, .37)) { line.H++; if (Math.random() < .23 + (p.pow - 50) * .002) line.D++; }
    }
    lines.push({ p, line });
  });
  let hrSum = lines.reduce((s, x) => s + x.line.HR, 0);
  while (hrSum > g.us) { const x = lines.find(l => l.line.HR > 0); x.line.HR--; hrSum--; }
  for (let i = 0; i < g.us; i++) { const a = pick(lines); a.line.R = (a.line.R || 0) + 1; const b = pick(lines); b.line.RBI = (b.line.RBI || 0) + 1; }
  lines.forEach(({ p, line }) => { const s = p.s; s.AB += line.AB; s.H += line.H; s.D += line.D; s.HR += line.HR; s.BB += line.BB; s.K += line.K; s.R += line.R || 0; s.RBI += line.RBI || 0; if (line.H && Math.random() < p.spd * .0009) s.SB++; });
  const st = P(g.st), sS = st.s || (st.s = blankS()), outs = clamp(Math.round((5.5 + gauss() * 1.1 + (st.stm - 50) * .025) * 3), 6, 27), share = outs / 27;
  let er = 0; for (let i = 0; i < g.them; i++) if (Math.random() < share * 1.15) er++;
  sS.G++; sS.GS++; sS.O += outs; sS.ER += er; const kPer = .85 + (st.stf - 50) * .018; sS.PK += poisson(Math.max(.2, outs / 3 * kPer)); sS.PBB += poisson(Math.max(.1, outs / 3 * clamp(.36 - (st.ctl - 50) * .007, .1, .7))); sS.PH += poisson(outs / 3 * .86);
  const pen = healthyPen(), won = g.us > g.them, relief = 27 - outs, used = pen.slice(0, 7).sort(() => Math.random() - .5).slice(0, ri(2, 3)), closer = pen[0];
  if (won && g.us - g.them <= 3 && closer && !used.includes(closer)) used[0] = closer;
  used.forEach(r => { const s = r.s || (r.s = blankS()), o = Math.round(relief / used.length); s.G++; s.O += o; const e = (g.them - er) / used.length; s.ER += Math.random() < e - Math.floor(e) ? Math.ceil(e) : Math.floor(e); s.PK += poisson(o / 3 * (.95 + (r.stf - 50) * .018)); s.PBB += poisson(o / 3 * .33); s.PH += poisson(o / 3 * .82); });
  if (won) { if (outs >= 15 && Math.random() < .78) sS.W++; else if (used[0]) used[0].s.W++; if (g.us - g.them <= 3 && closer && closer.s && outs < 27) closer.s.SV++; }
  else { if (Math.random() < .68) sS.L++; else if (used[used.length - 1]) used[used.length - 1].s.L++; }
  g.hero = lines.slice().sort((a, b) => (b.line.HR * 3 + b.line.H) - (a.line.HR * 3 + a.line.H))[0]?.p.id;
}
function injuries() {
  roster().forEach(p => { if (p.inj) { p.inj.g--; if (p.inj.g <= 0) { p.inj = null; if (p.level === 'MLB') { addNews(`${p.name} is off the injured list.`); autoAddToLineup(p); } } } });
  const pool = [...gameLineup().map(x => x.p), P(G.rotation[(G.rotIdx || 1) - 1])].filter(Boolean);
  pool.forEach(p => {
    if (p.inj) return; const risk = (isPit(p) ? .0042 : .0026) * (1 + Math.max(0, p.age - 30) * .08) * (1 + G.curse / 120);
    if (Math.random() < risk) {
      const g = Math.random() < .2 ? ri(40, 90) : ri(6, 30); p.inj = { g, why: pick(INJURIES) };
      addNews(`${p.name} hits the IL for ${g} games: ${p.inj.why}.`); if (g > 30 && p.ovr >= 55) headline('injury', p.name, `${p.name} will miss about ${g} games with a ${p.inj.why}.`);
      adj({ fans: -1 });
    }
  });
  rebalanceQuiet();
}
function rebalanceQuiet() { if (active().length !== 26) { const n = rebalance(); n.slice(0, 2).forEach(addNews); } else repair(); }
function finishMetsGame(g) {
  G.gameNo = (G.gameNo || 0) + 1;
  if (g.box) applyLiveBox(g); else applyBox(g);
  const won = g.us > g.them, t = G.teams[ME];
  if (g.po) { poGameDone(g); adj({ fans: won ? 2 : -1 }); }
  else {
    record(ME, g.us, g.them); record(g.opp, g.them, g.us);
    if (g.opp === RIVAL) { if (won) { G.rivalW = (G.rivalW || 0) + 1; if (G.rivalW === 10) award('rival'); } if (Math.abs(g.us - g.them) >= 5 && Math.random() < .5) headline(won ? 'rival' : 'rivalloss', null, won ? `The ${TEAM.name} beat the ${G.teams[RIVAL].name} ${g.us}-${g.them}. That's win No. ${G.rivalW} over ${G.teams[RIVAL].city} this year.` : `The ${G.teams[RIVAL].name} beat the ${TEAM.name} ${g.them}-${g.us}. ${VOICE()} has gone quiet.`); }
    G.log.push({ o: g.opp, h: g.home ? 1 : 0, u: g.us, t: g.them });
    adj({ fans: won ? .5 : -.45 });
    if (t.st === 10) award('streak');
    if (t.st === 5 || t.st === 8 || t.st === 12) { headline('hot', null, `The ${TEAM.name} have won ${t.st} straight and improve to ${t.w}-${t.l}.`); sayRadio('great'); adj({ fans: 3 }); }
    if (t.st === -5 || t.st === -8) { headline('cold', null, `That's ${-t.st} straight losses. The ${TEAM.name} fall to ${t.w}-${t.l}.`); sayRadio('bad'); adj({ fans: -3, curse: 3 }); }
    injuries();
  }
  G.last = g;
}
function maybePhone(p) { if (G.phone != null || Math.random() > p) return; const can = i => PHONE_CARDS[i].opts.some(o => !o.cost || G.cash >= o.cost), free = PHONE_CARDS.map((_, i) => i).filter(i => !G.used.includes(i) && can(i)); if (!free.length) { if (G.used.length) { G.used = []; return maybePhone(1); } return; } G.phone = pick(free); G.used.push(G.phone); }
function answerPhone(i) { const c = PHONE_CARDS[G.phone], o = c.opts[i]; if (!o) { addNews(`${c.title}: You let it go to voicemail.`); G.phone = null; return 'You let it go to voicemail.'; } if (o.cost && G.cash < o.cost) return null; adj(o.fx || {}); if (/^Rally /.test(c.title) && i === 0) award('cat'); addNews(`${c.title}: ${o.say}`); G.phone = null; sayRadio(); return o.say; }
function simDay() {
  if (G.phase !== 'season' || G.pending || G.live || G.phone != null || G.draft) return false;
  dayPairs(G.day).forEach(([h, a]) => { if (h === ME || a === ME) return; const r = aiGame(h, a); record(h, r.hr, r.ar); record(a, r.ar, r.hr); });
  const { opp, home } = metsMatch(G.day), g = playMetsGame(opp, home, false);
  if (g.clutch) { G.pending = g; return false; }
  finishMetsGame(g); return endDay();
}
function endDay() {
  learnPositions();
  G.day++;
  if (ME === 'BOS' && G.day === PATRIOTS_DAY) { adj({ fans: 3 }); G.buff = 1; G.buffG = 3; setBack('MARATHON MONDAY', 'An 11 a.m. first pitch on Patriots\' Day, with marathoners running through Kenmore Square during the game.', 'Patriots\' Day'); addNews('Patriots\' Day: the Red Sox played the morning game. The Fens were packed by 10.'); }
  if (G.day === ASG_DAY) { const b = topPerformer(); addNews(`All-Star break. ${b ? b.name + ' represents ' + TEAM.city + '.' : 'Nobody from ' + TEAM.city + ' made it. Ouch.'}`); }
  if (G.day === DRAFT_DAY) startDraft();
  if (G.day === DEADLINE - 14) { const n = onTheBlock().length; headline('deadline', null, `Two weeks to the July 31 deadline. ${n} players are on the trade block, led by sellers shopping expiring deals.`); addNews(`The trade block is open: ${n} players available. Sellers are listening.`); }
  if (G.day === DEADLINE) { addNews('The trade deadline has passed. No more trades this season.'); setBack('DEADLINE DAY', 'The phones go quiet. What you have is what you ride with.', 'Trade wire'); }
  if (G.day % 27 === 0 && payroll() > OWNERS[G.owner].cap) { adj({ trust: -2 }); addNews(`Ownership sent a note about the payroll. It is ${money(payroll() - OWNERS[G.owner].cap)} over budget.`); }
  if (G.day % 9 === 0) { sayRadio(); if (G.day < DEADLINE) maybeOffer(.28); }
  if (G.day >= DEADLINE - 16 && G.day < DEADLINE && Math.random() < .3) aiDeal();
  maybePhone(.045);
  if (G.day >= 162) { endRegular(); return false; }
  return G.phone == null && !G.draft;
}
function topPerformer() { return roster().filter(p => p.level === 'MLB').sort((a, b) => war(b) - war(a))[0]; }
function simDays(n, until) {
  let i = 0;
  while (i < n && G.phase === 'season') { if (until != null && G.day >= until) break; const go = simDay(); i++; if (!go) break; }
  refreshTeams();
}
function war(p) {
  const s = p.s; if (!s) return 0;
  if (isPit(p)) { if (!s.O) return 0; const ip = s.O / 3; return Math.round(((4.6 - s.ER / ip * 9) * ip / 9 / 9 + ip / 200 * 1.4) * 10) / 10; }
  if (!s.AB) return 0; const obp = (s.H + s.BB) / (s.AB + s.BB), slg = (s.H + s.D + 3 * s.HR) / s.AB;
  return Math.round((((obp + slg) - .69) * (s.AB + s.BB) / 60 + (p.fld - 50) * s.G / 1800 + s.G / 162 * 1.5) * 10) / 10;
}

/* ---------- draft ---------- */
function startDraft() {
  const mine = G.picks.find(k => k.owner === ME && k.year === G.year && k.rd === 1), any = mine || G.picks.find(k => k.owner === ME && k.year === G.year);
  if (!any) { addNews(`The ${TEAM.name} have no pick in this year's draft. ${VOICE()} is not pleased.`); return; }
  const qual = any.rd === 'A' ? 60 : any.rd === 'B' ? 56 : any.rd === 1 ? clamp(84 - G.teams[any.orig].w / (G.teams[any.orig].w + G.teams[any.orig].l + 1) * 40, 58, 78) : 54;
  const board = []; for (let i = 0; i < 5; i++) { const pos = pick(['SP', 'SS', 'CF', 'C', 'RF', '3B', 'RP', '2B']), age = ri(18, 22), pot = clamp(Math.round(qual + gauss() * 6), 42, 80); board.push({ name: pick(FIRST) + ' ' + pick(LAST), pos, age, pot, ovr: clamp(pot - ri(16, 28), 22, 44), from: pick(HOMETOWNS), est: pot + ri(-5, 5), vibe: pick(['Elite makeup', 'Raw but electric', 'High floor', 'Boom or bust', 'Scout fell in love', 'Polished college bat', 'Plus-plus arm']) }); }
  G.draft = { pick: any.id, rd: any.rd, board };
}
function draftPick(i) {
  const b = G.draft.board[i], p = addP(Object.assign({ name: b.name, pos: b.pos, age: b.age, b: pick(['R', 'L']), t: pick(['R', 'R', 'L']), ovr: b.ovr, pot: b.pot, sal: 0.8, yrs: 6, ctype: 'pre', team: ME, level: 'FARM', aff: b.age <= 19 ? 'FCL' : 'A', from: b.from, fict: true, s: blankS(), drafted: G.year, r5: G.year + (b.age >= 19 ? 3 : 4) }, genRatings(b.pos, b.ovr)));
  G.picks = G.picks.filter(k => k.id !== G.draft.pick); G.draft = null; addNews(`${TEAM.name} draft ${p.name} (${p.pos}, ${p.age}) from ${p.from}.`); return p;
}

/* ---------- free agency ---------- */
function freeAgents() { return roster('FA').sort((a, b) => b.ovr - a.ovr); }
function offerScore(p, o) {
  const a = p.ask, val = o.aav * o.yrs, want = a.aav * a.yrs;
  return .6 * (o.aav / a.aav) + .4 * (val / want) + (G.fans - 50) * .0009 + (p.exMet ? .03 : 0) + Math.min(o.yrs - a.yrs, 2) * .012;
}
function negotiate(p, o) {
  p.neg = p.neg || { patience: 3, bar: rnd(.97, 1.03) };
  if (p.neg.patience <= 0) return { kind: 'walked', msg: 'The agent has stopped taking your calls until next week.' };
  const s = offerScore(p, o);
  if (s >= p.neg.bar) { signFA(p, o); return { kind: 'signed' }; }
  p.neg.patience--;
  if (Math.random() < .28 && p.ovr >= 50) { p.ask.aav = Math.round(p.ask.aav * 1.03 * 10) / 10; p.heat = (p.heat || 1) + 1; var rival = pick(Object.keys(G.teams).filter(t => t !== ME)); }
  if (p.neg.patience <= 0) return { kind: 'walked', msg: `"We're done for now." The agent hung up and is calling ${rival ? G.teams[rival].name : 'someone else'}. Try again next week.` };
  if (s >= .88) { const c = { yrs: p.ask.yrs, aav: Math.round(((o.aav + p.ask.aav) / 2 + p.ask.aav * .015) * 10) / 10 }; return { kind: 'counter', counter: c, msg: rival ? `A mystery team from ${G.teams[rival].city} just called. We'd do ${c.yrs} years at ${money(c.aav)}.` : `We're close. Make it ${c.yrs} years at ${money(c.aav)} and we can talk.` }; }
  return { kind: 'insult', msg: pick(['My client laughed so hard a vein appeared.', 'Is this a typo? Please tell me this is a typo.', 'I am going to pretend this call never happened.', 'I have a sandwich that makes more than that.']) };
}
function signFA(p, o) {
  const defer = o.defer || 0;
  p.team = ME; p.yrs = o.yrs; p.sal = Math.round(o.aav * (1 - defer) * 100) / 100; p.ctype = 'g'; if (G.phase === 'offseason') p.fa = G.year; p.level = 'MLB'; p.s = p.s || blankS();
  const wasMet = p.exMet; delete p.ask; delete p.neg; delete p.heat; delete p.exMet;
  if (defer) { const amt = Math.round(o.aav * defer * 1.08 * 100) / 100; G.dead.push({ label: `${p.name} deferred money`, amt, from: G.year + o.yrs, thru: G.year + o.yrs * 2 - 1 }); award('bonilla'); }
  award('first_sign');
  const notes = rebalance(); autoAddToLineup(p);
  headline(p.ovr >= 60 ? 'bigsign' : 'sign', p.name, `${p.name} ${wasMet ? 're-signs' : 'signs'} for ${o.yrs} year${o.yrs > 1 ? 's' : ''}, ${money(o.aav * o.yrs)}${defer ? ' with money kicked down the road' : ''}.`);
  addNews(`SIGNED: ${p.name}, ${o.yrs}y / ${money(o.aav * o.yrs)}.`); notes.forEach(addNews);
  adj({ fans: clamp((p.ovr - 48) * .6, 0, 9), trust: payroll() > OWNERS[G.owner].cap ? -3 : 0 }); sayRadio('spend');
}
function autoAddToLineup(p) {
  if (isPit(p)) { if (p.pos === 'SP') { const w = G.rotation.map(P).sort((a, b) => a.ovr - b.ovr)[0]; if (w && p.ovr > w.ovr && !G.rotation.includes(p.id)) { G.bullpen = G.bullpen.filter(x => x !== p.id); G.rotation[G.rotation.indexOf(w.id)] = p.id; G.bullpen.push(w.id); } } return; }
  if (G.lineup.some(s => s.id === p.id) || p.level !== 'MLB') return;
  let best = null, gain = 1; G.lineup.forEach(s => { const g = effOvr(p, s.pos) - effOvr(P(s.id), s.pos); if (g > gain) { gain = g; best = s; } });
  if (best) best.id = p.id;
}
function faWeek() {
  const fa = freeAgents();
  fa.forEach(p => {
    if (p.neg) delete p.neg;
    p.heat = clamp((p.heat || 1) + ri(-1, 1), 0, 9);
    if (G.week > 4 && p.ask) p.ask.aav = Math.max(.8, Math.round(p.ask.aav * .975 * 10) / 10);
    if (Math.random() < .05 + (p.ovr >= 58 ? .05 : 0) + G.week * .012) aiSign(p);
  });
}
function aiSign(p) {
  const teams = Object.values(G.teams).filter(t => t.abbr !== ME), w = teams.map(t => Math.max(1, 25 + t.wv + rnd(0, 18))), tot = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot, t = teams[0]; for (let i = 0; i < teams.length; i++) { r -= w[i]; if (r <= 0) { t = teams[i]; break; } }
  const a = p.ask || genAsk(p); p.team = t.abbr; p.sal = a.aav; p.yrs = a.yrs; p.ctype = 'g'; if (G.phase === 'offseason') p.fa = G.year; delete p.ask; delete p.neg; delete p.heat; delete p.exMet;
  if (p.ovr >= 52) addNews(`${p.name} signs with the ${t.name}: ${a.yrs}y / ${money(a.aav * a.yrs)}.`);
}
function advanceWeek() {
  if (G.phase !== 'offseason') return;
  faWeek(); refreshTeams();
  if (G.week >= G.weeks) return startSeason();
  G.week++;
  if (G.week === 3 && G.r5Done !== G.year - 1) rule5Draft();
  if (G.year === 2027 && G.week === 2) { addNews(`The CBA expired on Dec. 1. In this universe, both sides settled on a napkin at a ${TEAM.city} pizza joint.`); setBack('LOCKOUT AVERTED BY PIZZA', `Owners and players reach a deal over a large cheese in ${TEAM.city}.`, 'Labor news'); }
  maybePhone(.45); maybeOffer(.5); sayRadio(); if (Math.random() < .25) aiDeal();
}

/* ---------- trades ---------- */
function teamMode(a) { const t = G.teams[a]; const w = t.w + t.l > 20 ? t.w / (t.w + t.l) * 162 : 81 + t.wv; return w >= 87 ? 'contender' : w <= 74 ? 'rebuild' : 'middle'; }
/* Trade values are $M of surplus value: projected WAR at market price, minus what the player is owed, year by year. */
const PER_WAR = 9.5, DISC = 0.08, POOL_STEP = 0.25, POOL_VAL = 1.2;
const FV_TABLE = [[35, .5], [40, 2], [45, 6], [50, 18], [55, 30], [60, 50], [65, 80], [70, 110], [80, 160]];
const pool$ = m => m < 1 ? '$' + Math.round(m * 1000) + 'K' : '$' + (Math.round(m * 100) / 100) + 'M';
const val$ = v => (v < -0.05 ? '-' : '') + '$' + (Math.abs(v) >= 10 ? Math.round(Math.abs(v)) : Math.round(Math.abs(v) * 10) / 10) + 'M';
function projOvr(p, k) { let o = p.ovr; for (let i = 0; i < k; i++) { const a = p.age + i; o = a <= 26 ? Math.min(Math.max(p.pot, o), o + Math.max(.5, (p.pot - o) * .25)) : a <= 29 ? o : a <= 32 ? o - 1 : o - 2.2; } return o; }
const warOf = (p, o) => Math.max(0, o - 44) * (p.pos === 'RP' ? .1 : .25);
function salaryIn(p, k, retain) {
  if (k === 0 || p.ctype === 'g') return p.sal * (1 - retain);
  const left = p.yrs - k; if (left > 3) return Math.max(.8, p.sal) * (1 - retain);
  return Math.max(p.sal, marketAAV(projOvr(p, k)) * (left >= 3 ? .25 : left === 2 ? .42 : .65)) * (1 - retain);
}
function prospectVal(p) {
  const fv = (p.pot + 1) / 1.2; let i = 0; while (i < FV_TABLE.length - 2 && fv > FV_TABLE[i + 1][0]) i++;
  const [a, va] = FV_TABLE[i], [b, vb] = FV_TABLE[i + 1], v = va + (vb - va) * clamp((fv - a) / (b - a), 0, 1);
  const lvl = { AAA: 1.15, AA: 1.15, 'A+': 1, A: .95, FCL: .85, DSL: .75 }[p.level === 'MLB' ? 'AAA' : affOf(p)] || 1;
  return v * (isPit(p) ? .8 : 1) * lvl * (p.age >= 26 ? .7 : 1);
}
function surplus(p, view, retain = 0) {
  const m = view ? teamMode(view) : 'middle', yrs = Math.min(p.yrs || 0, 8), left0 = G.phase === 'season' ? clamp(1 - G.day / 162, .05, 1) : 1;
  let v = 0;
  for (let k = 0; k < yrs; k++) {
    const w = warOf(p, projOvr(p, k)) * PER_WAR * Math.pow(1.03, k) * (m === 'contender' ? (k === 0 ? 1.25 : k >= 3 ? .9 : 1) : m === 'rebuild' ? (k === 0 ? .6 : k >= 2 ? 1.1 : 1) : 1);
    v += (w - (p.level === 'FARM' ? 0 : salaryIn(p, k, retain))) * (k === 0 ? left0 : 1) / Math.pow(1 + DISC, k);
  }
  if (m === 'rebuild' && p.age >= 31 && v > 0) v *= .8;
  return v;
}
function tradeVal(p, view, retain = 0) {
  const m = view ? teamMode(view) : 'middle', kid = p.age <= 25 && p.pot - p.ovr >= 6, pv = () => prospectVal(p) * (m === 'rebuild' ? 1.2 : m === 'contender' ? .85 : 1);
  let v;
  if (p.level === 'FARM' || (kid && p.ovr < 48)) v = Math.max(.2, pv());
  else { v = surplus(p, view, retain); if (kid) v = Math.max(v, pv()); }
  return Math.round(v * 10) / 10;
}
function cbRound(abbr, y) { const flip = (y - 2027) % 2 !== 0; if (CB_2027.A.includes(abbr)) return flip ? 'B' : 'A'; if (CB_2027.B.includes(abbr)) return flip ? 'A' : 'B'; return null; }
const isCB = k => k && (k.rd === 'A' || k.rd === 'B');
const tradeablePick = k => isCB(k) && !k.traded && k.year >= G.year;
function pickValue(k) { return k.rd === 'A' ? 7 : k.rd === 'B' ? 3 : k.rd === 1 ? 12 : 4; }
function poolBase(a) { return cbRound(a, 2027) ? 7.2 : BIG_MARKETS.includes(a) ? 5.6 : 6.5; }
function poolOf(a) { G.pool = G.pool || {}; if (!G.pool[a]) G.pool[a] = { base: poolBase(a), left: poolBase(a), got: 0 }; return G.pool[a]; }
function tradeBlock(p) {
  if (p.fa === G.year && (G.phase === 'offseason' || G.day < JUNE15)) return 'signed as a free agent this winter, so they can\'t be traded until June 15';
  if (p.drafted === G.year && G.phase !== 'offseason') return 'drafted this year, so they can\'t be traded until after the World Series';
  return null;
}
const needsOK = p => !!(p.ntc || p.tenFive);
const protTag = p => p.ntc ? 'no-trade clause' : '10-and-5 rights';
function consent(p, dest) {
  const key = G.year + (G.phase === 'offseason' ? 'w' + G.week : 'd' + Math.floor(G.day / 7));
  if (p.ok && p.ok.k === key) return p.ok.v;
  const strong = dest === ME ? metsRatings().exp >= 87 : teamMode(dest) === 'contender';
  const v = Math.random() < (strong ? .55 : .2) + (p.age >= 33 ? .1 : 0);
  p.ok = { k: key, v }; return v;
}
function coreIds(team) { return roster(team).map(p => [p.id, tradeVal(p, team)]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]); }
function poolCheck(team, send, get) {
  const out = send.filter(a => a.startsWith('i:')).length * POOL_STEP, inn = get.filter(a => a.startsWith('i:')).length * POOL_STEP, me = poolOf(ME), them = poolOf(team);
  if (out > me.left + 1e-9) return `The ${TEAM.name} only have ${money(me.left)} of international pool space left.`;
  if (inn > them.left + 1e-9) return `The ${G.teams[team].name} only have ${money(them.left)} of pool space left.`;
  if (me.got + inn > me.base * .6 + 1e-9) return `Teams can add only 60% of their pool by trade. The ${TEAM.name} can take ${money(Math.max(0, me.base * .6 - me.got))} more.`;
  if (them.got + out > them.base * .6 + 1e-9) return `The ${G.teams[team].name} can only take ${money(Math.max(0, them.base * .6 - them.got))} more pool space.`;
  return null;
}
const cashVal = (team, cash) => (cash || 0) * ({ rebuild: 1.15, contender: .85 }[teamMode(team)] || 1);
const assetVal = (a, view, retain) => a.startsWith('p:') ? tradeVal(P(+a.slice(2)), view, retain) : a.startsWith('i:') ? POOL_STEP * POOL_VAL : pickValue(G.picks.find(k => k.id === a.slice(2)));
function evalTrade(team, send, get, retain = 0, cash = 0, theirRet = 0) {
  const core = coreIds(team), reb = teamMode(team) === 'rebuild';
  const valOf = (a, side) => { let v = assetVal(a, team, side === 'send' ? retain : theirRet); const i = a.startsWith('p:') ? core.indexOf(+a.slice(2)) : -1; if (side === 'get' && i >= 0 && v > 0) v *= reb ? [1.15, 1.05][i] : [1.4, 1.2][i]; return v; };
  const vs = send.reduce((s, a) => s + valOf(a, 'send'), 0) + cashVal(team, cash), vg = get.reduce((s, a) => s + valOf(a, 'get'), 0);
  const need = vg + Math.max(2, Math.abs(vg) * .05), score = clamp((vs - need) / (Math.abs(vg) + 20), -1, 1);
  const players = [...send, ...get].filter(a => a.startsWith('p:')).map(a => P(+a.slice(2)));
  const blocks = players.map(p => { const w = tradeBlock(p); return w ? `${p.name} was ${w}.` : null; }).filter(Boolean);
  const pc = poolCheck(team, send, get); if (pc) blocks.push(pc);
  const picks = [...send, ...get].filter(a => a.startsWith('k:')).map(a => G.picks.find(k => k.id === a.slice(2)));
  if (picks.some(k => !tradeablePick(k))) blocks.push('Only Competitive Balance picks can be traded, and only once.');
  if (cash > CASH_MAX) blocks.push(`Cash in one deal is capped at ${money(CASH_MAX)} here.`);
  const ok = (send.length > 0 || cash > 0) && get.length > 0 && vs >= need && !blocks.length;
  const consents = players.filter(needsOK);
  const trueS = send.reduce((s, a) => s + assetVal(a, null, retain), 0) + cash, trueG = get.reduce((s, a) => s + assetVal(a, null, theirRet), 0);
  const dump = get.some(a => a.startsWith('p:') && P(+a.slice(2)).level !== 'FARM' && assetVal(a, team, 0) < -5);
  let label = score >= .5 ? 'Their GM is already on the phone with the press.' : score >= 0 ? 'They would take this deal.' : score >= -.15 ? 'So close. A sweetener gets it done.' : score >= -.4 ? 'Warming up, but not there.' : score >= -.7 ? 'A polite no. A very polite no.' : 'They put you on speakerphone so the office could laugh.';
  if (blocks.length) label = blocks[0]; else if (ok && consents.length) label += ` ${consents.map(p => p.name).join(' and ')} must approve it (${consents.map(protTag).join(', ')}).`;
  return { vs: Math.round(vs * 10) / 10, vg: Math.round(vg * 10) / 10, score, ok, label, blocks, consents, dump, fleece: ok && trueG > trueS * 1.12 && trueG > 40 };
}
function doTrade(team, send, get, retain = 0, cash = 0, theirRet = 0) {
  const ev = evalTrade(team, send, get, retain, cash, theirRet); if (!ev.ok || !tradeOpen()) return null;
  for (const p of ev.consents) { if (!consent(p, p.team === ME ? team : ME)) { addNews(`${p.name} used their ${protTag(p)} to block a trade to ${p.team === ME ? 'the ' + G.teams[team].name : TEAM.city}.`); return { refused: p }; } }
  const inPl = [], outPl = [], me = poolOf(ME), them = poolOf(team);
  send.forEach(a => {
    if (a.startsWith('p:')) { const p = P(+a.slice(2)); outPl.push(p); if (retain && p.sal > 0) { G.dead.push({ label: `${p.name} retained salary`, amt: Math.round(p.sal * retain * 100) / 100, from: G.year, thru: G.year + p.yrs - 1 }); p.sal = Math.round(p.sal * (1 - retain) * 100) / 100; } p.team = team; p.level = p.level === 'FARM' ? 'FARM' : 'MLB'; delete p.s; p.inj = null; }
    else if (a.startsWith('i:')) { me.left -= POOL_STEP; them.left += POOL_STEP; them.got += POOL_STEP; }
    else { const k = G.picks.find(k => k.id === a.slice(2)); k.owner = team; k.traded = true; }
  });
  get.forEach(a => {
    if (a.startsWith('p:')) { const p = P(+a.slice(2)); inPl.push(p); if (theirRet && p.sal > 0 && p.level !== 'FARM') p.sal = Math.round(p.sal * (1 - theirRet) * 100) / 100; p.team = ME; p.level = p.level === 'FARM' ? 'FARM' : 'MLB'; p.s = blankS(); }
    else if (a.startsWith('i:')) { them.left -= POOL_STEP; me.left += POOL_STEP; me.got += POOL_STEP; }
    else { const k = G.picks.find(k => k.id === a.slice(2)); k.owner = ME; k.traded = true; }
  });
  if (cash > 0) G.dead.push({ label: `Cash to the ${G.teams[team].name}`, amt: cash, from: G.year, thru: G.year });
  G.inbox = G.inbox.filter(x => x.send.concat(x.get).every(a => { if (a.startsWith('i:')) return true; if (!a.startsWith('p:')) { const k = G.picks.find(z => z.id === a.slice(2)); return k && !k.traded && (x.send.includes(a) ? k.owner === ME : k.owner === x.team); } const p = P(+a.slice(2)); return p && (x.send.includes(a) ? p.team === ME : p.team === x.team); }));
  const notes = rebalance(); inPl.forEach(autoAddToLineup); repair(); refreshTeams();
  const star = inPl.slice().sort((a, b) => b.ovr - a.ovr)[0], gone = outPl.slice().sort((a, b) => b.ovr - a.ovr)[0];
  if (star && star.ovr >= 70) award('blockbuster'); if (ev.fleece) award('fleece'); if (cash > 0 || ev.dump) award('sponge'); if (G.phase === 'season' && G.day >= DEADLINE - 14) award('deadline');
  const extra = (arr, side) => { const n = arr.filter(a => a.startsWith('i:')).length, k = arr.filter(a => a.startsWith('k:')).length; return [k ? `${k} Competitive Balance pick${k > 1 ? 's' : ''}` : '', n ? `${money(n * POOL_STEP)} in international pool space` : ''].filter(Boolean); };
  const gets = inPl.map(p => p.name).concat(extra(get)), gives = outPl.map(p => p.name).concat(extra(send));
  const desc = `${TEAM.name} get ${gets.join(', ') || 'future considerations'} from the ${G.teams[team].name}${gives.length ? ` for ${gives.join(', ')}` : ''}${cash ? `${gives.length ? ' and' : ' for'} ${money(cash)} in cash` : ''}${theirRet ? `. The ${G.teams[team].name} keep ${theirRet * 100}% of the salary` : ''}.`;
  headline('trade', star ? star.name : gone ? gone.name : null, desc); addNews('TRADE: ' + desc); notes.forEach(addNews);
  adj({ fans: star ? clamp((star.ovr - (gone ? gone.ovr : 45)) * .5, -6, 8) : 0 }); sayRadio('trade');
  return ev;
}
const tradeOpen = () => G.phase === 'offseason' || (G.phase === 'season' && G.day < DEADLINE);
function maybeOffer(pr) {
  if (Math.random() > pr || G.inbox.length >= 3 || !tradeOpen()) return;
  const ai = pick(Object.keys(G.teams).filter(t => t !== ME)), core = coreIds(ai);
  const mine = roster().filter(p => p.ovr >= 44 && p.ovr <= 68 && !tradeBlock(p) && !needsOK(p) && tradeVal(p, ai) > 10);
  if (!mine.length) return; const want = pick(mine), wv = tradeVal(want, ai);
  const theirs = roster(ai).filter(p => !core.includes(p.id) && !tradeBlock(p) && !needsOK(p)).map(p => [p, tradeVal(p, ai)]).filter(([, v]) => v > 0 && v <= (wv - 2.5) * .95).sort((a, b) => b[1] - a[1])[0];
  if (!theirs) return;
  G.inbox.push({ id: G.tick++, team: ai, send: ['p:' + want.id], get: ['p:' + theirs[0].id], line: pick(['We like your guy. Here is our offer.', 'Hear me out before you hang up.', 'Our analytics department got excited.', 'One phone call. Could change both our seasons.']) });
}
function aiDeal() {
  const others = Object.keys(G.teams).filter(a => a !== ME), sellers = others.filter(sellerOf), buyers = others.filter(a => teamMode(a) === 'contender');
  if (!sellers.length || !buyers.length) return;
  const s = pick(sellers), b = pick(buyers), core = coreIds(s);
  const vet = roster(s).filter(p => p.level !== 'FARM' && (p.age >= 29 || p.yrs <= 1) && p.ovr >= 52 && !core.includes(p.id) && !tradeBlock(p) && !needsOK(p)).sort((x, y) => y.ovr - x.ovr)[0]; if (!vet) return;
  const kids = roster(b).filter(p => p.age <= 25 && p.pot >= p.ovr + 4 && !tradeBlock(p) && !coreIds(b).includes(p.id)).sort((x, y) => y.pot - x.pot), kid = kids[Math.min(kids.length - 1, ri(1, 3))];
  vet.team = b; vet.inj = null; if (kid) kid.team = s; refreshTeams();
  addNews(`Trade wire: the ${G.teams[b].name} land ${vet.name} from the ${G.teams[s].name}${kid ? ` for prospect ${kid.name}` : ' for prospects'}.`);
}
/* The trade block: who sellers are shopping, plus contracts any club would pay to move. */
function wcGB(a) { const t = G.teams[a], lg = Object.values(G.teams).filter(x => x.lg === t.lg).sort((x, y) => (y.w - y.l) - (x.w - x.l)), line = lg[5]; return Math.max(0, ((line.w - line.l) - (t.w - t.l)) / 2); }
function sellerOf(a) { if (a === ME) return false; if (teamMode(a) === 'rebuild') return true; return G.phase === 'season' && G.day >= 45 && wcGB(a) >= 6; }
function onTheBlock() {
  const out = [];
  Object.keys(G.teams).forEach(a => {
    if (a === ME) return; const sell = sellerOf(a), core = coreIds(a);
    roster(a).forEach(p => {
      if (p.level === 'FARM' || core.includes(p.id) || tradeBlock(p) || p.ovr < 46) return;
      const v = tradeVal(p, a); let why = null;
      if (v < -6 && p.sal >= 8 && p.yrs >= 1) why = 'dump';
      else if (sell && p.yrs <= 1 && p.ovr >= 48 && p.age >= 25) why = 'rental';
      else if (sell && p.age >= 29 && p.ovr >= 52 && p.yrs <= 3) why = 'vet';
      if (why) out.push({ p, a, why, v, gb: G.phase === 'season' ? wcGB(a) : null });
    });
  });
  return out.sort((x, y) => y.p.ovr - x.p.ovr);
}
/* Rival farms keep moving: promotions, call-ups, and new signings so every system stays stocked. */
function aiFarms() {
  const bar = { DSL: 27, FCL: 31, A: 35, 'A+': 39, AA: 43 };
  Object.keys(G.teams).forEach(a => {
    if (a === ME) return;
    roster(a).filter(p => p.level === 'FARM').forEach(p => { const k = affOf(p), i = AFF_ORDER.indexOf(k); if (i > 0 && p.ovr >= bar[k]) p.aff = AFF_ORDER[i - 1]; if (p.ovr >= 50 || (p.ovr >= 47 && p.age >= 25)) { p.level = 'MLB'; p.sal = .8; p.yrs = 6; p.ctype = 'pre'; } });
    for (let n = roster(a).filter(p => p.level === 'FARM').length; n < AI_FARM - 4; n++) makeProspect('FARM', ri(17, 22), ri(24, 38), ri(42, 64), a);
    const big = roster(a).filter(p => p.level !== 'FARM').sort((x, y) => x.ovr - y.ovr);
    while (big.length > 44) { const p = big.shift(); if (p.ovr >= 46 && p.age < 36) { p.team = 'FA'; p.yrs = 0; p.sal = 0; p.ask = genAsk(p); p.heat = ri(0, 3); } else delete G.players[p.id]; }
  });
}

/* ---------- season and playoffs ---------- */
function startSeason() {
  G.phase = 'season'; G.day = 0; G.log = []; G.rotIdx = 0; G.clutchCD = 5; G.inbox = G.inbox.slice(0, 2);
  Object.values(G.teams).forEach(t => { t.w = t.l = t.rs = t.ra = t.st = 0; t.form = gauss() * 3.5; });
  roster().forEach(p => { p.s = blankS(); });
  const n = rebalance(); n.forEach(addNews); refreshTeams();
  const m = metsRatings(); G.expect = m.exp; G.rivalW = 0;
  setBack('PLAY BALL!', `Opening Day at ${TEAM.park}. The projection says ${m.exp} wins. ${VOICE()} says zero.`, `${G.year} season`);
  addNews(`Opening Day ${G.year}. Projected wins: ${m.exp}.`);
}
function divStandings(lg, div) { return Object.values(G.teams).filter(t => t.lg === lg && t.div === div).sort((a, b) => (b.w - b.l) - (a.w - a.l) || (b.rs - b.ra) - (a.rs - a.ra)); }
function seeds(lg) {
  const wins = ['East', 'Central', 'West'].map(d => divStandings(lg, d)[0]).sort((a, b) => b.w - a.w || (b.rs - b.ra) - (a.rs - a.ra));
  const others = Object.values(G.teams).filter(t => t.lg === lg && !wins.includes(t)).sort((a, b) => b.w - a.w || (b.rs - b.ra) - (a.rs - a.ra)).slice(0, 3);
  return [...wins, ...others].map(t => t.abbr);
}
function endRegular() {
  const t = G.teams[ME]; G.phase = 'playoffs';
  G.po = { round: 0, seeds: { AL: seeds('AL'), NL: seeds('NL') }, series: [], past: [], champ: null };
  refreshTeams(); buildRound();
  const inPO = G.po.seeds[MY_LG].includes(ME);
  if (t.w >= 90) award('ninety'); if (t.w >= 100) award('hundred');
  if (divStandings(MY_LG, MY_DIV)[0].abbr === ME) { award('division'); addNews(`The ${TEAM.name} are ${MY_LG} ${MY_DIV} champions!`); }
  if (inPO) { award('playoffs'); if (payroll() < CBT_LINE) award('thrift'); setBack(`OCTOBER IN ${TEAM.city.toUpperCase()}`, `The ${t.w}-${t.l} ${TEAM.name} are in as the No. ${G.po.seeds[MY_LG].indexOf(ME) + 1} seed.`, 'Postseason'); adj({ fans: 8 }); sayRadio('great'); }
  else { headline('miss', null, `The ${TEAM.name} finish ${t.w}-${t.l} and miss the playoffs.`); while (G.phase === 'playoffs' && !G.po.champ) poAdvance(); }
}
function mkSeries(a, b, need, lg) { return { a, b, need, wa: 0, wb: 0, lg, w: null }; }
function buildRound() {
  const po = G.po, r = po.round, S = [];
  const prev = po.past[r - 1] || [];
  ['AL', 'NL'].forEach(lg => {
    const s = po.seeds[lg], pv = prev.filter(x => x.lg === lg);
    if (r === 0) { S.push(mkSeries(s[2], s[5], 2, lg)); S.push(mkSeries(s[3], s[4], 2, lg)); }
    if (r === 1) { S.push(mkSeries(s[0], pv[1].w, 3, lg)); S.push(mkSeries(s[1], pv[0].w, 3, lg)); }
    if (r === 2) { const [x, y] = [pv[0].w, pv[1].w]; const hi = s.indexOf(x) < s.indexOf(y); S.push(mkSeries(hi ? x : y, hi ? y : x, 4, lg)); }
  });
  if (r === 3) { const al = prev.find(x => x.lg === 'AL').w, nl = prev.find(x => x.lg === 'NL').w; S.push(mkSeries(G.teams[al].w >= G.teams[nl].w ? al : nl, G.teams[al].w >= G.teams[nl].w ? nl : al, 4, 'WS')); }
  po.series = S;
}
const metsSeries = () => G.po && G.po.series.find(s => !s.w && (s.a === ME || s.b === ME));
function poGameDone(g) {
  const s = metsSeries(); if (!s) return;
  const metsA = s.a === ME, won = g.us > g.them;
  if (won === metsA) s.wa++; else s.wb++;
  if (s.wa >= s.need) s.w = s.a; if (s.wb >= s.need) s.w = s.b;
  G.po.lastLine = `Game ${s.wa + s.wb}: ${won ? TEAM.name + ' win' : TEAM.name + ' lose'} ${g.us}-${g.them} vs ${G.teams[g.opp].name}`; addNews(G.po.lastLine + '.');
  if (s.w) {
    if (s.w === ME) { if (G.po.round === 2) award('pennant'); setBack(G.po.round === 3 ? 'WORLD CHAMPS!' : 'ON TO THE NEXT ROUND', `The ${TEAM.name} beat the ${G.teams[g.opp].name} ${Math.max(s.wa, s.wb)}-${Math.min(s.wa, s.wb)}.`, 'Postseason'); adj({ fans: 6 }); sayRadio('great'); }
    else { setBack('WAIT TIL NEXT YEAR', `The ${G.teams[g.opp].name} end the ${TEAM.name} season.`, 'Postseason'); sayRadio('bad'); }
    settleRound();
  }
}
function simSeries(s) { while (!s.w) { const hHome = (s.wa + s.wb) % 2 === 0; const r = hHome ? aiGame(s.a, s.b) : aiGame(s.b, s.a); const aWin = hHome ? r.hr > r.ar : r.ar > r.hr; if (aWin) s.wa++; else s.wb++; if (s.wa >= s.need) s.w = s.a; if (s.wb >= s.need) s.w = s.b; } }
function settleRound() {
  const po = G.po; if (metsSeries()) return;
  po.series.filter(s => !s.w).forEach(simSeries);
  po.past[po.round] = po.series;
  if (po.round === 3) { po.champ = po.series[0].w; finishPostseason(); return; }
  po.round++; buildRound();
}
function poAdvance() {
  if (G.phase !== 'playoffs' || G.pending || G.live || G.review) return;
  const s = metsSeries();
  if (!s) return settleRound();
  const opp = s.a === ME ? s.b : s.a, gn = s.wa + s.wb, topHome = [0, 1, 5, 6].includes(gn) || s.need === 2;
  const g = playMetsGame(opp, s.a === ME ? topHome : !topHome, true);
  if (g.clutch) { G.pending = g; return; }
  finishMetsGame(g);
}
function finishPostseason() {
  const t = G.teams[ME], po = G.po, O = OWNERS[G.owner];
  const roundsWon = po.past.filter(r => r && r.some(s => s.w === ME)).length, made = po.seeds[MY_LG].includes(ME), champ = po.champ === ME;
  const result = champ ? 'World Series champions' : !made ? 'Missed playoffs' : ['Lost Wild Card', 'Lost Division Series', 'Lost ' + MY_LG + 'CS', 'Lost World Series'][Math.min(3, roundsWon)];
  if (champ) { G.titles++; award('champ'); if (G.titles >= 2) award('dynasty'); headline('champ', null, `The ${G.year} ${TEAM.name} are World Series champions. ${ME === 'BOS' ? 'Start the duck boats.' : 'Plan the parade.'}`); adj({ fans: 30, curse: -25 }); }
  let dT = (t.w - (G.expect || 81)) * .7 + (made ? 6 : -6) + roundsWon * 3 + (champ ? 30 : 0) + (t.w >= 90 ? 4 : t.w < 72 ? -8 : 0);
  if (payroll() > O.cap) dT -= (payroll() - O.cap) * .12;
  if (dT < 0) dT /= O.patience;
  G.trust = clamp(Math.round(G.trust + dT), 0, 100);
  const rev = Math.round(10 + G.fans * .12 + roundsWon * 3 + (champ ? 8 : 0)); adj({ cash: rev });
  const grade = dT >= 25 ? 'A+' : dT >= 14 ? 'A' : dT >= 7 ? 'B' : dT >= 0 ? 'C' : dT >= -8 ? 'D' : 'F';
  const hitters = roster().filter(p => !isPit(p) && p.s && p.s.AB > 150).sort((a, b) => war(b) - war(a)), pitchers = roster().filter(p => isPit(p) && p.s && p.s.O > 90).sort((a, b) => war(b) - war(a));
  G.history.push({ year: G.year, w: t.w, l: t.l, result, payroll: Math.round(payroll()), grade, champ: G.teams[po.champ].name });
  G.review = { year: G.year, w: t.w, l: t.l, result, grade, dT: Math.round(dT), rev, champ: po.champ, mvp: hitters[0]?.id, cy: pitchers[0]?.id, finish: divStandings(MY_LG, MY_DIV).findIndex(x => x.abbr === ME) + 1 };
  if (G.trust <= 0) { G.fired = true; G.review.fired = true; }
  addNews(`${G.year} final: ${G.teams[po.champ].city} ${G.teams[po.champ].name} win the World Series.`);
}
function progress(p) {
  let d;
  if (p.age <= 22) d = ri(0, 5); else if (p.age <= 25) d = ri(-1, 4); else if (p.age <= 28) d = ri(-2, 2); else if (p.age <= 31) d = ri(-3, 1); else if (p.age <= 34) d = ri(-4, 1); else d = ri(-5, 0);
  if (p.team === ME && p.age <= 26 && G.dev) d += Math.random() < .35 * G.dev ? 1 : 0;
  if (p.ovr + d > p.pot && p.age <= 27) d = Math.max(0, p.pot - p.ovr) + (Math.random() < .12 ? 1 : 0);
  p.ovr = clamp(p.ovr + d, 20, 80); p.pot = clamp(Math.max(p.ovr, p.age < 27 ? p.pot + ri(-2, 2) : p.ovr), 20, 80);
  ['con', 'pow', 'eye', 'spd', 'fld', 'stf', 'ctl'].forEach(k => { if (p[k] != null) p[k] = clamp(p[k] + d + ri(-1, 1) - (k === 'spd' && p.age > 29 ? 1 : 0), 20, 80); });
  p.age++;
}
function beginOffseason() {
  if (!G.review || G.fired) return;
  G.year++; G.phase = 'offseason'; G.week = 1; G.po = null; G.review = null; G.pending = null; G.log = []; G.day = 0; G.used = G.used.slice(-6);
  const expiring = [];
  Object.values(G.players).forEach(p => {
    progress(p); p.inj = null;
    if (p.team === 'FA') { if (p.age >= 38 || p.ovr < 40 || Math.random() < .2) delete G.players[p.id]; else { p.ask = genAsk(p); p.heat = ri(0, 4); } return; }
    if (p.level === 'FARM') { p.yrs--; if (p.yrs <= 0) { if (p.age >= 30 || (p.pot < 44 && p.age >= 25)) { delete G.players[p.id]; return; } p.yrs = p.age <= 23 ? 3 : 1; } return; }
    p.yrs--;
    if (p.ctype === 'pre' && p.yrs <= 3) { p.ctype = 'arb'; }
    if (p.ctype === 'arb' && p.yrs > 0) p.sal = Math.round(Math.max(p.sal, marketAAV(p.ovr) * (p.yrs >= 3 ? .25 : p.yrs === 2 ? .42 : .65)) * 100) / 100;
    if (p.yrs <= 0) {
      if (p.age >= 40 || (p.age >= 37 && p.ovr < 48)) { addNews(`${p.name} retires after a fine career.`); delete G.players[p.id]; return; }
      if (p.team === ME) { expiring.push(p); p.team = 'FA'; p.exMet = true; p.ask = genAsk(p); p.ask.aav = Math.round(p.ask.aav * .95 * 10) / 10; p.heat = ri(1, 5); p.s = undefined; p.level = 'MLB'; }
      else if (p.ovr < 45 || Math.random() < .72) { const a = genAsk(p); p.yrs = a.yrs; p.sal = a.aav; p.ctype = 'g'; }
      else { p.team = 'FA'; p.ask = genAsk(p); p.heat = ri(1, 6); }
    }
  });
  G.dead = G.dead.filter(x => x.thru >= G.year);
  G.picks = G.picks.filter(k => k.year >= G.year); seedPicks(G.year + 1);
  Object.values(G.teams).forEach(t => { const pace = (t.w - 81) * .6; t.wv = t.wv * .35 + pace * .45 + gauss() * 2; const a = aiTotals(t.abbr); t.h0 = a.h; t.p0 = a.p; });
  farmMoves(); aiFarms();
  if (fortyMan().length > 40) rebalance();
  const notes = rebalance(); repair(); autoLineup(); autoPitching(); refreshTeams();
  if (expiring.length) addNews(`Expiring deals: ${expiring.slice(0, 5).map(p => p.name).join(', ')}${expiring.length > 5 ? ' and more' : ''} hit the market. They give the ${TEAM.name} a hometown discount.`);
  notes.slice(0, 2).forEach(addNews);
  setBack('THE HOT STOVE IS ON', `Free agency opens for ${G.year}. The phones are ringing at ${TEAM.park}.`, 'Offseason');
  maybePhone(.5); sayRadio();
}
const r5Dec = () => G.phase === 'offseason' ? G.year - 1 : G.year;
const r5Elig = p => p.team === ME && p.level === 'FARM' && p.r5 != null && p.r5 <= r5Dec();
function rule5Draft() {
  const el = roster().filter(r5Elig).sort((a, b) => (b.pot + (b.pr ? 8 : 0)) - (a.pot + (a.pr ? 8 : 0))), taken = [];
  el.forEach(p => { if (taken.length >= 3) return; const ch = p.pot < 47 && !p.pr ? 0 : clamp((p.pot - 46) * .03 + (p.ovr - 40) * .015 + (p.pr ? .06 : 0), 0, .3); if (Math.random() < ch) { const t = pick(Object.keys(G.teams).filter(x => x !== ME)); p.team = t; p.level = 'MLB'; p.sal = 0.8; p.yrs = 6; p.ctype = 'pre'; taken.push([p, t]); } });
  G.r5Done = G.year - 1; G.cash = Math.round((G.cash + taken.length * .1) * 100) / 100;
  if (taken.length) { const who = taken.map(([p, t]) => `${p.name} (${G.teams[t].name})`).join(', '); setBack('RULE 5 RAID', `${who} ${taken.length > 1 ? 'were' : 'was'} taken in the Rule 5 draft. The ${TEAM.name} get $100K per player.`, 'Winter meetings'); addNews(`Rule 5 draft: lost ${who}.`); adj({ fans: -2 * taken.length }); }
  else { addNews(`Rule 5 draft: nobody took a ${TEAM.name} prospect. ${el.length} eligible players went unpicked.`); award('rule5'); }
  return taken;
}
function farmMoves() {
  const bar = { DSL: 27, FCL: 31, A: 35, 'A+': 39, AA: 43 }, up = [];
  roster().filter(p => p.level === 'FARM').forEach(p => { const a = affOf(p), i = AFF_ORDER.indexOf(a); if (i > 0 && p.ovr >= bar[a]) { p.aff = AFF_ORDER[i - 1]; up.push(p); } });
  up.sort((a, b) => b.pot - a.pot).slice(0, 3).forEach(p => addNews(`Farm report: ${p.name} moves up to ${AFF[p.aff].n}.`));
  const pool = poolOf(ME), n = clamp(Math.round(2 + pool.left / .8), 2, 14), cls = [];
  for (let i = 0; i < n; i++) cls.push(makeProspect('FARM', ri(16, 17), ri(22, 30), ri(40, clamp(Math.round(48 + pool.left * 2.2), 44, 70))));
  const star = cls.sort((a, b) => b.pot - a.pot)[0]; if (star) addNews(`International signing day: the ${TEAM.name} sign ${n} teenagers, led by ${star.name} (${star.pos}).`);
  Object.keys(G.teams).forEach(a => { const x = poolOf(a); x.left = x.base; x.got = 0; });
}
function moveAff(p, dir) {
  if (p.level !== 'FARM') return null; const i = AFF_ORDER.indexOf(affOf(p)), a = AFF_ORDER[i + dir]; if (!a) return null; p.aff = a; return AFF[a].n;
}
function promote(p, level) {
  if (level === 'MLB' && p.drafted) award('homegrown');
  if (level === 'AAA' && p.level === 'FARM' && fortyMan().length >= 40) { const d = roster().filter(x => x.level === 'AAA' && x.id !== p.id).sort((a, b) => (a.ovr + a.pot * .3) - (b.ovr + b.pot * .3))[0]; if (d) { d.level = 'FARM'; d.aff = 'AAA'; addNews(`${d.name} outrighted off the 40-man.`); } }
  p.level = level; const n = level === 'MLB' ? (() => { const a = active(); if (a.length > 26) { const locked = new Set([...G.lineup.map(s => s.id), ...G.rotation, p.id]); const d = a.filter(x => !locked.has(x.id) && isPit(x) === isPit(p)).sort(rankBench).pop() || a.filter(x => !locked.has(x.id)).sort(rankBench).pop(); if (d) { d.level = 'AAA'; return [`${d.name} optioned to ${AFF.AAA.n} to make room`]; } } return []; })() : [];
  const m = rebalance(); return n.concat(m);
}
function releasePlayer(p) {
  if (p.sal > 1 && p.yrs > 0) G.dead.push({ label: `${p.name} released`, amt: p.sal, from: G.year, thru: G.year + p.yrs - 1 });
  p.team = 'FA'; p.yrs = 0; p.sal = 0; p.ask = { yrs: 1, aav: Math.max(.8, Math.round(marketAAV(p.ovr) * .6 * 10) / 10) }; p.heat = ri(0, 3); delete p.s; p.level = 'MLB'; p.inj = null;
  const n = rebalance(); addNews(`${p.name} has been released.`); adj({ fans: p.ovr >= 55 ? -4 : 0 }); return n;
}
/* Saves leave out text that never changes (bios, stat lines) and put it back from the roster data on load. */
const STATIC = ['lines', 'from', 'draft', 'acq', 'note', 'l26'];
function serialize() { return JSON.stringify(G, function (k, v) { return this && this.src && STATIC.includes(k) ? undefined : v; }); }
function restore(s) {
  G = typeof s === 'string' ? JSON.parse(s) : s; setTeam(G.me || 'BOS'); G.me = ME;
  Object.values(G.players || {}).forEach(p => {
    if (!p.src) return; const [a, i] = p.src.split(':'), r = ORGS[a] && ORGS[a][+i]; if (!r) return; const o = unpackRow(r);
    if (p.lines === undefined) p.lines = o.lines; if (p.l26 === undefined) p.l26 = o.l26 || (o.lines || [])[0]; if (p.from === undefined) p.from = o.from_; if (p.draft === undefined) p.draft = o.draft; if (p.acq === undefined) p.acq = o.acq; if (p.note === undefined) p.note = o.note;
  });
  return G;
}
