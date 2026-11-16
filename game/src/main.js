// DUSTLINE boot: fixed-step loop, round state machine, combat resolution, shot mode.
// ?shot=start|play|end&seed=N renders a deterministic frame twice, freezes, sets __shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { WEAPONS, createWeapon } from './weapons.js';
import { createBots } from './bots.js';
import { createSpike, PLANT_TIME, DEFUSE_TIME } from './spike.js';
import { createEconomy } from './economy.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const BUY_TIME = 12;
const ROUND_TIME = 100;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const spike = createSpike(scene, [{ id: 'A', ...world.sites.A }, { id: 'B', ...world.sites.B }]);
const weapon = createWeapon(camera);
const audio = createAudio();
const effects = createEffects(scene);
const hud = createHud();
const economy = createEconomy(WEAPONS);
const bots = createBots(scene, world);
const player = createPlayer(world.colliders);

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const playerHit = new THREE.Mesh(
  new THREE.BoxGeometry(0.7, 1.72, 0.7),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
);
playerHit.userData.player = true;
scene.add(playerHit);
const shootables = world.shootables.concat(bots.hitMeshes, [playerHit]);
const dirV = new THREE.Vector3();
const tmpV = new THREE.Vector3();

const body = player.state;
let phase = 'buy'; // buy | live | post | matchEnd
let round = 1;
let buyT = BUY_TIME;
let roundT = ROUND_TIME;
let postT = 0;
let postWinner = null;
let postReason = '';
let scoreE = 0;
let scoreS = 0;
let hp = 100;
let playerAlive = true;
let carrier = 'player'; // 'player' | bot | null
let buyOpen = false;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let stepDist = 0;
let lastPos = new THREE.Vector3().copy(body.position);
let beepT = 0;
let plantSite = null;

function los(from, to) {
  dirV.copy(to).sub(from);
  const d = dirV.length();
  if (d < 0.01) return true;
  dirV.normalize();
  raycaster.set(from, dirV);
  raycaster.far = d - 0.1;
  return raycaster.intersectObjects(world.shootables, false).length === 0;
}

function botCtx() {
  return { time: elapsed, playerPos: body.position, playerAlive, spike: { state: spike.state, site: spike.site, pos: spike.pos }, los };
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  playerHit.position.set(body.position.x, body.position.y + 0.86, body.position.z);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function muzzleWorld() {
  return camera.localToWorld(new THREE.Vector3(0.24, -0.18, -0.9));
}

function fireRay(origin, direction, maxDist, shooter) {
  raycaster.set(origin, direction);
  raycaster.far = maxDist;
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const end = hit ? hit.point : tmpV.copy(origin).addScaledVector(direction, maxDist).clone();
  return { hit, end };
}

function damagePlayer(amount, attackerName) {
  if (!playerAlive) return;
  const hpDmg = economy.applyDamage(amount);
  hp -= hpDmg;
  effects.vignette(0.55);
  hud.setHealth(hp, economy.armor);
  if (hp <= 0) {
    hp = 0;
    playerAlive = false;
    hud.setHealth(0, economy.armor);
    hud.banner('KAMU GUGUR', attackerName ? `oleh ${attackerName}` : '');
    if (carrier === 'player') {
      carrier = null;
      spike.dropAt(body.position.x, body.position.z);
    }
    weapon.setScoped(false);
    hud.scope(false);
  }
}

function killBot(bot, dmg, head, byPlayer) {
  const died = bots.damage(bot, dmg);
  if (byPlayer) {
    hud.hitMarker(died, shot ? 4000 : 90);
    audio.hit(head);
    if (died) {
      economy.add(200);
      hud.setMoney(economy.money);
      hud.killfeed(`Kamu ▸ ${bot.name}${head ? ' (headshot)' : ''}`, head);
      if (carrier === bot) { carrier = null; bot.hasSpike = false; spike.dropAt(bot.ctrl.state.position.x, bot.ctrl.state.position.z); }
    }
  }
  return died;
}

function shootPlayer(spread) {
  if (!weapon.takeRound()) { weapon.reload(); return false; }
  const w = weapon.current();
  camera.getWorldDirection(dirV);
  const origin = muzzleWorld();
  let anyHit = false;
  for (let p = 0; p < w.pellets; p += 1) {
    const d = dirV.clone();
    d.x += (random() * 2 - 1) * spread;
    d.y += (random() * 2 - 1) * spread;
    d.z += (random() * 2 - 1) * spread;
    d.normalize();
    const { hit, end } = fireRay(camera.position, d, 90, 'player');
    effects.tracer(origin, end, PALETTE.accent);
    if (hit) {
      anyHit = true;
      const o = hit.object;
      if (o.userData.bot && o.userData.bot.team === 'slate') {
        const head = o.userData.part === 'head';
        killBot(o.userData.bot, w.dmg * (head ? w.headMul : 1), head, true);
      } else if (o.userData.bot) {
        effects.spark(hit.point);
      } else if (!o.userData.player) {
        effects.spark(hit.point);
      }
    }
  }
  weapon.pullTrigger();
  audio.shot(w.id);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return anyHit;
}

function shootBot(bot) {
  const w = WEAPONS[bot.weaponId];
  const origin = bots.eyeOf(bot);
  origin.y -= 0.15;
  const target = bot.aimPoint;
  const dist = origin.distanceTo(target);
  const spread = 0.012 + dist * 0.0009;
  const d = tmpV.copy(target).sub(origin).normalize().clone();
  d.x += (random() * 2 - 1) * spread;
  d.y += (random() * 2 - 1) * spread;
  d.z += (random() * 2 - 1) * spread;
  d.normalize();
  const { hit, end } = fireRay(origin, d, 60, bot);
  effects.tracer(origin, end, bot.team === 'ember' ? PALETTE.accent : PALETTE.slate);
  audio.shot(bot.weaponId);
  if (!hit) return;
  const o = hit.object;
  if (o.userData.player && bot.team === 'slate') {
    const fall = Math.max(0.5, 1 - dist / 70);
    damagePlayer(w.dmg * fall, bot.name);
  } else if (o.userData.bot && o.userData.bot.team !== bot.team) {
    const head = o.userData.part === 'head';
    const died = killBot(o.userData.bot, w.dmg * (head ? w.headMul : 1), head, false);
    if (died) hud.killfeed(`${bot.name} ▸ ${o.userData.bot.name}${head ? ' (headshot)' : ''}`, head);
    if (carrier === o.userData.bot && died) { carrier = null; o.userData.bot.hasSpike = false; spike.dropAt(o.userData.bot.ctrl.state.position.x, o.userData.bot.ctrl.state.position.z); }
  } else if (!o.userData.bot) {
    effects.spark(hit.point);
  }
}

function siteNear(x, z) {
  for (const id of ['A', 'B']) {
    const s = world.sites[id];
    if (Math.hypot(x - s.x, z - s.z) < s.r) return id;
  }
  return null;
}

function startRound(n) {
  round = n;
  phase = 'buy';
  buyT = BUY_TIME;
  roundT = ROUND_TIME;
  hp = 100;
  playerAlive = true;
  buyOpen = false;
  plantSite = null;
  spike.reset();
  carrier = 'player';
  weapon.switchTo('sidearm');
  weapon.refill();
  economy.resetRound();
  body.position.set(world.spawns.ember[0][0], 0, world.spawns.ember[0][1]);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  bots.spawnRound();
  bots.list.forEach((b, i) => {
    if (b.team === 'ember') {
      const sp = world.spawns.ember[i + 1];
      b.ctrl.state.position.set(sp[0], 0, sp[1]);
      b.group.position.copy(b.ctrl.state.position);
    }
  });
  hud.setHealth(hp, economy.armor);
  hud.setMoney(economy.money);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setScore(scoreE, scoreS);
  hud.setRound(round);
  hud.setSpikeStatus('SPIKE — kamu bawa · tahan E di site untuk plant');
  hud.progress('plant', 0);
  hud.showBuy(false);
  hud.banner(`RONDE ${round}`, 'Fase beli 12 detik — tekan B untuk buy menu', 2500);
}

function endRound(winner, reason) {
  if (phase !== 'live') return;
  phase = 'post';
  postT = 3.5;
  postWinner = winner;
  postReason = reason;
  if (winner === 'ember') { scoreE += 1; economy.add(500); }
  else { scoreS += 1; economy.add(300); }
  hud.setMoney(economy.money);
  hud.setScore(scoreE, scoreS);
  hud.banner(winner === 'ember' ? 'EMBER MENANG' : 'SLATE MENANG', reason, 3000);
  if (winner === 'ember') audio.win(); else audio.lose();
  weapon.setScoped(false);
  hud.scope(false);
}

function resetMatch() {
  scoreE = 0;
  scoreS = 0;
  economy.money = 800;
  economy.armor = 0;
  economy.owned.clear();
  economy.owned.add('sidearm');
  startRound(1);
  hud.hideOverlay();
}

const input = createInput(renderer.domElement, onLockChange, {
  onBuy() {
    if (phase !== 'buy' || shot) return;
    buyOpen = !buyOpen;
    hud.showBuy(buyOpen, economy.money, [...economy.owned, ...(economy.armor > 0 ? ['armor'] : [])], Object.values(WEAPONS));
    if (buyOpen) { hud.hideOverlay(); if (document.pointerLockElement) document.exitPointerLock(); }
    else input.requestLock();
  },
  onInteractDown() {},
  onInteractUp() {},
  onMute() { audio.toggleMute(); },
  onScopeDown() { if (weapon.current().id === 'sniper') { weapon.setScoped(true); hud.scope(true); } },
  onScopeUp() { weapon.setScoped(false); hud.scope(false); },
});

hud.onPlay(() => {
  if (shot) return;
  audio.resume();
  if (phase === 'matchEnd') { resetMatch(); return; }
  if (!playerAlive) return;
  input.requestLock();
});
hud.onBuySelect((id) => {
  if (economy.buy(id)) {
    if (id !== 'armor') weapon.switchTo(id);
    hud.setMoney(economy.money);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    hud.showBuy(true, economy.money, [...economy.owned, ...(economy.armor > 0 ? ['armor'] : [])], Object.values(WEAPONS));
    hud.setHealth(hp, economy.armor);
    audio.reloadSnd();
  }
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.resume();
    hud.hideOverlay();
    if (buyOpen) { buyOpen = false; hud.showBuy(false); }
  } else if (!buyOpen && phase !== 'matchEnd') {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function step(dt) {
  elapsed += dt;
  const keys = input.state.keys;
  if (phase === 'buy') {
    buyT -= dt;
    hud.setTimer(buyT);
    if (buyT <= 0) { phase = 'live'; hud.banner('RONDE MULAI', 'Plant spike di A atau B', 2000); }
  } else if (phase === 'live') {
    roundT -= dt;
    hud.setTimer(spike.state === 'planted' ? spike.detonateT : roundT);
    if (roundT <= 0 && spike.state !== 'planted') { endRound('slate', 'Waktu habis — spike tidak ditanam'); }
  } else if (phase === 'post') {
    postT -= dt;
    if (postT <= 0) {
      if (scoreE >= WIN_ROUNDS || scoreS >= WIN_ROUNDS || round >= MAX_ROUNDS) {
        phase = 'matchEnd';
        hud.showOverlay('end', { ember: scoreE, slate: scoreS, title: scoreE > scoreS ? 'EMBER MENANG!' : 'SLATE MENANG', copy: `Skor akhir: EMBER ${scoreE} — ${scoreS} SLATE.` });
        if (document.pointerLockElement) document.exitPointerLock();
      } else startRound(round + 1);
    }
  }

  if (playerAlive && !frozen) {
    player.step(dt, keys);
    const moved = Math.hypot(body.position.x - lastPos.x, body.position.z - lastPos.z);
    stepDist += moved;
    if (stepDist > 2.4 && player.onGround) { stepDist = 0; audio.footstep(); }
    lastPos.copy(body.position);
  }
  weapon.step(dt);
  spike.update(dt);
  bots.step(dt, botCtx());

  // Bot fire resolution.
  for (const bot of bots.list) {
    if (bot.wantsFire && bot.alive) { bot.wantsFire = false; shootBot(bot); }
  }

  // Spike pickup by friendly bots.
  if (spike.state === 'dropped') {
    for (const bot of bots.list) {
      if (bot.team !== 'ember' || !bot.alive) continue;
      const p = bot.ctrl.state.position;
      if (Math.hypot(p.x - spike.pos.x, p.z - spike.pos.z) < 1.4) {
        bot.hasSpike = true;
        carrier = bot;
        spike.pickUp();
        hud.setSpikeStatus(`SPIKE — dibawa ${bot.name}`);
        break;
      }
    }
    // Player walks over dropped spike.
    if (spike.state === 'dropped' && playerAlive && Math.hypot(body.position.x - spike.pos.x, body.position.z - spike.pos.z) < 1.4) {
      carrier = 'player';
      spike.pickUp();
      hud.setSpikeStatus('SPIKE — kamu bawa · tahan E di site untuk plant');
    }
  }

  // Plant / defuse channels.
  if (phase === 'live') {
    let planting = false;
    let defusing = false;
    if (spike.state === 'carried' && carrier === 'player' && playerAlive && input.state.interact) {
      const site = siteNear(body.position.x, body.position.z);
      if (site) {
        planting = true;
        plantSite = site;
        spike.plantT += dt;
        beepT -= dt;
        if (beepT <= 0) { audio.plantBeep(); beepT = 0.5; }
        hud.progress('plant', spike.plantT / PLANT_TIME, `Menanam spike di ${site}…`);
        if (spike.plantT >= PLANT_TIME) {
          spike.setPlanted(site);
          spike.plantT = 0;
          economy.add(300);
          hud.setMoney(economy.money);
          hud.progress('plant', 0);
          hud.banner('SPIKE PLANTED', `Meledak dalam 35 detik — jaga site ${site}!`, 3000);
          audio.plantBeep();
        }
      }
    }
    if (spike.state === 'carried' && carrier && carrier !== 'player' && carrier.mode === 'plant') {
      planting = true;
      spike.plantT += dt;
      hud.progress('plant', spike.plantT / PLANT_TIME, `${carrier.name} menanam spike…`);
      if (spike.plantT >= PLANT_TIME) {
        spike.setPlanted(carrier.site);
        spike.plantT = 0;
        hud.progress('plant', 0);
        hud.banner('SPIKE PLANTED', `Meledak dalam 35 detik — jaga site ${carrier.site}!`, 3000);
        audio.plantBeep();
      }
    }
    if (!planting && spike.state === 'carried') {
      spike.plantT = Math.max(0, spike.plantT - dt * 2);
      hud.progress('plant', 0);
    }
    if (spike.state === 'planted') {
      if (playerAlive && input.state.interact && Math.hypot(body.position.x - spike.pos.x, body.position.z - spike.pos.z) < 1.8) {
        defusing = true;
        spike.defuseT += dt;
        beepT -= dt;
        if (beepT <= 0) { audio.defuseBeep(); beepT = 0.5; }
        hud.progress('defuse', spike.defuseT / DEFUSE_TIME, 'Menjinakkan spike…');
        if (spike.defuseT >= DEFUSE_TIME) {
          spike.setDefused();
          economy.add(300);
          hud.setMoney(economy.money);
          hud.progress('defuse', 0);
          endRound('slate', 'Spike dijinakkan');
        }
      }
      if (spike.state === 'planted') {
        for (const bot of bots.list) {
          if (bot.team === 'slate' && bot.alive && bot.mode === 'defuse') {
            defusing = true;
            spike.defuseT += dt;
            hud.progress('defuse', spike.defuseT / DEFUSE_TIME, `${bot.name} menjinakkan spike…`);
            if (spike.defuseT >= DEFUSE_TIME) {
              spike.setDefused();
              hud.progress('defuse', 0);
              endRound('slate', 'Spike dijinakkan');
            }
            break;
          }
        }
      }
      if (!defusing && spike.state === 'planted') {
        spike.defuseT = Math.max(0, spike.defuseT - dt * 2);
        hud.progress('defuse', 0);
      }
      if (spike.state === 'detonated') endRound('ember', 'Spike meledak');
    }
  }

  // Round end by elimination.
  if (phase === 'live') {
    const eAlive = bots.aliveCount('ember') + (playerAlive ? 1 : 0);
    const sAlive = bots.aliveCount('slate');
    if (eAlive === 0) endRound('slate', 'Tim EMBER gugur semua');
    else if (sAlive === 0) endRound('ember', 'Tim SLATE gugur semua');
  }

  // HUD spike status.
  if (spike.state === 'planted') hud.setSpikeStatus(`SPIKE planted di ${spike.site} — ${Math.ceil(spike.detonateT)} dtk`);
  else if (spike.state === 'dropped') hud.setSpikeStatus('SPIKE jatuh — ambil kembali!');
  else if (spike.state === 'carried' && carrier && carrier !== 'player') hud.setSpikeStatus(`SPIKE — dibawa ${carrier.name}`);
  else if (spike.state === 'carried' && carrier === 'player') hud.setSpikeStatus('SPIKE — kamu bawa · tahan E di site untuk plant');

  hud.setHealth(hp, economy.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setCrosshairSpread(3 + weapon.spread(player.groundSpeed()) * 320);
  effects.step(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerAlive) player.look(look.x, look.y);
    if (input.state.firing && playerAlive && phase === 'live' && weapon.ready()) shootPlayer(shot ? 0 : weapon.spread(player.groundSpeed()));
    if (input.state.keys.has('KeyR')) weapon.reload();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  startRound(1);
  phase = 'live';
  roundT = ROUND_TIME;
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(0, 0, 13.5);
    settle(30);
    aimAt(new THREE.Vector3(0, 1.5, -8));
    hud.showOverlay('start');
  } else if (name === 'play') {
    // Mid-round action: bots in the open mid lane, clear sight line past the ramp.
    const e0 = bots.list.find((b) => b.id === 'slate-0');
    const e1 = bots.list.find((b) => b.id === 'slate-1');
    e0.ctrl.state.position.set(-1, 0, -1);
    e1.ctrl.state.position.set(5, 0, -4);
    e0.group.position.copy(e0.ctrl.state.position);
    e1.group.position.copy(e1.ctrl.state.position);
    weapon.switchTo('rifle');
    body.position.set(-8, 0, 10);
    settle(20);
    for (let i = 0; i < 3; i += 1) {
      const t0 = new THREE.Vector3(e0.ctrl.state.position.x, 1.1, e0.ctrl.state.position.z);
      aimAt(t0);
      shootPlayer(0);
      settle(7);
    }
    const t1 = new THREE.Vector3(e1.ctrl.state.position.x, 1.2, e1.ctrl.state.position.z);
    aimAt(t1);
    shootPlayer(0);
    settle(2);
  } else {
    // Round end: EMBER leads 4-2 after 6 rounds, round-end overlay.
    scoreE = 4;
    scoreS = 2;
    hud.setScore(scoreE, scoreS);
    hud.setRound(7);
    body.position.set(0, 0, 10);
    settle(20);
    aimAt(new THREE.Vector3(-16, 1.5, -8));
    hud.showOverlay('round', { title: 'Ronde selesai', copy: 'EMBER menang — spike meledak di Site A.' });
  }
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setHealth(hp, economy.armor);
  hud.setMoney(economy.money);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startRound(1);
syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
