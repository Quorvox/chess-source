// 3D-сцена на главной: король вдали, впереди ферзь и конь
export async function mountHero(host) {
  const THREE = await import('/vendor/three/three.module.js');
  const { RoomEnvironment } = await import('/vendor/three/RoomEnvironment.js');
  const { buildPiece, makeMaterials } = await import('/js/pieces3d.js');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x26231f, 11, 26);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  camera.position.set(0, 3.4, 11);
  const target = new THREE.Vector3(0.6, 1.2, 0);
  camera.lookAt(target);

  const M = makeMaterials(THREE);

  // пол: шахматная доска из дерева, уходит в туман
  const tex = (m) => { const t = m.clone(); t.repeat.set(1, 1); return t; };
  const sq = 1.7, n = 16;
  const dark = new THREE.MeshStandardMaterial({ map: tex(M.woodDarkSquare), roughness: 0.4, metalness: 0.05 });
  const light = new THREE.MeshStandardMaterial({ map: tex(M.woodLightSquare), roughness: 0.45, metalness: 0.05 });
  const floor = new THREE.Group();
  const sqGeo = new THREE.PlaneGeometry(sq, sq);
  for (let i = -n / 2; i < n / 2; i++) {
    for (let j = -n / 2; j < n / 2; j++) {
      const m = new THREE.Mesh(sqGeo, (i + j) % 2 === 0 ? light : dark);
      m.rotation.x = -Math.PI / 2;
      m.position.set(i * sq + sq / 2, 0, j * sq + sq / 2);
      m.receiveShadow = true;
      floor.add(m);
    }
  }
  scene.add(floor);

  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2118, 0.55));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6);
  key.position.set(4, 9, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa9c4ff, 1.4);
  rim.position.set(-7, 5, -6);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffa640, 18, 12, 2);
  warm.position.set(1.5, 2.5, 3);
  scene.add(warm);

  // фигуры: [тип, цвет, x, z, масштаб, поворот]
  const set = [
    ['k', 'dark', 3.0, -6.2, 1.45, -0.4],
    ['b', 'dark', -0.6, -3.6, 1.3, 0.5],
    ['q', 'light', 0.9, 0.6, 1.2, 0.3],
    ['n', 'light', 3.5, 1.6, 1.2, -0.9],
  ];
  const pieces = set.map(([type, color, x, z, s, ry]) => {
    const p = buildPiece(THREE, M, type, color);
    p.position.set(x, 0, z);
    p.scale.setScalar(s);
    p.rotation.y = ry;
    scene.add(p);
    return { p, ry };
  });

  const host$ = host;
  const resize = () => {
    const w = host$.clientWidth, h = host$.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1.3 ? 15 : 11;
    if (w / h < 1.3) camera.setViewOffset(w, h, 0, -h * 0.3, w, h); // узкий экран: фигуры внизу, текст сверху
    else camera.setViewOffset(w, h, -w * 0.27, -h * 0.03, w, h);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host$);
  resize();

  let mx = 0, my = 0, raf = 0, visible = true;
  const onMove = (e) => { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2; };
  addEventListener('pointermove', onMove);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(host$);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clock = new THREE.Clock();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const t = clock.getElapsedTime();
    pieces.forEach(({ p, ry }, i) => { p.rotation.y = ry + (reduce ? 0 : Math.sin(t * 0.5 + i * 1.7) * 0.28); });
    camera.position.x += (mx * 0.9 - camera.position.x) * 0.04;
    camera.position.y += (3.4 - my * 0.5 - camera.position.y) * 0.04;
    camera.lookAt(target);
    renderer.render(scene, camera);
  };
  frame();

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    ro.disconnect();
    io.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
