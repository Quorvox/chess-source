// Процедурные 3D-фигуры: дерево с текстурой и золотые детали (в духе Real Chess).
// Модуль не тянет Three.js сам, его передают снаружи, чтобы грузить библиотеку только там, где она нужна.

function woodTexture(THREE, base, grain, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  let r = seed * 9301 + 7;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < 280; i++) {
    const y = rnd() * 512;
    g.strokeStyle = grain;
    g.globalAlpha = 0.05 + rnd() * 0.2;
    g.lineWidth = 0.6 + rnd() * 2.4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3 + (rnd() - 0.5) * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function makeMaterials(THREE) {
  const mk = (base, grain, seed, rough) => new THREE.MeshPhysicalMaterial({
    map: woodTexture(THREE, base, grain, seed), roughness: rough, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.35,
  });
  return {
    dark: mk('#4b4d55', '#23242a', 3, 0.45),
    light: mk('#d9ccb3', '#a89a82', 5, 0.5),
    gold: new THREE.MeshStandardMaterial({ color: '#f0b13c', metalness: 0.95, roughness: 0.28 }),
    woodDarkSquare: woodTexture(THREE, '#3b3d44', '#1d1e23', 11),
    woodLightSquare: woodTexture(THREE, '#d7c9ae', '#a99b82', 13),
  };
}

const lathe = (THREE, pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// общее основание: широкий диск с закруглением
const BASE = [[0, 0], [0.5, 0], [0.53, 0.05], [0.5, 0.12], [0.4, 0.2], [0.3, 0.27]];

function knightGeometry(THREE) {
  const s = new THREE.Shape();
  s.moveTo(-0.34, 0);
  s.lineTo(0.38, 0);
  s.bezierCurveTo(0.4, 0.35, 0.5, 0.62, 0.42, 0.95);        // спина и шея
  s.bezierCurveTo(0.36, 1.18, 0.2, 1.34, -0.02, 1.42);      // загривок к темени
  s.lineTo(-0.05, 1.64);                                    // ухо
  s.lineTo(-0.2, 1.46);
  s.bezierCurveTo(-0.34, 1.42, -0.5, 1.28, -0.62, 1.12);    // лоб к носу
  s.bezierCurveTo(-0.7, 1.0, -0.68, 0.88, -0.58, 0.86);     // морда
  s.bezierCurveTo(-0.46, 0.84, -0.4, 0.9, -0.3, 0.8);       // челюсть
  s.bezierCurveTo(-0.18, 0.66, -0.34, 0.34, -0.34, 0);      // горло и грудь
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 6, curveSegments: 28 });
  g.translate(0, 0, -0.21);
  return g;
}

/** Строит фигуру типа p/n/b/r/q/k. color: 'dark' | 'light'. Высота пешки около 1.1. */
export function buildPiece(THREE, M, type, color) {
  const wood = M[color];
  const gold = M.gold;
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const ring = (y, r, t = 0.035) => { const m = add(new THREE.TorusGeometry(r, t, 12, 40), gold, 0, y, 0); m.rotation.x = Math.PI / 2; };

  if (type === 'p') {
    add(lathe(THREE, [...BASE, [0.2, 0.4], [0.16, 0.58], [0.27, 0.64], [0.28, 0.69], [0.17, 0.74], [0, 0.74]]), wood);
    add(new THREE.SphereGeometry(0.23, 32, 24), wood, 0, 0.9, 0);
  } else if (type === 'r') {
    add(lathe(THREE, [...BASE, [0.26, 0.5], [0.24, 0.95], [0.4, 1.05], [0.42, 1.2], [0.36, 1.22], [0, 1.22]]), wood);
    ring(0.98, 0.3);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = add(new THREE.BoxGeometry(0.15, 0.16, 0.15), gold, Math.cos(a) * 0.36, 1.28, Math.sin(a) * 0.36);
      m.rotation.y = -a;
    }
  } else if (type === 'b') {
    add(lathe(THREE, [...BASE, [0.22, 0.52], [0.17, 1.0], [0.3, 1.06], [0.3, 1.12], [0.16, 1.18], [0, 1.18]]), wood);
    const head = add(new THREE.SphereGeometry(0.25, 32, 24), wood, 0, 1.42, 0);
    head.scale.y = 1.4;
    ring(1.1, 0.27);
    add(new THREE.SphereGeometry(0.075, 20, 16), gold, 0, 1.9, 0);
  } else if (type === 'q') {
    add(lathe(THREE, [...BASE, [0.24, 0.6], [0.18, 1.3], [0.34, 1.42], [0.44, 1.6], [0.34, 1.7], [0, 1.7]]), wood);
    ring(1.36, 0.27);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      add(new THREE.SphereGeometry(0.06, 14, 12), gold, Math.cos(a) * 0.36, 1.74, Math.sin(a) * 0.36);
    }
    add(new THREE.SphereGeometry(0.11, 20, 16), gold, 0, 1.78, 0);
  } else if (type === 'k') {
    add(lathe(THREE, [...BASE, [0.26, 0.6], [0.19, 1.45], [0.36, 1.58], [0.42, 1.82], [0.3, 1.94], [0, 1.94]]), wood);
    ring(1.5, 0.28);
    ring(1.9, 0.32, 0.04);
    add(new THREE.BoxGeometry(0.1, 0.38, 0.1), gold, 0, 2.18, 0);
    add(new THREE.BoxGeometry(0.28, 0.1, 0.1), gold, 0, 2.2, 0);
  } else if (type === 'n') {
    add(lathe(THREE, [...BASE, [0.34, 0.34], [0.3, 0.38], [0, 0.38]]), wood);
    const head = add(knightGeometry(THREE), wood, 0, 0.36, 0);
    head.scale.setScalar(1.05);
    // золотая грива по загривку (координаты формы пересчитаны в систему фигуры)
    const P = (x, y) => new THREE.Vector3(1.05 * (x + 0.07), 0.36 + 1.05 * y, 0);
    const curve = new THREE.CatmullRomCurve3([P(0.0, 1.5), P(0.24, 1.38), P(0.46, 1.0), P(0.55, 0.64), P(0.46, 0.3)]);
    add(new THREE.TubeGeometry(curve, 28, 0.05, 8), gold, 0, 0, 0);
  }
  return g;
}
