// Comet cursor: the mouse pointer becomes a small comet. A bright nucleus sits
// exactly on the pointer (so clicks land where you expect), a glowing coma
// stretches with speed, and a tapered tail plus drifting sparks trail behind.
// Over something clickable an orbit ring with a tiny planet appears; clicking
// throws a burst of sparks and a shock ring.
//
// On touch screens there is no pointer to replace, so the comet appears only
// while a finger is down: a spark burst where you tap and a comet that follows
// your finger as you swipe, fading out when you let go.
//
// Visitors with "reduce motion" get none of this. Drawn on its own 2D canvas
// above the page, so it works on every page and in the no-WebGL fallback too.
//
// The 3D scene reports hover over its own buttons with setCursorHover();
// ordinary HTML links and buttons are detected here.

const MINT = [61, 245, 176];
const CYAN = [43, 217, 255];
const VIOLET = [123, 108, 255];
const PALETTE = [MINT, MINT, CYAN, VIOLET];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a, b, k) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));

let sceneHover = false;
/** Called by the 3D scene: true while the pointer is over something clickable. */
export function setCursorHover(v) { sceneHover = !!v; }

const CLICKABLE = 'a[href], button, [role="button"], label, select, summary, [data-email], [data-go]';

function init() {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'comet-cursor';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.appendChild(canvas);
  // Hide the system pointer only where the comet replaces it (mouse/trackpad).
  if (fine.matches) document.documentElement.classList.add('comet-on');
  // A mouse plugged into a touch device keeps its normal pointer, so no comet for it there.
  const tracks = (e) => (e.pointerType === 'mouse' ? fine.matches : touching);
  let touching = false;

  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  const head = { x: -100, y: -100 };
  const vel = { x: 0, y: 0 }; // smoothed, px per second
  let visible = false;
  let domHover = false;
  let hoverK = 0; // eased 0..1
  let pressK = 0; // eased 0..1 while the button is held
  let pressed = false;
  let lastMove = 0;
  let nextSparkle = 0;
  const trail = []; // recent pointer positions: { x, y, t }
  const sparks = []; // { x, y, vx, vy, life, age, size, c }
  const rings = []; // click shock rings: { x, y, age }
  let running = false;

  function spark(x, y, vx, vy, life, size, c) {
    if (sparks.length > 260) sparks.shift();
    sparks.push({ x, y, vx, vy, life, age: 0, size, c: c || PALETTE[(Math.random() * PALETTE.length) | 0] });
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  window.addEventListener('pointermove', (e) => {
    if (!tracks(e)) return;
    const now = performance.now();
    const dx = e.clientX - head.x;
    const dy = e.clientY - head.y;
    const dist = Math.hypot(dx, dy);
    if (visible && dist > 0 && dist < 400) {
      // Shed sparks along the path, thrown back against the direction of travel.
      const n = Math.min(6, Math.floor(dist / 7));
      for (let i = 0; i < n; i++) {
        const k = Math.random();
        const back = 0.08 + Math.random() * 0.12;
        spark(head.x + dx * k, head.y + dy * k,
          -dx * back * 6 + (Math.random() - 0.5) * 50, -dy * back * 6 + (Math.random() - 0.5) * 50,
          0.45 + Math.random() * 0.5, 0.6 + Math.random() * 1.6);
      }
    }
    head.x = e.clientX;
    head.y = e.clientY;
    if (!visible) trail.length = 0;
    visible = true;
    lastMove = now;
    trail.push({ x: head.x, y: head.y, t: now });
    start();
  }, { passive: true });

  document.addEventListener('pointerover', (e) => {
    domHover = !!(e.target instanceof Element && e.target.closest(CLICKABLE));
  }, { passive: true });
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) visible = false; }, { passive: true });
  window.addEventListener('blur', () => { visible = false; });

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (!fine.matches) return;
    } else {
      // Finger down: the comet appears right here.
      touching = true;
      head.x = e.clientX;
      head.y = e.clientY;
      trail.length = 0;
      trail.push({ x: head.x, y: head.y, t: performance.now() });
      visible = true;
      lastMove = performance.now();
    }
    pressed = true;
    rings.push({ x: e.clientX, y: e.clientY, age: 0 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const sp = 90 + Math.random() * 160;
      spark(e.clientX, e.clientY, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.4, 0.8 + Math.random() * 1.4);
    }
    start();
  }, { passive: true });
  const release = (e) => {
    pressed = false;
    if (e.pointerType !== 'mouse') { touching = false; visible = false; }
  };
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });

  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // Velocity from the trail (smoothed), used to stretch the coma.
    while (trail.length && now - trail[0].t > 320) trail.shift();
    const still = now - lastMove > 60;
    const tv = { x: 0, y: 0 };
    if (!still && trail.length > 1) {
      const a = trail[Math.max(0, trail.length - 4)];
      const span = Math.max(16, now - a.t) / 1000;
      tv.x = (head.x - a.x) / span;
      tv.y = (head.y - a.y) / span;
    }
    const kv = Math.min(1, dt * 12);
    vel.x += (tv.x - vel.x) * kv;
    vel.y += (tv.y - vel.y) * kv;

    const hover = visible && (sceneHover || domHover);
    hoverK += ((hover ? 1 : 0) - hoverK) * Math.min(1, dt * 10);
    pressK += ((pressed ? 1 : 0) - pressK) * Math.min(1, dt * 18);

    // Idle shimmer: a few slow sparks drifting off the nucleus.
    if (visible && now > nextSparkle) {
      const a = Math.random() * Math.PI * 2;
      spark(head.x, head.y, Math.cos(a) * 18, Math.sin(a) * 18 - 6, 0.7 + Math.random() * 0.5, 0.5 + Math.random() * 0.9);
      nextSparkle = now + (still ? 140 : 60);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';

    // Sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) { sparks.splice(i, 1); continue; }
      const drag = Math.pow(0.12, dt);
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.age / p.life;
      const r = p.size * (0.4 + 0.6 * k);
      ctx.fillStyle = rgba(p.c, 0.18 * k);
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(mix(p.c, [255, 255, 255], 0.5), 0.85 * k);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Shock rings from clicks
    for (let i = rings.length - 1; i >= 0; i--) {
      const s = rings[i];
      s.age += dt;
      if (s.age > 0.55) { rings.splice(i, 1); continue; }
      const k = s.age / 0.55;
      ctx.strokeStyle = rgba(mix(MINT, VIOLET, k), 0.7 * (1 - k));
      ctx.lineWidth = 2 * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, 6 + 34 * (1 - Math.pow(1 - k, 3)), 0, Math.PI * 2); ctx.stroke();
    }

    if (visible) {
      // Tail: a tapered ribbon through recent positions, fading from mint to violet.
      if (trail.length > 1) {
        ctx.lineCap = 'round';
        const n = trail.length;
        for (let i = 1; i < n; i++) {
          const a = trail[i - 1];
          const b = trail[i];
          const age = (now - b.t) / 320;
          const k = (i / (n - 1)) * (1 - age);
          if (k <= 0) continue;
          ctx.strokeStyle = rgba(mix(VIOLET, MINT, k), 0.55 * k);
          ctx.lineWidth = 1 + 7 * k;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      // Coma: a glow stretched backwards along the direction of travel.
      const speed = Math.hypot(vel.x, vel.y);
      const stretch = Math.min(2.6, 1 + speed / 700);
      const ang = Math.atan2(vel.y, vel.x);
      const R = (13 + 9 * hoverK) * (1 - 0.25 * pressK);
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(ang);
      ctx.translate(-(stretch - 1) * R * 0.45, 0);
      ctx.scale(stretch, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(255,255,255,0.75)');
      g.addColorStop(0.25, rgba(MINT, 0.45));
      g.addColorStop(0.6, rgba(CYAN, 0.14));
      g.addColorStop(1, rgba(VIOLET, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Orbit ring and a small planet while over something clickable.
      if (hoverK > 0.01) {
        const rr = 15 + 3 * Math.sin(now / 400);
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(-0.5);
        ctx.scale(1, 0.45 + 0.1 * hoverK);
        ctx.strokeStyle = rgba(MINT, 0.55 * hoverK);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, rr * hoverK, 0, Math.PI * 2); ctx.stroke();
        const pa = now / 260;
        ctx.fillStyle = rgba(VIOLET, hoverK);
        ctx.beginPath(); ctx.arc(Math.cos(pa) * rr * hoverK, Math.sin(pa) * rr * hoverK, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Nucleus: the exact pointer position.
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = rgba(MINT, 0.9);
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(head.x, head.y, 2.6 + 0.8 * hoverK - 0.8 * pressK, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.globalCompositeOperation = 'source-over';
    if (visible || sparks.length || rings.length) requestAnimationFrame(tick);
    else {
      running = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
