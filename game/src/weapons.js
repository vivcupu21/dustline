// Weapon defs + view models + firing/reload/spread. main.js owns the ray and damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sidearm: { id: 'sidearm', name: 'P9 Sidearm', price: 0, dmg: 25, headMul: 2, mag: 12, reserve: 48, rate: 0.22, reload: 1.2, spread: 0.006, auto: false, pellets: 1, zoom: 1 },
  smg: { id: 'smg', name: 'VK-9 Rasp', price: 900, dmg: 22, headMul: 2, mag: 30, reserve: 120, rate: 0.075, reload: 1.7, spread: 0.016, auto: true, pellets: 1, zoom: 1 },
  rifle: { id: 'rifle', name: 'AR-77 Duster', price: 1800, dmg: 34, headMul: 3, mag: 30, reserve: 90, rate: 0.096, reload: 1.9, spread: 0.004, auto: true, pellets: 1, zoom: 1 },
  shotgun: { id: 'shotgun', name: 'SG-12 Breacher', price: 1200, dmg: 12, headMul: 1.5, mag: 6, reserve: 24, rate: 0.85, reload: 2.4, spread: 0.05, auto: false, pellets: 8, zoom: 1 },
  sniper: { id: 'sniper', name: 'LW-50 Longshot', price: 2500, dmg: 90, headMul: 2, mag: 5, reserve: 15, rate: 1.1, reload: 2.8, spread: 0.0008, auto: false, pellets: 1, zoom: 3.2 },
};

const FOV_HIP = 74;
const FOV_SCOPE = 24;
const MOVE_REF = 5.2;
const MUZZLE_TIME = 0.06;

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Distinct silhouette per weapon, all built from boxes around the same anchor.
function buildModel(id, body, grip, dark) {
  const g = new THREE.Group();
  if (id === 'sidearm') {
    g.add(box(0.07, 0.09, 0.26, body, 0, 0.01, -0.05));
    g.add(box(0.05, 0.05, 0.12, grip, 0, 0.02, -0.24));
    g.add(box(0.06, 0.14, 0.08, grip, 0, -0.09, 0.06));
  } else if (id === 'smg') {
    g.add(box(0.08, 0.09, 0.34, body, 0, 0.01, -0.02));
    g.add(box(0.05, 0.05, 0.22, dark, 0, 0.02, -0.3));
    g.add(box(0.06, 0.13, 0.07, grip, 0, -0.09, 0.05));
    g.add(box(0.05, 0.11, 0.06, grip, 0, -0.08, -0.12));
  } else if (id === 'shotgun') {
    g.add(box(0.09, 0.1, 0.4, body, 0, 0.01, 0.02));
    g.add(box(0.06, 0.06, 0.42, dark, 0, 0.045, -0.28));
    g.add(box(0.055, 0.05, 0.2, grip, 0, -0.02, -0.3));
    g.add(box(0.07, 0.09, 0.2, grip, 0, -0.02, 0.3));
  } else if (id === 'sniper') {
    g.add(box(0.08, 0.09, 0.44, body, 0, 0.01, 0.02));
    g.add(box(0.04, 0.04, 0.55, dark, 0, 0.03, -0.42));
    g.add(box(0.05, 0.06, 0.16, dark, 0, 0.09, -0.08));
    g.add(box(0.07, 0.08, 0.26, grip, 0, -0.02, 0.32));
    g.add(box(0.05, 0.05, 0.1, grip, 0, 0.06, -0.2));
  } else { // rifle
    g.add(box(0.09, 0.1, 0.42, body));
    g.add(box(0.045, 0.045, 0.4, grip, 0, 0.025, -0.38));
    g.add(box(0.075, 0.08, 0.22, grip, 0, -0.02, 0.3));
    g.add(box(0.05, 0.12, 0.06, grip, 0, -0.09, -0.05));
  }
  return g;
}

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.45, metalness: 0.5 });

  const model = new THREE.Group();
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = { id: 'rifle', mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };
  let scoped = false;
  let inner = null;

  function mount(id) {
    if (inner) { model.remove(inner); inner = null; }
    inner = buildModel(id, body, grip, dark);
    model.add(inner);
    model.rotation.set(0, 0, 0);
  }
  mount(state.id);

  function cur() { return WEAPONS[state.id]; }

  function step(dt) {
    const w = cur();
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (w.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const take = Math.min(w.mag - state.mag, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    WEAPONS,
    step,
    current: cur,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const w = cur();
      state.cooldown = w.rate;
      state.flash = MUZZLE_TIME;
      state.kick = 0.03 + w.dmg * 0.0006;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const w = cur();
      if (state.reloadLeft > 0 || state.mag === w.mag || state.reserve === 0) return;
      state.reloadLeft = w.reload;
    },
    spread(speed) {
      return cur().spread + Math.min(1, speed / MOVE_REF) * 0.028;
    },
    refill() {
      const w = cur();
      state.mag = w.mag;
      state.reserve = w.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    switchTo(id) {
      if (!WEAPONS[id] || id === state.id) return;
      state.id = id;
      const w = cur();
      state.mag = w.mag;
      state.reserve = w.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      mount(id);
      if (scoped) { scoped = false; camera.fov = FOV_HIP; camera.updateProjectionMatrix(); }
    },
    setScoped(on) {
      if (state.id !== 'sniper') on = false;
      if (on === scoped) return;
      scoped = on;
      camera.fov = scoped ? FOV_SCOPE : FOV_HIP;
      camera.updateProjectionMatrix();
    },
  };
}
