/* Playable plate appearances. AtBat: you swing. Mound: you call and throw the pitches. Each returns one result to the live game. */
const PT = {
  FF: { n: '4-seam', fam: 'FB', dv: 0, hb: -6, vb: -10 }, SI: { n: 'Sinker', fam: 'FB', dv: -.8, hb: -17, vb: 12 }, FC: { n: 'Cutter', fam: 'FB', dv: -4.5, hb: 9, vb: 3 },
  SL: { n: 'Slider', fam: 'BR', dv: -8.5, hb: 21, vb: 15 }, ST: { n: 'Sweeper', fam: 'BR', dv: -11, hb: 37, vb: 9 }, CU: { n: 'Curveball', fam: 'BR', dv: -14, hb: 12, vb: 38 },
  CH: { n: 'Changeup', fam: 'OS', dv: -8.5, hb: -16, vb: 23 }, FS: { n: 'Splitter', fam: 'OS', dv: -7, hb: -6, vb: 31 }
};
const FAM_NAME = { any: 'Anything', FB: 'Fastball', BR: 'Breaking', OS: 'Offspeed' }, FAM_COLOR = { FB: '#f4f6fb', BR: '#6fd3ff', OS: '#ff8ad8' };
function arsenal(p) {
  const r = srand(hashN('ars' + p.id + p.name)), sp = p.pos === 'SP', velo = 92.6 + ((p.stf || 50) - 50) * .13 + (r() - .5) * 3;
  const fb = r() < .62 ? 'FF' : 'SI', brk = r() < .42 ? 'SL' : r() < .55 ? 'ST' : 'CU', list = [{ k: fb, use: sp ? .44 : .54 }, { k: brk, use: sp ? .25 : .34 }];
  if (sp || r() < .45) list.push({ k: r() < .62 ? 'CH' : 'FS', use: sp ? .17 : .14 });
  if (sp && r() < .55) list.push({ k: brk === 'CU' ? 'SL' : r() < .5 ? 'FC' : 'CU', use: .13 });
  return list.map(x => { const d = PT[x.k]; return Object.assign({}, d, { k: x.k, use: x.use, mph: Math.round((velo + d.dv + (r() - .5) * 1.6) * 10) / 10, q: clamp((p.stf || 50) + Math.round((r() - .5) * 12), 25, 80) }); });
}
const grade = q => q >= 66 ? 'A' : q >= 58 ? 'B+' : q >= 51 ? 'B' : q >= 44 ? 'C' : 'D';

/* ---------- shared: settings, sound, batted balls, the field ---------- */
const MINI_DIFF = { rookie: { t: 1.3, win: 1.42, r: 1.32, assist: .2, mark: true, meter: 1.35, sweet: 1.4, n: 'Easy' }, vet: { t: 1.08, win: 1.1, r: 1.08, assist: .08, mark: false, meter: 1, sweet: 1, n: 'Normal' }, star: { t: .92, win: .9, r: .92, assist: 0, mark: false, meter: .8, sweet: .78, n: 'Hard' } };
const miniPref = (() => { let v = null; return (set) => { if (!v) { v = { diff: 'rookie', sound: true }; try { Object.assign(v, JSON.parse(localStorage.getItem('fo30-mini') || '{}')); } catch (e) { } } if (set) { Object.assign(v, set); try { localStorage.setItem('fo30-mini', JSON.stringify(v)); } catch (e) { } } return v; }; })();
const Sfx = (() => {
  let ac = null;
  const ctx = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; } return ac; };
  function burst(freq, len, vol, q) {
    if (!miniPref().sound) return; const a = ctx(); if (!a) return;
    try { const n = Math.floor(a.sampleRate * len), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 5);
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol; s.buffer = buf; s.connect(f); f.connect(g); g.connect(a.destination); s.start(); } catch (e) { }
  }
  return { crack: p => burst(1500 + p * 1800, .13, .55, .8), mitt: () => burst(420, .07, .5, 1.4), foul: () => burst(900, .06, .35, 1) };
})();
const ZN = { x: 120, y: 118, w: 100, h: 124 };
const inZone = (x, y) => x >= ZN.x - 3 && x <= ZN.x + ZN.w + 3 && y >= ZN.y - 3 && y <= ZN.y + ZN.h + 3;
const outside = (x, y) => Math.hypot(Math.max(0, ZN.x - x, x - ZN.x - ZN.w), Math.max(0, ZN.y - y, y - ZN.y - ZN.h));
const edgeness = (x, y) => Math.max(Math.abs(x - ZN.x - ZN.w / 2) / (ZN.w / 2), Math.abs(y - ZN.y - ZN.h / 2) / (ZN.h / 2));
function fenceFt(a, fenway) {
  if (!fenway) return 400 - 70 * Math.pow(Math.abs(a) / 45, 1.4);
  if (a <= 0) return a < -12 ? 310 + (a + 45) / 33 * 69 : 379 + (a + 12) / 12 * 11;
  return a < 15 ? 390 + a / 15 * 30 : a < 25 ? 420 - (a - 15) / 10 * 40 : 380 - (a - 25) / 20 * 78;
}
const wallFt = (a, fenway) => fenway ? (a < -12 ? 37 : a <= 0 ? 17 : a > 40 ? 3 : 5) : 8;
function battedBall(EV, LA, a, fenway, spd = 50, easy = false) {
  const rad = Math.PI / 180, d = LA <= 0 ? 0 : (EV * EV / 24.5) * Math.pow(Math.sin(2 * Math.min(LA, 80) * rad), .55) * (1 - Math.max(0, LA - 35) / 100);
  const f = fenceFt(a, fenway), r = Math.random(), base = { d, a, EV: Math.round(EV), LA: Math.round(LA), dir: a < -15 ? 'left' : a > 15 ? 'right' : 'center' };
  if (LA >= 16 && LA <= 47 && d - f >= wallFt(a, fenway) * 1.1) return Object.assign(base, { ev: 'HR', txt: fenway && a < -12 ? pick(['launches one over the Green Monster', 'clears the Monster']) : fenway && a > 38 && f < 320 ? "wraps one around Pesky's Pole" : null });
  if (LA < 9) {
    const hp = clamp((easy ? .16 : .14) + (EV - 82) * .011 + (spd - 50) * .002, .05, .6);
    return Object.assign(base, { d: 70 + EV * .9, gb: true, ev: r < hp ? (EV > 98 && Math.abs(a) > 36 && Math.random() < .35 ? '2B' : '1B') : 'GO' });
  }
  if (LA < 22) {
    if (fenway && a < -12 && d >= f - 25) return Object.assign(base, { d: f, ev: r < .7 ? '2B' : '1B', txt: 'lines one off the Green Monster' });
    if (r < clamp((easy ? .62 : .6) + (EV - 92) * .016, .22, .92)) return Object.assign(base, { ev: d > 230 && Math.abs(a) > 10 && Math.abs(a) < 38 ? (Math.random() < .07 + (spd - 50) * .003 ? '3B' : Math.random() < .5 ? '2B' : '1B') : d > 260 ? '2B' : '1B' });
    return Object.assign(base, { ev: 'LO' });
  }
  if (LA <= 47) {
    if (fenway && a < -12 && d >= f - 10) return Object.assign(base, { d: f, ev: r < .75 ? '2B' : '1B', txt: pick(['bangs one off the Monster', 'hits one high off the Wall']) });
    if (d >= f - 12) return Object.assign(base, { deep: true, ev: r < .5 ? '2B' : r < .57 && spd > 55 ? '3B' : 'FO', txt: r >= .57 ? 'flies out to the warning track' : null });
    if (d < 175 && EV < 88) return Object.assign(base, { ev: r < .38 ? '1B' : 'FO', txt: r < .38 ? 'drops a bloop single in' : null });
    return Object.assign(base, { ev: 'FO', deep: d > 300 });
  }
  return Object.assign(base, { d: Math.max(60, d * .5), ev: 'PO' });
}
const EV_WORD = { '1B': 'Single!', '2B': 'Double!', '3B': 'Triple!', HR: 'Home run!', GO: 'Grounded out', FO: 'Flied out', LO: 'Lined out', PO: 'Popped up', K: 'Strikeout', BB: 'Ball four', HBP: 'Hit by pitch' };
function drawField(x, bb, t, fenway) {
  const W = 340, H = 340, hx = 170, hy = 322, s = .62, pt = (ft, a) => [hx + Math.sin(a * Math.PI / 180) * ft * s, hy - Math.cos(a * Math.PI / 180) * ft * s];
  x.fillStyle = '#0b1f3f'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1f6b44'; x.beginPath(); x.moveTo(hx, hy); for (let a = -45; a <= 45; a += 3) x.lineTo(...pt(fenceFt(a, fenway), a)); x.closePath(); x.fill();
  x.fillStyle = '#b8895a'; x.beginPath(); x.moveTo(hx, hy); x.lineTo(...pt(127, -45)); x.quadraticCurveTo(...pt(170, 0), ...pt(127, 45)); x.closePath(); x.fill();
  x.fillStyle = '#1f6b44'; x.beginPath(); x.moveTo(...pt(90, -45)); x.lineTo(...pt(127, 0)); x.lineTo(...pt(90, 45)); x.lineTo(hx, hy - 10); x.closePath(); x.fill();
  [[90, -45], [127, 0], [90, 45]].forEach(([d, a]) => { const [bx, by] = pt(d, a); x.fillStyle = '#fff'; x.fillRect(bx - 3, by - 3, 6, 6); });
  x.strokeStyle = '#ffffffaa'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(hx, hy); x.lineTo(...pt(fenceFt(-45, fenway), -45)); x.moveTo(hx, hy); x.lineTo(...pt(fenceFt(45, fenway), 45)); x.stroke();
  x.lineWidth = 4; x.strokeStyle = '#0e3b26'; x.beginPath(); for (let a = -45; a <= 45; a += 3) { const p = pt(fenceFt(a, fenway), a); a === -45 ? x.moveTo(...p) : x.lineTo(...p); } x.stroke();
  if (fenway) { x.lineWidth = 9; x.strokeStyle = '#2f8a57'; x.beginPath(); for (let a = -45; a <= -12; a += 3) { const p = pt(fenceFt(a, true) + 6, a); a === -45 ? x.moveTo(...p) : x.lineTo(...p); } x.stroke(); x.fillStyle = '#d9f5e4'; x.font = '700 11px Barlow Condensed, sans-serif'; x.fillText('THE MONSTER', 22, 118); }
  if (!bb) return;
  const e = Math.min(1, t), dist = bb.d * e, [bx, by] = pt(dist, bb.a), hgt = bb.gb ? 0 : Math.sin(Math.PI * e) * Math.min(1, bb.d / 250) * 26 * Math.max(.4, bb.LA / 35);
  x.strokeStyle = '#ffffff55'; x.setLineDash([3, 4]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(hx, hy); x.lineTo(bx, by); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#00000055'; x.beginPath(); x.arc(bx, by, 3, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(bx, by - hgt, 3 + hgt / 9, 0, 7); x.fill();
  if (t >= 1) { const hit = HIT_EVS[bb.ev]; x.font = '400 30px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.fillStyle = hit ? '#ffd34d' : '#ffffff'; x.fillText((EV_WORD[bb.ev] || bb.ev).toUpperCase(), 170, 40); x.font = '600 13px Barlow Condensed, sans-serif'; x.fillStyle = '#d6e0f5'; x.fillText(`${bb.EV} mph off the bat · ${bb.LA}° · ${Math.round(bb.d)} ft`, 170, 58); x.textAlign = 'left'; }
}
function scene(x, o, f) {
  const W = 340, H = 340, g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d2d5e'); g.addColorStop(.28, '#14406f'); g.addColorStop(.29, o.fenway ? '#1f5a3d' : '#1d6a44'); g.addColorStop(1, '#11462e'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  if (o.fenway) { x.fillStyle = '#2a7a50'; x.fillRect(0, 40, 64, 56); x.fillStyle = '#e9f7ee'; x.font = '700 9px Barlow Condensed, sans-serif'; x.fillText('AL EAST', 8, 56); x.fillText('B  O  S', 8, 70); }
  x.fillStyle = '#b58a56'; x.beginPath(); x.ellipse(170, 106, 44, 9, 0, 0, 7); x.fill();
  const lh = o.p.t === 'L'; x.fillStyle = '#e9edf5'; x.fillRect(165, 74, 10, 26); x.beginPath(); x.arc(170, 69, 6, 0, 7); x.fill(); x.fillRect(lh ? 158 : 175, 74 - (f != null && f < .05 ? 8 : 0), 7, 4);
  x.strokeStyle = '#ffffffcc'; x.lineWidth = 2; x.strokeRect(ZN.x, ZN.y, ZN.w, ZN.h);
  x.strokeStyle = '#ffffff22'; x.lineWidth = 1; for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(ZN.x + ZN.w * i / 3, ZN.y); x.lineTo(ZN.x + ZN.w * i / 3, ZN.y + ZN.h); x.moveTo(ZN.x, ZN.y + ZN.h * i / 3); x.lineTo(ZN.x + ZN.w, ZN.y + ZN.h * i / 3); x.stroke(); }
  x.fillStyle = '#f4f4f4'; x.beginPath(); x.moveTo(145, 304); x.lineTo(195, 304); x.lineTo(195, 315); x.lineTo(170, 330); x.lineTo(145, 315); x.closePath(); x.fill();
  const bats = o.b.b === 'S' ? (o.p.t === 'R' ? 'L' : 'R') : o.b.b, bx = bats === 'R' ? 78 : 262;
  x.fillStyle = '#071733cc'; x.beginPath(); x.arc(bx, 150, 13, 0, 7); x.fill(); x.fillRect(bx - 14, 163, 28, 92); x.fillRect(bx - 12, 255, 10, 50); x.fillRect(bx + 2, 255, 10, 50);
  x.strokeStyle = '#c9a26b'; x.lineWidth = 5; x.beginPath(); x.moveTo(bx + (bats === 'R' ? 8 : -8), 168); x.lineTo(bx + (bats === 'R' ? 26 : -26), 120); x.stroke();
  const bs = o.bases; [[306, 34, bs[0]], [282, 14, bs[1]], [258, 34, bs[2]]].forEach(([a, b, on]) => { x.save(); x.translate(a, b); x.rotate(Math.PI / 4); x.fillStyle = on ? '#e8394a' : '#ffffff33'; x.fillRect(-7, -7, 14, 14); x.restore(); });
}
function ballAt(pt, f, o) {
  const rx = o.p.t === 'L' ? 160 : 180, ry = 80, e = Math.pow(Math.min(f, 1.3), 1.6), gg = clamp((f - .35) / .65, 0, 1), g = Math.pow(gg * gg * (3 - 2 * gg), 1.4);
  return { x: rx + (pt.fx - pt.hb - rx) * e + pt.hb * g, y: ry + (pt.fy - pt.vb - ry) * e + pt.vb * g, r: 2.2 + 12 * Math.pow(Math.min(f, 1.2), 2) };
}
function drawBall(x, b) {
  x.fillStyle = '#00000044'; x.beginPath(); x.ellipse(b.x + 3, b.y + b.r + 3, b.r, b.r * .4, 0, 0, 7); x.fill();
  x.fillStyle = '#fbfbf7'; x.beginPath(); x.arc(b.x, b.y, b.r, 0, 7); x.fill();
  if (b.r > 6) { x.strokeStyle = '#d3323f'; x.lineWidth = 1.4; x.beginPath(); x.arc(b.x - b.r * .9, b.y, b.r * .75, -.9, .9); x.stroke(); x.beginPath(); x.arc(b.x + b.r * .9, b.y, b.r * .75, Math.PI - .9, Math.PI + .9); x.stroke(); }
}
const dots = (n, m, k) => Array.from({ length: m }, (_, i) => `<i class="dot ${i < n ? k : ''}"></i>`).join('');
const canvasPos = (cv, e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 340 / r.width, y: (e.clientY - r.top) * 340 / r.height }; };
function makePitch(a, tx, ty, ctl, fat, o) { const side = o.p.t === 'L' ? -1 : 1; return { k: a.k, n: a.n, fam: a.fam, q: a.q, mph: Math.round((a.mph + gauss() * .5 - fat * 1.2) * 10) / 10, hb: a.hb * .9 * side, vb: a.vb * .9, fx: tx, fy: ty }; }
const flightMs = (pt) => 560 * (94 / pt.mph) * MINI_DIFF[miniPref().diff].t;
function walkOrK(S, done) { if (S.balls >= 4) { done('BB'); return true; } if (S.strikes >= 3) { done('K'); return true; } return false; }
const diffChips = () => `<div class="chips mg-opts">${Object.entries(MINI_DIFF).map(([k, d]) => `<button class="chip ${miniPref().diff === k ? 'on' : ''}" data-a="mgDiff" data-k="${k}">${d.n}</button>`).join('')}<button class="chip ${miniPref().sound ? 'on' : ''}" data-a="mgSound">Sound</button></div>`;

/* ---------- you swing ---------- */
const AtBat = (() => {
  let S = null, raf = 0, cb = null, cv = null, lastSit = 'any';
  function mount(host, o, done) {
    cancelAnimationFrame(raf); cb = done;
    S = { o, balls: 0, strikes: 0, n: 0, phase: 'ready', sit: lastSit, power: false, pci: { x: ZN.x + ZN.w / 2, y: ZN.y + ZN.h / 2 }, pitch: null, msg: 'Step in', sub: 'Pick what to sit on, then call for the pitch.', ars: arsenal(o.p), seen: [] };
    host.innerHTML = `<div class="mg"><canvas id="mg-cv" width="340" height="340" aria-label="Batter's view. Tap where the ball will cross the plate to swing there."></canvas><div class="mg-side" id="mg-side"></div></div>`;
    cv = host.querySelector('#mg-cv');
    cv.addEventListener('pointermove', e => { if (!S || e.pointerType === 'touch') return; S.pci = clampPci(canvasPos(cv, e)); if (S.phase !== 'flying') draw(); });
    cv.addEventListener('pointerdown', e => { if (!S) return; e.preventDefault(); S.pci = clampPci(canvasPos(cv, e)); if (S.phase === 'flying') swing(); else if (S.phase === 'done') end(); else if (S.phase === 'ready') go(); });
    side(); draw();
  }
  const clampPci = p => ({ x: clamp(p.x, ZN.x - 45, ZN.x + ZN.w + 45), y: clamp(p.y, ZN.y - 45, ZN.y + ZN.h + 45) });
  const pciR = () => (19.5 + (S.o.b.con - 50) * .2) * MINI_DIFF[miniPref().diff].r * (S.power ? .85 : 1);
  function side() {
    const el = document.getElementById('mg-side'); if (!el || !S) return; const b = S.o.b, p = S.o.p, fly = S.phase === 'flying';
    el.innerHTML = `<div class="who-tag">${esc(S.o.label)}</div><div class="mg-name">${esc(b.name)}</div>
      <div class="note">Bats ${b.b === 'S' ? 'switch' : b.b === 'L' ? 'left' : 'right'} · Contact ${b.con} · Power ${b.pow} · Eye ${b.eye}</div>
      <div class="mg-vs">vs <b>${esc(p.name)}</b> <span class="note">${p.t}HP · ${S.o.pc + S.n} pitches${S.o.tired ? ' · tired' : ''}</span></div>
      <div class="ars">${S.ars.map(a => `<span class="pt" style="--c:${FAM_COLOR[a.fam]}">${a.n} <b>${Math.round(a.mph)}</b></span>`).join('')}</div>
      <div class="count"><span>B ${dots(S.balls, 3, 'b')}</span><span>S ${dots(S.strikes, 2, 's')}</span><span>O ${dots(S.o.outs, 2, 'o')}</span></div>
      <div class="mg-l">Sit on</div><div class="chips">${['any', 'FB', 'BR', 'OS'].map(k => `<button class="chip ${S.sit === k ? 'on' : ''}" data-a="mgSit" data-k="${k}" ${fly ? 'disabled' : ''}>${FAM_NAME[k]}</button>`).join('')}<button class="chip ${S.power ? 'on' : ''}" data-a="mgPow" ${fly ? 'disabled' : ''}>Power swing</button></div>
      <div class="pmsg" aria-live="polite">${S.msg}</div><div class="note mg-sub">${S.sub}</div>
      <button class="swing" data-a="mgGo">${fly ? 'Swing!' : S.phase === 'done' ? 'Continue' : S.phase === 'contact' ? '…' : 'Next pitch'}</button>
      <div class="row2"><button class="btn sm" data-a="mgSim" ${S.phase === 'ready' ? '' : 'disabled'}>Sim the at-bat</button></div>${diffChips()}
      <p class="note">Tap the field or Next pitch to call for one. Watch the ring close on the ball and tap where it will cross. It breaks late, so read the spin: the ring changes color once you pick up the pitch. Space swings at your cursor. Guessing the pitch type right widens your timing window. On Easy your swing gets nudged toward the ball.</p>`;
  }
  function choosePitch() {
    const b = S.balls, s = S.strikes, ahead = s > b, behind = b > s, A = S.ars;
    const w = A.map(a => a.use * (a.fam === 'FB' ? (behind ? 1.6 : ahead ? .75 : 1) * (b === 3 ? 1.6 : 1) : (ahead ? 1.35 : behind ? .7 : 1)));
    let r = Math.random() * w.reduce((x, y) => x + y, 0), a = A[0]; for (let i = 0; i < A.length; i++) { r -= w[i]; if (r <= 0) { a = A[i]; break; } }
    const zp = b === 3 && s < 2 ? .78 : b === 3 ? .62 : s === 2 && b < 2 ? .3 : ahead ? .4 : behind ? .6 : .5, inZ = Math.random() < zp;
    let tx, ty;
    if (inZ) { tx = ZN.x + ZN.w * (Math.random() < .6 ? pick([.15, .85]) + gauss() * .08 : rnd(.25, .75)); ty = ZN.y + ZN.h * (Math.random() < .6 ? pick([.15, .85]) + gauss() * .08 : rnd(.25, .75)); }
    else if (a.fam === 'FB') { const up = Math.random() < .55; tx = up ? rnd(ZN.x + 10, ZN.x + ZN.w - 10) : pick([ZN.x - rnd(10, 30), ZN.x + ZN.w + rnd(10, 30)]); ty = up ? ZN.y - rnd(10, 35) : rnd(ZN.y + 20, ZN.y + ZN.h - 10); }
    else { const low = Math.random() < .65; tx = low ? rnd(ZN.x + 5, ZN.x + ZN.w - 5) : pick([ZN.x - rnd(12, 34), ZN.x + ZN.w + rnd(12, 34)]); ty = low ? ZN.y + ZN.h + rnd(10, 40) : rnd(ZN.y + 40, ZN.y + ZN.h + 20); }
    const fat = S.o.fat || 0, sd = 8 + (55 - (S.o.p.ctl || 50)) * .3 + fat * 8;
    return makePitch(a, clamp(tx + gauss() * sd, 40, 300), clamp(ty + gauss() * sd, 70, 300), S.o.p.ctl, fat, S.o);
  }
  function go() {
    if (!S) return;
    if (S.phase === 'ready') { const pt = choosePitch(); pt.T = flightMs(pt); pt.t0 = performance.now(); pt.rec = clamp(.56 - (S.o.b.eye - 50) * .006 - (S.sit === pt.fam ? .06 : 0), .36, .7) * (MINI_DIFF[miniPref().diff].mark ? .85 : 1); S.pitch = pt; S.phase = 'flying'; S.msg = ''; S.sub = ''; S.n++; side(); raf = requestAnimationFrame(loop); later(pt, pt.T * 1.03 + 20); later(pt, pt.T * 1.21 + 20); }
    else if (S.phase === 'flying') swing();
    else if (S.phase === 'done') end();
  }
  const later = (pt, ms) => setTimeout(() => { if (S && S.pitch === pt) loop(performance.now()); }, ms);
  function loop(now) {
    if (!S || !S.pitch || (S.phase !== 'flying' && S.phase !== 'contact')) return; const pt = S.pitch, f = (now - pt.t0) / pt.T;
    if (S.phase === 'contact') { const t = (now - S.anim) / 1300; draw(null, t); if (t >= 1.25) { finish(S.bb.ev, S.bb); return; } raf = requestAnimationFrame(loop); return; }
    draw(f);
    if (f >= 1.02 && pt.out && !pt.done) { pt.done = true; return resolveSwing(); }
    if (f >= 1.2 && !pt.swung) return take();
    raf = requestAnimationFrame(loop);
  }
  function take() {
    const pt = S.pitch, b = S.o.b, edge = outside(pt.fx, pt.fy), inZ = inZone(pt.fx, pt.fy), border = edge < 4 && (pt.fx < ZN.x + 4 || pt.fx > ZN.x + ZN.w - 4 || pt.fy < ZN.y + 4 || pt.fy > ZN.y + ZN.h - 4);
    const bats = b.b === 'S' ? (S.o.p.t === 'R' ? 'L' : 'R') : b.b, inside = bats === 'R' ? pt.fx < ZN.x - 46 : pt.fx > ZN.x + ZN.w + 46;
    Sfx.mitt();
    if (inside && Math.random() < .5) return finish('HBP');
    const strike = border ? Math.random() < .5 : inZ;
    if (strike) { S.strikes++; S.msg = 'Called strike'; } else { S.balls++; S.msg = 'Ball'; }
    S.sub = `${pt.n}, ${Math.round(pt.mph)} mph${inZ ? ', in the zone' : ', off the plate'}`;
    if (!walkOrK(S, finish)) nextPitch();
  }
  function swing() {
    const pt = S.pitch; if (!pt || pt.swung) return; pt.swung = true; pt.swAt = performance.now();
    const b = S.o.b, D = MINI_DIFF[miniPref().diff], ts = pt.swAt - pt.t0, sitOK = S.sit !== 'any' && S.sit === pt.fam, sitBad = S.sit !== 'any' && !sitOK;
    const win = (84 + (b.con - 50) * 1.1) * D.win * (sitOK ? 1.35 : sitBad ? .9 : 1) * (S.power ? .88 : 1), R = pciR() * (sitOK ? 1.12 : 1);
    const dt = ts - pt.T, te = Math.abs(dt) / win, dx = (pt.fx - S.pci.x) * (1 - (D.assist || 0)), dy = (pt.fy - S.pci.y) * (1 - (D.assist || 0)), le = Math.hypot(dx, dy) / R;
    pt.sw = { x: pt.fx - dx, y: pt.fy - dy };
    if (te > 1.7 || le > 1.3) { pt.out = { k: 'whiff', why: te > 1.7 ? (dt < 0 ? 'Way out in front' : 'Late on it') : dy > 0 ? 'Swung over it' : dy < 0 ? 'Swung under it' : 'Missed it' }; }
    else {
      let q = clamp(1 - .45 * te / 1.7 - .45 * le / 1.3, 0, 1) * clamp(1 - outside(pt.fx, pt.fy) / 45, .35, 1);
      if (q < .16 || (te > 1.2 && Math.random() < .5)) pt.out = { k: 'foul', why: dt < 0 ? 'Out in front, pulled foul' : 'Late, fought it off' };
      else {
        const EV = 68 + q * 37 + (b.pow - 50) * .3 + (S.power ? 6 : 0) - ((pt.q || 50) - 50) * .08 + gauss() * 3, LA = 13 - (dy / R) * 30 + gauss() * 7 + (S.power ? 4 : 0);
        const bats = b.b === 'S' ? (S.o.p.t === 'R' ? 'L' : 'R') : b.b, a = clamp((bats === 'R' ? -1 : 1) * (-dt / win) * 32 + gauss() * 9, -44, 44);
        pt.out = { k: 'bip', bb: battedBall(EV, LA, a, S.o.fenway, b.spd, true), q };
      }
    }
    if (performance.now() - pt.t0 >= pt.T * 1.02) { pt.done = true; resolveSwing(); }
  }
  function resolveSwing() {
    const pt = S.pitch, o = pt.out;
    if (o.k === 'whiff') { S.strikes++; S.msg = 'Swing and a miss'; S.sub = `${o.why}. ${pt.n}, ${Math.round(pt.mph)} mph.`; Sfx.mitt(); if (!walkOrK(S, finish)) nextPitch(); return; }
    if (o.k === 'foul') { if (S.strikes < 2) S.strikes++; S.msg = 'Foul ball'; S.sub = `${o.why}. ${pt.n}.`; Sfx.foul(); nextPitch(); return; }
    Sfx.crack(o.q); S.bb = o.bb; S.phase = 'contact'; S.anim = performance.now(); S.msg = ''; S.sub = `${pt.n}, ${Math.round(pt.mph)} mph`; side(); raf = requestAnimationFrame(loop); later(pt, 1300 * 1.26 + 20);
  }
  function nextPitch() { S.phase = 'ready'; S.seen.push(S.pitch); S.last = S.pitch; S.pitch = null; side(); draw(); }
  function finish(ev, bb) {
    if (!S || S.phase === 'done') return; cancelAnimationFrame(raf);
    S.phase = 'done'; S.res = Object.assign({ ev, pc: S.n, mini: true }, bb ? { txt: bb.txt, dir: bb.dir, deep: bb.deep } : {});
    S.msg = EV_WORD[ev] || ev; if (ev === 'K') S.sub = `Strike three. ${S.pitch ? S.pitch.n : ''}`; if (ev === 'BB') S.sub = 'Take your base.';
    side(); if (!bb) draw(); setTimeout(() => { if (S && S.phase === 'done' && !S.ended) end(); }, 1500);
  }
  function end() { if (!S || S.ended || S.phase !== 'done') return; S.ended = true; cancelAnimationFrame(raf); const r = S.res, f = cb; S = null; f(r); }
  function simIt() { if (!S || S.phase !== 'ready') return; cancelAnimationFrame(raf); const n = S.n, f = cb; S = null; f({ sim: true, pc: n }); }
  function draw(f, ft) {
    if (!cv || !S) return; const x = cv.getContext('2d');
    if (S.phase === 'contact' || (S.phase === 'done' && S.bb)) { drawField(x, S.bb, ft == null ? 1.25 : ft, S.o.fenway); return; }
    scene(x, S.o, f);
    const pt = S.pitch, R = pciR();
    if (pt && f != null) {
      const b = ballAt(pt, f, S.o), rec = f >= pt.rec;
      if (rec && MINI_DIFF[miniPref().diff].mark) { x.strokeStyle = '#ffffff55'; x.setLineDash([3, 3]); x.lineWidth = 1.5; x.beginPath(); x.arc(pt.fx, pt.fy, 9, 0, 7); x.stroke(); x.setLineDash([]); }
      if (f <= 1.03) { const close = Math.abs(1 - f) < .08; x.strokeStyle = close ? '#43e0a0' : rec ? FAM_COLOR[pt.fam] : '#ffd34d'; x.lineWidth = close ? 4 : 3; x.beginPath(); x.arc(b.x, b.y, b.r + Math.max(0, 1 - f) * 70, 0, 7); x.stroke(); }
      if (rec && f < 1.1) { x.fillStyle = FAM_COLOR[pt.fam]; x.font = '700 13px Barlow Condensed, sans-serif'; x.fillText(pt.n.toUpperCase(), Math.min(280, b.x + b.r + 10), b.y - 6); }
      drawBall(x, b);
      if (pt.sw) { x.strokeStyle = '#c9a26b'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(pt.sw.x - 34, pt.sw.y + 10); x.lineTo(pt.sw.x + 34, pt.sw.y - 10); x.stroke(); x.lineCap = 'butt'; }
    } else if (S.phase === 'ready' && S.last) { const last = S.last; x.fillStyle = inZone(last.fx, last.fy) ? '#ffd34d' : '#ffffff88'; x.beginPath(); x.arc(last.fx, last.fy, 5, 0, 7); x.fill(); }
    if (S.phase === 'ready' || S.phase === 'flying') { x.strokeStyle = S.power ? '#ff6b78' : '#ffffffdd'; x.lineWidth = S.power ? 3 : 2; x.beginPath(); x.arc(S.pci.x, S.pci.y, R, 0, 7); x.stroke(); x.beginPath(); x.moveTo(S.pci.x - 5, S.pci.y); x.lineTo(S.pci.x + 5, S.pci.y); x.moveTo(S.pci.x, S.pci.y - 5); x.lineTo(S.pci.x, S.pci.y + 5); x.stroke(); }
  }
  return {
    mount, active: () => !!S, press: go, sim: simIt, state: () => S && { phase: S.phase, n: S.n, b: S.balls, s: S.strikes, f: S.pitch && S.pitch.t0 ? (performance.now() - S.pitch.t0) / S.pitch.T : null },
    sit: k => { if (S && S.phase !== 'flying') { S.sit = lastSit = k; side(); } }, power: () => { if (S && S.phase !== 'flying') { S.power = !S.power; side(); draw(); } }, refresh: () => { if (S) { side(); draw(); } }
  };
})();

/* ---------- you pitch ---------- */
function hotZones(b) {
  const r = srand(hashN('hz' + b.id)), cells = Array(9).fill(0); cells[4] = 1;
  const hot = [0, 1, 2, 3, 5, 6, 7, 8].sort(() => r() - .5); cells[hot[0]] = 1; if (b.pow >= 58) cells[hot[1]] = 1;
  const cold = [0, 2, 6, 8].filter(i => cells[i] === 0).sort(() => r() - .5); cold.slice(0, 2).forEach(i => { cells[i] = -1; });
  return cells;
}
const cellOf = (x, y) => { if (!inZone(x, y)) return -1; const c = clamp(Math.floor((x - ZN.x) / (ZN.w / 3)), 0, 2), r = clamp(Math.floor((y - ZN.y) / (ZN.h / 3)), 0, 2); return r * 3 + c; };
const Mound = (() => {
  let S = null, raf = 0, cb = null, cv = null;
  function mount(host, o, done) {
    cancelAnimationFrame(raf); cb = done;
    S = { o, balls: 0, strikes: 0, n: 0, phase: 'aim', sel: 0, ars: arsenal(o.p), tgt: null, pitch: null, hist: [], msg: 'Your call', sub: 'Pick a pitch, then tap the spot you want. Stop the meter in the green to hit it.', hz: hotZones(o.b) };
    host.innerHTML = `<div class="mg"><canvas id="mg-cv" width="340" height="340" aria-label="Catcher's view. Tap a spot to aim the pitch."></canvas><div class="mg-side" id="mg-side"></div></div>`;
    cv = host.querySelector('#mg-cv');
    cv.addEventListener('pointerdown', e => { if (!S) return; e.preventDefault(); const p = canvasPos(cv, e); if (S.phase === 'aim') aim(p); else if (S.phase === 'meter') release(); else if (S.phase === 'done') end(); });
    cv.addEventListener('pointermove', e => { if (!S || S.phase !== 'aim' || e.pointerType === 'touch') return; S.hover = canvasPos(cv, e); draw(); });
    side(); draw();
  }
  const sweet = () => clamp(.12 + ((S.o.p.ctl || 50) - 50) * .004 - (S.o.fat || 0) * .05 - (S.o.tired ? .025 : 0), .045, .26) * MINI_DIFF[miniPref().diff].sweet;
  function side() {
    const el = document.getElementById('mg-side'); if (!el || !S) return; const b = S.o.b, p = S.o.p, busy = S.phase === 'flying' || S.phase === 'contact';
    el.innerHTML = `<div class="who-tag">${esc(S.o.label)}</div><div class="mg-name">${esc(p.name)} <small>${p.t}HP</small></div>
      <div class="note">${S.o.pc + S.n} pitches${S.o.fat > .2 ? ' · tiring, the green zone is shrinking' : S.o.tired ? ' · arm is tired today' : ''} · Control ${p.ctl}</div>
      <div class="mg-vs">vs <b>${esc(b.name)}</b> <span class="note">bats ${b.b === 'S' ? 'switch' : b.b === 'L' ? 'left' : 'right'} · Con ${b.con} · Pow ${b.pow} · Eye ${b.eye}</span></div>
      <div class="count"><span>B ${dots(S.balls, 3, 'b')}</span><span>S ${dots(S.strikes, 2, 's')}</span><span>O ${dots(S.o.outs, 2, 'o')}</span></div>
      <div class="mg-l">Pitch</div><div class="pgrid">${S.ars.map((a, i) => `<button class="pbtn ${S.sel === i ? 'on' : ''}" style="--c:${FAM_COLOR[a.fam]}" data-a="mpSel" data-k="${i}" ${S.phase === 'aim' ? '' : 'disabled'}><b>${a.n}</b><small>${Math.round(a.mph)} mph · ${grade(a.q)}</small></button>`).join('')}</div>
      <div class="pmsg" aria-live="polite">${S.msg}</div><div class="note mg-sub">${S.sub}</div>
      <button class="swing" data-a="mgGo" ${busy ? 'disabled' : ''}>${S.phase === 'meter' ? 'Release!' : S.phase === 'done' ? 'Continue' : busy ? '…' : 'Tap a spot to aim'}</button>
      <div class="row2"><button class="btn sm" data-a="mgSim" ${S.phase === 'aim' ? '' : 'disabled'}>Sim the at-bat</button></div>${diffChips()}
      ${S.hist.length ? `<div class="plog">${S.hist.slice(-6).map((h, i) => `<div><span>${S.hist.length - Math.min(6, S.hist.length) + i + 1}</span> ${h.n} ${Math.round(h.mph)} · ${esc(h.r)}</div>`).join('')}</div>` : ''}
      <p class="note">Red cells are where ${esc(lastName(b.name))} does damage. Blue cells are cold. Hitters start sitting on what you keep throwing, so mix speeds and change eye levels.</p>`;
  }
  function aim(p) { S.tgt = { x: clamp(p.x, 40, 300), y: clamp(p.y, 70, 300) }; S.phase = 'meter'; S.m0 = performance.now(); S.msg = ''; S.sub = 'Stop the needle in the green.'; side(); raf = requestAnimationFrame(loop); }
  const needle = now => Math.sin((now - S.m0) / (1050 * MINI_DIFF[miniPref().diff].meter) * Math.PI * 2);
  function release() {
    if (!S || S.phase !== 'meter') return; const pos = needle(performance.now()), e = Math.abs(pos), w = sweet(), a = S.ars[S.sel];
    let miss = e <= w ? Math.abs(gauss()) * 2.5 : 6 + (e - w) * 72, th = Math.random() * Math.PI * 2;
    if (e > w * 1.8 && Math.random() < .4) th = Math.atan2(ZN.y + ZN.h / 2 - S.tgt.y, ZN.x + ZN.w / 2 - S.tgt.x);
    const pt = makePitch(a, clamp(S.tgt.x + Math.cos(th) * miss, 30, 310), clamp(S.tgt.y + Math.sin(th) * miss, 64, 306), S.o.p.ctl, S.o.fat || 0, S.o);
    pt.exec = e <= w ? 'Painted it' : e <= w * 2 ? 'Missed a little' : 'Missed the spot'; pt.T = flightMs(pt); pt.t0 = performance.now(); pt.ai = batterAI(pt);
    S.pitch = pt; S.phase = 'flying'; S.n++; side(); raf = requestAnimationFrame(loop); later(pt, pt.T * 1.03 + 20);
  }
  function batterAI(pt) {
    const b = S.o.b, x = pt.fx, y = pt.fy, inZ = inZone(x, y), out = outside(x, y), st = S.strikes, bl = S.balls, prev = S.hist[S.hist.length - 1];
    const fc = { FB: 1, BR: 1, OS: 1 }; S.hist.slice(-4).forEach(h => { fc[h.fam] += 1.2; }); if (st === 2) fc.FB += .5;
    let r = Math.random() * (fc.FB + fc.BR + fc.OS); const guess = (r -= fc.FB) < 0 ? 'FB' : (r -= fc.BR) < 0 ? 'BR' : 'OS', sitOK = guess === pt.fam;
    const same = prev && prev.k === pt.k && Math.hypot(prev.x - x, prev.y - y) < 26, tunnel = prev ? clamp(Math.abs(prev.mph - pt.mph) / 10, 0, 1) * .05 + (Math.abs(prev.y - y) > 50 ? .03 : 0) : 0;
    const swingP = inZ ? clamp(.64 + (st === 2 ? .2 : 0) - (bl === 3 && st < 2 ? .22 : 0) + (sitOK ? .06 : 0), .3, .95) : clamp(.36 - out * .011 - (b.eye - 50) * .006 + (st === 2 ? .16 : 0) + (pt.fam !== 'FB' ? .07 : 0) - (bl === 3 ? .1 : 0), .02, .62);
    if (Math.random() >= swingP) return { swing: false };
    const stuff = ((pt.q || 50) - 50) * .006 + tunnel - (S.o.fat || 0) * .05 - (S.o.tired ? .04 : 0), edge = edgeness(x, y), cell = cellOf(x, y), hot = cell >= 0 ? S.hz[cell] : -1;
    const cP = clamp((inZ ? .84 : .56) - stuff + (b.con - 50) * .006 + (sitOK ? .06 : -.04) + (same ? .08 : 0) - Math.min(edge, 1.4) * .08, .3, .96);
    if (Math.random() >= cP) return { swing: true, miss: true };
    const q = clamp(.52 - Math.min(edge, 1.4) * .28 + hot * .12 + (sitOK ? .1 : -.05) + (same ? .12 : 0) - stuff * 1.2 + (b.con - 50) * .004 + gauss() * .17, 0, 1);
    if (q < .3 && Math.random() < .62) return { swing: true, foul: true };
    const EV = 66 + q * 38 + (b.pow - 50) * .3 + gauss() * 3, LA = 12 + ((ZN.y + ZN.h / 2) - y) / ZN.h * 34 + gauss() * 9;
    const bats = b.b === 'S' ? (S.o.p.t === 'R' ? 'L' : 'R') : b.b, a = clamp((bats === 'R' ? -1 : 1) * (gauss() * 20 + 8), -44, 44);
    return { swing: true, bb: battedBall(EV, LA, a, S.o.fenway, b.spd), q };
  }
  const later = (pt, ms) => setTimeout(() => { if (S && S.pitch === pt && (S.phase === 'flying' || S.phase === 'contact')) loop(performance.now()); }, ms);
  function loop(now) {
    if (!S) return;
    if (S.phase === 'meter') { draw(null, now); raf = requestAnimationFrame(loop); return; }
    if (S.phase === 'contact') { const t = (now - S.anim) / 1300; draw(null, null, t); if (t >= 1.25) return finish(S.bb.ev, S.bb); raf = requestAnimationFrame(loop); return; }
    if (S.phase !== 'flying') return;
    const pt = S.pitch, f = (now - pt.t0) / pt.T; draw(f);
    if (f >= 1.02) return resolve();
    raf = requestAnimationFrame(loop);
  }
  function resolve() {
    const pt = S.pitch, ai = pt.ai, b = S.o.b, rec = { k: pt.k, n: pt.n, fam: pt.fam, mph: pt.mph, x: pt.fx, y: pt.fy, r: '' };
    const done = r => { rec.r = r; S.hist.push(rec); };
    if (!ai.swing) {
      Sfx.mitt();
      const bats = b.b === 'S' ? (S.o.p.t === 'R' ? 'L' : 'R') : b.b, inside = bats === 'R' ? pt.fx < ZN.x - 46 : pt.fx > ZN.x + ZN.w + 46;
      if (inside && Math.random() < .5) { done('hit batter'); return finish('HBP'); }
      const border = outside(pt.fx, pt.fy) < 4 && (pt.fx < ZN.x + 4 || pt.fx > ZN.x + ZN.w - 4 || pt.fy < ZN.y + 4 || pt.fy > ZN.y + ZN.h - 4), strike = border ? Math.random() < .5 : inZone(pt.fx, pt.fy);
      if (strike) { S.strikes++; S.msg = 'Called strike'; done('called strike'); } else { S.balls++; S.msg = 'Ball'; done('ball'); }
      S.sub = `${pt.exec}. ${pt.n}, ${Math.round(pt.mph)} mph.`; if (!walkOrK(S, finish)) again(); return;
    }
    if (ai.miss) { S.strikes++; S.msg = 'Swing and a miss'; S.sub = `${pt.exec}. ${pt.n}, ${Math.round(pt.mph)} mph.`; done('swinging strike'); Sfx.mitt(); if (!walkOrK(S, finish)) again(); return; }
    if (ai.foul) { if (S.strikes < 2) S.strikes++; S.msg = 'Foul ball'; S.sub = `${pt.exec}. ${pt.n}.`; done('foul'); Sfx.foul(); again(); return; }
    done('in play'); Sfx.crack(ai.q); S.bb = ai.bb; S.phase = 'contact'; S.anim = performance.now(); S.msg = ''; S.sub = `${pt.exec}. ${pt.n}, ${Math.round(pt.mph)} mph.`; side(); raf = requestAnimationFrame(loop); later(pt, 1300 * 1.26 + 20);
  }
  function again() { S.phase = 'aim'; S.tgt = null; side(); setTimeout(() => { if (S && S.phase === 'aim') draw(); }, 400); }
  function finish(ev, bb) {
    if (!S || S.phase === 'done') return; cancelAnimationFrame(raf);
    S.phase = 'done'; S.res = Object.assign({ ev, pc: S.n, mini: true }, bb ? { txt: bb.txt, dir: bb.dir, deep: bb.deep } : {});
    S.msg = ev === 'K' ? 'Strikeout!' : EV_WORD[ev] || ev; if (ev === 'BB') S.sub = 'Ball four.';
    side(); if (!bb) draw(); setTimeout(() => { if (S && S.phase === 'done' && !S.ended) end(); }, 1500);
  }
  function end() { if (!S || S.ended || S.phase !== 'done') return; S.ended = true; cancelAnimationFrame(raf); const r = S.res, f = cb; S = null; f(r); }
  function simIt() { if (!S || S.phase !== 'aim') return; cancelAnimationFrame(raf); const n = S.n, f = cb; S = null; f({ sim: true, pc: n }); }
  function draw(f, now, ft) {
    if (!cv || !S) return; const x = cv.getContext('2d');
    if (S.phase === 'contact' || (S.phase === 'done' && S.bb)) { drawField(x, S.bb, ft == null ? 1.25 : ft, S.o.fenway); return; }
    scene(x, S.o, f);
    x.fillStyle = '#071733b0'; x.fillRect(ZN.x, ZN.y, ZN.w, ZN.h);
    S.hz.forEach((v, i) => { if (!v) return; const c = i % 3, r = Math.floor(i / 3); x.fillStyle = v > 0 ? '#ff4d5e8c' : '#4da6ff80'; x.fillRect(ZN.x + c * ZN.w / 3 + 1, ZN.y + r * ZN.h / 3 + 1, ZN.w / 3 - 2, ZN.h / 3 - 2); });
    S.hist.slice(-5).forEach((h, i, arr) => { x.globalAlpha = .35 + .5 * (i + 1) / arr.length; x.fillStyle = FAM_COLOR[h.fam]; x.beginPath(); x.arc(h.x, h.y, 4, 0, 7); x.fill(); x.globalAlpha = 1; });
    const t = S.tgt || (S.phase === 'aim' ? S.hover : null);
    if (t) { x.strokeStyle = '#ffd34d'; x.lineWidth = 2; x.beginPath(); x.arc(t.x, t.y, 10, 0, 7); x.moveTo(t.x - 15, t.y); x.lineTo(t.x + 15, t.y); x.moveTo(t.x, t.y - 15); x.lineTo(t.x, t.y + 15); x.stroke(); }
    if (S.phase === 'meter' && now != null) {
      const w = sweet(), X0 = 50, X1 = 290, cx = (X0 + X1) / 2, half = (X1 - X0) / 2, y = 290;
      x.fillStyle = '#04102ccc'; x.fillRect(X0 - 8, y - 10, X1 - X0 + 16, 30); x.fillStyle = '#ff6b78'; x.fillRect(X0, y, X1 - X0, 10); x.fillStyle = '#ffd34d'; x.fillRect(cx - half * w * 2, y, half * w * 4, 10); x.fillStyle = '#43e0a0'; x.fillRect(cx - half * w, y, half * w * 2, 10);
      const nx = cx + needle(now) * half; x.fillStyle = '#fff'; x.fillRect(nx - 2, y - 6, 4, 22);
    }
    if (S.pitch && f != null) { const b = ballAt(S.pitch, f, S.o); drawBall(x, b); if (f > .95 && S.pitch.ai.swing) { x.strokeStyle = '#c9a26b'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(S.pitch.fx - 34, S.pitch.fy + (S.pitch.ai.miss ? 22 : 8)); x.lineTo(S.pitch.fx + 34, S.pitch.fy - (S.pitch.ai.miss ? 0 : 12)); x.stroke(); x.lineCap = 'butt'; } }
  }
  return { mount, active: () => !!S, state: () => S && { phase: S.phase, n: S.n, b: S.balls, s: S.strikes }, press: () => { if (!S) return; if (S.phase === 'meter') release(); else if (S.phase === 'done') end(); }, sim: simIt, sel: k => { if (S && S.phase === 'aim') { S.sel = clamp(+k, 0, S.ars.length - 1); side(); } }, refresh: () => { if (S) { side(); draw(); } } };
})();
/* Older code paths call Clutch; it now routes to whichever plate appearance is being played. */
const Clutch = { active: () => AtBat.active() || Mound.active(), press: () => AtBat.active() ? AtBat.press() : Mound.press(), autoPlay: () => { }, W: 340, H: 340 };
