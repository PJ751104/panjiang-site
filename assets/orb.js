/* orb.js — 中央核心 v2（Canvas 2D，无依赖）
   两种视觉模式：
     orbit  星轨·暖金   —— 椭圆轨道网 + 节点 + 细射线 + 白热核
     fiber  纤维·灰白   —— 纤维云团 + 断口 + 尘埃 + 暗核光晕
   对外接口保持不变：window.Orb.setLevel(v) / .setState(s) / .setMode(m)
   性能：静态场预渲染到离屏 canvas，每帧只做旋转合成 + 少量动态粒子。 */

(function () {
  'use strict';

  const canvas = document.getElementById('orb');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const CFG = {
    orbit: { label: 'ORBITAL MESH', sub: '26 PATHS · GOLD' },
    fiber: { label: 'FIBER CLOUD', sub: '5.2K STRANDS · MONO' },
  };

  const PAL = {
    orbit: { ember: [196, 78, 12], gold: [255, 168, 64], hot: [255, 232, 190], white: [255, 255, 255], hud: [255, 168, 92] },
    fiber: { ember: [118, 124, 132], gold: [206, 213, 221], hot: [246, 249, 253], white: [255, 255, 255], hud: [196, 206, 218] },
  };

  const STATE = {
    idle: { speed: 0.6, glow: 0.55, dust: 1.0 },
    listening: { speed: 1.0, glow: 0.82, dust: 1.15 },
    thinking: { speed: 2.2, glow: 0.86, dust: 1.6 },
    speaking: { speed: 0.85, glow: 0.92, dust: 1.2 },
    error: { speed: 0.3, glow: 0.45, dust: 0.7 },
  };

  const DPR_MAX = 1.5;
  let dpr = 1, w = 0, h = 0, cx = 0, cy = 0, R = 0, RH = 0;

  const qsInit = new URLSearchParams(location.search);
  // 已确认使用「星轨 · 暖金」；?mode=fiber 仅保留给设计实验
  let mode = qsInit.get('mode') === 'fiber' ? 'fiber' : 'orbit';
  let state = 'idle';
  let level = 0, smooth = 0;
  let t0 = performance.now();
  let dust = [];
  let fps = { frames: 0, t: 0, value: 60 };
  let hudT = 0;

  const qs = new URLSearchParams(location.search);
  const BENCH = qs.has('bench');

  /* ---------- 工具 ---------- */
  const rgba = (c, a) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 尺寸 ---------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(320, Math.round(rect.width));
    h = Math.max(320, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = w / 2; cy = h / 2;
    // 内容半径 R 按宽高比放大（宽屏更满），环形 HUD 半径 RH 保持不出屏
    const aspect = w / h;
    let k = 1;
    if (aspect > 1.55) k = 1.07;
    else if (aspect > 1.25) k = 1.04;
    else if (aspect < 0.85) k = 1.0;
    RH = Math.min(w, h) / 2;
    R = RH * k;
    build();
  }

  function makeField() {
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(cx, cy);
    return { c, g };
  }

  /* ---------- 场构建：星轨 ---------- */
  function buildOrbitField(seed, density) {
    const { c, g } = makeField();
    const rnd = mulberry(seed);
    const P = PAL.orbit;

    // 椭圆轨道
    for (let i = 0; i < 26; i++) {
      const rr = R * (0.26 + rnd() * 0.56);
      const ecc = 0.18 + rnd() * 0.55;
      const tilt = rnd() * Math.PI;
      const alpha = (0.09 + rnd() * 0.22) * density;
      g.save();
      g.rotate(tilt);
      g.strokeStyle = rgba(rnd() > 0.72 ? P.hot : P.gold, alpha);
      g.lineWidth = 0.6 + rnd() * 0.9;
      if (rnd() > 0.7) g.setLineDash([3 + rnd() * 5, 6 + rnd() * 10]);
      g.beginPath();
      g.ellipse(0, 0, rr, rr * (1 - ecc) * 0.58, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();

      // 节点
      const n = 3 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr * (1 - ecc) * 0.58;
        g.save(); g.rotate(tilt);
        g.fillStyle = rgba(P.hot, 0.2 + rnd() * 0.55);
        g.beginPath(); g.arc(x, y, 0.7 + rnd() * 1.5, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }

    // 六条主轨道（更亮，构成骨架）
    for (let i = 0; i < 6; i++) {
      const rr = R * (0.32 + i * 0.09 + rnd() * 0.03);
      const ecc = 0.3 + rnd() * 0.35;
      g.save();
      g.rotate(rnd() * Math.PI);
      g.strokeStyle = rgba(P.gold, 0.20 + rnd() * 0.18);
      g.lineWidth = 1 + rnd() * 0.7;
      g.beginPath();
      g.ellipse(0, 0, rr, rr * (1 - ecc) * 0.6, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    // 细射线
    const rays = Math.round(90 * density);
    for (let i = 0; i < rays; i++) {
      const a = rnd() * Math.PI * 2;
      const r0 = R * (0.10 + rnd() * 0.10);
      const r1 = R * (0.28 + rnd() * 0.52);
      g.strokeStyle = rgba(rnd() > 0.82 ? P.hot : P.gold, 0.03 + rnd() * 0.12);
      g.lineWidth = 0.4 + rnd() * 0.6;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.stroke();
    }

    // 尘
    for (let i = 0; i < 420; i++) {
      const a = rnd() * Math.PI * 2;
      const r = R * (0.16 + Math.pow(rnd(), 0.7) * 0.74);
      g.fillStyle = rgba(rnd() > 0.75 ? P.hot : P.gold, 0.06 + rnd() * 0.4);
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.3 + rnd() * 1.2, 0, Math.PI * 2);
      g.fill();
    }

    return c;
  }

  /* ---------- 场构建：纤维云 ---------- */
  function buildFiberField(seed, density, lobes) {
    const { c, g } = makeField();
    const rnd = mulberry(seed);
    const P = PAL.fiber;

    // 稀薄云团
    for (let i = 0; i < Math.round(80 * density); i++) {
      const a = rnd() * Math.PI * 2;
      const r = R * (0.14 + rnd() * 0.62);
      const rad = R * (0.05 + rnd() * 0.17);
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.98;
      const al = 0.02 + rnd() * 0.05;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, rgba(P.gold, al));
      grad.addColorStop(1, rgba(P.gold, 0));
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }

    // 纤维带：四层，角向断口
    const bands = [
      { r: 0.87, n: 1700, spread: 0.055, len: 1.0, alpha: 0.85 },
      { r: 0.73, n: 1800, spread: 0.070, len: 1.15, alpha: 0.95 },
      { r: 0.59, n: 1400, spread: 0.075, len: 1.3, alpha: 0.85 },
      { r: 0.40, n: 650, spread: 0.080, len: 1.6, alpha: 0.75 },
    ];

    for (const b of bands) {
      for (let i = 0; i < b.n * density; i++) {
        const th0 = rnd() * Math.PI * 2;
        const gap = 0.30 + 0.70 * Math.pow(Math.sin(th0 * 3 + lobes), 2);
        if (rnd() > gap) continue;

        const petal = 1 + 0.085 * Math.sin(th0 * 5 + lobes) + 0.035 * Math.sin(th0 * 13 - lobes * 0.6);
        const r0 = R * b.r * petal + (rnd() + rnd() + rnd() - 1.5) * R * b.spread;
        const span = (0.05 + rnd() * 0.28) * b.len;
        const dir = rnd() > 0.28 ? 1 : -1;
        const curl = (rnd() - 0.5) * 0.08;

        const steps = 6;
        g.beginPath();
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const th = th0 + dir * span * t;
          const rr = r0 + curl * R * t + t * t * R * 0.010;
          const x = Math.cos(th) * rr, y = Math.sin(th) * rr * 0.995;
          s === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        const heat = Math.max(0, 1 - Math.abs(r0 - R * b.r) / (R * b.spread * 4.2));
        const a = (0.05 + rnd() * 0.17) * b.alpha * (0.45 + heat);
        g.strokeStyle = rgba(rnd() > 0.8 ? P.hot : rnd() > 0.4 ? P.gold : P.ember, a);
        g.lineWidth = 0.4 + rnd() * 0.7;
        g.lineCap = 'round';
        g.stroke();
      }
    }

    // 亮弧：几段更浓的纤维团
    for (let i = 0; i < 7; i++) {
      const rr = R * (0.55 + rnd() * 0.3);
      const a0 = rnd() * Math.PI * 2;
      const span = 0.25 + rnd() * 0.7;
      g.strokeStyle = rgba(P.hot, 0.10 + rnd() * 0.12);
      g.lineWidth = 10 + rnd() * 22;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(0, 0, rr, a0, a0 + span);
      g.stroke();
    }

    // 尘
    for (let i = 0; i < 900; i++) {
      const a = rnd() * Math.PI * 2;
      const r = R * (0.10 + Math.pow(rnd(), 0.65) * 0.84);
      g.fillStyle = rgba(rnd() > 0.72 ? P.hot : P.gold, 0.05 + rnd() * 0.38);
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.25 + rnd() * 1.1, 0, Math.PI * 2);
      g.fill();
    }

    return c;
  }

  /* ---------- 构建与重建 ---------- */
  let fieldA = null, fieldB = null, hudLayer = null, glowSprite = null, nucSprite = null, bgGrad = null;

  function build() {
    fieldA = mode === 'orbit' ? buildOrbitField(90210, 1) : buildFiberField(90210, 1, 0.7);
    fieldB = mode === 'orbit' ? buildOrbitField(44017, 0.55) : buildFiberField(44017, 0.55, 2.4);

    // 把第二层一次性合成进第一层，运行时只画一张，省一半合成开销
    const ga = fieldA.getContext('2d');
    ga.save();
    ga.globalAlpha = 0.42;
    ga.rotate(0.42);
    ga.drawImage(fieldB, -w / 2, -h / 2, w, h);
    ga.restore();

    hudLayer = buildHudLayer();
    glowSprite = makeGlow();
    nucSprite = makeNucleus();
    bgGrad = null;
    buildDust();

    document.body.dataset.mode = mode;
  }

  function buildDust() {
    dust = Array.from({ length: 150 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.16 + Math.random() * 0.76,
      v: (Math.random() > 0.5 ? 1 : -1) * (0.00002 + Math.random() * 0.00006),
      s: 0.5 + Math.random() * 1.4,
      p: Math.random() * Math.PI * 2,
      hot: Math.random() > 0.78,
    }));
  }

  function buildHudLayer() {
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(cx, cy);
    const P = PAL[mode];
    const r = RH * 0.90;
    for (let i = 0; i < 240; i++) {
      const a = (i / 240) * Math.PI * 2;
      const major = i % 10 === 0, mid = i % 5 === 0;
      const len = major ? 14 : mid ? 8 : 3.5;
      g.beginPath();
      g.strokeStyle = rgba(P.hud, major ? 0.5 : mid ? 0.26 : 0.11);
      g.lineWidth = major ? 1.2 : 1;
      g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      g.lineTo(Math.cos(a) * (r - len), Math.sin(a) * (r - len));
      g.stroke();
    }
    [[0.35, 0.95, 0.4], [2.55, 1.35, 0.24], [4.35, 0.55, 0.16]].forEach(([st, len, al], i) => {
      g.beginPath();
      g.strokeStyle = rgba(i === 1 ? P.hot : P.hud, al);
      g.lineWidth = 1.8;
      g.arc(0, 0, r - 24, st, st + len);
      g.stroke();
    });
    return c;
  }

  function makeGlow() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const P = PAL[mode];
    const grd = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
    grd.addColorStop(0, rgba(P.hot, 0.85));
    grd.addColorStop(0.32, rgba(P.gold, 0.30));
    grd.addColorStop(0.68, rgba(P.ember, 0.07));
    grd.addColorStop(1, rgba(P.ember, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return c;
  }

  function makeNucleus() {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const P = PAL[mode];
    const grd = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
    grd.addColorStop(0, rgba(P.white, 0.95));
    grd.addColorStop(0.30, rgba(P.hot, 0.62));
    grd.addColorStop(0.62, rgba(P.gold, 0.18));
    grd.addColorStop(1, rgba(P.gold, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return c;
  }

  /* ---------- 背景 ---------- */
  function drawBg() {
    const warm = mode === 'orbit';
    if (!bgGrad) {
      const g = ctx.createRadialGradient(cx, cy, R * 0.04, cx, cy, R * 0.99);
      if (warm) {
        g.addColorStop(0, 'rgba(62, 22, 7, 0.92)');
        g.addColorStop(0.40, 'rgba(16, 7, 4, 0.78)');
        g.addColorStop(0.78, 'rgba(6, 3, 2, 0.35)');
        g.addColorStop(1, 'rgba(3, 2, 2, 0)');
      } else {
        g.addColorStop(0, 'rgba(28, 32, 38, 0.9)');
        g.addColorStop(0.40, 'rgba(12, 14, 16, 0.75)');
        g.addColorStop(0.78, 'rgba(5, 6, 7, 0.32)');
        g.addColorStop(1, 'rgba(2, 3, 4, 0)');
      }
      bgGrad = g;
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---------- 动态尘 ---------- */
  function drawDust(dt, st) {
    const P = PAL[mode];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of dust) {
      d.a += d.v * dt * st.speed;
      const r = R * (d.r + Math.sin(performance.now() * 0.0004 + d.p) * 0.006 + smooth * 0.012);
      const x = cx + Math.cos(d.a) * r;
      const y = cy + Math.sin(d.a) * r * (mode === 'fiber' ? 0.99 : 1);
      const alpha = (0.10 + 0.45 * (0.5 + 0.5 * Math.sin(performance.now() * 0.0015 + d.p))) * st.glow;
      ctx.fillStyle = rgba(d.p > 4.6 ? P.hot : P.gold, alpha);
      ctx.fillRect(x, y, d.s, d.s);
    }
    ctx.restore();
  }

  /* ---------- 核心 ---------- */
  function drawCore(st) {
    const isFiber = mode === 'fiber';
    const t = performance.now();
    const pulse = 1 + Math.sin(t * 0.0012) * 0.02 + smooth * 0.06;

    if (isFiber) {
      const voidG = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.24);
      voidG.addColorStop(0, 'rgba(0,0,0,0.88)');
      voidG.addColorStop(0.55, 'rgba(0,0,0,0.45)');
      voidG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = voidG;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.24, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const haloR = R * (isFiber ? 0.20 : 0.24) * pulse;
    ctx.globalAlpha = (isFiber ? 0.34 : 0.72) * st.glow;
    ctx.drawImage(glowSprite, cx - haloR, cy - haloR, haloR * 2, haloR * 2);

    const nucR = R * (isFiber ? 0.045 : 0.07) * pulse;
    ctx.globalAlpha = (isFiber ? 0.7 : 1) * st.glow;
    ctx.drawImage(nucSprite, cx - nucR, cy - nucR, nucR * 2, nucR * 2);

    ctx.globalAlpha = 0.5;
    ctx.restore();

    // 十字耀斑（仅暖金）
    if (!isFiber) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flareW = R * 0.40;
      const fx = ctx.createLinearGradient(cx - flareW, cy, cx + flareW, cy);
      fx.addColorStop(0, 'rgba(255,168,64,0)');
      fx.addColorStop(0.46, 'rgba(255,232,190,0.16)');
      fx.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      fx.addColorStop(0.54, 'rgba(255,232,190,0.16)');
      fx.addColorStop(1, 'rgba(255,168,64,0)');
      ctx.fillStyle = fx;
      ctx.fillRect(cx - flareW, cy - 0.7, flareW * 2, 1.4);
      ctx.restore();
    }
  }

  /* ---------- HUD ---------- */
  function drawHud(st) {
    ctx.save();
    ctx.globalAlpha = 0.55 + st.glow * 0.4;
    ctx.drawImage(hudLayer, 0, 0, w, h);
    ctx.restore();
  }

  /* ---------- 主循环 ---------- */
  let last = performance.now();
  function frame(now) {
    // 首屏滚出视口后停画，省 GPU（由页面里的 IntersectionObserver 置 dataset.off）
    if (canvas.dataset.off === '1') { last = now; requestAnimationFrame(frame); return; }
    const dt = Math.min(48, now - last);
    last = now;
    const st = STATE[state] || STATE.idle;
    smooth += (level - smooth) * 0.12;

    const speed = (mode === 'orbit' ? 0.000030 : 0.000024) * st.speed;
    const rot = (now - t0) * speed;

    ctx.clearRect(0, 0, w, h);
    drawBg();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const sc = 1 + smooth * 0.022;
    ctx.scale(sc, sc);
    ctx.globalAlpha = st.glow;
    ctx.drawImage(fieldA, -w / 2, -h / 2, w, h);
    ctx.restore();

    drawDust(dt, st);
    drawCore(st);
    drawHud(st);

    if (smooth > 0.03) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 * smooth;
      const gr = R * (0.55 + smooth * 0.2);
      ctx.drawImage(glowSprite, cx - gr, cy - gr, gr * 2, gr * 2);
      ctx.restore();
    }

    fps.frames++;
    if (now - fps.t > 1000) { fps.value = fps.frames * 1000 / (now - fps.t); fps.frames = 0; fps.t = now; }

    if (now - hudT > 200) {
      hudT = now;
      const amp = document.getElementById('hudAmp');
      const hs = document.getElementById('hudState');
      if (amp) amp.textContent = smooth.toFixed(2);
      if (hs) hs.textContent = state.toUpperCase();
    }

    if (BENCH) {
      bench.n++;
      if (bench.n === 240) document.title = 'FPS ' + (bench.n * 1000 / (now - bench.start)).toFixed(1);
    }

    requestAnimationFrame(frame);
  }

  const bench = { n: 0, start: 0 };

  /* ---------- 对外接口 ---------- */
  window.Orb = {
    setLevel(v) { level = Math.max(0, Math.min(1, v)); },
    setState(s) { state = S_STATES.includes(s) ? s : 'idle'; },
    setMode(m) { applyMode(m); },
    getMode() { return mode; },
    getFps() { return fps.value; },
  };

  const S_STATES = ['idle', 'listening', 'thinking', 'speaking', 'error'];

  function applyMode(m) {
    mode = m === 'fiber' ? 'fiber' : 'orbit';
    localStorage.setItem('aivy.orb.mode', mode);
    document.querySelectorAll('.mode').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.mode === mode);
    });
    const label = document.getElementById('modeLabel');
    const sub = document.getElementById('modeSub');
    if (label) label.textContent = CFG[mode].label;
    if (sub) sub.textContent = CFG[mode].sub;
    build();
  }

  /* ---------- 启动 ---------- */
  document.querySelectorAll('.mode').forEach((b) => {
    b.addEventListener('click', () => applyMode(b.dataset.mode));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey && document.activeElement !== document.getElementById('input')) {
      applyMode(mode === 'orbit' ? 'fiber' : 'orbit');
    }
  });

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(resize, 160);
  });

  resize();
  applyMode(mode);
  t0 = performance.now();
  if (BENCH) bench.start = t0;
  requestAnimationFrame(frame);
})();
