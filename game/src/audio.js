// Synth SFX, no audio files. AudioContext is lazy: created on first resume()
// (user gesture); every method is a safe no-op before that.
export function createAudio() {
  let ctx = null;
  let master = null;
  let mutedFlag = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = mutedFlag ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { return false; }
    return true;
  }

  function noise(dur, freq, gain, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Heavier/lower per weapon: sniper thumps, shotgun cracks, smg snaps.
  const SHOT = {
    sidearm: [1400, 0.09, 0.5], smg: [2200, 0.06, 0.38], rifle: [1200, 0.11, 0.55],
    shotgun: [700, 0.18, 0.8], sniper: [420, 0.3, 0.9],
  };

  return {
    resume() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    shot(id) {
      if (!ctx || mutedFlag) return;
      const s = SHOT[id] || SHOT.rifle;
      noise(s[1], s[0], s[2]);
      tone(160, s[1] * 0.8, 'sine', 0.35, 0, 60);
    },
    hit(head) {
      if (!ctx || mutedFlag) return;
      if (head) { tone(1900, 0.12, 'sine', 0.3); tone(2600, 0.08, 'sine', 0.18, 0.02); }
      else tone(1200, 0.05, 'square', 0.18);
    },
    reloadSnd() {
      if (!ctx || mutedFlag) return;
      tone(700, 0.04, 'square', 0.15);
      noise(0.03, 3000, 0.12, 0.12);
      tone(900, 0.04, 'square', 0.18, 0.3);
    },
    plantBeep() { if (ctx && !mutedFlag) tone(880, 0.09, 'sine', 0.3); },
    defuseBeep() { if (ctx && !mutedFlag) tone(660, 0.09, 'sine', 0.3); },
    win() {
      if (!ctx || mutedFlag) return;
      tone(523, 0.16, 'triangle', 0.3);
      tone(659, 0.16, 'triangle', 0.3, 0.14);
      tone(784, 0.3, 'triangle', 0.35, 0.28);
    },
    lose() {
      if (!ctx || mutedFlag) return;
      tone(392, 0.18, 'triangle', 0.3);
      tone(330, 0.18, 'triangle', 0.3, 0.16);
      tone(262, 0.34, 'triangle', 0.32, 0.32);
    },
    footstep() { if (ctx && !mutedFlag) noise(0.05, 400, 0.05); },
    toggleMute() {
      mutedFlag = !mutedFlag;
      if (master) master.gain.value = mutedFlag ? 0 : 0.5;
      return mutedFlag;
    },
    muted() { return mutedFlag; },
  };
}
