/* Live games: every plate appearance simulated, with manager moves, box scores and win probability. No DOM in this file. */

const innOrd = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const hashN = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const srand = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const HIT_EVS = { '1B': 1, '2B': 2, '3B': 3, HR: 4 };
const sn = id => { const p = P(id); return p ? lastName(p.name) : 'Runner'; };

/* ---------- who plays ---------- */
function aiStaff(abbr) {
  const ps = roster(abbr).filter(p => isPit(p) && p.level === 'MLB' && !p.inj);
  const sp = ps.filter(p => p.pos === 'SP').sort((a, b) => b.ovr - a.ovr), rp = ps.filter(p => p.pos === 'RP').sort((a, b) => b.ovr - a.ovr);
  const rot = sp.slice(0, 5); while (rot.length < 5 && rp.length > 3) rot.push(rp.pop());
  return { rot, pen: rp.concat(sp.slice(5)) };
}
function aiOrder(abbr) {
  const hs = roster(abbr).filter(p => !isPit(p) && p.level === 'MLB' && !p.inj), used = new Set(), out = [];
  ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B'].forEach(pos => { const c = hs.filter(p => !used.has(p.id)).sort((a, b) => effOvr(b, pos) - effOvr(a, pos))[0]; if (c) { used.add(c.id); out.push({ id: c.id, pos }); } });
  const dh = hs.filter(p => !used.has(p.id)).sort((a, b) => b.ovr - a.ovr)[0]; if (dh) { used.add(dh.id); out.push({ id: dh.id, pos: 'DH' }); }
  out.sort((a, b) => P(b.id).ovr - P(a.id).ovr);
  const obp = x => P(x.id).con + P(x.id).eye + P(x.id).spd * .5, lead = out.slice(0, 5).sort((a, b) => obp(b) - obp(a))[0];
  return { order: lead ? [lead, ...out.filter(x => x !== lead)] : out, bench: hs.filter(p => !used.has(p.id)).map(p => p.id) };
}
function poGameNo() { const s = metsSeries(); return s ? s.wa + s.wb + (G.po ? G.po.round * 3 : 0) : 0; }
function probable(abbr, po) {
  if (abbr === ME) { const rot = healthyRotation(); return rot[(G.rotIdx || 0) % Math.max(1, rot.length)] || null; }
  const { rot } = aiStaff(abbr); if (!rot.length) return null;
  return po ? rot[poGameNo() % Math.min(4, rot.length)] : rot[(G.day + hashN(abbr)) % rot.length];
}
function teamFld(T) { const f = T.order.filter(s => s.pos !== 'DH').map(s => { const p = P(s.id); return (p.fld || 45) - (effOvr(p, s.pos) < p.ovr - 5 ? 6 : 0); }); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 50; }
let LMU = null;
function leagueMu() {
  const key = G.year + G.phase; if (LMU && LMU.key === key) return LMU.mu;
  const h = { con: 0, pow: 0, eye: 0, spd: 0, fld: 0 }, p = { stf: 0, ctl: 0 }; let nh = 0, wp = 0;
  Object.keys(G.teams).forEach(t => {
    const hs = t === ME ? gameLineup().map(x => x.p).filter(Boolean) : aiOrder(t).order.map(x => P(x.id));
    hs.forEach(x => { Object.keys(h).forEach(k => { h[k] += x[k] || 50; }); nh++; });
    const st = t === ME ? { rot: healthyRotation(), pen: healthyPen() } : aiStaff(t);
    st.rot.slice(0, 5).forEach(x => { p.stf += x.stf * .12; p.ctl += x.ctl * .12; wp += .12; });
    st.pen.slice(0, 7).forEach(x => { p.stf += x.stf * .057; p.ctl += x.ctl * .057; wp += .057; });
  });
  const mu = {}; Object.keys(h).forEach(k => { mu[k] = h[k] / Math.max(1, nh); }); Object.keys(p).forEach(k => { mu[k] = p[k] / Math.max(1e-6, wp); });
  LMU = { key, mu }; return mu;
}
function isTired(p) { const a = p.app, cur = (G.gameNo || 0) + 1; return !!a && a.n === cur - 1 && (a.pc >= 25 || a.streak >= 2); }
function newPS(side, st, lead, p) { return { side, st, pc: 0, bf: 0, bfS: 0, o: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0, lead, tired: side === 'us' && isTired(p) }; }

function liveTeam(abbr, po) {
  if (abbr === ME) {
    const order = gameLineup().filter(x => x.p).map(x => ({ id: x.p.id, pos: x.pos })), inO = new Set(order.map(x => x.id));
    const rot = healthyRotation(); G.rotIdx = (G.rotIdx || 0) % Math.max(1, rot.length); const st = rot[G.rotIdx] || rot[0]; G.rotIdx++;
    return { abbr, order, idx: 0, bench: active().filter(p => !isPit(p) && !inO.has(p.id)).map(p => p.id), pen: healthyPen().filter(p => p.id !== st.id).map(p => p.id), pit: st.id, st: st.id, used: [st.id], out: [], hook: gauss() * 5 };
  }
  const o = aiOrder(abbr), s = aiStaff(abbr), st = probable(abbr, po) || s.rot[0] || s.pen[0];
  return { abbr, order: o.order, idx: 0, bench: o.bench, pen: s.pen.filter(p => p.id !== st.id).map(p => p.id), pit: st.id, st: st.id, used: [st.id], out: [], hook: gauss() * 5 };
}
function liveNew(opp, home, po) {
  const L = { v: 1, opp, home, po: !!po, inn: 1, top: true, outs: 0, bases: [null, null, null], score: { us: 0, them: 0 }, ls: { us: [], them: [] }, hits: { us: 0, them: 0 }, err: { us: 0, them: 0 },
    T: { us: liveTeam(ME, po), them: liveTeam(opp, po) }, pst: {}, bl: {}, log: [], wp: [], asked: {}, prompt: null, over: false, halfPA: 0, halfRuns: 0, goA: null, mu: leagueMu(),
    boost: (G.buffG > 0 ? G.buff * 2 : 0) - (G.curse - 30) * .03, user: { bat: 0, pit: 0 }, gameNo: (G.gameNo || 0) + 1 };
  ['us', 'them'].forEach(s => { const T = L.T[s]; T.fld = teamFld(T); L.pst[T.pit] = newPS(s, true, 0, P(T.pit)); });
  const m = metsRatings(), o = G.teams[opp], hm = home ? m : o, aw = home ? o : m;
  const lh = Math.max(2, hm.off * aw.def / LG_RPG + .1), la = Math.max(2, aw.off * hm.def / LG_RPG - .05), py = Math.pow(lh, 1.83) / (Math.pow(lh, 1.83) + Math.pow(la, 1.83));
  L.str = Math.log(py / (1 - py));
  L.ls[home ? 'them' : 'us'][0] = 0;
  plog(L, `${home ? `${G.teams[opp].city} ${G.teams[opp].name} at ${TEAM.name}` : `${TEAM.name} at ${G.teams[opp].city} ${G.teams[opp].name}`}. ${P(L.T.us.st).name} starts for ${TEAM.city}. ${P(L.T.them.st).name} goes for ${G.teams[opp].name}.`, 'info');
  plog(L, 'Top of the 1st', 'inn');
  L.wp.push([Math.round(wpUs(L) * 1000) / 10, L.log.length - 1]);
  return L;
}

/* ---------- state helpers ---------- */
const batSide = L => L.top !== L.home ? 'us' : 'them';
const fldSide = L => L.top !== L.home ? 'them' : 'us';
const homeSide = L => L.home ? 'us' : 'them';
const lead4 = (L, s) => s === 'us' ? L.score.us - L.score.them : L.score.them - L.score.us;
const slotOf = L => { const T = L.T[batSide(L)]; return T.order[T.idx % T.order.length]; };
const curB = L => P(slotOf(L).id);
const curP = L => P(L.T[fldSide(L)].pit);
const onDeck = L => { const T = L.T[batSide(L)]; return P(T.order[(T.idx + 1) % T.order.length].id); };
function line(L, id, side) { return L.bl[id] || (L.bl[id] = { side, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, k: 0, r: 0, rbi: 0, sb: 0, cs: 0 }); }
function plog(L, s, k = 'play') { L.log.push({ i: L.inn, t: L.top ? 1 : 0, s, k }); }
const scoreLine = L => { const u = L.score.us, t = L.score.them, a = ME, b = L.opp; return u === t ? `Tied ${u}-${t}` : u > t ? `${a} ${u}, ${b} ${t}` : `${b} ${t}, ${a} ${u}`; };
const halfName = L => `${L.top ? 'Top' : 'Bottom'} of the ${innOrd(L.inn)}`;

/* ---------- plate appearance model ---------- */
const EVS = ['K', 'BB', 'HBP', 'HR', '3B', '2B', '1B', 'GO', 'FO', 'LO', 'PO'];
function pLimit(p, ps) { return ps.st ? 62 + ((p.stm || 50) - 20) * .7 : 16 + Math.max(0, (p.stm || 22) - 20) * .6; }
function fatigue(p, ps) { return Math.max(0, ps.pc - pLimit(p, ps)) / 20; }
function plat(h, p) { return h.b === 'S' ? 1 : h.b === p.t ? -2.2 : 1.4; }
function paDist(L, h, p, mods) {
  const mu = L.mu, bs = batSide(L), fs = fldSide(L), ps = L.pst[p.id] || newPS(fs, false, 0, p), fat = fatigue(p, ps), tired = ps.tired ? 1 : 0;
  const tto = ps.st ? Math.max(0, Math.floor(ps.bf / 9) - 1) * 1.6 : 0, up = plat(h, p) + tto + (bs === homeSide(L) ? 1.9 : -.4) + (bs === 'us' ? L.boost : 0) + ((mods && mods.up) || 0);
  const dc = h.con - mu.con + up, dp = h.pow - mu.pow + up * .8, de = h.eye - mu.eye + up * .5, sp = (h.spd || 50) - mu.spd;
  const ds = p.stf - mu.stf - fat * 7 - tired * 4, dl = p.ctl - mu.ctl - fat * 7 - tired * 3, df = L.T[fs].fld - mu.fld;
  const k = clamp(.211 * Math.exp(-.021 * dc + .021 * ds), .07, .42), bb = clamp(.078 * Math.exp(.024 * de - .023 * dl), .03, .19), hbp = .011;
  const hr = clamp(.0288 * Math.exp(.037 * dp - .013 * ds), .004, .085), bip = Math.max(.2, 1 - k - bb - hbp - hr);
  const babip = clamp(.293 + .0016 * dc + .0007 * sp - .0009 * ds - .0011 * df, .22, .36), hits = bip * babip, outs = bip - hits;
  const t3 = clamp(.022 + .0011 * sp, .004, .06), d2 = clamp(.215 + .0028 * dp + .0007 * sp, .12, .32);
  const go = clamp(.47 - .004 * dp, .3, .6), fo = clamp(.32 + .004 * dp, .2, .45), lo = .12, po = Math.max(.04, 1 - go - fo - lo);
  return [k, bb, hbp, hr, hits * t3, hits * d2, hits * (1 - t3 - d2), outs * go, outs * fo, outs * lo, outs * po];
}
function simPA(L) {
  const d = paDist(L, curB(L), curP(L)), tot = d.reduce((a, b) => a + b, 0); let r = Math.random() * tot;
  for (let i = 0; i < d.length; i++) { r -= d[i]; if (r <= 0) return { ev: EVS[i], deep: EVS[i] === 'FO' && Math.random() < .35 }; }
  return { ev: 'GO' };
}
const PC_BASE = { K: 4.8, BB: 5.7, HBP: 3.3, HR: 3.4, '3B': 3.5, '2B': 3.5, '1B': 3.5, GO: 3.4, FO: 3.5, LO: 3.4, PO: 3.2, E: 3.4, SH: 1.8 };
const pcFor = ev => ev === 'IBB' ? 0 : Math.max(ev === 'K' ? 3 : ev === 'BB' ? 4 : 1, Math.round((PC_BASE[ev] || 3.5) + gauss() * 1.25));

/* Pure baserunning: B is [1st, 2nd, 3rd] runners ({id, spd, rp}); returns new bases, runners who scored, outs made. */
function resolveBases(ev, B, outs, run, deep) {
  const nb = [null, null, null], sc = []; let o = 0, rbi = true, dp = false, sf = false, fc = null;
  const sp = r => (r && r.spd) || 50;
  switch (ev) {
    case 'HR': [2, 1, 0].forEach(i => B[i] && sc.push(B[i])); sc.push(run); break;
    case '3B': [2, 1, 0].forEach(i => B[i] && sc.push(B[i])); nb[2] = run; break;
    case '2B': if (B[2]) sc.push(B[2]); if (B[1]) sc.push(B[1]); if (B[0]) { if (Math.random() < clamp(.42 + (sp(B[0]) - 50) * .012 + (outs === 2 ? .22 : 0), .15, .9)) sc.push(B[0]); else nb[2] = B[0]; } nb[1] = run; break;
    case '1B': if (B[2]) sc.push(B[2]); if (B[1]) { if (Math.random() < clamp(.58 + (sp(B[1]) - 50) * .012 + (outs === 2 ? .25 : 0), .25, .95)) sc.push(B[1]); else nb[2] = B[1]; }
      if (B[0]) { if (!nb[2] && Math.random() < clamp(.26 + (sp(B[0]) - 50) * .01 + (outs === 2 ? .1 : 0), .05, .6)) nb[2] = B[0]; else nb[1] = B[0]; } nb[0] = run; break;
    case 'BB': case 'HBP': case 'IBB': nb[0] = run; nb[1] = B[1]; nb[2] = B[2]; if (B[0]) { nb[1] = B[0]; if (B[1]) { nb[2] = B[1]; if (B[2]) sc.push(B[2]); } } break;
    case 'E': nb[0] = run; nb[1] = B[0]; nb[2] = B[1]; if (B[2]) sc.push(B[2]); rbi = false; break;
    case 'K': case 'LO': case 'PO': o = 1; nb[0] = B[0]; nb[1] = B[1]; nb[2] = B[2]; break;
    case 'FO': o = 1; nb[0] = B[0]; nb[1] = B[1]; nb[2] = B[2];
      if (outs < 2) { if (B[2] && Math.random() < clamp(.55 + (sp(B[2]) - 50) * .012 + (deep ? .3 : 0), .25, .97)) { sc.push(B[2]); nb[2] = null; sf = true; } if (B[1] && !nb[2] && Math.random() < .25 + (deep ? .3 : 0)) { nb[2] = B[1]; nb[1] = null; } }
      break;
    case 'GO':
      if (outs < 2 && B[0] && Math.random() < clamp(.42 - (sp(run) - 50) * .009, .18, .62)) {
        dp = true; o = 2; rbi = false; if (outs === 0) { if (B[2]) sc.push(B[2]); if (B[1]) nb[2] = B[1]; }
      } else if (B[0] && Math.random() < .45) {
        o = 1; fc = B[0]; nb[0] = run; if (B[1]) { nb[2] = B[1]; if (B[2]) sc.push(B[2]); } else if (B[2]) { if (Math.random() < .5) sc.push(B[2]); else nb[2] = B[2]; }
      } else {
        o = 1; if (B[0]) nb[1] = B[0];
        if (B[1]) { if (B[0] || Math.random() < .6) nb[2] = B[1]; else nb[1] = B[1]; }
        if (B[2]) { if ((B[0] && B[1]) || nb[2] || Math.random() < .55) sc.push(B[2]); else nb[2] = B[2]; }
      }
      break;
    case 'SH': {
      const r = Math.random(), hit = clamp(.08 + (sp(run) - 50) * .004, .03, .18);
      if (r < hit) { nb[0] = run; nb[1] = B[0]; nb[2] = B[1] || B[2]; if (B[1] && B[2]) sc.push(B[2]); }
      else if (r < hit + .18 && (B[0] || B[1])) { o = 1; fc = B[1] || B[0]; nb[0] = run; nb[2] = B[2]; if (fc === B[1]) nb[1] = B[0]; }
      else { o = 1; nb[1] = B[0]; if (B[1]) { nb[2] = B[1]; if (B[2]) sc.push(B[2]); } else nb[2] = B[2]; }
      break;
    }
  }
  if (outs + o >= 3) sc.length = 0;
  return { nb, sc, o, rbi, dp, sf, fc };
}

/* ---------- applying a plate appearance ---------- */
function applyPA(L, res) {
  const bs = batSide(L), fs = fldSide(L), T = L.T[bs], b = curB(L), p = curP(L), ps = L.pst[p.id], bl = line(L, b.id, bs), hs = homeSide(L);
  let ev = res.ev; if (ev === 'GO' && !res.mini && Math.random() < .014) ev = 'E';
  const before = lead4(L, 'us'), startOuts = L.outs, B = L.bases;
  ps.pc += res.pc != null ? res.pc : pcFor(ev); ps.bf++; ps.bfS++; L.halfPA++;
  const R = resolveBases(ev, B, startOuts, { id: b.id, spd: b.spd || 50, rp: p.id }, res.deep);
  let sc = R.sc;
  if (bs === hs && L.inn >= 9 && ev !== 'HR') { const need = L.score[fs] - L.score[bs] + 1; if (need > 0 && sc.length > need) sc = sc.slice(0, need); }
  L.bases = R.nb; L.outs += R.o; ps.o += Math.min(R.o, 3 - startOuts);
  bl.pa++; if (['BB', 'HBP', 'IBB'].includes(ev)) { bl.bb++; ps.bb++; } else if (ev !== 'SH' && !R.sf) bl.ab++;
  if (HIT_EVS[ev]) { bl.h++; ps.h++; L.hits[bs]++; if (ev === '2B') bl.d++; if (ev === '3B') bl.t++; if (ev === 'HR') { bl.hr++; ps.hr++; } }
  if (ev === 'K') { bl.k++; ps.k++; } if (ev === 'E') L.err[fs]++;
  sc.forEach(r => { line(L, r.id, bs).r++; const rp = L.pst[r.rp]; if (rp) { rp.r++; if (ev !== 'E' && !r.ghost) rp.er++; } });
  if (R.rbi) bl.rbi += sc.length;
  L.score[bs] += sc.length; L.ls[bs][L.inn - 1] = (L.ls[bs][L.inn - 1] || 0) + sc.length; L.halfRuns += sc.length;
  const after = lead4(L, 'us');
  if (sc.length && Math.sign(after) !== Math.sign(before) && after !== 0) {
    const ldr = after > 0 ? 'us' : 'them', trail = ldr === 'us' ? 'them' : 'us', needed = (ldr === bs ? Math.abs(before) + 1 : 0);
    const goRun = sc[Math.max(0, Math.min(sc.length - 1, needed - 1))];
    L.goA = { side: ldr, w: L.T[ldr].pit, l: goRun && goRun.rp && L.pst[goRun.rp] && L.pst[goRun.rp].side === trail ? goRun.rp : L.T[trail].pit };
  }
  const text = pbp(L, ev, b, p, R, sc, res), li = L.log.length;
  plog(L, text, ev === 'HR' ? 'hr' : sc.length ? 'run' : R.o ? 'out' : 'on');
  if (sc.length) plog(L, scoreLine(L), 'score');
  T.idx++;
  if (bs === hs && L.inn >= 9 && L.score[bs] > L.score[fs]) { L.walkoff = { id: b.id, ev, n: sc.length, slam: ev === 'HR' && sc.length === 4 }; gameOver(L); }
  else if (L.outs >= 3) endHalf(L);
  L.wp.push([Math.round(wpUs(L) * 1000) / 10, li]);
  return { ev, sc: sc.length, text };
}
function endHalf(L) {
  const hs = homeSide(L), as = hs === 'us' ? 'them' : 'us', bs = batSide(L);
  L.ls[bs][L.inn - 1] = L.ls[bs][L.inn - 1] || 0;
  L.bases = [null, null, null]; L.outs = 0; L.halfPA = 0; L.halfRuns = 0;
  if (L.top) { if (L.inn >= 9 && L.score[hs] > L.score[as]) return gameOver(L); L.top = false; }
  else { if (L.inn >= 9 && L.score[hs] !== L.score[as]) return gameOver(L); L.inn++; L.top = true; }
  if (L.inn > 30) { L.score[Math.random() < .5 ? 'us' : 'them']++; return gameOver(L); }
  const nb = batSide(L); L.ls[nb][L.inn - 1] = 0;
  plog(L, halfName(L), 'inn');
  if (L.inn >= 10) { const T = L.T[nb], g = T.order[(T.idx + T.order.length - 1) % T.order.length]; L.bases[1] = { id: g.id, spd: P(g.id).spd || 50, rp: L.T[fldSide(L)].pit, ghost: true }; plog(L, `${P(g.id).name} starts the inning on second base.`, 'info'); }
}
function gameOver(L) {
  L.over = true; L.prompt = null;
  const win = L.score.us > L.score.them ? 'us' : 'them', lose = win === 'us' ? 'them' : 'us', T = L.T[win];
  let w = L.goA && L.goA.side === win ? L.goA.w : T.st, l = L.goA && L.goA.side === win ? L.goA.l : L.T[lose].st;
  if (w === T.st && (L.pst[w] ? L.pst[w].o : 0) < 15 && T.used.length > 1) { const rel = T.used.slice(1).map(id => [id, L.pst[id]]).filter(x => x[1]).sort((a, b) => (b[1].o - b[1].r * 4) - (a[1].o - a[1].r * 4))[0]; if (rel) w = rel[0]; }
  const last = T.pit, lp = L.pst[last]; let sv = null;
  if (last !== w && lp && !lp.st && ((lp.lead >= 1 && lp.lead <= 3 && lp.o >= 1) || lp.o >= 9)) sv = last;
  L.dec = { w, l, sv };
  plog(L, `Final: ${scoreLine(L)}.`, 'final');
}

/* ---------- managers ---------- */
function pickReliever(L, side) {
  const T = L.T[side], lead = lead4(L, side), inn = L.inn, rank = id => T.pen.indexOf(id);
  const avail = T.pen.filter(id => !T.used.includes(id)).map(P).filter(p => p && !p.inj); if (!avail.length) return null;
  const fresh = avail.filter(p => side !== 'us' || !isTired(p)), pool = (fresh.length ? fresh : avail).sort((a, b) => rank(a.id) - rank(b.id));
  if ((inn >= 9 && lead >= 0 && lead <= 3) || (inn >= 10 && Math.abs(lead) <= 2)) return pool[0];
  if (inn >= 7 && Math.abs(lead) <= 3) return pool.find(p => rank(p.id) >= 1 && rank(p.id) <= 4) || pool[pool.length - 1];
  const low = pool.filter(p => rank(p.id) >= 3); return low.length ? (inn <= 5 ? low[low.length - 1] : low[0]) : pool[pool.length - 1];
}
function canPull(L, side) { const ps = L.pst[L.T[side].pit]; return L.halfPA === 0 || ps.bfS >= 3; }
function wantChange(L, side) {
  const T = L.T[side], p = P(T.pit), ps = L.pst[p.id], lim = pLimit(p, ps), lead = lead4(L, side), start = L.halfPA === 0;
  if (!canPull(L, side)) return null;
  let why = null;
  if (ps.st) {
    if (ps.pc >= lim + T.hook + (start ? 0 : 14)) why = `${lastName(p.name)} is at ${ps.pc} pitches`;
    else if (ps.r >= 6 || (ps.r >= 5 && L.halfRuns >= 2)) why = `${lastName(p.name)} has allowed ${ps.r} runs`;
    else if (L.inn >= 6 && L.halfRuns >= 2 && Math.abs(lead) <= 2 && ps.pc >= lim - 12 && !start) why = `${lastName(p.name)} is tiring in a close game`;
    else if (start && L.inn >= 8 && lead >= 1 && lead <= 3 && ps.pc >= lim - 10) why = `Late lead, and ${lastName(p.name)} has thrown ${ps.pc}`;
  } else {
    const longMan = (p.stm || 22) >= 40 && Math.abs(lead) >= 4;
    if (start && ps.o >= (longMan ? 6 : 3)) why = `${lastName(p.name)} already pitched ${longMan ? 'two innings' : 'an inning'}`;
    else if (ps.pc >= lim + 12) why = `${lastName(p.name)} is at ${ps.pc} pitches`;
    else if (!start && L.halfRuns >= 2 && ps.bfS >= 3 && Math.abs(lead) <= 3) why = `${lastName(p.name)} is getting hit`;
  }
  const closer = T.pen.find(id => !T.used.includes(id) && !(side === 'us' && isTired(P(id))));
  if (!why && start && L.inn >= 9 && lead >= 1 && lead <= 3 && closer && closer === T.pen[0] && T.pit !== closer && !ps.st) why = 'Save situation';
  if (!why && start && L.inn >= 9 && lead >= 1 && lead <= 3 && ps.st && closer === T.pen[0]) why = 'Save situation';
  if (!why) return null;
  const r = pickReliever(L, side); if (!r) return null;
  return { id: r.id, why, key: `pit-${T.pit}-${L.inn}-${L.top ? 1 : 0}` };
}
function doPitchChange(L, id) {
  const side = fldSide(L), T = L.T[side], old = P(T.pit), p = P(id); if (!p || T.used.includes(id)) return false;
  T.pit = id; T.used.push(id); L.pst[id] = newPS(side, false, lead4(L, side), p);
  plog(L, `Pitching change: ${p.name} replaces ${old.name}.`, 'sub'); return true;
}
const batVal = (h, p) => h.con * .4 + h.pow * .35 + h.eye * .25 + plat(h, p);
function coachPH(L) {
  if (L.inn < 7 || batSide(L) !== 'us') return null;
  const T = L.T.us, b = curB(L), p = curP(L), d = lead4(L, 'us'); if (d > 1 || d < -3 || (d < -1 && !L.bases.some(Boolean))) return null;
  const best = T.bench.map(P).filter(x => x && !x.inj).sort((x, y) => batVal(y, p) - batVal(x, p))[0];
  if (!best) return null; const gain = batVal(best, p) - batVal(b, p); if (gain < 4) return null;
  return { id: best.id, gain, big: gain >= 7, key: `ph-${b.id}-${L.inn}-${L.top ? 1 : 0}`, why: `${best.name} (${best.b === 'S' ? 'switch' : best.b === 'L' ? 'bats left' : 'bats right'}) is a better bet than ${b.name} against ${lastName(p.name)}.` };
}
function doPinchHit(L, id) {
  const T = L.T[batSide(L)], s = slotOf(L), old = P(s.id), p = P(id); if (!p || !T.bench.includes(id)) return false;
  T.bench = T.bench.filter(x => x !== id); T.out.push(old.id); L.posAt = L.posAt || {}; L.posAt[old.id] = s.pos; L.posAt[id] = 'PH-' + s.pos; s.id = id; T.fld = teamFld(T);
  plog(L, `Pinch-hitter ${p.name} bats for ${old.name}.`, 'sub'); return true;
}
function doPinchRun(L, base, id) {
  const T = L.T[batSide(L)], r = L.bases[base], p = P(id); if (!r || !p || !T.bench.includes(id)) return false;
  const s = T.order.find(x => x.id === r.id); if (!s) return false;
  T.bench = T.bench.filter(x => x !== id); T.out.push(r.id); L.posAt = L.posAt || {}; L.posAt[r.id] = L.posAt[r.id] || s.pos; L.posAt[id] = 'PR-' + s.pos; s.id = id; T.fld = teamFld(T); L.bases[base] = Object.assign({}, r, { id, spd: p.spd || 50 });
  plog(L, `${p.name} pinch-runs for ${P(r.id).name}.`, 'sub'); return true;
}
function stealOdds(L, base) { const r = L.bases[base]; return r ? clamp(.74 + ((r.spd || 50) - 50) * .011 - (base === 1 ? .07 : 0), .4, .94) : 0; }
function canSteal(L, base) { return !L.over && L.outs < 3 && !!L.bases[base] && !L.bases[base + 1] && base < 2; }
function doSteal(L, base) {
  if (!canSteal(L, base)) return false;
  const r = L.bases[base], bs = batSide(L), ok = Math.random() < stealOdds(L, base), to = base === 0 ? 'second' : 'third';
  L.bases[base] = null;
  if (ok) { L.bases[base + 1] = r; line(L, r.id, bs).sb++; plog(L, `${P(r.id).name} steals ${to}!`, 'on'); }
  else { line(L, r.id, bs).cs++; L.outs++; L.pst[curP(L).id].o++; plog(L, `${P(r.id).name} is caught stealing ${to}.`, 'out'); if (L.outs >= 3) endHalf(L); }
  L.wp.push([Math.round(wpUs(L) * 1000) / 10, L.log.length - 1]);
  return true;
}
function aiSteal(L, side) {
  if (Math.abs(lead4(L, side)) > 4 || (L.outs === 2 && Math.random() < .5)) return false;
  const r1 = L.bases[0], r2 = L.bases[1];
  if (r1 && !r2 && (r1.spd || 50) >= 45 && Math.random() < clamp(.05 + ((r1.spd || 50) - 45) * .009, 0, .32)) return doSteal(L, 0);
  if (r2 && !L.bases[2] && L.outs < 2 && (r2.spd || 50) >= 58 && Math.random() < .08) return doSteal(L, 1);
  return false;
}
function preAB(L, auto) {
  const fs = fldSide(L), bs = batSide(L);
  if (fs === 'them') { const c = wantChange(L, 'them'); if (c) doPitchChange(L, c.id); }
  else { const c = wantChange(L, 'us'); if (c) { if (auto) doPitchChange(L, c.id); else if (!L.asked[c.key]) { L.prompt = Object.assign({ t: 'pit' }, c); return 'prompt'; } } }
  if (bs === 'us') {
    const ph = coachPH(L);
    if (ph) { if (auto) { if (ph.big) doPinchHit(L, ph.id); } else if (!L.asked[ph.key]) { L.prompt = Object.assign({ t: 'ph' }, ph); return 'prompt'; } }
  }
  if (bs === 'them' || auto) { const h = L.inn * 2 + L.top; if (aiSteal(L, bs) && (L.over || L.inn * 2 + L.top !== h)) return 'half'; }
  return null;
}
function keyMoment(L) {
  if (L.over || L.inn < 7) return false; const d = lead4(L, batSide(L));
  return Math.abs(d) <= 2 && (d <= 0 || L.inn >= 9) && (!!(L.bases[1] || L.bases[2]) || (d >= -1 && !!L.bases[0]) || (L.inn >= 9 && d <= 0));
}

/* ---------- driving the game ---------- */
function livePA(L, auto, res) {
  if (L.over) return null; L.prompt = null;
  if (!res) { const r = preAB(L, auto); if (r) return r; }
  return applyPA(L, res || simPA(L));
}
function liveRun(L, mode) {
  if (mode === 'pa') return livePA(L, false);
  const h = L.inn * 2 + L.top; let n = 0;
  while (!L.over && n++ < 600) { livePA(L, true); if (mode === 'half' && L.inn * 2 + L.top !== h) break; }
  return null;
}
function liveStartDay() {
  if (G.phase !== 'season' || G.live || G.pending || G.phone != null || G.draft || G.day >= 162) return null;
  dayPairs(G.day).forEach(([h, a]) => { if (h === ME || a === ME) return; const r = aiGame(h, a); record(h, r.hr, r.ar); record(a, r.ar, r.hr); });
  const { opp, home } = metsMatch(G.day); G.live = liveNew(opp, home, false); return G.live;
}
function liveStartPO() {
  if (G.phase !== 'playoffs' || G.live || G.pending || G.review) return null;
  const s = metsSeries(); if (!s) return null;
  const opp = s.a === ME ? s.b : s.a, gn = s.wa + s.wb, topHome = [0, 1, 5, 6].includes(gn) || s.need === 2;
  G.live = liveNew(opp, s.a === ME ? topHome : !topHome, true); return G.live;
}

/* A clutch spot from a quick sim, rebuilt as a live game so it can be managed or simmed. */
function liveFromClutch(g) {
  const c = g.clutch, keepRot = G.rotIdx, L = liveNew(g.opp, g.home, g.po); G.rotIdx = keepRot;
  L.log.length = 0; L.wp.length = 0; L.fromClutch = c.kind; L.inn = 9; L.score = { us: g.us, them: g.them };
  const spread = (n, k) => { const a = Array(k).fill(0); for (let i = 0; i < n; i++) a[ri(0, k - 1)]++; return a; };
  if (c.kind === 'save') {
    L.top = g.home; // they bat: top of the 9th when you are home, bottom when you are away
    L.ls.us = spread(g.us, g.home ? 8 : 9); L.ls.them = spread(g.them, 8); L.ls.them[8] = 0;
    L.T.them.idx = ri(0, 8); plog(L, `${halfName(L)}. ${TEAM.city} leads ${g.us}-${g.them}. Three outs to go.`, 'inn');
    const cl = L.T.us.pen.find(id => !isTired(P(id))) || L.T.us.pen[0];
    if (cl) { L.T.us.used.push(cl); L.T.us.pit = cl; L.pst[cl] = newPS('us', false, lead4(L, 'us'), P(cl)); plog(L, `${P(cl).name} takes the mound for ${TEAM.city}.`, 'sub'); }
  } else {
    L.top = !g.home; L.outs = c.outs;
    L.ls.us = spread(g.us, 8); L.ls.us[8] = 0; L.ls.them = spread(g.them, g.home ? 9 : 8);
    const T = L.T.us, start = T.order.findIndex(s => s.id === c.order[0]); T.idx = start >= 0 ? start : 0;
    const cl = L.T.them.pen[0];
    if (cl) { L.T.them.used.push(cl); L.T.them.pit = cl; L.pst[cl] = newPS('them', false, lead4(L, 'them'), P(cl)); L.pst[cl].pc = ri(12, 22); L.pst[cl].bfS = 3; }
    let k = 1; [2, 1, 0].forEach(i => { if (c.bases[i]) { const id = T.order[(T.idx - k++ + T.order.length * 3) % T.order.length].id; L.bases[i] = { id, spd: P(id).spd || 50, rp: L.T.them.pit }; } });
    const on = L.bases.filter(Boolean).length;
    plog(L, `${halfName(L)}, ${c.outs} out${c.outs === 1 ? "" : "s"}. ${TEAM.city} trails ${g.them}-${g.us} with ${on === 3 ? 'the bases loaded' : on === 2 ? 'two on' : 'a runner on'}.`, 'inn');
    if (cl) plog(L, `${P(cl).name} is on the mound for ${G.teams[g.opp].name}.`, 'info');
  }
  L.halfPA = 0; L.wp.push([Math.round(wpUs(L) * 1000) / 10, L.log.length - 1]);
  L.g = { opp: g.opp, home: g.home, st: g.st, po: g.po };
  return L;
}
function clutchSetup(g) {
  const d = g.them - g.us, L = gameLineup(), start = ri(0, 8);
  if (d < 0) return { kind: 'save', lead: -d };
  const bases = d === 1 ? [true, true, false] : [true, true, true];
  return { kind: 'rally', deficit: d, bases, outs: d === 3 ? 2 : 1, order: L.slice(start).concat(L.slice(0, start)).map(x => x.p.id) };
}

/* ---------- finishing ---------- */
function liveFinish() {
  const L = G.live; if (!L || !L.over) return null;
  const won = L.score.us > L.score.them;
  const g = Object.assign({ opp: L.opp, home: L.home, us: L.score.us, them: L.score.them, st: L.T.us.st, po: L.po, live: true }, L.g || {});
  g.us = L.score.us; g.them = L.score.them;
  if (!L.fromClutch) { g.box = L; if (G.buffG > 0) G.buffG--; }
  G.live = null;
  const sum = liveSummary(L);
  if (won) {
    G.liveWins = (G.liveWins || 0) + 1; if (G.liveWins >= 10) award('skipper');
    if (L.walkoff || L.fromClutch === 'rally') {
      G.clutchWins++; award('walkoff'); if (L.walkoff && L.walkoff.slam) award('salami'); if (G.clutchWins >= 5) award('ko');
      const h = L.walkoff ? P(L.walkoff.id) : null; adj({ fans: g.po ? 6 : 3, trust: 1, curse: -2 });
      if (h) headline('walkoff', h.name, `${h.name} ends it and the ${TEAM.name} beat the ${G.teams[L.opp].name} ${g.us}-${g.them}.`);
      else headline('walkoff', null, `The ${TEAM.name} rally in the ninth and beat the ${G.teams[L.opp].name} ${g.us}-${g.them}.`);
      if (!L.walkoff && /WALK-OFF/.test((G.back || {}).head || '')) G.back.head = 'NINTH-INNING MAGIC';
      sayRadio('great');
    }
    if (L.userSave && L.dec && L.dec.sv) award('lightsout');
    if (L.fromClutch === 'save') adj({ fans: 1 });
  } else if (L.fromClutch === 'save') { adj({ fans: -2 }); headline('choke', null, `The ${G.teams[L.opp].name} rally in the ninth and beat the ${TEAM.name} ${g.them}-${g.us}.`); }
  else if (L.fromClutch === 'rally') { adj({ fans: -1 }); if (g.po) headline('choke', null, `The rally dies with the tying run on base against the ${G.teams[L.opp].name}.`); }
  G.lastLive = sum;
  finishMetsGame(g);
  delete g.box;
  if (!L.fromClutch) Object.entries(L.bl).forEach(([id, l]) => { if (l.side === 'us' && l.h - l.d - l.t - l.hr > 0 && l.d && l.t && l.hr) award('cycle'); });
  if (G.phase === 'season') endDay();
  return sum;
}
function applyLiveBox(g) {
  const L = g.box, n = G.gameNo || 0;
  Object.entries(L.bl).forEach(([id, l]) => { if (l.side !== 'us') return; const p = P(+id); if (!p) return; const s = p.s || (p.s = blankS()); s.G++; s.AB += l.ab; s.H += l.h; s.D += l.d + l.t; s.HR += l.hr; s.BB += l.bb; s.K += l.k; s.R += l.r; s.RBI += l.rbi; s.SB += l.sb; });
  Object.entries(L.pst).forEach(([id, ps]) => {
    if (ps.side !== 'us') return; const p = P(+id); if (!p) return; const s = p.s || (p.s = blankS());
    s.G++; if (ps.st) s.GS++; s.O += ps.o; s.ER += ps.er; s.PK += ps.k; s.PBB += ps.bb; s.PH += ps.h;
    if (L.dec.w === +id) s.W++; if (L.dec.l === +id) s.L++; if (L.dec.sv === +id) s.SV++;
    if (!ps.st) p.app = { n, pc: ps.pc, streak: p.app && p.app.n === n - 1 ? (p.app.streak || 1) + 1 : 1 };
  });
  const hero = Object.entries(L.bl).filter(([, l]) => l.side === 'us').sort((a, b) => (b[1].h + b[1].hr * 2 + b[1].rbi * .6) - (a[1].h + a[1].hr * 2 + a[1].rbi * .6))[0];
  g.hero = hero ? +hero[0] : null;
}
function liveBox(L) {
  const T = L.T.us, pa = L.posAt || {}, posOf = id => pa[id] || (T.order.find(x => x.id === id) || {}).pos || '';
  const bat = Object.entries(L.bl).filter(([, l]) => l.side === 'us').map(([id, l]) => [(P(+id) || {}).name || '?', posOf(+id), l.ab, l.r, l.h, l.rbi, l.bb, l.k, l.hr]);
  const pit = T.used.filter(id => L.pst[id]).map(id => { const s = L.pst[id], d = L.dec || {}; return [(P(id) || {}).name || '?', `${Math.floor(s.o / 3)}.${s.o % 3}`, s.h, s.r, s.er, s.bb, s.k, s.pc, d.w === id ? 'W' : d.l === id ? 'L' : d.sv === id ? 'SV' : '']; });
  return { bat, pit };
}
function liveSummary(L) {
  const nm = id => (P(id) || {}).name || '?';
  const stars = Object.entries(L.bl).filter(([, l]) => l.h || l.rbi || l.bb > 1).map(([id, l]) => ({ id: +id, side: l.side, l, v: l.h + l.hr * 2 + l.rbi * .6 + l.bb * .3 + l.sb * .3 })).sort((a, b) => b.v - a.v).slice(0, 4)
    .map(x => `${nm(x.id)} (${x.side === 'us' ? ME : L.opp}): ${x.l.h}-for-${x.l.ab}${x.l.hr ? `, ${x.l.hr > 1 ? x.l.hr + ' HR' : 'HR'}` : x.l.d + x.l.t ? `, ${x.l.d + x.l.t} XBH` : ''}${x.l.rbi ? `, ${x.l.rbi} RBI` : ''}${x.l.sb ? `, ${x.l.sb} SB` : ''}`);
  const arm = Object.entries(L.pst).filter(([, s]) => s.st || s.o >= 6).map(([id, s]) => `${nm(+id)} (${s.side === 'us' ? ME : L.opp}): ${Math.floor(s.o / 3)}.${s.o % 3} IP, ${s.h} H, ${s.er} ER, ${s.k} K, ${s.pc} pitches`);
  return { opp: L.opp, home: L.home, po: L.po, us: L.score.us, them: L.score.them, ls: L.ls, hits: L.hits, err: L.err, inn: L.inn, wp: L.wp.map(x => x[0]), dec: L.dec ? { w: L.dec.w && nm(L.dec.w), l: L.dec.l && nm(L.dec.l), sv: L.dec.sv && nm(L.dec.sv) } : {}, stars, arm, big: L.log.filter(x => x.k === 'hr' || x.k === 'run').slice(-5).map(x => `${x.t ? 'T' : 'B'}${x.i}: ${x.s}`), clutch: L.fromClutch || null, walkoff: !!L.walkoff, d: dateStr(), box: L.fromClutch ? null : liveBox(L), wpT: L.wp.map(x => ((L.log[x[1]] || {}).s || '').slice(0, 90)), user: L.user };
}

/* ---------- win probability: Markov table for average clubs, tilted by team strength ---------- */
const WPT = (() => {
  let F = null, W = null, Wx = 0;
  const RMAX = 12, MASK = B => (B[0] ? 1 : 0) | (B[1] ? 2 : 0) | (B[2] ? 4 : 0);
  function build() {
    const avg = [.222, .084, .011, .03, 0, 0, 0, 0, 0, 0, 0], bip = 1 - .222 - .084 - .011 - .03, hits = bip * .293, outs = bip - hits;
    avg[4] = hits * .022; avg[5] = hits * .215; avg[6] = hits * (1 - .237); avg[7] = outs * .47; avg[8] = outs * .32; avg[9] = outs * .12; avg[10] = outs * .09;
    const N = 500, run = { spd: 50 }, trans = [];
    for (let o = 0; o < 3; o++) for (let b = 0; b < 8; b++) {
      const acc = {};
      EVS.forEach((ev, i) => { const n = ['2B', '1B', 'FO', 'GO'].includes(ev) ? N : 1; for (let k = 0; k < n; k++) { const B = [b & 1 ? run : null, b & 2 ? run : null, b & 4 ? run : null], R = resolveBases(ev, B, o, run, Math.random() < .35); const key = `${Math.min(3, o + R.o)}|${MASK(R.nb)}|${R.sc.length}`; acc[key] = (acc[key] || 0) + avg[i] / n; } });
      trans[o * 8 + b] = Object.entries(acc).map(([k, p]) => { const [o2, b2, r] = k.split('|').map(Number); return [o2, b2, r, p]; });
    }
    const Gm = {}, gk = (o, b, r) => o * 1000 + b * 100 + r, cnt = b => (b & 1) + (b >> 1 & 1) + (b >> 2 & 1), order = [0, 1, 2, 3, 4, 5, 6, 7].sort((x, y) => cnt(y) - cnt(x));
    for (let r = RMAX; r >= 0; r--) for (let o = 2; o >= 0; o--) for (const b of order) {
      const d = new Float64Array(RMAX + 1);
      trans[o * 8 + b].forEach(([o2, b2, rr, p]) => { const r2 = Math.min(RMAX, r + rr); if (o2 >= 3) d[r2] += p; else { const nx = Gm[gk(o2, b2, r2)]; if (nx) for (let i = 0; i <= RMAX; i++) d[i] += p * nx[i]; else d[r2] += p; } });
      Gm[gk(o, b, r)] = d;
    }
    F = []; for (let o = 0; o < 3; o++) for (let b = 0; b < 8; b++) F[o * 8 + b] = Gm[gk(o, b, 0)];
    const X = F[2], S = (D, k) => { let s = 0; for (let i = Math.max(0, k); i <= RMAX; i++) s += D[i]; return s; };
    let num = 0, tie = 0; for (let a = 0; a <= RMAX; a++) { num += X[a] * S(X, a + 1); tie += X[a] * X[a]; } Wx = num / (1 - tie);
    W = {};
    const A = F[0], D = 15, cl = d => Math.max(-D, Math.min(D, d));
    for (let inn = 10; inn >= 1; inn--) {
      const Dh = inn >= 10 ? X : A;
      const bot = d => { if (inn >= 9) { if (d > 0) return 1; return S(Dh, -d + 1) + (Dh[-d] || 0) * (inn >= 9 ? Wx : 0); } let s = 0; for (let r = 0; r <= RMAX; r++) s += Dh[r] * W[(inn + 1) + 't' + cl(d + r)]; return s; };
      for (let d = -D; d <= D; d++) W[inn + 'b' + d] = bot(d);
      for (let d = -D; d <= D; d++) { let s = 0; for (let r = 0; r <= RMAX; r++) s += Dh[r] * W[inn + 'b' + cl(d - r)]; W[inn + 't' + d] = s; }
    }
  }
  function home(inn, top, outs, B, d) {
    if (!F) build();
    const D = 15, cl = x => Math.max(-D, Math.min(D, x)), i = Math.min(10, inn), C = F[Math.min(2, outs) * 8 + MASK(B)];
    let s = 0;
    if (top) { for (let r = 0; r <= RMAX; r++) s += C[r] * W[i + 'b' + cl(d - r)]; return s; }
    if (inn >= 9) { if (d > 0) return 1; for (let r = 0; r <= RMAX; r++) s += C[r] * (d + r > 0 ? 1 : d + r === 0 ? Wx : 0); return s; }
    for (let r = 0; r <= RMAX; r++) s += C[r] * W[(i + 1) + 't' + cl(d + r)]; return s;
  }
  return { home, build };
})();
function wpUs(L) {
  if (L.over) return L.score.us > L.score.them ? 1 : 0;
  const hs = homeSide(L), d = L.score[hs] - L.score[hs === 'us' ? 'them' : 'us'];
  let w = clamp(WPT.home(L.inn, L.top, L.outs, L.bases, d), .0005, .9995);
  const outsLeft = Math.max(0, (9 - L.inn) * 6 + (L.top ? 6 : 3) - L.outs), frac = Math.max(.04, Math.min(1, outsLeft / 54));
  w = 1 / (1 + Math.exp(-(Math.log(w / (1 - w)) + (L.str || 0) * frac)));
  return hs === 'us' ? w : 1 - w;
}

/* ---------- play-by-play ---------- */
function pbp(L, ev, b, p, R, sc, res) {
  const B = lastName(b.name), bats = b.b === 'S' ? (p.t === 'R' ? 'L' : 'R') : b.b, pull = bats === 'L' ? 'right' : 'left', oppo = pull === 'left' ? 'right' : 'left';
  const fenway = (L.home ? ME : L.opp) === 'BOS', dir = res.dir || (Math.random() < .42 ? pull : Math.random() < .6 ? 'center' : oppo);
  const inf = dir === 'left' ? pick(['third', 'short']) : dir === 'right' ? pick(['first', 'second']) : pick(['short', 'second', 'the mound']);
  const ofd = dir === 'left' ? 'left' : dir === 'right' ? 'right' : 'center', gap = dir === 'right' ? 'right-center' : 'left-center';
  const who = sc.map(r => lastName(P(r.id).name)), runs = who.length ? ` ${who.join(' and ')} score${who.length > 1 ? '' : 's'}.` : '';
  const n = sc.length, slam = ev === 'HR' && n === 4;
  switch (ev) {
    case 'HR': {
      const kind = slam ? 'grand slam' : n === 1 ? 'solo homer' : `${['', '', 'two', 'three'][n]}-run homer`;
      if (res.txt) return `${B} ${res.txt}! A ${kind}.${n > 1 ? runs : ''}`;
      const spot = fenway && dir === 'left' ? pick(['over the Green Monster', 'onto Lansdowne Street', 'over the Monster seats']) : fenway && dir === 'right' && Math.random() < .3 ? "around Pesky's Pole" : pick([`deep to ${ofd}`, `into the ${ofd}-field seats`, `over the wall in ${ofd}`, `way out to ${ofd}`]);
      return `${slam ? 'GRAND SLAM! ' : ''}${B} hits a ${kind} ${spot}!${n > 1 && !slam ? runs : ''}`;
    }
    case '3B': return `${B} ${res.txt ? res.txt : `triples into the ${dir === 'center' ? 'triangle in center' : ofd + '-field corner'}`}.${runs}`;
    case '2B': return `${B} ${res.txt ? res.txt : fenway && dir === 'left' ? pick(['doubles off the Green Monster', 'bangs a double off the Wall']) : pick([`doubles into the ${gap} gap`, `doubles down the ${ofd}-field line`, `lines a double to ${ofd}`])}.${runs}`;
    case '1B': return `${B} ${res.txt ? res.txt : pick([`singles to ${ofd}`, `lines a single to ${ofd}`, `grounds a single past ${inf === 'the mound' ? 'the pitcher' : inf}`, `bloops a single into shallow ${ofd}`])}.${runs}`;
    case 'BB': return `${B} walks.${runs}`;
    case 'IBB': return `${B} is intentionally walked.${runs}`;
    case 'HBP': return `${B} is hit by a pitch.${runs}`;
    case 'E': return `${B} reaches on an error by the ${inf === 'the mound' ? 'pitcher' : inf === 'short' ? 'shortstop' : inf + ' baseman'}.${runs}`;
    case 'K': return `${B} ${Math.random() < .27 ? 'is called out on strikes' : 'strikes out swinging'}.`;
    case 'SH': return R.o && !R.fc ? `${B} lays down a sacrifice bunt.${runs}` : R.fc ? `${B} bunts, but the lead runner is cut down.` : `${B} beats out a bunt for a hit.${runs}`;
    case 'GO': return R.dp ? `${B} grounds into a double play.${runs}` : R.fc ? `${B} grounds to ${inf}. ${lastName(P(R.fc.id).name)} is forced out.${runs}` : `${B} grounds out to ${inf}.${runs}`;
    case 'FO': return R.sf ? `${B} hits a sacrifice fly to ${ofd}.${runs}` : `${B} ${res.txt || (res.deep ? `flies out to the warning track in ${ofd}` : `flies out to ${ofd}`)}.`;
    case 'LO': return `${B} lines out to ${Math.random() < .5 ? inf : ofd}.`;
    case 'PO': return `${B} pops out to ${inf === 'the mound' ? 'the catcher' : inf}.`;
  }
  return `${B}: ${ev}.`;
}
