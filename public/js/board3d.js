// 3D-доска в духе Real Chess: деревянная рама с буквами, перспектива со стороны игрока, анимация ходов.
// Three.js грузится только когда игрок включает 3D.
const FILES = 'abcdefgh';
const SCALE = 0.9; // фигуры чуть меньше клетки, чтобы не наползали друг на друга

const sqPos = (sq) => ({ x: FILES.indexOf(sq[0]) - 3.5, z: 4.5 - Number(sq[1]) });

function parseFen(fen) {
  const out = new Map();
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      out.set(FILES[f] + (8 - i), { t: ch.toLowerCase(), c: ch === ch.toLowerCase() ? 'dark' : 'light' });
      f++;
    }
  });
  return out;
}

/** cb.onSquare(sq) вызывается при клике по клетке. Состояние задаётся через set(). */
export async function createBoard3D(host, cb) {
  const THREE = await import('/vendor/three/three.module.js');
  const { RoomEnvironment } = await import('/vendor/three/RoomEnvironment.js');
  const { buildPiece, makeMaterials } = await import('/js/pieces3d.js');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:manipulation';
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  const M = makeMaterials(THREE);

  // стол
  const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#8a7a66', roughness: 0.9 }));
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.62;
  table.receiveShadow = true;
  scene.add(table);

  // доска: всё внутри группы, для чёрных поворачиваем её на 180°
  const board = new THREE.Group();
  scene.add(board);

  const woodDark = new THREE.MeshStandardMaterial({ color: '#2b2c31', roughness: 0.55, map: M.woodDarkSquare });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.6, map: M.woodDarkSquare });
  for (let f = 0; f < 8; f++) {
    for (let r = 1; r <= 8; r++) {
      const light = (f + r) % 2 === 1;
      const tex = (light ? M.woodLightSquare : M.woodDarkSquare).clone();
      tex.offset.set(Math.random(), Math.random());
      tex.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.02 }));
      const p = sqPos(FILES[f] + r);
      m.position.set(p.x, -0.07, p.z);
      m.receiveShadow = true;
      board.add(m);
    }
  }
  // рама
  const frame = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), frameMat);
    m.position.set(x, -0.07, z);
    m.castShadow = true;
    m.receiveShadow = true;
    board.add(m);
  };
  frame(9.8, 0.9, 0, -4.45); frame(9.8, 0.9, 0, 4.45); frame(0.9, 8, -4.45, 0); frame(0.9, 8, 4.45, 0);
  const base = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.3, 9.8), woodDark);
  base.position.y = -0.3;
  board.add(base);

  // подписи на раме
  const label = (txt, x, z, flip) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f1e6c8';
    g.font = '800 92px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    m.rotation.x = -Math.PI / 2;
    if (flip) m.rotation.z = Math.PI;
    m.position.set(x, 0.19, z);
    board.add(m);
  };
  for (let i = 0; i < 8; i++) {
    label(FILES[i].toUpperCase(), i - 3.5, 4.45, false);
    label(FILES[i].toUpperCase(), i - 3.5, -4.45, true);
    label(String(i + 1), -4.45, 3.5 - i, false);
    label(String(i + 1), 4.45, 3.5 - i, true);
  }

  // свет
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a2f25, 0.6));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
  key.position.set(-5, 11, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd2ff, 0.7);
  fill.position.set(7, 6, -4);
  scene.add(fill);

  // подсветки клеток
  const marks = new THREE.Group();
  board.add(marks);
  const flat = (geo, color, opacity, y = 0.012) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  };
  const dotGeo = new THREE.CircleGeometry(0.17, 28);
  const ringGeo = new THREE.RingGeometry(0.36, 0.46, 32);
  const sqGeo = new THREE.PlaneGeometry(1, 1);

  // фигуры
  const pieces = new Map(); // sq -> { mesh, t, c }
  const anims = [];
  const spawn = (sq, info) => {
    const mesh = buildPiece(THREE, M, info.t, info.c);
    mesh.scale.setScalar(SCALE);
    const turn = FILES.indexOf(sq[0]) < 4 ? -0.7 : 0.7; // кони смотрят чуть в центр
    mesh.rotation.y = info.t === 'n' ? (info.c === 'light' ? -Math.PI / 2 + turn : Math.PI / 2 + turn) : Math.random() * 6;
    const p = sqPos(sq);
    mesh.position.set(p.x, 0, p.z);
    board.add(mesh);
    pieces.set(sq, { mesh, ...info });
    return mesh;
  };

  let state = { fen: '', lastMove: null, check: null, dests: new Map(), canMove: false, orientation: 'white' };
  let selected = null;
  let dirty = true;
  let raf = 0;

  function syncPieces(fen) {
    const next = parseFen(fen);
    const removed = [];
    for (const [sq, p] of pieces) {
      const n = next.get(sq);
      if (!n || n.t !== p.t || n.c !== p.c) { removed.push([sq, p]); pieces.delete(sq); }
    }
    for (const [sq, info] of next) {
      if (pieces.has(sq)) continue;
      // тот же тип и цвет, исчезнувший с другой клетки: это ход, анимируем
      let best = -1, bestD = 1e9;
      removed.forEach(([osq, p], i) => {
        if (p.t !== info.t || p.c !== info.c) return;
        const a = sqPos(osq), b = sqPos(sq);
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) {
        const [osq, p] = removed.splice(best, 1)[0];
        pieces.set(sq, p);
        const a = sqPos(osq), b = sqPos(sq);
        anims.push({ mesh: p.mesh, ax: a.x, az: a.z, bx: b.x, bz: b.z, t0: performance.now(), dur: 320 });
      } else spawn(sq, info);
    }
    // взятые фигуры уходят вниз
    for (const [, p] of removed) anims.push({ mesh: p.mesh, kill: true, t0: performance.now(), dur: 220 });
  }

  function drawMarks() {
    marks.clear();
    const mk = (sq, geo, color, op) => { const m = flat(geo, color, op); const p = sqPos(sq); m.position.x = p.x; m.position.z = p.z; marks.add(m); };
    if (state.lastMove) for (const sq of state.lastMove) mk(sq, sqGeo, 0xffd63c, 0.38);
    if (state.check) {
      for (const [sq, p] of pieces) if (p.t === 'k' && p.c === (state.check === 'white' ? 'light' : 'dark')) mk(sq, sqGeo, 0xff2d46, 0.55);
    }
    if (selected) {
      mk(selected, sqGeo, 0xffd63c, 0.55);
      for (const to of state.dests.get(selected) || []) {
        if (pieces.has(to)) mk(to, ringGeo, 0x1a1208, 0.45); else mk(to, dotGeo, 0x1a1208, 0.42);
      }
    }
    dirty = true;
  }

  function applyOrientation() {
    board.rotation.y = state.orientation === 'black' ? Math.PI : 0;
    dirty = true;
  }

  function frameCamera() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = 14 / Math.min(1, camera.aspect * 1.05);
    camera.position.set(0, dist * 0.78, dist * 0.7);
    camera.lookAt(0, 0.2, 0.5);
    camera.updateProjectionMatrix();
    dirty = true;
  }
  const ro = new ResizeObserver(frameCamera);
  ro.observe(host);
  frameCamera();

  // клики по клеткам
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function squareAt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    board.worldToLocal(hit);
    const f = Math.floor(hit.x + 4), row = Math.floor(hit.z + 4);
    if (f < 0 || f > 7 || row < 0 || row > 7) return null;
    return FILES[f] + (8 - row);
  }
  const onDown = (e) => {
    if (e.button > 0) return;
    const sq = squareAt(e);
    if (!sq) { selected = null; drawMarks(); return; }
    if (state.canMove && selected && (state.dests.get(selected) || []).includes(sq)) {
      const from = selected;
      selected = null;
      drawMarks();
      cb.onMove(from, sq);
      return;
    }
    selected = state.canMove && state.dests.has(sq) && selected !== sq ? sq : null;
    drawMarks();
  };
  renderer.domElement.addEventListener('pointerdown', onDown);

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function loop() {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      const k = Math.min(1, (now - a.t0) / a.dur);
      if (a.kill) {
        a.mesh.scale.setScalar(SCALE * (1 - ease(k)));
        if (k >= 1) { board.remove(a.mesh); anims.splice(i, 1); }
      } else {
        const e = ease(k);
        a.mesh.position.set(a.ax + (a.bx - a.ax) * e, Math.sin(Math.PI * k) * 0.7, a.az + (a.bz - a.az) * e);
        if (k >= 1) { a.mesh.position.y = 0; anims.splice(i, 1); }
      }
      dirty = true;
    }
    if (!dirty || document.hidden) return;
    dirty = false;
    renderer.render(scene, camera);
  }
  loop();

  return {
    set(next) {
      const fenChanged = next.fen !== state.fen;
      const turnedOver = next.orientation !== state.orientation;
      state = { ...state, ...next };
      if (turnedOver) applyOrientation();
      if (fenChanged) { selected = null; syncPieces(state.fen); }
      drawMarks();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
