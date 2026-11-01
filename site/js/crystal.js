/* Rock Park — procedural amethyst cluster for the hero (Three.js r170).
   Tiers: T0 poster image (no WebGL / reduced motion / save-data), T1 standard glass, T2 physical transmission. */
let THREE, mergeGeometries; // loaded on demand, so the 140 KB engine never weighs on first paint

const hero = document.querySelector(".hero");
const canvas = document.getElementById("crystal");
const params = new URLSearchParams(location.search);
const POSTER_MODE = params.has("poster"); // dev: render a still for assets/img/crystal-poster.webp
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const saveData = navigator.connection && navigator.connection.saveData;

// WebGL boots on the first sign of a visitor (pointer, touch, scroll, key) once the page has loaded.
// Until then the poster — a still of this same scene — holds the stage, so first paint stays light.
if ((!reduced && !saveData) || POSTER_MODE) {
  const EVENTS = ["pointermove", "pointerdown", "touchstart", "wheel", "scroll", "keydown"];
  let armed = false;
  const go = () => {
    if (armed) return;
    armed = true;
    EVENTS.forEach((e) => removeEventListener(e, go));
    Promise.all([import("three"), import("three/addons/utils/BufferGeometryUtils.js")])
      .then(([three, utils]) => {
        THREE = three; mergeGeometries = utils.mergeGeometries;
        window.requestIdleCallback ? requestIdleCallback(start, { timeout: 300 }) : setTimeout(start, 50);
      })
      .catch((e) => console.warn("Crystal scene unavailable, keeping the poster:", e)); // e.g. offline CDN
  };
  const arm = () => (POSTER_MODE ? go() : EVENTS.forEach((e) => addEventListener(e, go, { passive: true, once: true })));
  if (document.readyState === "complete") arm(); else addEventListener("load", arm, { once: true });
}

function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: POSTER_MODE });
  } catch { return; } // T0: the poster stays
  const fine = matchMedia("(pointer: fine)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.2, 9.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.02).texture;

  /* ---------- geometry: hexagonal points with pyramidal tips ---------- */
  const rand = mulberry32(7);
  const CLEAR = new THREE.Color(0xf6f0ff), VIOLET = new THREE.Color(0x6a2fc4);
  function point(radius, height) {
    const body = new THREE.CylinderGeometry(radius, radius * 1.08, height, 6, 1);
    const tip = new THREE.ConeGeometry(radius, radius * 1.9, 6, 1);
    tip.translate(0, height / 2 + radius * 0.95, 0);
    const g = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()]);
    const p = g.attributes.position; // jitter facets so each point catches light differently
    const seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(k)) seen.set(k, [(rand() - 0.5) * radius * 0.16, (rand() - 0.5) * radius * 0.1, (rand() - 0.5) * radius * 0.16]);
      const [dx, dy, dz] = seen.get(k);
      p.setXYZ(i, p.getX(i) + dx, p.getY(i) + dy, p.getZ(i) + dz);
    }
    g.translate(0, height / 2, 0);
    g.computeVertexNormals();
    // real amethyst points run from near-clear at the base to deep violet at the tip
    const top = height + radius * 1.9, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const k = Math.min(1, Math.max(0, p.getY(i) / top)) ** 1.6;
      c.copy(CLEAR).lerp(VIOLET, k);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }
  // points radiate from one root like a real cluster: [radius, height, lean, azimuth, dx, dz]
  const spec = [
    [0.50, 2.55, 0.04, 0.0, 0, 0],
    [0.36, 1.95, 0.42, 2.4, -0.18, 0.05],
    [0.34, 1.80, 0.48, 0.5, 0.2, 0.06],
    [0.27, 1.45, 0.78, 3.3, -0.2, -0.12],
    [0.27, 1.40, 0.82, -0.4, 0.22, -0.1],
    [0.22, 1.10, 0.95, 1.6, 0.05, 0.25],
    [0.20, 1.00, 1.0, 4.4, -0.1, 0.2],
    [0.18, 0.85, 1.05, 5.4, 0.15, -0.22],
  ];
  const parts = spec.map(([r, h, lean, az, dx, dz]) => {
    const g = point(r, h);
    g.rotateZ(lean);
    g.rotateY(az + rand() * 0.3);
    g.translate(dx, -0.35, dz); // broken-off roots meet in a tight bundle
    return g;
  });
  const crystalGeo = mergeGeometries(parts);


  /* ---------- materials ---------- */
  const glowTex = radialTexture(["rgba(170,120,255,0.95)", "rgba(110,60,190,0.35)", "rgba(20,10,40,0)"]);
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  backdrop.position.set(0, 1, -3.2);

  const physical = () => new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.03, metalness: 0, transmission: 1, thickness: 1.2, ior: 1.54, dispersion: 5,
    attenuationColor: new THREE.Color(0xc9a8ff), attenuationDistance: 2.4,
    iridescence: 0.2, iridescenceIOR: 1.3, clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1, envMapIntensity: 1.6, flatShading: true,
  });
  const standard = () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    transparent: true, opacity: 0.9, envMapIntensity: 1.8, flatShading: true });
  let tier = fine && innerWidth > 900 ? 2 : 1;
  const crystal = new THREE.Mesh(crystalGeo, tier === 2 ? physical() : standard());
  // no rock: the cluster floats over a soft contact shadow and a pool of light
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({
    map: radialTexture(["rgba(0,0,0,0.75)", "rgba(0,0,0,0.25)", "rgba(0,0,0,0)"]), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.82;
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({
    map: radialTexture(["rgba(190,150,255,0.55)", "rgba(120,70,220,0.18)", "rgba(0,0,0,0)"]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = -0.81;
  const cluster = new THREE.Group();
  cluster.add(crystal);
  const rig = new THREE.Group(); // rig = pointer/scroll; cluster = idle spin
  rig.add(cluster, shadow, pool);
  scene.add(backdrop, rig);

  const key = new THREE.DirectionalLight(0xffe6c8, 2.4); key.position.set(3, 5, 4);
  const rim = new THREE.PointLight(0xb98cff, 30, 12); rim.position.set(-3, 2, -2);
  const fill = new THREE.PointLight(0xff9a6a, 4, 10); fill.position.set(3, -1, 2);
  scene.add(key, rim, fill);

  /* ---------- drifting dust ---------- */
  const N = 220, dust = new Float32Array(N * 3), speed = new Float32Array(N);
  for (let i = 0; i < N; i++) { dust.set([(rand() - 0.5) * 9, (rand() - 0.5) * 6, (rand() - 0.5) * 4], i * 3); speed[i] = 0.05 + rand() * 0.15; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
  const motes = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.05, map: radialTexture(["rgba(255,240,255,1)", "rgba(200,160,255,0.4)", "rgba(0,0,0,0)"]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
  scene.add(motes);

  /* ---------- layout ---------- */
  const layout = { x: 0, y: 0, s: 1 };
  function resize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const wide = w > 900;
    layout.x = wide ? Math.min(2.5, 1.38 * camera.aspect) : 0;
    layout.y = wide ? -0.95 : 1.3;
    layout.s = wide ? 0.78 : Math.min(0.5, 0.55 * camera.aspect + 0.1);
    backdrop.position.x = layout.x;
  }
  addEventListener("resize", resize);
  resize();

  /* ---------- input ---------- */
  const pointer = { x: 0, y: 0 }, tilt = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  // Gyro only where no permission prompt is needed (never required)
  if (!fine && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== "function") {
    addEventListener("deviceorientation", (e) => { if (e.gamma == null) return; pointer.x = Math.max(-1, Math.min(1, e.gamma / 30)); pointer.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30)); }, { passive: true });
  }

  /* ------------------------------------------------------------------
     Scroll choreography: p = 0 at the top of the hero, 1 when it has scrolled away.
     Decides how the crystal hands the stage over to the manifesto.
     ------------------------------------------------------------------ */
  function onScrollProgress(p) {
    const e = p * p * (3 - 2 * p); // smoothstep
    rig.position.set(layout.x * (1 - e * 0.35), layout.y + e * 1.6, -e * 2.5);
    rig.rotation.z = e * 0.35;
    rig.scale.setScalar(layout.s * (1 - e * 0.25));
    backdrop.material.opacity = 1 - e;
  }

  /* ---------- loop ---------- */
  let visible = true, running = false, dead = false, ready = false, last = performance.now(), t = 0, frames = 0, acc = 0;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); });
  io.observe(hero);
  document.addEventListener("visibilitychange", kick);
  function kick() { if (ready && !dead && !running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

  // One way out for every failure: stop for good and hand the stage back to the poster
  function shutdown() {
    if (dead) return;
    dead = true; running = false;
    io.disconnect(); document.removeEventListener("visibilitychange", kick);
    hero.classList.remove("has-webgl");
    renderer.dispose();
  }

  function frame(now) {
    if (dead || !visible || document.hidden) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    tilt.x += (pointer.y * 0.22 - tilt.x) * Math.min(1, dt * 3);
    tilt.y += (pointer.x * 0.4 - tilt.y) * Math.min(1, dt * 3);
    cluster.rotation.y += dt * 0.18;
    cluster.position.y = Math.sin(t * 0.8) * 0.1;
    shadow.material.opacity = pool.material.opacity = 0.85 - cluster.position.y * 1.5; // shadow tightens as it sinks
    rig.rotation.x = tilt.x;
    rig.rotation.y = tilt.y;
    onScrollProgress(Math.min(1, Math.max(0, scrollY / hero.offsetHeight)));
    const pos = dustGeo.attributes.position;
    for (let i = 0; i < N; i++) { let y = pos.getY(i) + speed[i] * dt; if (y > 3) y = -3; pos.setY(i, y); }
    pos.needsUpdate = true;
    renderer.render(scene, camera);
    budget(dt);
    if (running) requestAnimationFrame(frame);
  }

  // Measure the real frame time; step the material down, then give up to the poster
  function budget(dt) {
    if (POSTER_MODE || frames > 120) return;
    frames++; acc += dt;
    if (frames === 60) {
      const avg = acc / 60 * 1000;
      if (tier === 2 && avg > 24) { crystal.material.dispose(); crystal.material = standard(); tier = 1; frames = 0; acc = 0; }
      else if (tier === 1 && avg > 40) shutdown(); // too slow even for the light tier
    }
  }

  let compiled;
  try { compiled = renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(); }
  catch (e) { compiled = Promise.reject(e); }
  compiled.then(reveal, (e) => { console.warn("Crystal shaders failed, keeping the poster:", e); shutdown(); });
  function reveal() { if (dead) return; ready = true; hero.classList.add("has-webgl"); kick(); }

  if (POSTER_MODE) window.__crystalPNG = () => { renderer.render(scene, camera); return canvas.toDataURL("image/png"); };
}

// A dark studio with softboxes: crisp highlights on flat facets read as cut gem rather than plastic.
function studio() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x050407);
  const box = (w, h, color, i, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); s.add(m);
  };
  box(6, 3, 0xffffff, 4, [-4, 6, 3], [0, 0, 0]);   // key softbox, top left
  box(1, 8, 0xffd2a8, 3, [6, 1, 1], [0, 0, 0]);    // warm strip, right
  box(8, 2, 0xa77bff, 3, [0, 3, -7], [0, 0, 0]);   // violet rim, behind
  box(10, 10, 0x1a1424, 1, [0, -6, 0], [0, 0, 0]); // floor bounce
  return s;
}

function radialTexture(stops) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach((s, i) => grd.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
