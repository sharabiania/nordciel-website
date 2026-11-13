import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { initI18n, t as tr, getLang, setLang, onLangChange, LANGUAGES } from './i18n.js?v=__BUILD__';
import { email, openMail, SOCIALS } from './contact.js?v=__BUILD__';

await initI18n();
const up = (key, params) => String(tr(key, params)).toUpperCase();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const FONTS = 'https://cdn.jsdelivr.net/npm/@fontsource';
const F_DISPLAY = `${FONTS}/space-grotesk@5.1.0/files/space-grotesk-latin-700-normal.woff`;
const F_MED = `${FONTS}/space-grotesk@5.1.0/files/space-grotesk-latin-500-normal.woff`;
const F_BODY = `${FONTS}/inter@5.1.0/files/inter-latin-400-normal.woff`;

const COL = { mint: 0x3df5b0, violet: 0x7b6cff, cyan: 0x2bd9ff, text: 0xe8ecff, muted: 0x9aa3c7, dark: 0x050816 };
const SECTIONS = ['home', 'work', 'services', 'contact'];
const navLabels = () => SECTIONS.map((s) => up(`nav.${s}`));
const YEAR = new Date().getFullYear();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Phones and tablets get a lighter scene (fewer stars, lower pixel ratio, no glass refraction).
const LOW_POWER = window.matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;

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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_POWER ? 1.5 : 2));
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

const STAR_COUNT = LOW_POWER ? 2200 : 3500;
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

// ---------------------------------------------------------------------------
// Constellations: every few seconds a handful of nearby stars (as seen on
// screen) are linked by a minimum spanning tree, drawn line by line, held,
// then faded out. Lines live in the star field, so they drift with it.
// ---------------------------------------------------------------------------
const constellations = [];
const constellationLayer = new THREE.Group();
stars.add(constellationLayer);

const nodeMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute float aAlpha; uniform float uPixelRatio; varying float vA;
    void main() {
      vA = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 14.0 * uPixelRatio;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float core = smoothstep(0.12, 0.0, d);
      float halo = smoothstep(0.5, 0.0, d) * 0.35;
      gl_FragColor = vec4(mix(vec3(0.24, 0.96, 0.69), vec3(1.0), core), (core + halo) * vA);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});

const _w = new V3();
function screenStars() {
  // Project every star once; keep those comfortably on screen.
  stars.updateMatrixWorld();
  const out = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    _w.fromArray(starPos, i * 3).applyMatrix4(stars.matrixWorld).project(camera);
    if (_w.z < 1 && Math.abs(_w.x) < 0.92 && Math.abs(_w.y) < 0.85) out.push({ i, x: _w.x * camera.aspect, y: _w.y });
  }
  return out;
}

// Screen rectangles (x scaled by aspect) of the text, cards and menu currently
// on screen, so constellations only form in empty sky.
const _box = new THREE.Box3();
const _corner = new V3();
function contentBoxes() {
  const boxes = [];
  const roots = [hud];
  if (current >= 0) roots.push(sections[SECTIONS[current]]);
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const isPanel = o.isMesh && o.material?.uniforms?.uSize;
      if (!(o instanceof Text) && !isPanel && !o.userData.avoid) return;
      if (!o.visible) return;
      _box.setFromObject(o);
      if (_box.isEmpty()) return;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        _corner.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).project(camera);
        x0 = Math.min(x0, _corner.x); x1 = Math.max(x1, _corner.x);
        y0 = Math.min(y0, _corner.y); y1 = Math.max(y1, _corner.y);
      }
      boxes.push([x0 * camera.aspect, x1 * camera.aspect, y0, y1]);
    });
  }
  return boxes;
}
const PAD = 0.05;
const inBoxes = (boxes, x, y) => boxes.some(([x0, x1, y0, y1]) => x > x0 - PAD && x < x1 + PAD && y > y0 - PAD && y < y1 + PAD);
const edgeHitsBoxes = (boxes, a, b) => {
  for (let k = 1; k < 10; k++) {
    const f = k / 10;
    if (inBoxes(boxes, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)) return true;
  }
  return false;
};

function spawnConstellation() {
  const used = new Set(constellations.flatMap((c) => c.nodes));
  const boxes = contentBoxes();
  const pool = screenStars().filter((s) => !used.has(s.i) && !inBoxes(boxes, s.x, s.y));
  if (pool.length < 20) return false;
  // Prefer the sky above/around the content: upper half or the sides.
  const seeds = pool.filter((s) => starSize[s.i] > 1.2 && (s.y > 0.2 || Math.abs(s.x) > camera.aspect * 0.6));
  const seed = (seeds.length ? seeds : pool)[Math.floor(Math.random() * (seeds.length || pool.length))];
  const R = 0.8;
  const near = pool
    .map((s) => ({ ...s, d: Math.hypot(s.x - seed.x, s.y - seed.y) }))
    .filter((s) => s.d < R && s.i !== seed.i)
    .sort((a, b) => a.d - b.d);
  // Skip stars crowding an already chosen one, so shapes read clearly.
  const chosen = [seed];
  const want = 5 + Math.floor(Math.random() * 4);
  for (const s of near) {
    if (chosen.length >= want) break;
    if (chosen.every((c) => Math.hypot(c.x - s.x, c.y - s.y) > 0.16)
      && !edgeHitsBoxes(boxes, chosen.reduce((m, c) => (Math.hypot(c.x - s.x, c.y - s.y) < Math.hypot(m.x - s.x, m.y - s.y) ? c : m)), s)) {
      chosen.push(s);
    }
  }
  if (chosen.length < 4) return false;

  // Prim's MST in screen space, recording draw order from the seed outwards.
  const n = chosen.length;
  const inTree = new Array(n).fill(false);
  inTree[0] = true;
  const edgesList = [];
  const dist = (a, b) => Math.hypot(chosen[a].x - chosen[b].x, chosen[a].y - chosen[b].y);
  const crosses = (a, b) => edgeHitsBoxes(boxes, chosen[a], chosen[b]);
  for (let k = 1; k < n; k++) {
    let best = null;
    for (let a = 0; a < n; a++) if (inTree[a]) for (let b = 0; b < n; b++) if (!inTree[b]) {
      const d = dist(a, b);
      if ((!best || d < best.d) && !crosses(a, b)) best = { a, b, d };
    }
    if (!best) return false; // can't connect without crossing content; try again soon
    inTree[best.b] = true;
    edgesList.push([best.a, best.b]);
  }
  // Sometimes close a loop between two nodes, like many real asterisms.
  if (n >= 5 && Math.random() < 0.4) {
    const deg = new Array(n).fill(0);
    edgesList.forEach(([a, b]) => { deg[a]++; deg[b]++; });
    const leaves = [...deg.keys()].filter((i) => deg[i] === 1);
    let best = null;
    for (const a of leaves) for (let b = 0; b < n; b++) {
      if (a === b || edgesList.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) continue;
      const d = dist(a, b);
      if (d < 0.5 && (!best || d < best.d) && !crosses(a, b)) best = { a, b, d };
    }
    if (best) edgesList.push([best.a, best.b]);
  }

  const P = (k) => new V3().fromArray(starPos, chosen[k].i * 3);
  const linePos = new Float32Array(edgesList.length * 6);
  const lineCol = new Float32Array(edgesList.length * 6);
  const cA = new THREE.Color(COL.mint);
  const cB = new THREE.Color(COL.cyan);
  edgesList.forEach(([a], e) => {
    P(a).toArray(linePos, e * 6);
    P(a).toArray(linePos, e * 6 + 3);
    cA.toArray(lineCol, e * 6);
    cB.toArray(lineCol, e * 6 + 3);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  lg.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));

  const nodePos = new Float32Array(n * 3);
  chosen.forEach((_, k) => P(k).toArray(nodePos, k * 3));
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
  ng.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  const nodes = new THREE.Points(ng, nodeMaterial());

  constellationLayer.add(lines, nodes);
  const EDGE_STEP = 0.32;
  const EDGE_DUR = 0.7;
  constellations.push({
    nodes: chosen.map((c) => c.i),
    edges: edgesList,
    from: edgesList.map(([a]) => P(a)),
    to: edgesList.map(([, b]) => P(b)),
    lines, nodesObj: nodes, n,
    born: uTime.value,
    drawEnd: (edgesList.length - 1) * EDGE_STEP + EDGE_DUR,
    EDGE_STEP, EDGE_DUR,
    hold: 2.6, fade: 1.8,
  });
  return true;
}

let nextConstellation = 1.5;
function updateConstellations(time) {
  if (reduceMotion) return;
  if (transition) {
    // Clear the sky while flying; start fresh shortly after arriving.
    constellations.forEach((k) => { k.leaveAt ??= time; });
    nextConstellation = Math.max(nextConstellation, time + 1.2);
  } else if (time > nextConstellation) {
    const ok = constellations.length >= 2 || spawnConstellation();
    nextConstellation = time + (ok ? 2.4 + Math.random() * 1.6 : 0.25);
  }
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  for (let c = constellations.length - 1; c >= 0; c--) {
    const k = constellations[c];
    const age = time - k.born;
    const fadeStart = k.drawEnd + k.hold;
    let alpha = age < fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / k.fade);
    if (k.leaveAt != null) alpha = Math.min(alpha, Math.max(0, 1 - (time - k.leaveAt) / 0.6));
    if (alpha <= 0) {
      constellationLayer.remove(k.lines, k.nodesObj);
      k.lines.geometry.dispose(); k.lines.material.dispose();
      k.nodesObj.geometry.dispose(); k.nodesObj.material.dispose();
      constellations.splice(c, 1);
      continue;
    }
    const pos = k.lines.geometry.attributes.position;
    const nodeA = k.nodesObj.geometry.attributes.aAlpha;
    nodeA.array.fill(0);
    nodeA.array[k.edges[0][0]] = Math.min(1, age / 0.4) * alpha;
    k.edges.forEach(([, b], e) => {
      const p = easeOut(THREE.MathUtils.clamp((age - e * k.EDGE_STEP) / k.EDGE_DUR, 0, 1));
      _w.copy(k.from[e]).lerp(k.to[e], p).toArray(pos.array, e * 6 + 3);
      // A star lights up as its line arrives
      nodeA.array[b] = Math.max(nodeA.array[b], p * p * alpha);
    });
    pos.needsUpdate = true;
    nodeA.needsUpdate = true;
    k.lines.material.opacity = 0.42 * alpha;
  }
}

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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 9, LOW_POWER ? 120 : 240, LOW_POWER ? 10 : 20), auroraMaterial(a, b, off));
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
  const done = () => {
    // Shrink-to-fit: longer translations get a smaller font instead of overflowing.
    if (o.fit && !t.userData.fitted) {
      t.userData.fitted = true;
      const b = t.textRenderInfo?.blockBounds;
      const w = b ? b[2] - b[0] : 0;
      if (w > o.fit) {
        t.fontSize *= o.fit / w;
        if (o.glow != null) t.outlineBlur = t.fontSize * 0.5;
        t.sync(() => o.onSync?.(t));
        return;
      }
    }
    o.onSync?.(t);
  };
  if (!booted) {
    pendingText++;
    t.sync(() => { done(); if (--pendingText === 0) markReady(); });
  } else {
    t.sync(done);
  }
  return t;
}

/** Rough line count for wrapped text, used to size cards before fonts load. */
function estLines(text, size, maxW, charW = 0.52) {
  const cw = size * charW;
  let lines = 1;
  let x = 0;
  for (const word of String(text).split(/\s+/)) {
    const w = word.length * cw;
    if (x > 0 && x + cw * 0.55 + w > maxW) { lines++; x = w; } else x += (x > 0 ? cw * 0.55 : 0) + w;
  }
  return lines;
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

/**
 * Holographic glass panel with glowing border. `unit` lets HUD panels be
 * authored in pixels while the shader keeps world-like proportions.
 */
function Panel(w, h, o = {}) {
  const u = o.unit ?? 1;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: new THREE.Vector2(w / u, h / u) }, uTime,
      uHover: { value: 0 }, uOpacity: { value: 1 },
      uA: { value: new THREE.Color(o.a ?? COL.mint) }, uB: { value: new THREE.Color(o.b ?? COL.violet) },
      uR: { value: (o.radius ?? 0.3) / u }, uFill: { value: o.fill ?? 0.42 }, uSolid: { value: o.solid ? 1 : 0 },
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

/** Rounded-square outline shared by the social glyphs. */
function roundedSquare(s, r) {
  const h = s / 2;
  const sq = new THREE.Shape();
  sq.moveTo(-h + r, -h); sq.lineTo(h - r, -h); sq.quadraticCurveTo(h, -h, h, -h + r);
  sq.lineTo(h, h - r); sq.quadraticCurveTo(h, h, h - r, h);
  sq.lineTo(-h + r, h); sq.quadraticCurveTo(-h, h, -h, h - r);
  sq.lineTo(-h, -h + r); sq.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.BufferGeometry().setFromPoints(sq.getPoints(8));
}

/** Line-art Instagram glyph (rounded square, lens, dot). */
function igIcon(s, color, hud = false) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, depthTest: !hud });
  const lens = new THREE.Path().absarc(0, 0, s * 0.22, 0, Math.PI * 2);
  g.add(new THREE.LineLoop(roundedSquare(s, s * 0.28), mat));
  g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(lens.getPoints(40)), mat));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(s * 0.055, 12), new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: !hud }));
  dot.position.set(s * 0.26, s * 0.26, 0);
  g.add(dot);
  if (hud) g.traverse((o) => { o.renderOrder = 1001; });
  return g;
}

/** Line-art LinkedIn glyph (rounded square with "in"), matching igIcon. */
function liIcon(s, color, hud = false) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, depthTest: !hud });
  const line = (pts) => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x * s, y * s, 0))), mat));
  g.add(new THREE.LineLoop(roundedSquare(s, s * 0.2), mat));
  // "i": stem + dot
  line([[-0.24, -0.24], [-0.24, 0.08]]);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(s * 0.055, 12), new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: !hud }));
  dot.position.set(-0.24 * s, 0.2 * s, 0);
  g.add(dot);
  // "n": stem, then shoulder arc down into the right leg
  line([[-0.04, -0.24], [-0.04, 0.08]]);
  const arc = [];
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI - (k / 12) * Math.PI;
    arc.push([0.1 + 0.14 * Math.cos(a), -0.04 + 0.12 * Math.sin(a)]);
  }
  line([...arc, [0.24, -0.24]]);
  if (hud) g.traverse((o) => { o.renderOrder = 1001; });
  return g;
}

/** Recolour every material in a glyph group (hover states). */
const tint = (icon, c) => icon.traverse((o) => o.material?.color.set(c));

/** Glyph builder per social network id (see SOCIALS in contact.js). */
const SOCIAL_ICONS = { instagram: igIcon, linkedin: liIcon };
const socialIcon = (id, s, color, hud) => SOCIAL_ICONS[id](s, color, hud);

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
const mail = openMail;
const openUrl = (url) => () => window.open(url, '_blank', 'noopener');
const goPrivacy = () => { location.href = `privacy.html${location.search}`; };
const EMAIL_LABEL = () => email().toUpperCase();

function Button(label, o) {
  const g = new THREE.Group();
  const h = o.h ?? 0.9;
  const p = Panel(o.w, h, { radius: h / 2, fill: 0.22, solid: o.primary });
  g.add(p);
  const t = T(label, { font: F_MED, size: o.size ?? 0.24, ls: 0.12, ax: 'center', ay: 'middle',
    color: o.primary ? COL.dark : COL.text, z: 0.05, x: o.icon ? h * 0.3 : 0, fit: o.w - h * (o.icon ? 1.6 : 0.9) });
  g.add(t);
  if (o.icon) {
    o.icon.position.set(-o.w / 2 + h * 0.75, 0, 0.05);
    g.add(o.icon);
  }
  addHit(p, o.owner, o.onClick, (v) => {
    p.material.uniforms.uHover.value = v;
    g.scale.setScalar(1 + v * 0.04);
    g.position.z = (g.userData.z0 ?? 0) + v * 0.15;
  });
  return g;
}

/** Round glass button holding only an icon (used for social links). */
function IconButton(icon, o) {
  const g = new THREE.Group();
  const d = o.d;
  const p = Panel(d, d, { radius: d / 2, fill: 0.22 });
  icon.position.set(0, 0, 0.05);
  g.add(p, icon);
  addHit(p, o.owner, o.onClick, (v) => {
    p.material.uniforms.uHover.value = v;
    g.scale.setScalar(1 + v * 0.06);
    g.position.z = (g.userData.z0 ?? 0) + v * 0.15;
  });
  return g;
}

/** A centred row of social icon buttons; returns the group. */
function SocialRow(owner, d, iconSize, gap) {
  const row = new THREE.Group();
  const total = SOCIALS.length * d + (SOCIALS.length - 1) * gap;
  SOCIALS.forEach((s, i) => {
    const b = IconButton(socialIcon(s.id, iconSize, COL.mint), { d, owner, onClick: openUrl(s.url) });
    b.position.x = -total / 2 + d / 2 + i * (d + gap);
    row.add(b);
  });
  return row;
}

// Card type sizes per layout (world units).
const CARD_SZ = {
  phone: { pad: 0.5, num: 0.22, title: 0.52, body: 0.31, lh: 1.5, footer: 0.22, icon: 0.5 },
  tablet: { pad: 0.48, num: 0.2, title: 0.5, body: 0.29, lh: 1.5, footer: 0.21, icon: 0.5 },
  desktop: { pad: 0.42, num: 0.18, title: 0.48, body: 0.25, lh: 1.5, footer: 0.19, icon: 0.45 },
};

function cardHeight(c, w, s) {
  const lines = estLines(c.body, s.body, w - s.pad * 2);
  return s.pad + s.num + 0.2 + s.title * 1.15 + 0.3 + lines * s.body * s.lh + (c.footer ? 0.45 + s.footer : 0) + s.pad;
}

function Card(o) {
  const { w, s } = o;
  const h = o.h ?? cardHeight(o, w, s);
  const g = new THREE.Group();
  const p = Panel(w, h);
  g.add(p);
  const L = -w / 2 + s.pad;
  const top = h / 2 - s.pad;
  const iconSpace = s.icon * 2.2;
  g.add(T(o.num, { font: F_MED, size: s.num, color: COL.mint, ls: 0.25, x: L, y: top }));
  const yTitle = top - s.num - 0.2;
  g.add(T(o.title, { font: F_DISPLAY, size: s.title, x: L, y: yTitle, fit: w - s.pad * 2 - iconSpace }));
  g.add(T(o.body, { size: s.body, color: COL.muted, lh: s.lh, maxWidth: w - s.pad * 2, x: L, y: yTitle - s.title * 1.15 - 0.3 }));
  if (o.footer) {
    g.add(T(o.footer, { font: F_MED, size: s.footer, ls: 0.15, color: o.footerColor ?? COL.mint, x: L, y: -h / 2 + s.pad, ay: 'bottom' }));
  }
  const icon = ICONS[o.icon]();
  icon.scale.setScalar(s.icon / 0.48);
  icon.position.set(w / 2 - s.pad - s.icon, top - s.icon * 0.8, 0.35);
  icon.userData.spin = 1;
  icons.push(icon);
  g.add(icon);
  addHit(p, o.owner, o.onClick, (v) => {
    p.material.uniforms.uHover.value = v;
    g.position.z = v * 0.35;
    g.scale.setScalar(1 + v * 0.025);
    icon.userData.spin = 1 + v * 4;
  });
  g.userData.h = h;
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
// Layout modes. Content is authored in world units; the camera distance is
// chosen so 1 unit = S pixels, keeping text readable on every screen size.
// ---------------------------------------------------------------------------
const MODES = {
  phone: { cols: 1, cardW: 7.0, gap: 0.38, W: 7.0, colW: 7.0 },
  tablet: { cols: 2, cardW: 6.4, gap: 0.5, W: 13.3, colW: 10 },
  desktop: { cols: 3, cardW: 6.4, gap: 0.6, W: 20.4 },
};
const clamp = THREE.MathUtils.clamp;
let mode = null;
let SHORT = false; // short screen (phone in landscape)
let S = 50; // pixels per world unit at the content plane
let HUD_TOP = 84;
let HUD_BOTTOM = 56;

function desktopScale() { return Math.min((innerWidth - 180) / 21.5, (innerHeight - 84 - 56) / 10.8); }
function chooseMode() {
  if (innerWidth >= 1000 && innerHeight >= 560 && desktopScale() >= 42) return 'desktop';
  if (innerWidth >= 640) return 'tablet'; // includes phones in landscape
  return 'phone';
}
function scaleFor(m) {
  if (m === 'desktop') return desktopScale();
  if (m === 'tablet') {
    const byWidth = (innerWidth - 80) / MODES.tablet.W;
    // Landscape phones: also fit the home screen's height so it shows in full.
    const byHeight = innerHeight < 500 ? (innerHeight - 92) / 6.2 : Infinity;
    return clamp(Math.min(byWidth, byHeight), 38, 75);
  }
  return clamp((innerWidth - 36) / MODES.phone.W, 38, 72);
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
  const coreMat = LOW_POWER
    ? new THREE.MeshStandardMaterial({ color: 0x7fd8ff, metalness: 0.2, roughness: 0.15, flatShading: true,
      emissive: 0x1a2a6a, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 })
    : new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, metalness: 0.1, roughness: 0.05, transmission: 0.6, thickness: 1,
      flatShading: true, emissive: 0x1a2a6a, emissiveIntensity: 0.5, transparent: true });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), coreMat);
  const w = edges(new THREE.OctahedronGeometry(1.63, 0), COL.mint);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.015, 8, 160),
    new THREE.MeshBasicMaterial({ color: COL.violet, transparent: true, opacity: 0.7 }));
  ring1.rotation.x = Math.PI / 2.3;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.008, 8, 160),
    new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.5 }));
  ring2.rotation.x = Math.PI / 1.8;
  group.add(core, w, ring1, ring2);
  group.userData = { core, w, ring1, ring2, baseY: 0, avoid: true };
  return group;
}

// Visual config per card; the words come from the locale files (same order).
const WORK_ICONS = ['piano', 'gem', 'ring'];
const SERVICE_ICONS = ['ico', 'knot', 'cube'];
const cardList = (key, icns) => tr(`${key}.items`).map((item, i) => ({
  num: String(i + 1).padStart(2, '0'),
  title: item.title,
  body: item.body,
  footer: item.status ? item.status.toUpperCase() : null,
  footerColor: COL.violet,
  icon: icns[i],
}));

function buildHome(g, m) {
  crystal = makeCrystal();
  g.add(crystal);
  if (m === 'desktop') {
    const L = -10.5;
    g.add(T(up('home.eyebrow'), { font: F_MED, size: 0.26, color: COL.mint, ls: 0.3, x: L, y: 3.7 }));
    g.add(T('NORDCIEL', { font: F_DISPLAY, size: 2.7, ls: 0.02, x: L, y: 3.3, glow: COL.cyan, glowA: 0.35 }));
    g.add(T(tr('home.tagline'), { font: F_MED, size: 0.62, color: COL.mint, x: L, y: 0.3, glow: COL.mint, glowA: 0.25, fit: 13.2 }));
    g.add(T(tr('home.lead'), { size: 0.3, color: COL.muted, lh: 1.55, maxWidth: 9, x: L, y: -0.75 }));
    const b1 = Button(up('home.ctaWork'), { w: 4.2, owner: 'home', primary: true, onClick: () => go(1) });
    b1.position.set(L + 2.1, -2.95, 0);
    const b2 = Button(EMAIL_LABEL(), { w: 5.4, owner: 'home', onClick: mail });
    b2.position.set(L + 4.5 + 2.7, -2.95, 0);
    g.add(b1, b2);
    crystal.position.set(6.6, 0.4, 0);
    crystal.userData.baseY = 0.4;
    g.userData.bounds = { top: 4.1, bottom: -3.55, cx: -0.6 };
    return;
  }
  if (m === 'tablet' && SHORT) {
    // Landscape phone: text column on the left, crystal on the right.
    const L = -MODES.tablet.W / 2;
    const CW = 7.6;
    let y = 0;
    g.add(T(up('home.eyebrow'), { font: F_MED, size: 0.24, color: COL.mint, ls: 0.3, x: L, y, fit: CW }));
    y -= 0.24 + 0.25;
    g.add(T('NORDCIEL', { font: F_DISPLAY, size: 1.5, x: L, y, glow: COL.cyan, glowA: 0.35, fit: CW }));
    y -= 1.5 * 1.05 + 0.2;
    g.add(T(tr('home.tagline'), { font: F_MED, size: 0.46, color: COL.mint, maxWidth: CW, lh: 1.2, x: L, y }));
    y -= estLines(tr('home.tagline'), 0.46, CW, 0.56) * 0.46 * 1.2 + 0.25;
    g.add(T(tr('home.lead'), { size: 0.29, color: COL.muted, lh: 1.5, maxWidth: CW, x: L, y }));
    y -= estLines(tr('home.lead'), 0.29, CW) * 0.29 * 1.5 + 0.4;
    const b1 = Button(up('home.ctaWork'), { w: 3.6, h: 0.9, size: 0.22, owner: 'home', primary: true, onClick: () => go(1) });
    b1.position.set(L + 1.8, y - 0.45, 0);
    const b2 = Button(EMAIL_LABEL(), { w: 4.4, h: 0.9, size: 0.22, owner: 'home', onClick: mail });
    b2.position.set(L + 3.6 + 0.3 + 2.2, y - 0.45, 0);
    g.add(b1, b2);
    y -= 0.9;
    crystal.scale.setScalar(0.55);
    crystal.position.set(4.4, y / 2, -0.5);
    crystal.userData.baseY = y / 2;
    g.userData.bounds = { top: 0, bottom: y, cx: 0 };
    return;
  }
  // Phone / tablet: a centred column, laid out top-down from y = 0.
  const CW = MODES[m].colW;
  const tab = m === 'tablet';
  const c = { ax: 'center', align: 'center' };
  const cs = tab ? 0.62 : 0.46;
  crystal.scale.setScalar(cs);
  crystal.position.set(0, -3.3 * cs, -0.5);
  crystal.userData.baseY = -3.3 * cs;
  let y = -6.6 * cs - 0.2;
  const eb = tab ? 0.26 : 0.24;
  g.add(T(up('home.eyebrow'), { ...c, font: F_MED, size: eb, color: COL.mint, ls: 0.3, y, fit: CW }));
  y -= eb + 0.32;
  const ts = tab ? 1.9 : 1.35;
  g.add(T('NORDCIEL', { ...c, font: F_DISPLAY, size: ts, y, glow: COL.cyan, glowA: 0.35, fit: CW }));
  y -= ts * 1.05 + 0.3;
  const tg = tab ? 0.6 : 0.5;
  g.add(T(tr('home.tagline'), { ...c, font: F_MED, size: tg, color: COL.mint, maxWidth: CW, lh: 1.2, y }));
  y -= estLines(tr('home.tagline'), tg, CW, 0.56) * tg * 1.2 + 0.35;
  const ls = tab ? 0.34 : 0.32;
  const lw = CW * 0.96;
  g.add(T(tr('home.lead'), { ...c, size: ls, color: COL.muted, lh: 1.55, maxWidth: lw, y }));
  y -= estLines(tr('home.lead'), ls, lw) * ls * 1.55 + 0.6;
  const bh = 1.05;
  const bw = tab ? 6.4 : CW;
  const b1 = Button(up('home.ctaWork'), { w: bw, h: bh, size: 0.27, owner: 'home', primary: true, onClick: () => go(1) });
  b1.position.set(0, y - bh / 2, 0);
  y -= bh + 0.3;
  const b2 = Button(EMAIL_LABEL(), { w: bw, h: bh, size: 0.27, owner: 'home', onClick: mail });
  b2.position.set(0, y - bh / 2, 0);
  y -= bh;
  g.add(b1, b2);
  g.userData.bounds = { top: 0, bottom: y, cx: 0 };
}

function buildCardsSection(g, name, num, icns, m) {
  const label = tr(`${name}.title`);
  const list = cardList(name, icns);
  const M = MODES[m];
  const s = CARD_SZ[m];
  if (m === 'desktop') {
    g.add(T(`${num} / ${label.toUpperCase()}`, { font: F_MED, size: 0.22, color: COL.mint, ls: 0.3, x: -10.2, y: 4.9 }));
    g.add(T(label, { font: F_DISPLAY, size: 1.3, x: -10.2, y: 4.5, glow: COL.cyan, glowA: 0.3 }));
    const h = Math.max(4.4, ...list.map((c) => cardHeight(c, M.cardW, s)));
    list.forEach((c, i) => {
      const holder = new THREE.Group();
      holder.position.set((i - 1) * (M.cardW + M.gap), -0.8, 0);
      holder.rotation.y = (1 - i) * 0.08;
      holder.add(Card({ ...c, owner: name, w: M.cardW, h, s }));
      g.add(holder);
    });
    g.userData.bounds = { top: 5.2, bottom: -0.8 - h / 2, cx: 0 };
    return;
  }
  const L = -M.W / 2;
  const tab = m === 'tablet';
  g.add(T(`${num} / ${label.toUpperCase()}`, { font: F_MED, size: 0.24, color: COL.mint, ls: 0.3, x: L, y: 0 }));
  const hs = tab ? 1.2 : 1.05;
  g.add(T(label, { font: F_DISPLAY, size: hs, x: L, y: -0.42, glow: COL.cyan, glowA: 0.3, fit: M.W }));
  let y = -0.42 - hs * 1.15 - 0.4;
  for (let r = 0; r < list.length; r += M.cols) {
    const row = list.slice(r, r + M.cols);
    const h = Math.max(...row.map((c) => cardHeight(c, M.cardW, s)));
    row.forEach((c, k) => {
      const holder = new THREE.Group();
      const x = row.length < M.cols ? 0 : L + M.cardW / 2 + k * (M.cardW + M.gap);
      holder.position.set(x, y - h / 2, 0);
      holder.add(Card({ ...c, owner: name, w: M.cardW, h, s }));
      g.add(holder);
    });
    y -= h + M.gap;
  }
  g.userData.bounds = { top: 0, bottom: y + M.gap, cx: 0 };
}

function buildContact(g, m) {
  const c = { ax: 'center', align: 'center' };
  if (m === 'desktop') {
    g.add(T(`04 / ${up('contact.label')}`, { ...c, font: F_MED, size: 0.22, color: COL.mint, ls: 0.3, y: 3.2 }));
    g.add(T(tr('contact.title'), { ...c, font: F_DISPLAY, size: 1.5, y: 2.7, glow: COL.cyan, glowA: 0.35, fit: 16 }));
    g.add(T(tr('contact.lead'), { ...c, size: 0.34, color: COL.muted, y: 0.4, fit: 16 }));
    const b = Button(EMAIL_LABEL(), { w: 8, h: 1.3, size: 0.4, owner: 'contact', primary: true, onClick: mail });
    b.position.set(0, -1.4, 0);
    const socials = SocialRow('contact', 0.85, 0.36, 0.35);
    socials.position.set(0, -2.85, 0);
    const p = Button(up('footer.privacy'), { w: 5.2, h: 0.7, size: 0.16, owner: 'contact', onClick: goPrivacy });
    p.position.set(0, -3.85, 0);
    g.add(b, socials, p);
    g.userData.bounds = { top: 3.5, bottom: -4.25, cx: 0 };
    return;
  }
  const tab = m === 'tablet';
  const CW = MODES[m].colW;
  let y = 0;
  g.add(T(`04 / ${up('contact.label')}`, { ...c, font: F_MED, size: 0.24, color: COL.mint, ls: 0.3, y }));
  y -= 0.24 + 0.35;
  const ts = tab ? 1.3 : 0.95;
  g.add(T(tr('contact.title'), { ...c, font: F_DISPLAY, size: ts, maxWidth: CW, lh: 1.1, y, glow: COL.cyan, glowA: 0.35 }));
  y -= estLines(tr('contact.title'), ts, CW, 0.6) * ts * 1.1 + 0.4;
  const ls = tab ? 0.34 : 0.32;
  g.add(T(tr('contact.lead'), { ...c, size: ls, maxWidth: CW * 0.92, color: COL.muted, lh: 1.5, y }));
  y -= estLines(tr('contact.lead'), ls, CW * 0.92) * ls * 1.5 + 0.6;
  const bw = tab ? 8 : CW;
  const b = Button(EMAIL_LABEL(), { w: bw, h: 1.15, size: tab ? 0.34 : 0.3, owner: 'contact', primary: true, onClick: mail });
  b.position.set(0, y - 0.575, 0);
  y -= 1.15 + 0.35;
  const sh = 0.85;
  const sd = 1.0;
  const socials = SocialRow('contact', sd, 0.42, 0.4);
  socials.position.set(0, y - sd / 2, 0);
  y -= sd + 0.35;
  const pB = Button(up('footer.privacy'), { w: tab ? 8 : CW, h: sh, size: 0.2, owner: 'contact', onClick: goPrivacy });
  pB.position.set(0, y - sh / 2, 0);
  y -= sh;
  g.add(b, socials, pB);
  g.userData.bounds = { top: 0, bottom: y, cx: 0 };
}

function buildSections(m) {
  for (let i = hits.length - 1; i >= 0; i--) if (hits[i].owner !== 'hud') hits.splice(i, 1);
  icons = [];
  for (const name of SECTIONS) {
    const g = sections[name];
    disposeTree(g);
    g.clear();
    g.userData.alpha = -1;
  }
  buildHome(sections.home, m);
  buildCardsSection(sections.work, 'work', '02', WORK_ICONS, m);
  buildCardsSection(sections.services, 'services', '03', SERVICE_ICONS, m);
  buildContact(sections.contact, m);
  for (const name of SECTIONS) sections[name].updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// HUD (menu, progress, footer): attached to the camera and authored in CSS
// pixels, so it stays crisp and the same physical size on every screen.
// ---------------------------------------------------------------------------
const HUD_Z = 5;
const hud = new THREE.Group();
hud.position.z = -HUD_Z;
camera.add(hud);
let hudEls = null;
let menuOpen = false;
const fov2 = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
const hudUnitsPerPx = () => (2 * HUD_Z * fov2()) / innerHeight;

function textWidth(t, fallback) {
  const b = t.textRenderInfo?.blockBounds;
  return b ? b[2] - b[0] : fallback;
}

const HUD_SZ = {
  desktop: { m: 32, brand: 19, star: 17, menu: 12.5, lang: 11, foot: 10.5, hint: 10, top: 84, bottom: 56 },
  tablet: { m: 28, brand: 17, star: 15, toggle: 14, item: 21, lang: 14, foot: 11, hint: 10, top: 72, bottom: 64 },
  phone: { m: 18, brand: 16, star: 14, toggle: 13.5, item: 20, lang: 14, foot: 10.5, hint: 10, top: 64, bottom: 64 },
};

function buildHud(m) {
  for (let i = hits.length - 1; i >= 0; i--) if (hits[i].owner === 'hud') hits.splice(i, 1);
  disposeTree(hud);
  hud.clear();
  menuOpen = false;
  const Z = HUD_SZ[m];
  const compact = m !== 'desktop';
  const relayout = () => layoutHud();
  const E = { m, compact, Z };
  const hudMat = (c, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity });

  E.star = new THREE.Mesh(starShape(Z.star / 2), hudMat(COL.mint));
  E.star.renderOrder = 1000;
  E.brand = T('NORDCIEL', { font: F_DISPLAY, size: Z.brand, ls: 0.18, ay: 'middle', hud: true, onSync: relayout });
  E.brandHit = HitPlane();
  addHit(E.brandHit, 'hud', () => go(0), (v) => { E.star.rotation.z = v * Math.PI / 2; });
  hud.add(E.star, E.brand, E.brandHit);

  const otherLang = Object.keys(LANGUAGES).find((l) => l !== getLang());
  const menuVisible = () => !compact || menuOpen;

  // Language pill: shows the *other* language
  E.lang = T(otherLang.toUpperCase(), { font: F_MED, size: Z.lang, ls: 0.15, ax: 'center', ay: 'middle', hud: true, color: COL.text });
  E.langPill = Panel(Z.lang * 4.2, Z.lang * 2.4, { hud: true, unit: 100, radius: Z.lang * 1.2, fill: 0.15 });
  E.langHit = HitPlane();
  addHit(E.langHit, 'hud', () => setLang(otherLang), (v) => {
    E.langPill.material.uniforms.uHover.value = v;
    E.lang.color = v > 0.5 ? COL.mint : COL.text;
  }, menuVisible);
  hud.add(E.langPill, E.lang, E.langHit);

  const LABELS = navLabels();
  E.labels = LABELS;
  E.items = LABELS.map((label, i) => {
    const t = T(label, { font: F_MED, size: compact ? Z.item : Z.menu, ls: 0.2, ax: 'right', ay: 'middle', hud: true,
      color: COL.muted, onSync: relayout });
    const hit = HitPlane();
    const e = addHit(hit, 'hud', () => go(i), (v) => {
      t.color = new THREE.Color(COL.muted).lerp(new THREE.Color(i === current ? COL.mint : COL.text), Math.max(v, i === current ? 1 : 0));
    }, menuVisible);
    e.forceApply = true;
    hud.add(t, hit);
    return { t, hit };
  });

  E.bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), hudMat(COL.mint));
  E.bar.renderOrder = 1001;
  hud.add(E.bar);

  if (compact) {
    // Hamburger: three bars that fold into an X while the menu is open.
    E.burger = new THREE.Group();
    E.burgerBars = [0, 1, 2].map(() => {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hudMat(COL.text));
      bar.renderOrder = 1001;
      E.burger.add(bar);
      return bar;
    });
    E.toggleHit = HitPlane();
    addHit(E.toggleHit, 'hud', () => setMenu(!menuOpen), (v) => {
      E.burgerBars.forEach((bar) => bar.material.color.set(v > 0.5 ? COL.mint : COL.text));
    });
    E.menuPanel = null; // sized in layoutHud
    // Extra row in the open menu: social icons + privacy
    E.mSocials = SOCIALS.map((s) => {
      const icon = socialIcon(s.id, 16, COL.text, true);
      const hit = HitPlane();
      addHit(hit, 'hud', openUrl(s.url), (v) => tint(icon, v > 0.5 ? COL.mint : COL.text), () => menuOpen);
      hud.add(icon, hit);
      return { icon, hit };
    });
    E.mPrivacy = T(up('footer.privacy'), { font: F_MED, size: 11, ls: 0.15, ax: 'right', ay: 'middle', hud: true, color: COL.muted, onSync: relayout });
    E.mPrivacyHit = HitPlane();
    addHit(E.mPrivacyHit, 'hud', goPrivacy, (v) => { E.mPrivacy.color = v > 0.5 ? COL.mint : COL.muted; }, () => menuOpen);
    hud.add(E.mPrivacy, E.mPrivacyHit, E.burger, E.toggleHit);
  } else {
    E.dots = SECTIONS.map(() => {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 26), hudMat(COL.muted, 0.5));
      d.renderOrder = 1000;
      hud.add(d);
      return d;
    });
    E.counter = T('01', { font: F_DISPLAY, size: 19, ax: 'right', ay: 'middle', hud: true, color: COL.mint });
    E.counterTotal = T('/ 04', { font: F_MED, size: 10, ax: 'right', ay: 'middle', hud: true, color: COL.muted, ls: 0.1 });
    hud.add(E.counter, E.counterTotal);
  }

  // Footer
  const short = m === 'phone';
  const shortCopy = short || innerWidth < 900;
  E.copy = T(up(shortCopy ? 'footer.copyrightShort' : 'footer.copyright', { year: YEAR }).replace(' · ', '  ·  '),
    { font: F_MED, size: Z.foot, ls: 0.15, ay: 'middle', hud: true, color: COL.muted });
  hud.add(E.copy);
  E.socials = SOCIALS.map((s) => {
    const icon = socialIcon(s.id, Z.foot * 1.45, COL.muted, true);
    const hit = HitPlane();
    addHit(hit, 'hud', openUrl(s.url), (v) => tint(icon, v > 0.5 ? COL.mint : COL.muted));
    hud.add(icon, hit);
    return { icon, hit };
  });
  if (!short) {
    E.privacy = T(up('footer.privacy'), { font: F_MED, size: Z.foot, ls: 0.15, ax: 'right', ay: 'middle', hud: true, color: COL.muted, onSync: relayout });
    E.privacyHit = HitPlane();
    addHit(E.privacyHit, 'hud', goPrivacy, (v) => { E.privacy.color = v > 0.5 ? COL.mint : COL.muted; });
    hud.add(E.privacy, E.privacyHit);
  }
  E.hint = T(up(compact ? 'home.hintSwipe' : 'home.hintScroll'), { font: F_MED, size: Z.hint, ls: 0.35, ax: 'center', ay: 'middle', hud: true, color: COL.text });
  hud.add(E.hint);

  E.dim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: COL.dark, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }));
  E.dim.renderOrder = 998.5;
  hud.add(E.dim);
  E.fadeTop = fadeBand(true);
  E.fadeBottom = fadeBand(false);
  hud.add(E.fadeTop, E.fadeBottom);

  hudEls = E;
  layoutHud();
}

function setMenu(open) {
  menuOpen = open;
  layoutHud();
}

// Soft dark fades behind the header and footer so scrolled content slides under them.
function fadeBand(fromTop) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { uTop: { value: fromTop ? 1 : 0 } },
    vertexShader: panelVS,
    fragmentShader: `uniform float uTop; varying vec2 vUv;
      void main() { float k = uTop > 0.5 ? vUv.y : 1.0 - vUv.y; gl_FragColor = vec4(0.02, 0.03, 0.086, smoothstep(0.0, 1.0, k) * 0.92); }`,
    transparent: true, depthTest: false, depthWrite: false,
  }));
  m.renderOrder = 998;
  return m;
}

const placeHit = (hit, cx, cy, w, h) => { hit.scale.set(w, h, 1); hit.position.set(cx, cy, 0); };

function layoutHud() {
  const E = hudEls;
  if (!E) return;
  hud.scale.setScalar(hudUnitsPerPx());
  const { Z } = E;
  const hw = innerWidth;
  const hh = innerHeight;
  const m = Z.m;
  const top = hh / 2 - HUD_TOP / 2;
  const left = -hw / 2 + m;
  const right = hw / 2 - m;
  const bottom = -hh / 2 + Math.min(E.compact ? 22 : 26, HUD_BOTTOM / 2);

  // Brand
  E.star.position.set(left + Z.star / 2, top, 0);
  E.brand.position.set(left + Z.star + 10, top, 0);
  const bw = textWidth(E.brand, Z.brand * 6);
  placeHit(E.brandHit, left + (bw + Z.star + 10) / 2, top, bw + Z.star + 30, 44);

  const LABELS = E.labels;
  if (!E.compact) {
    const pillW = Z.lang * 4.2;
    E.langPill.position.set(right - pillW / 2, top, 0);
    E.lang.position.set(right - pillW / 2, top, 0);
    placeHit(E.langHit, right - pillW / 2, top, pillW + 10, 40);
    let x = right - pillW - 36;
    for (let i = E.items.length - 1; i >= 0; i--) {
      const { t, hit } = E.items[i];
      const w = textWidth(t, LABELS[i].length * Z.menu * 0.8);
      t.position.set(x, top, 0);
      placeHit(hit, x - w / 2, top, w + 24, 44);
      t.userData.w = w;
      x -= w + 36;
    }
    E.dots.forEach((d, i) => d.position.set(right - 1, 60 - i * 40, 0));
    E.counter.position.set(right - 8, -100, 0);
    E.counterTotal.position.set(right - 8, -122, 0);
  } else {
    const bw = Z.toggle * 1.6;
    const bt = Math.max(2, Z.toggle * 0.15);
    const gap = Z.toggle * 0.45;
    E.burger.position.set(right - bw / 2, top, 0);
    E.burgerBars.forEach((bar, i) => {
      bar.scale.set(menuOpen ? bw * 1.05 : bw, bt, 1);
      if (menuOpen) {
        bar.position.set(0, 0, 0);
        bar.rotation.z = i === 0 ? Math.PI / 4 : -Math.PI / 4;
        bar.visible = i !== 1;
      } else {
        bar.position.set(0, (1 - i) * gap, 0);
        bar.rotation.z = 0;
        bar.visible = true;
      }
    });
    placeHit(E.toggleHit, right - bw / 2, top, bw + 32, 48);

    // Drop-down menu panel under the toggle
    const pw = Math.min(hw - m * 2, 320);
    const row = Math.min(Z.item * 2.5, (hh - 160) / 6);
    const ph = 24 + row * 4 + 104;
    const pTop = top - 28;
    const pRight = right;
    if (!E.menuPanel || E.menuPanel.userData.w !== pw || E.menuPanel.userData.h !== ph) {
      if (E.menuPanel) { hud.remove(E.menuPanel); E.menuPanel.geometry.dispose(); E.menuPanel.material.dispose(); }
      E.menuPanel = Panel(pw, ph, { hud: true, unit: 100, radius: 18, fill: 0.97 });
      E.menuPanel.userData.w = pw;
      E.menuPanel.userData.h = ph;
      hud.add(E.menuPanel);
    }
    E.menuPanel.visible = menuOpen;
    E.menuPanel.position.set(pRight - pw / 2, pTop - ph / 2, -0.01);
    E.items.forEach(({ t, hit }, i) => {
      const y = pTop - 24 - row * (i + 0.5);
      t.position.set(pRight - 26, y, 0);
      t.visible = hit.visible = menuOpen;
      placeHit(hit, pRight - pw / 2, y, pw, row);
      t.userData.w = textWidth(t, LABELS[i].length * Z.item * 0.8);
    });
    const yb = pTop - 24 - row * 4 - 26;
    const pillW = Z.lang * 4.2;
    const pl = pRight - pw + 26 + pillW / 2;
    E.langPill.position.set(pl, yb, 0);
    E.lang.position.set(pl, yb, 0);
    placeHit(E.langHit, pl, yb, pillW + 16, 44);
    const yp = yb - 44;
    E.mPrivacy.position.set(pRight - 26, yp, 0);
    const mpw = textWidth(E.mPrivacy, 160);
    placeHit(E.mPrivacyHit, pRight - 26 - mpw / 2, yp, mpw + 20, 40);
    E.mSocials.forEach(({ icon, hit }, i) => {
      const sx = pl + pillW / 2 + 30 + i * 40;
      icon.position.set(sx, yb, 0);
      placeHit(hit, sx, yb, 40, 44);
      icon.visible = hit.visible = menuOpen;
    });
    [E.langPill, E.lang, E.langHit, E.mPrivacy, E.mPrivacyHit].forEach((o) => { o.visible = menuOpen; });
  }

  E.dim.scale.set(hw, hh, 1);
  E.dim.position.set(0, 0, -0.015);
  E.dim.visible = E.compact && menuOpen;

  // Header/footer fades
  E.fadeTop.scale.set(hw, HUD_TOP * 1.15, 1);
  E.fadeTop.position.set(0, hh / 2 - HUD_TOP * 0.575, -0.02);
  E.fadeBottom.scale.set(hw, HUD_BOTTOM * 1.1, 1);
  E.fadeBottom.position.set(0, -hh / 2 + HUD_BOTTOM * 0.55, -0.02);

  // Footer
  E.copy.position.set(left, bottom, 0);
  const isz = Z.foot * 1.45;
  let x = right;
  if (E.privacy) {
    const pw = textWidth(E.privacy, 140);
    E.privacy.position.set(x, bottom, 0);
    placeHit(E.privacyHit, x - pw / 2, bottom, pw + 16, 36);
    x -= pw + 28;
  }
  // Social icons, right to left, in reverse so they read in SOCIALS order.
  [...E.socials].reverse().forEach(({ icon, hit }) => {
    icon.position.set(x - isz / 2, bottom, 0);
    placeHit(hit, x - isz / 2, bottom, isz + 16, 44);
    x -= isz + 18;
  });
  E.hint.position.set(0, bottom + (E.compact ? 26 : 0), 0);
  updateHudActive();
}

function updateHudActive() {
  const E = hudEls;
  if (!E || current < 0) return;
  E.items.forEach(({ t }, i) => { t.color = i === current ? COL.mint : COL.muted; });
  const a = E.items[current].t;
  const w = a.userData.w ?? 50;
  E.barTarget = E.compact
    ? { x: a.position.x + 12, y: a.position.y, w: 6 }
    : { x: a.position.x - w / 2, y: a.position.y - 15, w };
  E.bar.visible = !E.compact || menuOpen;
  if (!E.compact) {
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
// Camera: each section has a pose; sections taller than the screen scroll.
// ---------------------------------------------------------------------------
let current = 0;
let transition = null;
const base = { p: new V3(), q: new THREE.Quaternion() };
let scroll = 0;
let scrollTarget = 0;
let scrollVel = 0;

const camDist = () => innerHeight / (2 * fov2() * S);

function sectionMetrics(i) {
  const b = sections[SECTIONS[i]].userData.bounds;
  const H = b.top - b.bottom;
  const vis = innerHeight / S;
  const topU = HUD_TOP / S;
  const botU = HUD_BOTTOM / S;
  const usable = vis - topU - botU;
  if (H <= usable) return { max: 0, cy0: (b.top + b.bottom) / 2 + (topU - botU) / 2, cx: b.cx ?? 0 };
  return { max: H - usable, cy0: b.top + topU - vis / 2, cx: b.cx ?? 0 };
}

function poseFor(i, s = 0) {
  const g = sections[SECTIONS[i]];
  const mt = sectionMetrics(i);
  const p = g.localToWorld(new V3(mt.cx, mt.cy0 - s, camDist()));
  return { p, q: g.quaternion.clone() };
}

function go(i, opts = {}) {
  if (i < 0 || i >= SECTIONS.length) return;
  if (i === current && !transition && !opts.instant) { setMenu(false); return; }
  const prev = current;
  current = i;
  if (!opts.keepScroll) {
    scroll = scrollTarget = opts.end ? sectionMetrics(i).max : 0;
  }
  scrollVel = 0;
  const to = poseFor(i, scroll);
  if (opts.instant) { base.p.copy(to.p); base.q.copy(to.q); transition = null; }
  else transition = { from: { p: base.p.clone(), q: base.q.clone() }, to, t0: performance.now(), dur: reduceMotion ? 300 : (prev < 0 ? 2400 : 1700) };
  if (hudEls?.compact && menuOpen) setMenu(false); else updateHudActive();
  history.replaceState(null, '', i ? `#${SECTIONS[i]}` : location.pathname + location.search);
}

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// ---------------------------------------------------------------------------
// Input: mouse hover/click, touch drag-to-scroll + swipe between sections,
// wheel, keyboard and the accessible HTML links.
// ---------------------------------------------------------------------------
const pointer = new THREE.Vector2(9, 9);
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
const raycaster = new THREE.Raycaster();
let hovered = null;
let down = null;
let drag = null;
const SWIPE_PX = 70;

function activeHits() {
  return hits.filter((e) => (e.owner === 'hud' || (e.owner === SECTIONS[current] && !transition && !(menuOpen && hudEls?.compact)))
    && (!e.enabled || e.enabled()));
}
function pick(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const list = activeHits();
  const res = raycaster.intersectObjects(list.map((e) => e.mesh), false);
  if (!res.length) return null;
  const hudHit = res.find((r) => list.find((e) => e.mesh === r.object)?.owner === 'hud');
  const obj = (hudHit || res[0]).object;
  return list.find((e) => e.mesh === obj) || null;
}
const toNdc = (e) => new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
const rubber = (raw, max) => (raw < 0 ? raw * 0.35 : raw > max ? max + (raw - max) * 0.35 : raw);

canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, type: e.pointerType };
  if (e.pointerType !== 'mouse') {
    drag = { y0: e.clientY, s0: scrollTarget, lastY: e.clientY, lastT: performance.now(), v: 0, moved: false };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    pointer.copy(toNdc(e));
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / innerHeight) * 2 - 1;
    return;
  }
  if (!drag || transition) return;
  const dy = e.clientY - drag.y0;
  if (Math.abs(dy) > 8) drag.moved = true;
  if (!drag.moved) return;
  const max = sectionMetrics(current).max;
  scrollTarget = rubber(drag.s0 - dy / S, max);
  scroll = scrollTarget;
  const now = performance.now();
  const dt = (now - drag.lastT) / 1000;
  if (dt > 0) drag.v = 0.7 * drag.v + 0.3 * (-(e.clientY - drag.lastY) / S / dt);
  drag.lastY = e.clientY;
  drag.lastT = now;
});
canvas.addEventListener('pointerleave', () => pointer.set(9, 9));
canvas.addEventListener('pointercancel', () => { drag = null; down = null; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x;
  const dy = e.clientY - down.y;
  const isTouch = down.type !== 'mouse';
  down = null;
  if (isTouch && drag?.moved) {
    const max = sectionMetrics(current).max;
    const raw = drag.s0 - dy / S;
    const drag0 = drag.s0;
    const v = drag.v;
    drag = null;
    if (transition) return;
    // Change section only when the swipe *started* at that edge, like native
    // scroll views: one swipe reaches the end, the next one moves on.
    const startTop = drag0 <= 0.01;
    const startEnd = drag0 >= max - 0.01;
    if (startTop && raw < 0 && -raw * S > SWIPE_PX) go(current - 1, { end: true });
    else if (startEnd && raw > max && (raw - max) * S > SWIPE_PX) go(current + 1);
    else scrollVel = clamp(v, -60, 60);
    return;
  }
  drag = null;
  if (Math.hypot(dx, dy) < 12) {
    const hit = pick(toNdc(e));
    if (hit?.onClick) hit.onClick();
    else if (menuOpen) setMenu(false);
  }
  if (isTouch) pointer.set(9, 9);
});

let wheelAcc = 0;
let wheelLock = 0;
let lastWheelScroll = 0;
window.addEventListener('wheel', (e) => {
  if (document.body.classList.contains('fallback')) return;
  e.preventDefault();
  const now = performance.now();
  if (transition || now < wheelLock) return;
  const dir = Math.sign(e.deltaY);
  const max = sectionMetrics(current).max;
  if (max > 0 && dir !== 0) {
    const atEdge = dir > 0 ? scrollTarget >= max - 0.01 : scrollTarget <= 0.01;
    if (!atEdge) {
      scrollTarget = clamp(scrollTarget + e.deltaY / S, 0, max);
      scrollVel = 0;
      lastWheelScroll = now;
      wheelAcc = 0;
      return;
    }
    if (now - lastWheelScroll < 450) return; // pause at the edge before leaving the section
  }
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) > 40) {
    go(current + Math.sign(wheelAcc), { end: wheelAcc < 0 });
    wheelAcc = 0;
    wheelLock = now + 500;
  }
}, { passive: false });

function scrollOrGo(dir) {
  const max = sectionMetrics(current).max;
  const atEdge = dir > 0 ? scrollTarget >= max - 0.01 : scrollTarget <= 0.01;
  if (max > 0 && !atEdge) scrollTarget = clamp(scrollTarget + (dir * 120) / S, 0, max);
  else go(current + dir, { end: dir < 0 });
}
window.addEventListener('keydown', (e) => {
  if (document.body.classList.contains('fallback')) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); scrollOrGo(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); scrollOrGo(-1); }
  else if (['PageDown', ' '].includes(e.key)) { e.preventDefault(); go(current + 1); }
  else if (e.key === 'PageUp') { e.preventDefault(); go(current - 1); }
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
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const m = chooseMode();
  S = scaleFor(m);
  // Short screens (phones in landscape) get slimmer header/footer bands.
  const short = innerHeight < 500;
  HUD_TOP = short ? 52 : HUD_SZ[m].top;
  HUD_BOTTOM = short ? 40 : HUD_SZ[m].bottom;
  if (m !== mode || short !== SHORT) {
    mode = m;
    SHORT = short;
    buildSections(m);
    buildHud(m);
  } else {
    layoutHud();
  }
  if (booted && !transition && current >= 0) {
    scroll = scrollTarget = clamp(scrollTarget, 0, sectionMetrics(current).max);
    go(current, { instant: true, keepScroll: true });
  }
}

// Switching language rebuilds the 3D text in place; the camera stays where it is.
onLangChange(() => {
  buildSections(mode);
  buildHud(mode);
  if (!transition && current >= 0) {
    scroll = scrollTarget = clamp(scrollTarget, 0, sectionMetrics(current).max);
    go(current, { instant: true, keepScroll: true });
  }
});

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
  } else if (current >= 0) {
    // In-section scrolling with momentum and a soft spring at the edges
    const max = sectionMetrics(current).max;
    if (!drag?.moved) {
      if (Math.abs(scrollVel) > 0.01) {
        scrollTarget += scrollVel * dt;
        scrollVel *= Math.pow(0.03, dt);
      }
      const c = clamp(scrollTarget, 0, max);
      if (c !== scrollTarget) { scrollTarget += (c - scrollTarget) * 0.2; scrollVel *= 0.5; }
    }
    scroll += (scrollTarget - scroll) * (drag?.moved ? 1 : 0.2);
    const p = poseFor(current, scroll);
    base.p.copy(p.p);
    base.q.copy(p.q);
  }

  // Parallax (mouse only)
  if (!reduceMotion) {
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
  }
  const right = new V3(1, 0, 0).applyQuaternion(base.q);
  const upV = new V3(0, 1, 0).applyQuaternion(base.q);
  camera.position.copy(base.p).addScaledVector(right, mouse.x * 0.6).addScaledVector(upV, -mouse.y * 0.4);
  tmpE.set(-mouse.y * 0.025, -mouse.x * 0.04, 0);
  camera.quaternion.copy(base.q).multiply(tmpQ.setFromEuler(tmpE));

  bg.position.copy(base.p);
  stars.rotation.y = t * 0.01;
  updateConstellations(t);
  keyLight.position.copy(base.p).add(new V3(6, 4, -6));
  fillLight.position.copy(base.p).add(new V3(-5, -3, -8));

  // Section visibility by distance to their camera pose
  SECTIONS.forEach((name, i) => {
    const g = sections[name];
    const d = base.p.distanceTo(poseFor(i, i === current ? scroll : 0).p);
    const a = 1 - smooth(d, 3, 26);
    if (Math.abs(a - g.userData.alpha) > 0.003) {
      g.userData.alpha = a;
      setOpacity(g, a);
    }
  });

  if (crystal) {
    const { core, w, ring1, ring2, baseY } = crystal.userData;
    core.rotation.y = t * 0.4;
    core.rotation.x = Math.sin(t * 0.3) * 0.3;
    w.rotation.copy(core.rotation);
    ring1.rotation.z = t * 0.2;
    ring2.rotation.z = -t * 0.12;
    crystal.position.y = baseY + Math.sin(t * 1.2) * 0.08;
  }
  icons.forEach((ic) => { ic.rotation.y += dt * 0.6 * ic.userData.spin; ic.rotation.x = Math.sin(t * 0.7) * 0.25; });

  // Hover (mouse)
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

  if (hudEls) {
    const E = hudEls;
    if (E.barTarget) {
      E.bar.position.x += (E.barTarget.x - E.bar.position.x) * 0.15;
      E.bar.position.y += (E.barTarget.y - E.bar.position.y) * 0.15;
      E.bar.scale.x += (E.barTarget.w - E.bar.scale.x) * 0.15;
    }
    E.star.rotation.z += dt * 0.3;
    const showHint = current === 0 && !transition && !menuOpen && !SHORT && sectionMetrics(0).max === 0;
    const hintA = showHint ? 0.35 + 0.35 * Math.sin(t * 2.5) : 0;
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
