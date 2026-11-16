// Tracers, impact sparks, damage vignette, muzzle-light flash. Pooled, no allocs per shot.
import * as THREE from 'three';

const TRACERS = 24;
const SPARKS = 10;
const SPARK_N = 8;
const TRACER_LIFE = 0.08;
const SPARK_LIFE = 0.4;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  const sparks = [];
  for (let i = 0; i < SPARKS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_N * 3), 3));
    const mat = new THREE.PointsMaterial({ color: 0xffd34d, size: 0.06, transparent: true, opacity: 0, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    pts.frustumCulled = false;
    scene.add(pts);
    sparks.push({ pts, vel: new Float32Array(SPARK_N * 3), life: 0 });
  }

  const flashLight = new THREE.PointLight(0xffc860, 0, 6);
  scene.add(flashLight);
  let flashLife = 0;

  let vigEl = null;
  let vig = 0;

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.line.visible = false; continue; }
      t.line.material.opacity = (t.life / TRACER_LIFE) * 0.9;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.pts.visible = false; continue; }
      const p = s.pts.geometry.attributes.position.array;
      for (let i = 0; i < SPARK_N; i++) {
        s.vel[i * 3 + 1] -= 9.8 * dt;
        p[i * 3] += s.vel[i * 3] * dt;
        p[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
        p[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
      }
      s.pts.geometry.attributes.position.needsUpdate = true;
      s.pts.material.opacity = s.life / SPARK_LIFE;
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashLight.intensity = Math.max(0, flashLife / 0.09) * 12;
      if (flashLife <= 0) flashLight.intensity = 0;
    }
    if (vig > 0) {
      vig = Math.max(0, vig - dt * 0.8);
      if (vigEl) vigEl.style.opacity = String(vig);
    }
  }

  return {
    step,
    tracer(from, to, colorHex = 0xffc860) {
      const t = tracers.find((x) => x.life <= 0) || tracers[0];
      const p = t.line.geometry.attributes.position.array;
      p[0] = from.x; p[1] = from.y; p[2] = from.z;
      p[3] = to.x; p[4] = to.y; p[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(colorHex);
      t.line.material.opacity = 0.9;
      t.line.visible = true;
      t.life = TRACER_LIFE;
    },
    spark(point) {
      const s = sparks.find((x) => x.life <= 0) || sparks[0];
      const p = s.pts.geometry.attributes.position.array;
      for (let i = 0; i < SPARK_N; i++) {
        p[i * 3] = point.x; p[i * 3 + 1] = point.y; p[i * 3 + 2] = point.z;
        const a = Math.random() * Math.PI * 2;
        const up = Math.random() * 2 + 0.5;
        const sp = Math.random() * 2.5 + 1;
        s.vel[i * 3] = Math.cos(a) * sp;
        s.vel[i * 3 + 1] = up;
        s.vel[i * 3 + 2] = Math.sin(a) * sp;
      }
      s.pts.geometry.attributes.position.needsUpdate = true;
      s.pts.material.opacity = 1;
      s.pts.visible = true;
      s.life = SPARK_LIFE;
    },
    vignette(amount) {
      if (!vigEl) vigEl = document.getElementById('vignette');
      vig = Math.max(0, Math.min(0.55, amount));
      if (vigEl) vigEl.style.opacity = String(vig);
    },
    flashAt(pos) {
      flashLight.position.copy(pos);
      flashLife = 0.09;
      flashLight.intensity = 12;
    },
  };
}
