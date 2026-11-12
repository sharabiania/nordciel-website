import * as THREE from 'three';

document.getElementById('year').textContent = new Date().getFullYear();

// Reveal cards on scroll
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
}, { threshold: 0.15 });
document.querySelectorAll('.card').forEach((c) => io.observe(c));

const canvas = document.getElementById('sky');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
} catch (err) {
  // No WebGL: fall back to a CSS gradient sky
  canvas.style.background = 'radial-gradient(ellipse at top, #12204a, #050816 70%)';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x050816, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050816, 0.035);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
camera.position.set(0, 0, 12);

// ---------- Stars ----------
const STAR_COUNT = 3000;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STAR_COUNT * 3);
const starSize = new Float32Array(STAR_COUNT);
for (let i = 0; i < STAR_COUNT; i++) {
  const r = 30 + Math.random() * 70;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = r * Math.cos(phi);
  starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 20;
  starSize[i] = Math.random() * 1.5 + 0.5;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('size', new THREE.BufferAttribute(starSize, 1));
const starMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute float size; uniform float uTime; uniform float uPixelRatio; varying float vTwinkle;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vTwinkle = 0.6 + 0.4 * sin(uTime * 2.0 + position.x * 10.0);
      gl_PointSize = size * uPixelRatio * (60.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying float vTwinkle;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d) * vTwinkle;
      gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// ---------- Aurora ribbons ----------
const auroraMat = (colorA, colorB, offset) => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(colorA) }, uB: { value: new THREE.Color(colorB) }, uOff: { value: offset } },
  vertexShader: `
    uniform float uTime; uniform float uOff; varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 p = position;
      float t = uTime * 0.25 + uOff;
      p.y += sin(p.x * 0.35 + t) * 1.2 + sin(p.x * 0.9 + t * 1.7) * 0.35;
      p.z += cos(p.x * 0.25 + t * 0.8) * 1.5;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uOff; varying vec2 vUv;
    void main() {
      float bands = 0.5 + 0.5 * sin(vUv.x * 40.0 + uTime * 0.6 + uOff * 3.0);
      float fadeY = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
      float fadeX = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
      vec3 col = mix(uA, uB, vUv.y + 0.2 * sin(vUv.x * 6.0 + uTime * 0.3));
      float a = fadeY * fadeX * (0.35 + 0.65 * bands) * 0.55;
      gl_FragColor = vec4(col, a);
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
});
const auroras = [];
[
  ['#3df5b0', '#7b6cff', 0.0, 5, -10],
  ['#2bd9ff', '#b26cff', 2.1, 7.5, -16],
  ['#3df5b0', '#2bd9ff', 4.2, 3, -22],
].forEach(([a, b, off, y, z]) => {
  const geo = new THREE.PlaneGeometry(50, 6, 200, 20);
  const mesh = new THREE.Mesh(geo, auroraMat(a, b, off));
  mesh.position.set(0, y, z);
  mesh.rotation.x = -0.3;
  scene.add(mesh);
  auroras.push(mesh);
});

// ---------- North star crystal ----------
const crystalGroup = new THREE.Group();
const crystal = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.6, 0),
  new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, metalness: 0.1, roughness: 0.05, transmission: 0.6, thickness: 1, flatShading: true, emissive: 0x1a2a6a, emissiveIntensity: 0.4 })
);
const wire = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.62, 0)),
  new THREE.LineBasicMaterial({ color: 0x3df5b0, transparent: true, opacity: 0.6 })
);
crystalGroup.add(crystal, wire);
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(2.8, 0.015, 8, 128),
  new THREE.MeshBasicMaterial({ color: 0x7b6cff, transparent: true, opacity: 0.6 })
);
ring.rotation.x = Math.PI / 2.3;
crystalGroup.add(ring);
crystalGroup.position.set(4.5, 0.5, 0);
scene.add(crystalGroup);

scene.add(new THREE.AmbientLight(0x6070ff, 0.6));
const key = new THREE.PointLight(0x3df5b0, 40, 30); key.position.set(6, 4, 6); scene.add(key);
const fill = new THREE.PointLight(0x7b6cff, 30, 30); fill.position.set(-4, -3, 4); scene.add(fill);

// ---------- Interaction ----------
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', (e) => {
  mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
});
let scrollT = 0;
window.addEventListener('scroll', () => {
  const max = document.body.scrollHeight - window.innerHeight;
  scrollT = max > 0 ? window.scrollY / max : 0;
}, { passive: true });

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Center the crystal on narrow screens
  crystalGroup.position.x = w < 800 ? 0 : 4.5;
  crystalGroup.position.y = w < 800 ? 3 : 0.5;
  crystalGroup.scale.setScalar(w < 800 ? 0.7 : 1);
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function frame() {
  const t = reduceMotion ? 0 : clock.getElapsedTime();
  mouse.x += (mouse.tx - mouse.x) * 0.05;
  mouse.y += (mouse.ty - mouse.y) * 0.05;

  starMat.uniforms.uTime.value = t;
  auroras.forEach((m) => (m.material.uniforms.uTime.value = t));
  stars.rotation.y = t * 0.01;

  crystal.rotation.y = t * 0.4;
  crystal.rotation.x = Math.sin(t * 0.3) * 0.3;
  wire.rotation.copy(crystal.rotation);
  ring.rotation.z = t * 0.2;
  crystalGroup.position.y += Math.sin(t * 1.2) * 0.002;

  // Camera: parallax with mouse, rises toward the sky while scrolling
  camera.position.x = mouse.x * 0.8;
  camera.position.y = -mouse.y * 0.5 + scrollT * 3;
  camera.lookAt(0, scrollT * 5, -10);

  renderer.render(scene, camera);
  if (!reduceMotion) requestAnimationFrame(frame);
}
frame();
if (reduceMotion) window.addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true });
