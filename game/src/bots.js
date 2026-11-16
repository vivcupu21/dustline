// Bots: 3v3 (player + 2 EMBER vs 3 SLATE). Each bot drives the same player
// controller with synthetic keys, so it collides and jumps exactly like the player.
// AI: waypoint follow, LOS combat with reaction + bursts, site push / hold,
// spike carrier plant, converge + defuse when planted, retreat when low HP.
// main.js resolves all shooting; bots only expose intents (wantsFire, aimPoint).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { createPlayer } from './player.js';

const NAMES = { ember: ['Vex', 'Rook'], slate: ['Ash', 'Dusk', 'Flint'] };
const BOT_WEAPONS = { ember: ['rifle', 'smg'], slate: ['rifle', 'smg', 'shotgun'] };
const EYE = 1.45;
const TURN = 7;
const REACT_MIN = 0.35;
const REACT_MAX = 0.7;

function makeBody(team) {
  const g = new THREE.Group();
  const col = team === 'ember' ? PALETTE.accent : PALETTE.slate;
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.hairline, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), mat);
  torso.position.y = 1.0;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), mat);
  head.position.y = 1.53;
  head.userData.part = 'head';
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 0.26), dark);
  legs.position.y = 0.31;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.5), dark);
  gun.position.set(0.3, 1.15, -0.2);
  g.add(torso, head, legs, gun);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { group: g, torso, head };
}

export function createBots(scene, world) {
  const list = [];
  const hitMeshes = [];
  const wps = world.waypoints;
  let now = 0;

  for (const team of ['ember', 'slate']) {
    NAMES[team].forEach((name, i) => {
      const body = makeBody(team);
      scene.add(body.group);
      const bot = {
        id: `${team}-${i}`, team, name, group: body.group,
        torso: body.torso, head: body.head,
        ctrl: createPlayer(world.colliders),
        hp: 100, alive: true, fall: 0,
        weaponId: BOT_WEAPONS[team][i % BOT_WEAPONS[team].length],
        mode: 'move', goal: null, wp: null, wpBlocked: new Map(),
        reactT: 0, burstLeft: 0, pauseT: 0, fireT: 0,
        wantsFire: false, aimPoint: new THREE.Vector3(),
        target: null, // {pos:Vector3, kind:'player'|'bot', ref}
        hasSpike: false, stuckT: 0, lastPos: new THREE.Vector3(),
        lastCheck: 0, patrolA: null, patrolB: null, patrolFlip: 0,
        site: team === 'ember' ? (i === 0 ? 'A' : 'B') : (i === 0 ? 'A' : i === 1 ? 'B' : 'A'),
        holdT: 0,
      };
      body.torso.userData.bot = bot;
      body.head.userData.bot = bot;
      hitMeshes.push(body.torso, body.head);
      list.push(bot);
    });
  }

  function posOf(bot) { return bot.ctrl.state.position; }
  function eyeOf(bot) {
    const p = posOf(bot);
    return new THREE.Vector3(p.x, p.y + EYE, p.z);
  }
  function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

  function pickWp(bot, goal) {
    let best = null, bestScore = Infinity;
    const p = posOf(bot);
    for (const w of wps) {
      const blocked = bot.wpBlocked.get(w);
      if (blocked && blocked > now) continue;
      const s = dist2(w.x, w.z, goal.x, goal.z) + 0.6 * dist2(p.x, p.z, w.x, w.z);
      if (s < bestScore) { bestScore = s; best = w; }
    }
    return best;
  }

  function faceToward(bot, tx, tz, dt, snap) {
    const p = posOf(bot);
    const want = Math.atan2(-(tx - p.x), -(tz - p.z));
    let d = want - bot.ctrl.state.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    bot.ctrl.state.yaw += snap ? d : Math.max(-TURN * dt, Math.min(TURN * dt, d));
  }

  function moveKeys(bot, tx, tz) {
    const keys = new Set();
    const p = posOf(bot);
    const dx = tx - p.x, dz = tz - p.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.15) return keys;
    const yaw = bot.ctrl.state.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const f = (dx * fx + dz * fz) / len;
    const s = (dx * rx + dz * rz) / len;
    if (f > 0.25) keys.add('KeyW');
    else if (f < -0.25) keys.add('KeyS');
    if (s > 0.25) keys.add('KeyD');
    else if (s < -0.25) keys.add('KeyA');
    return keys;
  }

  function decideGoal(bot, ctx) {
    const spike = ctx.spike;
    const p = posOf(bot);
    if (bot.team === 'slate' && spike.state === 'planted') {
      const s = world.sites[spike.site];
      bot.goal = { x: s.x, z: s.z };
      bot.mode = dist2(p.x, p.z, s.x, s.z) < 2.6 ? 'defuse' : 'move';
      return;
    }
    if (bot.team === 'ember' && spike.state === 'dropped') {
      bot.goal = spike.pos;
      bot.mode = dist2(p.x, p.z, spike.pos.x, spike.pos.z) < 1.4 ? 'move' : 'move';
      return;
    }
    if (bot.hasSpike) {
      const s = world.sites[bot.site];
      bot.goal = { x: s.x, z: s.z };
      bot.mode = dist2(p.x, p.z, s.x, s.z) < s.r * 0.8 ? 'plant' : 'move';
      return;
    }
    if (bot.team === 'ember') {
      const s = world.sites[bot.site];
      bot.goal = { x: s.x, z: s.z };
      bot.mode = 'move';
      return;
    }
    // Slate hold: patrol two waypoints near their site.
    if (!bot.patrolA) {
      const near = wps.filter((w) => dist2(w.x, w.z, world.sites[bot.site].x, world.sites[bot.site].z) < 90);
      bot.patrolA = near[0] || wps[0];
      bot.patrolB = near[near.length - 1] || wps[1];
    }
    bot.patrolFlip += 1;
    if (bot.holdT <= 0) {
      bot.goal = bot.patrolFlip % 2 ? bot.patrolA : bot.patrolB;
      bot.holdT = 5 + Math.random() * 3;
    }
    bot.mode = 'move';
  }

  function acquire(bot, ctx) {
    // Nearest visible enemy: player (for slate) or enemy bots.
    let best = null, bestD = Infinity;
    const eye = eyeOf(bot);
    const cands = [];
    if (bot.team === 'slate' && ctx.playerAlive) cands.push({ kind: 'player', pos: ctx.playerPos, ref: null });
    for (const o of list) {
      if (o.team === bot.team || !o.alive) continue;
      cands.push({ kind: 'bot', pos: posOf(o), ref: o });
    }
    for (const c of cands) {
      const d = Math.hypot(c.pos.x - eye.x, c.pos.z - eye.z);
      if (d > 42) continue;
      if (bot.weaponId === 'shotgun' && d > 13) continue;
      if (d < bestD && ctx.los(eye, new THREE.Vector3(c.pos.x, c.pos.y + 1.2, c.pos.z))) {
        best = c; bestD = d;
      }
    }
    if (best) {
      if (bot.target !== best) { bot.target = best; bot.reactT = REACT_MIN + Math.random() * (REACT_MAX - REACT_MIN); bot.burstLeft = 0; }
    } else bot.target = null;
  }

  function combat(bot, dt, ctx) {
    bot.wantsFire = false;
    if (!bot.target) { bot.burstLeft = 0; bot.pauseT = 0; return; }
    const t = bot.target;
    const tp = t.kind === 'player' ? ctx.playerPos : posOf(t.ref);
    bot.aimPoint.set(tp.x, tp.y + 1.15, tp.z);
    faceToward(bot, tp.x, tp.z, dt, true);
    if (bot.reactT > 0) { bot.reactT -= dt; return; }
    const w = WEAPONS[bot.weaponId];
    bot.fireT -= dt;
    if (bot.burstLeft <= 0) {
      bot.pauseT -= dt;
      if (bot.pauseT > 0) return;
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
    }
    if (bot.fireT <= 0) {
      bot.fireT = w.rate;
      bot.burstLeft -= 1;
      bot.wantsFire = true;
      if (bot.burstLeft <= 0) bot.pauseT = 0.5 + Math.random() * 0.6;
    }
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.holdT -= dt;
    decideGoal(bot, ctx);
    acquire(bot, ctx);
    combat(bot, dt, ctx);

    // Retreat when low HP and an enemy is near.
    const p = posOf(bot);
    let tx = null, tz = null;
    if (bot.hp < 35 && bot.target) {
      const s = world.spawns[bot.team][0];
      tx = s[0]; tz = s[1];
      bot.mode = 'retreat';
    } else if (bot.mode === 'plant' || bot.mode === 'defuse') {
      tx = null; // stand still, channel
    } else if (bot.goal) {
      const gd = Math.hypot(bot.goal.x - p.x, bot.goal.z - p.z);
      if (gd < 2.2) { tx = bot.goal.x; tz = bot.goal.z; }
      else {
        if (!bot.wp || Math.hypot(bot.wp.x - p.x, bot.wp.z - p.z) < 0.9) bot.wp = pickWp(bot, bot.goal);
        if (bot.wp) { tx = bot.wp.x; tz = bot.wp.z; }
      }
    }
    const keys = new Set();
    if (tx !== null) {
      const k = moveKeys(bot, tx, tz);
      for (const key of k) keys.add(key);
      faceToward(bot, tx, tz, dt, false);
    } else if (bot.target) {
      faceToward(bot, bot.aimPoint.x, bot.aimPoint.z, dt, true);
    }
    // Stuck detection: no progress while trying to move -> jump + repick.
    if (now - bot.lastCheck > 0.5) {
      const moved = Math.hypot(p.x - bot.lastPos.x, p.z - bot.lastPos.z);
      if (tx !== null && moved < 0.15) {
        bot.stuckT += 0.5;
        if (bot.stuckT >= 1 && bot.wp) {
          bot.wpBlocked.set(bot.wp, now + 4);
          bot.wp = null;
          bot.stuckT = 0;
        }
        keys.add('Space');
      } else bot.stuckT = 0;
      bot.lastPos.copy(p);
      bot.lastCheck = now;
    }
    bot.ctrl.step(dt, keys);
    bot.group.position.copy(p);
    bot.group.rotation.y = bot.ctrl.state.yaw;
    bot.group.position.y = p.y;
  }

  return {
    list,
    hitMeshes,
    eyeOf,
    posOf,
    spawnRound() {
      for (const bot of list) {
        const sp = world.spawns[bot.team][list.filter((b) => b.team === bot.team).indexOf(bot)];
        bot.ctrl.state.position.set(sp[0], 0, sp[1]);
        bot.ctrl.state.velocity.set(0, 0, 0);
        bot.ctrl.state.yaw = bot.team === 'ember' ? 0 : Math.PI;
        bot.hp = 100;
        bot.alive = true;
        bot.fall = 0;
        bot.group.rotation.set(0, bot.ctrl.state.yaw, 0);
        bot.group.position.copy(bot.ctrl.state.position);
        bot.hasSpike = false;
        bot.mode = 'move';
        bot.goal = null;
        bot.wp = null;
        bot.wpBlocked.clear();
        bot.target = null;
        bot.wantsFire = false;
        bot.patrolA = null;
        bot.patrolB = null;
        bot.patrolFlip = Math.floor(Math.random() * 2);
        bot.holdT = 0;
      }
    },
    step(dt, ctx) {
      now = ctx.time;
      for (const bot of list) stepBot(bot, dt, ctx);
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      if (bot.hp > 0) return false;
      bot.hp = 0;
      bot.alive = false;
      bot.fall = 0;
      bot.wantsFire = false;
      return true;
    },
    aliveCount(team) {
      return list.filter((b) => b.team === team && b.alive).length;
    },
  };
}
