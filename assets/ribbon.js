/* ribbon.js — 作品 ribbon（three.js），从 site-v3-works 迁入并改为「相对 section 进度」
   原版用全局 scrollY / (#track 高度 - 视口)，合并后在长页面里会算错，这里改用 trackTop 偏移。 */
import * as THREE from 'three';

const BASE = './media/';
const WORK = [
  ['脆哨 · 产品片', 'cuishao.mp4'],
  ['熙源国际 · 品牌宣传片', 'xiyuan.mp4'],
  ['柯基 · 旅拍 MV', 'keji.mp4'],
  ['浩宇 · 开工片', 'haoyu.mp4'],
  ['云西乐咖啡 · 品牌片', 'yunxile.mp4'],
  ['花卉园 · 采风片', 'huahui.mp4'],
];
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const out = (t) => 1 - (1 - t) ** 3;
const span = (p, a, b) => clamp((p - a) / (b - a));

function boot() {
  const canvas = $('gl');
  const track = $('track');
  const stage = $('w-stage');
  if (!canvas || !track || !stage) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    if (!renderer.getContext()) throw new Error('no webgl context');
  } catch (e) {
    window.__ribbonReady = true;  // 页面兜底脚本会出静态网格
    return;
  }
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;


  /* 无 WebGL 兜底：静态六格，滚动进场即显示 */
  function fallback() {
    const head = document.getElementById('l1'), head2 = document.getElementById('l2');
    if (head) head.style.transform = 'translate3d(-50vw,0,0)';
    if (head2) head2.style.transform = 'translate3d(50vw,0,0)';
    const cap = document.getElementById('cap');
    if (cap) cap.style.opacity = '0';
    const hint = document.getElementById('w-hint');
    if (hint) hint.style.display = 'none';
    canvas.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-content:center;padding:0 5vw;';
    const POSTERS = [
      ['脆哨 · 产品片', 'cuishao'], ['熙源国际 · 品牌宣传片', 'xiyuan'], ['柯基 · 旅拍 MV', 'keji'],
      ['浩宇 · 开工片', 'haoyu'], ['云西乐咖啡 · 品牌片', 'yunxile'], ['花卉园 · 采风片', 'huahui'],
    ];
    const mq = window.matchMedia('(max-width:820px)');
    function cols() {
      wrap.style.gridTemplateColumns = mq.matches ? 'repeat(2,1fr)' : 'repeat(3,1fr)';
      wrap.style.padding = mq.matches ? '0 6vw' : '0 5vw';
    }
    cols();
    mq.addEventListener('change', cols);
    POSTERS.forEach(([title, file]) => {
      const fig = document.createElement('figure');
      fig.style.cssText = 'position:relative;margin:0;aspect-ratio:16/9;border-radius:6px;overflow:hidden;background:#120a05;';
      const img = document.createElement('img');
      img.src = './media/poster-' + file + '.jpg';
      img.alt = title;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      const tag = document.createElement('figcaption');
      tag.textContent = title;
      tag.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:8px 10px;font:500 11px/1.3 system-ui,sans-serif;color:#f0e0d0;background:linear-gradient(to top,rgba(6,4,3,.92),rgba(6,4,3,0));';
      fig.append(img, tag);
      wrap.appendChild(fig);
    });
    stage.appendChild(wrap);
    renderFallbackHead();
    window.addEventListener('scroll', renderFallbackHead, { passive: true });
    function renderFallbackHead() {
      const r = track.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.max(0, Math.min(1, (-r.top) / Math.max(1, track.offsetHeight - vh)));
      const run = -50 + 126 * Math.min(1, p / 0.58);
      if (head) head.style.transform = `translate3d(${run}vw,0,0)`;
      if (head2) head2.style.transform = `translate3d(${-run}vw,0,0)`;
      if (hint) hint.style.display = 'none';
    }
  }

  const scene = new THREE.Scene();
  const FOV = 35;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  let path, PATH_L = 1;
  const SAMPLES = 1200, pathP = [], pathT = [];
  const PH0 = -1.5, PH1 = Math.PI * 2 + 1.35;

  function buildPath() {
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const t = i / 160, ph = mix(PH0, PH1, t), cs = Math.cos(ph), u = 2 * t - 1;
      const depth = cs > 0 ? 7.6 + 16.4 * cs ** 0.9 : 7.6 + 2.2 * cs;
      const edge = 0.84 + 0.5 * span(0.14 - t, 0, 0.14) + 0.8 * span(t, 0.84, 1);
      pts.push(new THREE.Vector3(
        edge * Math.sin(ph) * depth * 0.561,
        0.5 * Math.sign(u) * Math.abs(u) ** 1.4 * depth * 0.63,
        -depth
      ));
    }
    path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    path.arcLengthDivisions = 1500;
    PATH_L = path.getLength();
    pathP.length = pathT.length = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const u = i / SAMPLES;
      pathP.push(path.getPointAt(u));
      pathT.push(path.getTangentAt(u));
    }
  }

  const at = (s, op, ot) => {
    const f = clamp(s / PATH_L) * SAMPLES;
    const i = Math.min(SAMPLES - 1, Math.floor(f));
    const k = f - i;
    op.lerpVectors(pathP[i], pathP[i + 1], k);
    ot.lerpVectors(pathT[i], pathT[i + 1], k).normalize();
  };

  const CARD_W = 2.1, CARD_H = 1.32, GAP = 0.03, STEP = CARD_W + GAP, NX = 28, NY = 3;

  const vs = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const fs = `uniform sampler2D map;uniform vec2 cover;uniform float aspect,ready,radius;varying vec2 vUv;
void main(){
  vec2 q=(abs(vUv-.5)-.5)*vec2(aspect,1.)+radius;
  float d=length(max(q,0.))+min(max(q.x,q.y),0.)-radius;
  float px=fwidth(d),a=1.-smoothstep(-px,px,d);
  if(a<.01)discard;
  vec2 uv=vUv;if(!gl_FrontFacing)uv.x=1.-uv.x;
  vec3 c=mix(vec3(.075),texture2D(map,(uv-.5)*cover+.5).rgb,ready);
  float edge=smoothstep(-.012-px,-.012,d);
  gl_FragColor=vec4(mix(c,vec3(1.),edge*.1),a);
}`;

  const cards = WORK.map(([title, src], i) => {
    const v = document.createElement('video');
    Object.assign(v, { crossOrigin: 'anonymous', muted: true, loop: true, playsInline: true, preload: 'none', src: BASE + src });
    v.setAttribute('playsinline', '');
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const geo = new THREE.PlaneGeometry(1, 1, NX, NY);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vs, fragmentShader: fs, transparent: true, side: THREE.DoubleSide,
      uniforms: {
        map: { value: tex }, cover: { value: new THREE.Vector2(1, 1) },
        aspect: { value: CARD_W / CARD_H }, ready: { value: 0 }, radius: { value: 0.018 },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const c = { i, title, v, tex, geo, mat, mesh, rect: null };
    v.addEventListener('loadeddata', () => {
      const va = v.videoWidth / v.videoHeight, ca = CARD_W / CARD_H;
      mat.uniforms.cover.value.set(va > ca ? ca / va : 1, va > ca ? 1 : va / ca);
      mat.uniforms.ready.value = 1;
    });
    return c;
  });

  const GZ = 8;
  let W = 1, H = 1, asp = 1, cols = 3, rows = 2, tanH = 0.3153;

  function resize() {
    W = stage.clientWidth || window.innerWidth;
    H = stage.clientHeight || window.innerHeight;
    asp = W / H;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H, false);
    camera.aspect = asp;
    camera.fov = asp < 16 / 9 ? (Math.atan(0.561 / asp) * 360) / Math.PI : FOV;
    camera.updateProjectionMatrix();
    tanH = Math.tan((camera.fov * Math.PI) / 360);
    cols = asp < 0.9 ? 2 : 3;
    rows = asp < 0.9 ? 3 : 2;
  }
  window.addEventListener('resize', resize);
  resize();
  buildPath();

  function grid(i) {
    const vh = 2 * GZ * tanH, vw = vh * asp;
    const portrait = asp < 0.9;
    const gw = vw * (portrait ? 0.92 : 0.74);
    const gap = gw * 0.017;
    const cw = (gw - gap * (cols - 1)) / cols;
    const ch = cw / (CARD_W / CARD_H);
    // 竖屏三行在屏幕上会挤成中间一团：把行距拉开，占满视口高度的一半以上
    const gh = portrait ? vh * 0.52 : ch * rows + gap * 1.6 * (rows - 1);
    const step = portrait ? (gh - ch) / (rows - 1) : ch + gap * 1.6;
    const c = i % cols, r = Math.floor(i / cols);
    return {
      x: -gw / 2 + cw / 2 + c * (cw + gap),
      y: gh / 2 - ch / 2 - r * step,
      w: cw, h: ch, vw, vh, c, r,
    };
  }

  let target = 0, p = 0, frozen = false;

  // 关键改动：进度相对 #track 计算，而不是全局滚动位置
  function readScroll() {
    const top = track.getBoundingClientRect().top + window.scrollY;
    const spanPx = track.offsetHeight - window.innerHeight;
    target = clamp((window.scrollY - top) / Math.max(1, spanPx));
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', readScroll);
  readScroll();

  if (location.search.includes('p=')) {
    const val = parseFloat(location.search.match(/p=([\d.]+)/)[1]);
    target = p = val;
    frozen = true;
  }

  const op = new THREE.Vector3(), ot = new THREE.Vector3(), up = new THREE.Vector3(),
    Y = new THREE.Vector3(0, 1, 0), vp = new THREE.Vector3();

  function poseRibbon(c, head) {
    const pos = c.geo.attributes.position, centre = head - c.i * STEP;
    for (let iy = 0; iy <= NY; iy++) {
      for (let ix = 0; ix <= NX; ix++) {
        const k = iy * (NX + 1) + ix, lu = ix / NX - 0.5, lv = 0.5 - iy / NY;
        at(centre + lu * CARD_W, op, ot);
        up.copy(Y).addScaledVector(ot, -Y.dot(ot)).normalize();
        vp.copy(op).addScaledVector(up, lv * CARD_H);
        pos.setXYZ(k, vp.x, vp.y, vp.z);
      }
    }
    pos.needsUpdate = true;
  }

  function poseGrid(c, q) {
    const g = grid(c.i), pos = c.geo.attributes.position;
    const dx = (g.c - (cols - 1) / 2) * 1.2;
    const dy = g.r < rows / 2 ? 1 : -1;
    const ox = dx * g.vw * 0.62 * (1 - q);
    const oy = dy * g.vh * (g.c === 1 ? 0.95 : 0.34) * (1 - q);
    const tilt = (1 - q) * 0.22 * ((g.c - 1) || 0.5) * dy;
    const cs = Math.cos(tilt), sn = Math.sin(tilt);
    for (let iy = 0; iy <= NY; iy++) {
      for (let ix = 0; ix <= NX; ix++) {
        const k = iy * (NX + 1) + ix;
        const x = (ix / NX - 0.5) * g.w, y = (0.5 - iy / NY) * g.h;
        pos.setXYZ(
          k,
          g.x + ox + x * cs - y * sn,
          g.y + oy + x * sn + y * cs,
          -GZ - (1 - q) * 0.6 * Math.sin((ix / NX) * Math.PI)
        );
      }
    }
    pos.needsUpdate = true;
    c.rect = g;
  }

  const RIB_A = 0.14, RIB_B = 0.63;

  function render() {
    const pp = p;
    const rise = 1 - out(span(pp, 0, 0.12));
    const run = mix(-50, 76, span(pp, 0, 0.58));
    $('l1').style.transform = `translate3d(${run}vw,${rise * 34}vh,0)`;
    $('l2').style.transform = `translate3d(${-run}vw,${rise * 34}vh,0)`;

    const capA = 1 - span(pp, 0.52, 0.57);
    const cap = $('cap');
    cap.style.opacity = capA;
    cap.style.transform = `translate(-50%,calc(-50% + ${rise * 34}vh))`;

    const intro = 1 - span(pp, 0, 0.05);
    const headA = 1 - span(pp, 0.86, 0.94);
    $('l1').style.opacity = headA; $('l2').style.opacity = headA;
    ['w-hint', 'cross', 'glow'].forEach((id) => { const el = $(id); if (el) el.style.opacity = intro; });
    $('rule').style.transform = `scaleX(${ease(span(pp, 0.72, 0.86))})`;

    const pr = span(pp, RIB_A, RIB_B);
    const head = mix(0, PATH_L + cards.length * STEP, pr);

    for (const c of cards) {
      const s = head - c.i * STEP, end = PATH_L - CARD_W;
      if (s < end) {
        c.mesh.visible = s > CARD_W;
        c.rect = null;
        if (c.mesh.visible) poseRibbon(c, head);
      } else if (c.i < cols * rows) {
        const st = mix(RIB_A, RIB_B, (end + c.i * STEP) / (PATH_L + cards.length * STEP));
        const q = out(span(pp, st, st + 0.13));
        c.mesh.visible = q > 0.001;
        if (c.mesh.visible) poseGrid(c, q);
      } else {
        c.mesh.visible = false;
        c.rect = null;
      }
    }
    renderer.render(scene, camera);
  }

  const nameEl = $('w-name');
  stage.addEventListener('pointermove', (e) => {
    let hit = null;
    if (p > 0.86) {
      const nx = e.clientX / W - 0.5, ny = 0.5 - e.clientY / H;
      for (const c of cards) {
        const g = c.rect;
        if (!g) continue;
        const x = nx * g.vw, y = ny * g.vh;
        if (Math.abs(x - g.x) < g.w / 2 && Math.abs(y - g.y) < g.h / 2) hit = c;
      }
    }
    nameEl.style.opacity = hit ? 1 : 0;
    if (hit) {
      nameEl.textContent = hit.title;
      nameEl.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 16}px)`;
    }
  });

  // 离屏时停掉渲染与视频，回到视口再继续
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { rootMargin: '200px' }).observe(stage);
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    if (!frozen) {
      p += (target - p) * 0.09;
      if (Math.abs(target - p) < 0.00005) p = target;
      for (const c of cards) {
        if (c.mesh.visible && c.v.paused) c.v.play().catch(() => {});
        else if (!c.mesh.visible && !c.v.paused) c.v.pause();
      }
      render();
    }
  }
  loop();
  window.__ribbonReady = true;
}

boot();