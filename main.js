import * as THREE from 'three';
import { Text } from 'troika-three-text';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const FONTS = 'https://cdn.jsdelivr.net/npm/@fontsource';
const F_DISPLAY = `${FONTS}/space-grotesk@5.1.0/files/space-grotesk-latin-700-normal.woff`;
const F_MED = `${FONTS}/space-grotesk@5.1.0/files/space-grotesk-latin-500-normal.woff`;
const F_BODY = `${FONTS}/inter@5.1.0/files/inter-latin-400-normal.woff`;

const COL = { mint: 0x3df5b0, violet: 0x7b6cff, cyan: 0x2bd9ff, text: 0xe8ecff, muted: 0x9aa3c7, dark: 0x050816 };
const EMAIL = 'mailto:info@nordciel.com';
const SECTIONS = ['home', 'work', 'services', 'contact'];
const LABELS = ['HOME', 'WORK', 'SERVICES', 'CONTACT'];
const YEAR = new Date().getFullYear();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const V3 = THREE.Vector3;
const smooth = THREE.MathUtils.smoothstep;

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('sky');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  document.body.classList.remove('boot');
  document.body.classList.add('fallback');
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(COL.dark, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(COL.dark, 0.018);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
scene.add(camera);

const uTime = { value: 0 };

// ---------------------------------------------------------------------------
// Background: stars + aurora (follows the camera so it always surrounds you)
// ---------------------------------------------------------------------------
const bg = new THREE.Group();
scene.add(bg);

const STAR_COUNT = 3500;
const starPos = new Float32Array(STAR_COUNT * 3);
const starSize = new Float32Array(STAR_COUNT);
for (let i = 0; i < STAR_COUNT; i++) {
  const r = 40 + Math.random() * 80;
  const th = Math.random() * Math.PI * 2;
  const ph = Math.acos(2 * Math.random() - 1);
  starPos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
  starSize[i] = Math.random() * 1.5 + 0.5;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('size', new THREE.BufferAttribute(starSize, 1));
const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
  uniforms: { uTime, uPixelRatio: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute float size; uniform float uTime; uniform float uPixelRatio; varying float vTw;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vTw = 0.6 + 0.4 * sin(uTime * 2.0 + position.x * 10.0);
      gl_PointSize = size * uPixelRatio * (90.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying float vTw;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), smoothstep(0.5, 0.0, d) * vTw);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
}));
bg.add(stars);

function auroraMaterial(a, b, off) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uOff: { value: off } },
    vertexShader: `
      uniform float uTime; uniform float uOff; varying vec2 vUv;
      void main() {
        vUv = uv; vec3 p = position; float t = uTime * 0.25 + uOff;
        p.y += sin(p.x * 0.35 + t) * 1.2 + sin(p.x * 0.9 + t * 1.7) * 0.35;
        p.z += cos(p.x * 0.25 + t * 0.8) * 1.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uOff; varying vec2 vUv;
      void main() {
        float bands = 0.5 + 0.5 * sin(vUv.x * 40.0 + uTime * 0.6 + uOff * 3.0);
        float fy = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
        float fx = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        vec3 col = mix(uA, uB, vUv.y + 0.2 * sin(vUv.x * 6.0 + uTime * 0.3));
        gl_FragColor = vec4(col, fy * fx * (0.35 + 0.65 * bands) * 0.5);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  });
}
[
  [COL.mint, COL.violet, 0.0, 9, -26],
  [COL.cyan, 0xb26cff, 2.1, 12, -34],
  [COL.mint, COL.cyan, 4.2, 6, -42],
].forEach(([a, b, off, y, z]) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 9, 240, 20), auroraMaterial(a, b, off));
  m.position.set(0, y, z);
  m.rotation.x = -0.3;
  bg.add(m);
});

scene.add(new THREE.AmbientLight(0x6070ff, 0.6));
const keyLight = new THREE.PointLight(COL.mint, 40, 40);
const fillLight = new THREE.PointLight(COL.violet, 30, 40);
scene.add(keyLight, fillLight);

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
let booted = false;
let pendingText = 0;

function hudTextMaterial() {
  return new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
}

/** Create an SDF text mesh. */
function T(str, o = {}) {
  const t = new Text();
  t.text = str;
  t.font = o.font || F_BODY;
  t.fontSize = o.size || 0.3;
  t.color = o.color ?? COL.text;
  t.anchorX = o.ax || 'left';
  t.anchorY = o.ay || 'top';
  t.textAlign = o.align || 'left';
  t.lineHeight = o.lh || 1.2;
  t.letterSpacing = o.ls || 0;
  if (o.maxWidth) t.maxWidth = o.maxWidth;
  if (o.glow != null) {
    t.outlineWidth = 0;
    t.outlineBlur = t.fontSize * 0.5;
    t.outlineColor = o.glow;
    t.outlineOpacity = o.glowA ?? 0.45;
  }
  if (o.hud) { t.material = hudTextMaterial(); t.renderOrder = 1000; }
  t.position.set(o.x || 0, o.y || 0, o.z ?? 0.04);
  const done = () => { o.onSync?.(t); };
  if (!booted) {
    pendingText++;
    t.sync(() => { done(); if (--pendingText === 0) markReady(); });
  } else {
    t.sync(done);
  }
  return t;
}

const panelVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const panelFS = `
  uniform vec2 uSize; uniform float uTime, uHover, uOpacity, uR, uFill, uSolid; uniform vec3 uA, uB; varying vec2 vUv;
  float sdR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float d = sdR(p, uSize * 0.5 - 0.03, uR);
    float aa = fwidth(d) * 1.2 + 1e-4;
    float inside = 1.0 - smoothstep(-aa, aa, d);
    float edge = 1.0 - smoothstep(0.0, aa * 2.0 + 0.012, abs(d));
    vec3 g = mix(uA, uB, clamp(vUv.x + 0.25 * sin(uTime * 0.6 + vUv.y * 3.0), 0.0, 1.0));
    float scan = 0.5 + 0.5 * sin(p.y * 28.0 - uTime * 4.0);
    float sweep = exp(-pow((vUv.x - fract(uTime * 0.08) * 1.6 + 0.3) * 6.0, 2.0));
    vec3 col = vec3(0.04, 0.06, 0.15) + g * (0.06 + 0.10 * uHover) + g * scan * 0.02 + g * sweep * 0.08;
    col = mix(col, g * (0.95 + 0.15 * uHover), uSolid);
    float a = inside * mix(uFill + 0.12 * uHover, 1.0, uSolid);
    vec2 c = abs(vUv - 0.5) * 2.0;
    float corner = smoothstep(0.75, 1.0, c.x) * smoothstep(0.6, 1.0, c.y);
    float e = edge * (0.35 + 0.55 * uHover + 0.5 * corner);
    col = mix(col, g * 1.4, e * (1.0 - uSolid));
    a = max(a, e);
    gl_FragColor = vec4(col, a * uOpacity);
  }`;

/** Holographic glass panel with glowing border. */
function Panel(w, h, o = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: new THREE.Vector2(w, h) }, uTime,
      uHover: { value: 0 }, uOpacity: { value: 1 },
      uA: { value: new THREE.Color(o.a ?? COL.mint) }, uB: { value: new THREE.Color(o.b ?? COL.violet) },
      uR: { value: o.radius ?? 0.3 }, uFill: { value: o.fill ?? 0.42 }, uSolid: { value: o.solid ? 1 : 0 },
    },
    vertexShader: panelVS, fragmentShader: panelFS,
    transparent: true, depthWrite: false, depthTest: !o.hud,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  if (o.hud) m.renderOrder = 999;
  return m;
}

const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
function HitPlane() { return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hitMaterial); }

const lineMat = (c) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95 });
const edges = (geo, c) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(c));
const wire = (geo, c) => new THREE.LineSegments(new THREE.WireframeGeometry(geo), lineMat(c));

const ICONS = {
  piano() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const k = edges(new THREE.BoxGeometry(0.17, 0.75, 0.12), COL.mint);
      k.position.x = (i - 2) * 0.19;
      g.add(k);
    }
    for (const i of [0, 1, 3]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.14),
        new THREE.MeshBasicMaterial({ color: COL.violet, transparent: true, opacity: 0.95 }));
      b.position.set((i - 1.5) * 0.19, 0.16, 0.04);
      g.add(b);
    }
    return g;
  },
  gem: () => edges(new THREE.OctahedronGeometry(0.48, 0), COL.violet),
  ring: () => wire(new THREE.TorusGeometry(0.36, 0.1, 3, 12), COL.cyan),
  ico: () => edges(new THREE.IcosahedronGeometry(0.48, 0), COL.mint),
  knot: () => wire(new THREE.TorusKnotGeometry(0.3, 0.08, 48, 5), COL.violet),
  cube: () => edges(new THREE.BoxGeometry(0.62, 0.62, 0.62), COL.cyan),
};

function starShape(r = 1) {
  const s = new THREE.Shape();
  const pts = [[0, 1], [0.22, 0.22], [1, 0], [0.22, -0.22], [0, -1], [-0.22, -0.22], [-1, 0], [-0.22, 0.22]];
  pts.forEach(([x, y], i) => (i ? s.lineTo(x * r, y * r) : s.moveTo(x * r, y * r)));
  return new THREE.ShapeGeometry(s);
}

// ---------------------------------------------------------------------------
// Interaction registry
// ---------------------------------------------------------------------------
const hits = []; // { mesh, owner, onClick, apply(h), enabled(), h, t }
function addHit(mesh, owner, onClick, apply, enabled) {
  const e = { mesh, owner, onClick, apply, enabled, h: 0, t: 0 };
  hits.push(e);
  return e;
}
const mail = () => { window.location.href = EMAIL; };

function Button(label, o) {
  const g = new THREE.Group();
  const h = o.h ?? 0.9;
  const p = Panel(o.w, h, { radius: h / 2, fill: 0.22, solid: o.primary, hud: o.hud });
  g.add(p);
  const t = T(label, { font: F_MED, size: o.size ?? 0.24, ls: 0.12, ax: 'center', ay: 'middle',
    color: o.primary ? COL.dark : COL.text, z: 0.05, hud: o.hud });
  g.add(t);
  addHit(p, o.owner, o.onClick, (v) => {
    p.material.uniforms.uHover.value = v;
    g.scale.setScalar(1 + v * 0.04);
    g.position.z = (g.userData.z0 ?? 0) + v * 0.15;
  });
  return g;
}

function Card(o) {
  const { w, h } = o;
  const pad = 0.42;
  const g = new THREE.Group();
  const p = Panel(w, h);
  g.add(p);
  const L = -w / 2 + pad;
  const top = h / 2 - pad;
  g.add(T(o.num, { font: F_MED, size: 0.18, color: COL.mint, ls: 0.25, x: L, y: top }));
  g.add(T(o.title, { font: F_DISPLAY, size: o.compact ? 0.42 : 0.48, x: L, y: top - 0.38 }));
  g.add(T(o.body, { size: o.compact ? 0.22 : 0.25, color: COL.muted, lh: 1.5, maxWidth: w - pad * 2,
    x: L, y: top - (o.compact ? 0.98 : 1.08) }));
  if (o.footer) {
    g.add(T(o.footer, { font: F_MED, size: 0.19, ls: 0.15, color: o.footerColor ?? COL.mint, x: L, y: -h / 2 + pad, ay: 'bottom' }));
  }
  const icon = ICONS[o.icon]();
  icon.position.set(w / 2 - pad - 0.45, h / 2 - pad - 0.45, 0.35);
  icon.userData.spin = 1;
  icons.push(icon);
  g.add(icon);
  addHit(p, o.owner, o.onClick, (v) => {
    p.material.uniforms.uHover.value = v;
    g.position.z = v * 0.35;
    g.scale.setScalar(1 + v * 0.025);
    icon.userData.spin = 1 + v * 4;
  });
  return g;
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o instanceof Text) { o.dispose(); return; }
    o.geometry?.dispose();
    if (o.material && o.material !== hitMaterial) o.material.dispose?.();
  });
}

// ---------------------------------------------------------------------------
// Sections (3D world)
// ---------------------------------------------------------------------------
const POSES = {
  home: [0, 0, 0, 0],
  work: [28, 3, -26, -0.7],
  services: [-28, 6, -50, 0.7],
  contact: [0, 9, -78, 0],
};
const sections = {};
for (const name of SECTIONS) {
  const [x, y, z, yaw] = POSES[name];
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  g.userData.alpha = -1;
  scene.add(g);
  sections[name] = g;
}

let icons = [];
let crystal = null;

function makeCrystal() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6, 0),
    new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, metalness: 0.1, roughness: 0.05, transmission: 0.6, thickness: 1,
      flatShading: true, emissive: 0x1a2a6a, emissiveIntensity: 0.5, transparent: true })
  );
  const w = edges(new THREE.OctahedronGeometry(1.63, 0), COL.mint);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.015, 8, 160),
    new THREE.MeshBasicMaterial({ color: COL.violet, transparent: true, opacity: 0.7 }));
  ring1.rotation.x = Math.PI / 2.3;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.008, 8, 160),
    new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.5 }));
  ring2.rotation.x = Math.PI / 1.8;
  group.add(core, w, ring1, ring2);
  group.userData = { core, w, ring1, ring2 };
  return group;
}

function sectionHeader(g, num, label, o) {
  g.add(T(`${num} / ${label.toUpperCase()}`, { font: F_MED, size: o.small ? 0.18 : 0.22, color: COL.mint, ls: 0.3,
    x: o.x, y: o.y, ax: o.ax, align: o.align }));
  g.add(T(label, { font: F_DISPLAY, size: o.size, x: o.x, y: o.y - 0.4, ax: o.ax, align: o.align,
    glow: COL.cyan, glowA: 0.3, maxWidth: o.maxWidth }));
}

const WORK = [
  { num: '01', title: 'Pianotes', body: 'A music app for learning and practising piano notes.', footer: 'COMING SOON', footerColor: COL.violet, icon: 'piano' },
  { num: '02', title: 'Games', body: 'New games and experiences on mobile and Roblox. Coming soon.', footer: 'IN DEVELOPMENT', footerColor: COL.violet, icon: 'gem' },
  { num: '03', title: 'More apps', body: 'Small, focused tools that are a pleasure to use.', footer: 'COMING SOON', footerColor: COL.violet, icon: 'ring' },
];
const SERVICES = [
  { num: '01', title: 'Mobile & web apps', body: 'From idea to store listing: design, development and launch on Android, iOS and the web.', icon: 'ico' },
  { num: '02', title: 'Games & 3D', body: 'Playful experiences, prototypes and real-time 3D for the web and mobile.', icon: 'knot' },
  { num: '03', title: 'Custom software', body: 'Reliable tools and integrations built around how your business actually works.', icon: 'cube' },
];

function buildCards(g, owner, list, narrow) {
  list.forEach((c, i) => {
    const card = narrow
      ? Card({ ...c, owner, w: 6.4, h: 3.6, compact: true })
      : Card({ ...c, owner, w: 6.4, h: 4.4 });
    const holder = new THREE.Group();
    if (narrow) holder.position.set(0, 3.6 - i * 3.9, 0);
    else { holder.position.set((i - 1) * 7, -0.8, 0); holder.rotation.y = (1 - i) * 0.08; }
    holder.add(card);
    g.add(holder);
  });
}

function buildSections(narrow) {
  for (let i = hits.length - 1; i >= 0; i--) if (hits[i].owner !== 'hud') hits.splice(i, 1);
  icons = [];
  for (const name of SECTIONS) {
    const g = sections[name];
    disposeTree(g);
    g.clear();
    g.userData.alpha = -1;
  }

  // HOME
  const home = sections.home;
  crystal = makeCrystal();
  home.add(crystal);
  if (!narrow) {
    const L = -10.5;
    home.add(T('CANADIAN SOFTWARE STUDIO', { font: F_MED, size: 0.26, color: COL.mint, ls: 0.3, x: L, y: 3.7 }));
    home.add(T('NORDCIEL', { font: F_DISPLAY, size: 2.7, ls: 0.02, x: L, y: 3.3, glow: COL.cyan, glowA: 0.35 }));
    home.add(T('Software under the northern sky.', { font: F_MED, size: 0.62, color: COL.mint, x: L, y: 0.3, glow: COL.mint, glowA: 0.25 }));
    home.add(T('Nordciel builds apps, games and custom software, crafted with care in Ontario, Canada.',
      { size: 0.3, color: COL.muted, lh: 1.55, maxWidth: 9, x: L, y: -0.75 }));
    const b1 = Button('SEE OUR WORK', { w: 4.2, owner: 'home', primary: true, onClick: () => go(1) });
    b1.position.set(L + 2.1, -2.95, 0);
    const b2 = Button('INFO@NORDCIEL.COM', { w: 5.4, owner: 'home', onClick: mail });
    b2.position.set(L + 4.5 + 2.7, -2.95, 0);
    home.add(b1, b2);
    crystal.position.set(6.6, 0.4, 0);
    home.userData.bounds = { w: 21.5, h: 9.5, cx: -0.6, cy: 0.3 };
  } else {
    const c = { ax: 'center', align: 'center' };
    crystal.position.set(0, 4.5, -1);
    crystal.scale.setScalar(0.55);
    home.add(T('CANADIAN SOFTWARE STUDIO', { ...c, font: F_MED, size: 0.2, color: COL.mint, ls: 0.3, y: 2.45 }));
    home.add(T('NORDCIEL', { ...c, font: F_DISPLAY, size: 1.35, y: 2.1, glow: COL.cyan, glowA: 0.35 }));
    home.add(T('Software under the northern sky.', { ...c, font: F_MED, size: 0.4, color: COL.mint, maxWidth: 6.5, y: 0.45 }));
    home.add(T('Nordciel builds apps, games and custom software, crafted with care in Ontario, Canada.',
      { ...c, size: 0.25, color: COL.muted, lh: 1.55, maxWidth: 6.2, y: -0.35 }));
    const b1 = Button('SEE OUR WORK', { w: 5.6, h: 0.95, owner: 'home', primary: true, onClick: () => go(1) });
    b1.position.set(0, -2.6, 0);
    const b2 = Button('INFO@NORDCIEL.COM', { w: 5.6, h: 0.95, owner: 'home', onClick: mail });
    b2.position.set(0, -3.8, 0);
    home.add(b1, b2);
    home.userData.bounds = { w: 7.2, h: 11.6, cx: 0, cy: 0.6 };
  }

  // WORK + SERVICES
  for (const [name, num, label, list] of [['work', '02', 'Work', WORK], ['services', '03', 'Services', SERVICES]]) {
    const g = sections[name];
    if (!narrow) {
      sectionHeader(g, num, label, { x: -10.2, y: 4.9, size: 1.3 });
      buildCards(g, name, list, false);
      g.userData.bounds = { w: 22, h: 10, cx: 0, cy: 1.1 };
    } else {
      sectionHeader(g, num, label, { x: -3.2, y: 7.0, size: 0.85, small: true });
      buildCards(g, name, list, true);
      g.userData.bounds = { w: 7.2, h: 13.8, cx: 0, cy: 0.6 };
    }
  }

  // CONTACT
  const ct = sections.contact;
  const c = { ax: 'center', align: 'center' };
  if (!narrow) {
    ct.add(T('04 / CONTACT', { ...c, font: F_MED, size: 0.22, color: COL.mint, ls: 0.3, y: 3.2 }));
    ct.add(T("Let's build something.", { ...c, font: F_DISPLAY, size: 1.5, y: 2.7, glow: COL.cyan, glowA: 0.35 }));
    ct.add(T('Have a project, a question, or feedback on one of our apps?', { ...c, size: 0.34, color: COL.muted, y: 0.4 }));
    const b = Button('INFO@NORDCIEL.COM', { w: 8, h: 1.3, size: 0.4, owner: 'contact', primary: true, onClick: mail });
    b.position.set(0, -1.4, 0);
    const p = Button('PRIVACY POLICY', { w: 3.6, h: 0.7, size: 0.17, owner: 'contact', onClick: () => { location.href = 'privacy.html'; } });
    p.position.set(0, -2.9, 0);
    ct.add(b, p);
    ct.userData.bounds = { w: 17, h: 9, cx: 0, cy: 0.1 };
  } else {
    ct.add(T('04 / CONTACT', { ...c, font: F_MED, size: 0.18, color: COL.mint, ls: 0.3, y: 3.0 }));
    ct.add(T("Let's build something.", { ...c, font: F_DISPLAY, size: 0.85, maxWidth: 6.4, y: 2.6, glow: COL.cyan, glowA: 0.35 }));
    ct.add(T('Have a project, a question, or feedback on one of our apps?', { ...c, size: 0.26, maxWidth: 6, color: COL.muted, lh: 1.5, y: 0.5 }));
    const b = Button('INFO@NORDCIEL.COM', { w: 6.2, h: 1.1, size: 0.3, owner: 'contact', primary: true, onClick: mail });
    b.position.set(0, -1.2, 0);
    const p = Button('PRIVACY POLICY', { w: 3.4, h: 0.7, size: 0.16, owner: 'contact', onClick: () => { location.href = 'privacy.html'; } });
    p.position.set(0, -2.5, 0);
    ct.add(b, p);
    ct.userData.bounds = { w: 7.2, h: 9, cx: 0, cy: 0.2 };
  }

  for (const name of SECTIONS) sections[name].updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// HUD (menu, progress, footer) — attached to the camera
// ---------------------------------------------------------------------------
const HUD_Z = 5;
const hud = new THREE.Group();
hud.position.z = -HUD_Z;
camera.add(hud);
let hudEls = null;
let menuOpen = false;

function textWidth(t, fallback) {
  const b = t.textRenderInfo?.blockBounds;
  return b ? b[2] - b[0] : fallback;
}

function buildHud(narrow) {
  for (let i = hits.length - 1; i >= 0; i--) if (hits[i].owner === 'hud') hits.splice(i, 1);
  disposeTree(hud);
  hud.clear();
  menuOpen = false;

  const relayout = () => layoutHud();
  const E = { narrow };

  E.star = new THREE.Mesh(starShape(0.13), new THREE.MeshBasicMaterial({ color: COL.mint, depthTest: false, transparent: true }));
  E.star.renderOrder = 1000;
  E.brand = T('NORDCIEL', { font: F_DISPLAY, size: 0.17, ls: 0.18, ay: 'middle', hud: true, onSync: relayout });
  E.brandHit = HitPlane();
  addHit(E.brandHit, 'hud', () => go(0), (v) => { E.star.rotation.z = v * Math.PI / 2; });
  hud.add(E.star, E.brand, E.brandHit);

  // Menu items
  E.items = LABELS.map((label, i) => {
    const t = T(label, { font: F_MED, size: narrow ? 0.16 : 0.13, ls: 0.2, ax: 'right', ay: 'middle', hud: true,
      color: COL.muted, onSync: relayout });
    const hit = HitPlane();
    const e = addHit(hit, 'hud', () => go(i), (v) => {
      t.color = new THREE.Color(COL.muted).lerp(new THREE.Color(i === current ? COL.mint : COL.text), Math.max(v, i === current ? 1 : 0));
    }, () => !narrow || menuOpen);
    e.forceApply = true;
    hud.add(t, hit);
    return { t, hit };
  });

  E.bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.012), new THREE.MeshBasicMaterial({ color: COL.mint, depthTest: false, transparent: true }));
  E.bar.renderOrder = 1001;
  hud.add(E.bar);

  if (narrow) {
    E.toggle = T('MENU', { font: F_MED, size: 0.15, ls: 0.25, ax: 'right', ay: 'middle', hud: true, color: COL.text, onSync: relayout });
    E.toggleHit = HitPlane();
    addHit(E.toggleHit, 'hud', () => setMenu(!menuOpen), (v) => { E.toggle.color = v > 0.5 ? COL.mint : COL.text; });
    E.menuPanel = Panel(2.3, 2.3, { hud: true, radius: 0.18, fill: 0.85 });
    hud.add(E.menuPanel, E.toggle, E.toggleHit);
  } else {
    // Section progress rail
    E.dots = SECTIONS.map(() => {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.28), new THREE.MeshBasicMaterial({ color: COL.muted, depthTest: false, transparent: true, opacity: 0.5 }));
      d.renderOrder = 1000;
      hud.add(d);
      return d;
    });
    E.counter = T('01', { font: F_DISPLAY, size: 0.2, ax: 'right', ay: 'middle', hud: true, color: COL.mint });
    E.counterTotal = T('/ 04', { font: F_MED, size: 0.1, ax: 'right', ay: 'middle', hud: true, color: COL.muted, ls: 0.1 });
    hud.add(E.counter, E.counterTotal);
  }

  E.copy = T(narrow ? `© ${YEAR} NORDCIEL` : `© ${YEAR} NORDCIEL  ·  ONTARIO, CANADA`,
    { font: F_MED, size: 0.085, ls: 0.15, ay: 'bottom', hud: true, color: COL.muted });
  E.privacy = T('PRIVACY POLICY', { font: F_MED, size: 0.085, ls: 0.15, ax: 'right', ay: 'bottom', hud: true, color: COL.muted, onSync: relayout });
  E.privacyHit = HitPlane();
  addHit(E.privacyHit, 'hud', () => { location.href = 'privacy.html'; }, (v) => { E.privacy.color = v > 0.5 ? COL.mint : COL.muted; });
  E.hint = T(narrow ? 'SWIPE TO EXPLORE' : 'SCROLL TO EXPLORE', { font: F_MED, size: 0.08, ls: 0.35, ax: 'center', ay: 'bottom', hud: true, color: COL.text });
  hud.add(E.copy, E.privacy, E.privacyHit, E.hint);

  hudEls = E;
  layoutHud();
}

function setMenu(open) {
  menuOpen = open;
  layoutHud();
}

function layoutHud() {
  const E = hudEls;
  if (!E) return;
  const hh = 2 * HUD_Z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const hw = hh * camera.aspect;
  const m = Math.min(0.32, hw * 0.06);
  const top = hh / 2 - m - 0.08;
  const left = -hw / 2 + m;
  const right = hw / 2 - m;

  E.star.position.set(left + 0.13, top, 0);
  E.brand.position.set(left + 0.36, top, 0);
  const bw = textWidth(E.brand, 1.1);
  E.brandHit.scale.set(bw + 0.6, 0.45, 1);
  E.brandHit.position.set(left + (bw + 0.36) / 2, top, 0);

  if (!E.narrow) {
    let x = right;
    for (let i = E.items.length - 1; i >= 0; i--) {
      const { t, hit } = E.items[i];
      const w = textWidth(t, LABELS[i].length * 0.11);
      t.position.set(x, top, 0);
      hit.scale.set(w + 0.3, 0.45, 1);
      hit.position.set(x - w / 2, top, 0);
      t.userData.w = w;
      x -= w + 0.45;
    }
    E.dots.forEach((d, i) => d.position.set(right - 0.02, 0.55 - i * 0.37, 0));
    E.counter.position.set(right - 0.12, -1.0, 0);
    E.counterTotal.position.set(right - 0.12, -1.25, 0);
  } else {
    E.toggle.position.set(right, top, 0);
    const tw = textWidth(E.toggle, 0.6);
    E.toggleHit.scale.set(tw + 0.5, 0.5, 1);
    E.toggleHit.position.set(right - tw / 2, top, 0);
    E.items.forEach(({ t, hit }, i) => {
      const y = top - 0.6 - i * 0.45;
      const w = textWidth(t, LABELS[i].length * 0.13);
      t.position.set(right - 0.2, y, 0);
      t.visible = menuOpen;
      hit.visible = menuOpen;
      hit.scale.set(2.1, 0.42, 1);
      hit.position.set(right - 1.05, y, 0);
      t.userData.w = w;
    });
    E.menuPanel.visible = menuOpen;
    E.menuPanel.position.set(right - 1.05, top - 0.6 - 0.675, -0.01);
    const label = menuOpen ? 'CLOSE' : 'MENU';
    if (E.toggle.text !== label) E.toggle.text = label;
  }

  const bottom = -hh / 2 + m;
  E.copy.position.set(left, bottom, 0);
  E.privacy.position.set(right, bottom, 0);
  const pw = textWidth(E.privacy, 1.2);
  E.privacyHit.scale.set(pw + 0.3, 0.35, 1);
  E.privacyHit.position.set(right - pw / 2, bottom + 0.05, 0);
  E.hint.position.set(0, bottom + (E.narrow ? 0.3 : 0), 0);
  updateHudActive();
}

function updateHudActive() {
  const E = hudEls;
  if (!E) return;
  E.items.forEach(({ t }, i) => { t.color = i === current ? COL.mint : COL.muted; });
  const a = E.items[current].t;
  E.barTarget = E.narrow
    ? { x: a.position.x + 0.1, y: a.position.y, w: 0.06 }
    : { x: a.position.x - (a.userData.w ?? 0.5) / 2, y: a.position.y - 0.17, w: a.userData.w ?? 0.5 };
  E.bar.visible = !E.narrow || menuOpen;
  if (!E.narrow) {
    E.dots.forEach((d, i) => {
      d.material.color.set(i === current ? COL.mint : COL.muted);
      d.material.opacity = i === current ? 1 : 0.4;
      d.scale.y = i === current ? 1.3 : 1;
    });
    const n = String(current + 1).padStart(2, '0');
    if (E.counter.text !== n) E.counter.text = n;
  }
}

// ---------------------------------------------------------------------------
// Camera navigation
// ---------------------------------------------------------------------------
let current = 0;
let transition = null;
const base = { p: new V3(), q: new THREE.Quaternion() };
const fov2 = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

function poseFor(i) {
  const g = sections[SECTIONS[i]];
  const b = g.userData.bounds;
  const dist = Math.max((b.h * 1.2) / (2 * fov2()), (b.w * 1.1) / (2 * fov2() * camera.aspect), 9);
  const p = g.localToWorld(new V3(b.cx, b.cy, dist));
  return { p, q: g.quaternion.clone(), dist };
}

function go(i, instant = false) {
  if (i < 0 || i >= SECTIONS.length) return;
  if (i === current && !transition && !instant) { setMenu(false); return; }
  current = i;
  const to = poseFor(i);
  if (instant) { base.p.copy(to.p); base.q.copy(to.q); transition = null; }
  else transition = { from: { p: base.p.clone(), q: base.q.clone() }, to, t0: performance.now(), dur: reduceMotion ? 300 : 1900 };
  if (hudEls?.narrow) setMenu(false); else updateHudActive();
  history.replaceState(null, '', i ? `#${SECTIONS[i]}` : location.pathname + location.search);
}

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const pointer = new THREE.Vector2(9, 9);
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
const raycaster = new THREE.Raycaster();
let hovered = null;
let down = null;

function activeHits() {
  return hits.filter((e) => (e.owner === 'hud' || (e.owner === SECTIONS[current] && !transition)) && (!e.enabled || e.enabled()));
}
function pick(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const list = activeHits();
  const res = raycaster.intersectObjects(list.map((e) => e.mesh), false);
  if (!res.length) return null;
  // HUD wins over world
  const hudHit = res.find((r) => list.find((e) => e.mesh === r.object)?.owner === 'hud');
  const obj = (hudHit || res[0]).object;
  return list.find((e) => e.mesh === obj) || null;
}
const toNdc = (e) => new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);

canvas.addEventListener('pointermove', (e) => {
  pointer.copy(toNdc(e));
  if (e.pointerType === 'mouse') {
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / innerHeight) * 2 - 1;
  }
});
canvas.addEventListener('pointerleave', () => pointer.set(9, 9));
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, type: e.pointerType }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x;
  const dy = e.clientY - down.y;
  const wasTouch = down.type !== 'mouse';
  down = null;
  if (wasTouch && Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
    if (!transition) go(current + (dy < 0 ? 1 : -1));
    return;
  }
  if (Math.hypot(dx, dy) < 10) {
    const hit = pick(toNdc(e));
    if (hit?.onClick) hit.onClick();
    else if (menuOpen) setMenu(false);
  }
});

let wheelAcc = 0;
let wheelLock = 0;
window.addEventListener('wheel', (e) => {
  if (document.body.classList.contains('fallback')) return;
  e.preventDefault();
  const now = performance.now();
  if (transition || now < wheelLock) return;
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) > 40) {
    go(current + Math.sign(wheelAcc));
    wheelAcc = 0;
    wheelLock = now + 500;
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (document.body.classList.contains('fallback')) return;
  if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(current + 1); }
  else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(current - 1); }
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(SECTIONS.length - 1);
  else if (e.key === 'Escape') setMenu(false);
});

// Accessible HTML nav links drive the 3D camera too
document.querySelectorAll('[data-go]').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (document.body.classList.contains('fallback')) return;
    e.preventDefault();
    go(Number(a.dataset.go));
  });
  a.addEventListener('focus', () => { if (!document.body.classList.contains('fallback')) go(Number(a.dataset.go)); });
});

// ---------------------------------------------------------------------------
// Resize / layout
// ---------------------------------------------------------------------------
let narrowMode = null;
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const narrow = camera.aspect < 0.95;
  if (narrow !== narrowMode) {
    narrowMode = narrow;
    buildSections(narrow);
    buildHud(narrow);
  } else {
    layoutHud();
  }
  if (booted && !transition) go(current, true);
}
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });
resize();

// Start pose: far back, waiting for fonts
const startIdx = Math.max(0, SECTIONS.indexOf(location.hash.slice(1)));
{
  const p = poseFor(0);
  base.p.copy(p.p).add(new V3(0, 5, 30));
  base.q.copy(p.q);
}

function markReady() {
  if (booted) return;
  booted = true;
  window.__ncReady = true;
  document.body.classList.remove('boot', 'fallback');
  current = -1;
  go(startIdx);
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  uTime.value += reduceMotion ? dt * 0.15 : dt;
  const t = uTime.value;

  // Camera transition
  if (transition) {
    let k = (performance.now() - transition.t0) / transition.dur;
    if (k >= 1) k = 1;
    const e = ease(k);
    base.p.lerpVectors(transition.from.p, transition.to.p, e);
    base.q.slerpQuaternions(transition.from.q, transition.to.q, e);
    if (!reduceMotion) {
      const arc = Math.sin(Math.PI * e);
      base.p.y += arc * 3;
      base.p.add(new V3(0, 0, 1).applyQuaternion(base.q).multiplyScalar(arc * 7));
    }
    if (k === 1) transition = null;
  }

  // Parallax
  if (!reduceMotion) {
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
  }
  const right = new V3(1, 0, 0).applyQuaternion(base.q);
  const up = new V3(0, 1, 0).applyQuaternion(base.q);
  camera.position.copy(base.p).addScaledVector(right, mouse.x * 0.6).addScaledVector(up, -mouse.y * 0.4);
  tmpE.set(-mouse.y * 0.025, -mouse.x * 0.04, 0);
  camera.quaternion.copy(base.q).multiply(tmpQ.setFromEuler(tmpE));

  bg.position.copy(base.p);
  stars.rotation.y = t * 0.01;
  keyLight.position.copy(base.p).add(new V3(6, 4, -6));
  fillLight.position.copy(base.p).add(new V3(-5, -3, -8));

  // Section visibility by distance to their camera pose
  SECTIONS.forEach((name, i) => {
    const g = sections[name];
    const d = base.p.distanceTo(poseFor(i).p);
    const a = 1 - smooth(d, 3, 26);
    if (Math.abs(a - g.userData.alpha) > 0.003) {
      g.userData.alpha = a;
      setOpacity(g, a);
    }
  });

  // Crystal + icons
  if (crystal) {
    const { core, w, ring1, ring2 } = crystal.userData;
    core.rotation.y = t * 0.4;
    core.rotation.x = Math.sin(t * 0.3) * 0.3;
    w.rotation.copy(core.rotation);
    ring1.rotation.z = t * 0.2;
    ring2.rotation.z = -t * 0.12;
    crystal.position.y += Math.sin(t * 1.2) * 0.002;
  }
  icons.forEach((ic) => { ic.rotation.y += dt * 0.6 * ic.userData.spin; ic.rotation.x = Math.sin(t * 0.7) * 0.25; });

  // Hover
  const h = pointer.x < 2 ? pick(pointer) : null;
  if (h !== hovered) {
    if (hovered) hovered.t = 0;
    hovered = h;
    if (hovered) hovered.t = 1;
    canvas.style.cursor = hovered?.onClick ? 'pointer' : 'default';
  }
  for (const e of hits) {
    const prev = e.h;
    e.h += (e.t - e.h) * 0.15;
    if (Math.abs(e.h - prev) > 0.0005 || e.forceApply) e.apply?.(e.h);
  }

  // HUD details
  if (hudEls) {
    const E = hudEls;
    if (E.barTarget) {
      E.bar.position.x += (E.barTarget.x - E.bar.position.x) * 0.15;
      E.bar.position.y += (E.barTarget.y - E.bar.position.y) * 0.15;
      E.bar.scale.x += (E.barTarget.w - E.bar.scale.x) * 0.15;
    }
    E.star.rotation.z += dt * 0.3;
    const hintA = current === 0 && !transition ? 0.35 + 0.35 * Math.sin(t * 2.5) : 0;
    E.hint.fillOpacity += (hintA - E.hint.fillOpacity) * 0.1;
  }

  renderer.render(scene, camera);
}

function setOpacity(root, a) {
  root.traverse((o) => {
    if (o instanceof Text) {
      const u = o.userData;
      if (u.bf === undefined) { u.bf = o.fillOpacity ?? 1; u.bo = o.outlineOpacity ?? 0; }
      o.fillOpacity = u.bf * a;
      o.outlineOpacity = u.bo * a;
      o.visible = a > 0.01;
      return;
    }
    const m = o.material;
    if (!m || m === hitMaterial) return;
    if (m.uniforms?.uOpacity) m.uniforms.uOpacity.value = a;
    else {
      if (m.userData.bo === undefined) m.userData.bo = m.opacity;
      m.opacity = m.userData.bo * a;
    }
    o.visible = a > 0.01;
  });
}

frame();
