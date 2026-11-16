// Ember District: 44 x 32 m industrial yard (x -22..22, z -16..16). EMBER attacks
// from the south, SLATE defends the north; sites A (west) and B (east). Every box
// is a collider (THREE.Box3) and a bullet surface. All textures are canvas-made.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function cvTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}
function speckle(ctx, s, base, n) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.10)';
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  // Dusk sky gradient + fog over a dark canvas.
  scene.background = cvTex(256, (x, s) => {
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#0d1526'); g.addColorStop(0.55, '#27344d');
    g.addColorStop(0.72, '#b3541e'); g.addColorStop(0.8, '#3a2a20'); g.addColorStop(1, '#14161a');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  });
  scene.fog = new THREE.Fog(0x1a1d24, 45, 95);

  const conc = cvTex(256, (x, s) => speckle(x, s, '#7e838a', 2600), 10, 7);
  const concWall = cvTex(256, (x, s) => speckle(x, s, '#6d7278', 2200), 8, 2);
  const hazard = cvTex(128, (x, s) => {
    x.fillStyle = '#e8b820';
    x.fillRect(0, 0, s, s);
    x.fillStyle = '#141414';
    for (let i = -s; i < s * 2; i += 32) {
      x.beginPath(); x.moveTo(i, s); x.lineTo(i + 16, 0);
      x.lineTo(i + 32, 0); x.lineTo(i + 16, s); x.fill();
    }
  }, 4, 1);
  const letterTex = (ch, bg) => cvTex(128, (x, s) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, s, s);
    x.fillStyle = PALETTE.ink;
    x.font = `bold ${s * 0.7}px sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(ch, s / 2, s / 2 + 4);
  });

  const M = {
    floor: new THREE.MeshStandardMaterial({ map: conc, roughness: 0.95 }),
    wall: new THREE.MeshStandardMaterial({ map: concWall, roughness: 0.95 }),
    amber: new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.6, metalness: 0.3 }),
    slate: new THREE.MeshStandardMaterial({ color: PALETTE.slate, roughness: 0.6, metalness: 0.3 }),
    grey: new THREE.MeshStandardMaterial({ color: PALETTE.hairline, roughness: 0.85, metalness: 0.15 }),
  };

  function box(w, h, d, x, y, z, m) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function barrel(x, z, m) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), m);
    mesh.position.set(x, 0.55, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }
  function flat(w, d, x, z, mat, y = 0.02) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Floor + 4.6 m perimeter walls.
  box(44.4, 0.4, 32.4, 0, -0.2, 0, M.floor);
  box(0.4, 4.6, 32.4, -22.2, 2.3, 0, M.wall);
  box(0.4, 4.6, 32.4, 22.2, 2.3, 0, M.wall);
  box(44.4, 4.6, 0.4, 0, 2.3, -16.2, M.wall);
  box(44.4, 4.6, 0.4, 0, 2.3, 16.2, M.wall);
  // Broken mid wall (z=0): gaps at x -19..-16 (left flank), -2..2 (mid door), 16..19 (right).
  box(3, 3, 0.6, -20.5, 1.5, 0, M.wall);
  box(14, 3, 0.6, -9, 1.5, 0, M.wall);
  box(14, 3, 0.6, 9, 1.5, 0, M.wall);
  box(3, 3, 0.6, 20.5, 1.5, 0, M.wall);
  // Containers: amber stack at A, slate stack at B, neutral grey mid.
  box(6, 2.4, 2.4, -18.8, 1.2, -11, M.amber);
  box(6, 2.4, 2.4, -18.8, 3.6, -11, M.amber);
  box(6, 2.4, 2.4, 18.8, 1.2, -11, M.slate);
  box(6, 2.4, 2.4, 18.8, 3.6, -11, M.slate);
  box(6, 2.4, 2.4, 5, 1.2, 6, M.grey);
  box(6, 2.4, 2.4, -9, 1.2, -9, M.grey);
  // Crates: crouch cover [x, z, size].
  [[-10, 6, 1.1], [10, 6, 1.1], [-4, -5, 0.8], [4, -5, 0.8], [-13, 2, 0.7],
   [13, 2, 0.7], [-20.5, 5, 1], [20.5, -3, 1], [-1, 11.5, 1.1], [1, -12.5, 1.1]]
    .forEach(([x, z, s]) => box(s, 0.9, s, x, 0.45, z, M.grey));
  barrel(-8, 11, M.amber); barrel(11, 8, M.slate);
  barrel(-15, -13, M.amber); barrel(15, -13.5, M.slate);
  // Elevated mid walkway (top y 2.6) with 4 step boxes as its ramp.
  box(8, 0.4, 4, 0, 2.4, 2.5, M.grey);
  [[7.0, 0.6], [6.1, 1.2], [5.2, 1.8], [4.3, 2.4]]
    .forEach(([z, h]) => box(3, h, 0.9, 0, h / 2, z, M.grey));

  // Site markers: ground ring + post with letter panel, hazard strips on approach.
  const sites = { A: { x: -16, z: -8, r: 3.2 }, B: { x: 16, z: -8, r: 3.2 } };
  const hzMat = new THREE.MeshBasicMaterial({ map: hazard });
  for (const [key, s] of Object.entries(sites)) {
    const col = key === 'A' ? PALETTE.accent : PALETTE.slate;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.2, 40),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    group.add(ring);
    const px = s.x + (s.x < 0 ? -3.4 : 3.4);
    box(0.25, 2.2, 0.25, px, 1.1, s.z, M.grey);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8),
      new THREE.MeshBasicMaterial({ map: letterTex(key, col) }));
    panel.position.set(px, 2.6, s.z + 0.14);
    group.add(panel);
    flat(4.4, 0.8, s.x, s.z + 3.6, hzMat);
  }
  flat(4, 0.8, 0, 1.6, hzMat);

  // Low warm sun, cool sky/ground bounce, cold slate fill.
  scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x14161a, 0.9));
  const sun = new THREE.DirectionalLight(0xffb36b, 2.2);
  sun.position.set(20, 9, 12);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x5b7fa6, 0.5);
  fill.position.set(-14, 10, -10);
  scene.add(fill);

  const waypoints = [
    { x: -4, z: 13 }, { x: 0, z: 13.5 }, { x: 4, z: 13 },
    { x: -6, z: 8 }, { x: 0, z: 8.5 }, { x: 6, z: 8 },
    { x: -4, z: 4 }, { x: 0, z: 0 }, { x: 0, z: -3.5 },
    { x: -17.5, z: 10 }, { x: -17.5, z: 4 }, { x: -17.5, z: -4 },
    { x: 17.5, z: 10 }, { x: 17.5, z: 4 }, { x: 17.5, z: -4 },
    { x: -12, z: -4 }, { x: -14, z: -7 }, { x: -16, z: -5 },
    { x: 12, z: -4 }, { x: 14, z: -7 }, { x: 16, z: -5 },
    { x: -6, z: -6 }, { x: 0, z: -7 }, { x: 6, z: -6 },
    { x: -4, z: -13 }, { x: 0, z: -13.5 }, { x: 4, z: -13 },
  ];
  const spawns = {
    ember: [[-4, 13], [0, 13.5], [4, 13]],
    slate: [[-4, -13], [0, -13.5], [4, -13]],
  };
  return { colliders, shootables, group, sites, waypoints, spawns };
}
