// Spike: plant/defuse state + visuals. plantT/defuseT are written from outside
// (main/bots run the hold channels); this module stores them and drives the mesh,
// the site rings and the detonation timer.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const DETONATE_TIME = 35;

function sitePos(sites, siteId) {
  const s = sites.find((s) => s.id === siteId) || sites[0];
  if (!s) return { x: 0, z: 0 };
  return { x: s.x ?? s.pos?.x ?? 0, z: s.z ?? s.pos?.z ?? 0 };
}

function makeRing(x, z) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.5, 40),
    new THREE.MeshBasicMaterial({
      color: PALETTE.accent, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.03, z);
  return ring;
}

export function createSpike(scene, sites) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.16, 0.28),
    new THREE.MeshStandardMaterial({ color: PALETTE.accent, emissive: PALETTE.accent, emissiveIntensity: 1.2 }),
  );
  mesh.add(new THREE.PointLight(PALETTE.accent, 6, 7, 1.5));
  mesh.visible = false;
  scene.add(mesh);

  const ringA = makeRing(...Object.values(sitePos(sites, 'A')));
  const ringB = makeRing(...Object.values(sitePos(sites, 'B')));
  scene.add(ringA, ringB);

  const state = {
    state: 'carried',
    site: null,
    pos: null,
    plantT: 0,
    defuseT: 0,
    detonateT: DETONATE_TIME,
    mesh,
    ringA,
    ringB,
  };
  let t = 0;

  function place(x, z, y = 0.25) {
    mesh.position.set(x, y, z);
    mesh.visible = true;
  }

  return {
    ...state,
    get state() { return state.state; },
    get site() { return state.site; },
    get pos() { return state.pos; },
    get plantT() { return state.plantT; },
    set plantT(v) { state.plantT = v; },
    get defuseT() { return state.defuseT; },
    set defuseT(v) { state.defuseT = v; },
    get detonateT() { return state.detonateT; },
    mesh,
    ringA,
    ringB,

    reset() {
      state.state = 'carried';
      state.site = null;
      state.pos = null;
      state.plantT = 0;
      state.defuseT = 0;
      state.detonateT = DETONATE_TIME;
      mesh.visible = false;
    },
    dropAt(x, z) {
      state.state = 'dropped';
      state.pos = { x, z };
      place(x, z);
    },
    pickUp() {
      state.state = 'carried';
      state.pos = null;
      mesh.visible = false;
    },
    setPlanted(siteId) {
      const p = sitePos(sites, siteId);
      state.state = 'planted';
      state.site = siteId;
      state.pos = p;
      state.detonateT = DETONATE_TIME;
      place(p.x, p.z);
    },
    setDefused() {
      state.state = 'defused';
      mesh.visible = false;
    },
    setDetonated() {
      state.state = 'detonated';
      mesh.visible = false;
    },
    update(dt) {
      t += dt;
      if (state.state === 'planted') {
        state.detonateT -= dt;
        const pulse = 1 + 0.12 * Math.sin(t * 5);
        const ring = state.site === 'B' ? ringB : ringA;
        ring.scale.setScalar(pulse);
        ring.material.opacity = 0.55 + 0.3 * Math.sin(t * 5);
        if (state.detonateT <= 0) {
          state.detonateT = 0;
          state.state = 'detonated';
          mesh.visible = false;
        }
      } else {
        ringA.scale.setScalar(1);
        ringB.scale.setScalar(1);
      }
    },
    progress() {
      const clamp = (v) => Math.min(1, Math.max(0, v));
      return {
        plant: clamp(state.plantT / PLANT_TIME),
        defuse: clamp(state.defuseT / DEFUSE_TIME),
        detonate: clamp(state.detonateT / DETONATE_TIME),
      };
    },
  };
}
