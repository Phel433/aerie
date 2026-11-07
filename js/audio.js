'use strict';
/* Flung8 — synthesized sound: wind, chimes, effects and a generative ambient score. */

const Sfx = (() => {
  let ctx = null, master, musicBus, sfxBus, windGain, windFilter, sprayGain, verb, verbSend;
  let noiseBuf = null;
  const last = {};
  const vol = { master: 0.8, music: 0.5, sfx: 0.8 };
  const MODES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], pentatonic: [0, 2, 4, 7, 9, 12, 14]
  };
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
    master = ctx.createGain(); master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    // reverb from a generated impulse
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
    verb.buffer = ir;
    verbSend = ctx.createGain(); verbSend.gain.value = 0.35; verbSend.connect(verb); verb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // continuous wind
    const wn = ctx.createBufferSource(); wn.buffer = noiseBuf; wn.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 400; windFilter.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    wn.connect(windFilter); windFilter.connect(windGain); windGain.connect(sfxBus); wn.start();
    // water / ground spray hiss
    const sn = ctx.createBufferSource(); sn.buffer = noiseBuf; sn.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 2500;
    sprayGain = ctx.createGain(); sprayGain.gain.value = 0;
    sn.connect(sf); sf.connect(sprayGain); sprayGain.connect(sfxBus); sn.start();
    setVolumes(vol.master, vol.music, vol.sfx);
    startMusic();
  }

  function setVolumes(m, mu, s) {
    vol.master = m; vol.music = mu; vol.sfx = s;
    if (!ctx) return;
    master.gain.setTargetAtTime(m, ctx.currentTime, 0.05);
    musicBus.gain.setTargetAtTime(mu * 0.55, ctx.currentTime, 0.05);
    sfxBus.gain.setTargetAtTime(s, ctx.currentTime, 0.05);
  }

  function gap(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return false;
    last[name] = now; return true;
  }

  function tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.005, when = 0, glide = 0, wet = 0.3, pan = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    o.connect(g); node.connect(sfxBus);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(verbSend); }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, { gain = 0.3, freq = 1200, q = 0.8, type = 'bandpass', when = 0, sweep = 0, attack = 0.01 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    const w = ctx.createGain(); w.gain.value = 0.2; g.connect(w); w.connect(verbSend);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  const S = {
    ring(combo) {
      const base = 72 + (musicRoot % 12);
      const step = PENTA[Math.min(combo, PENTA.length - 1)];
      tone(mtof(base + step), 0.5, { type: 'triangle', gain: 0.16, wet: 0.5 });
      tone(mtof(base + step + 12), 0.35, { type: 'sine', gain: 0.07, when: 0.04, wet: 0.6 });
      noise(0.35, { gain: 0.12, freq: 900, sweep: 3, q: 0.6 });
    },
    lift() { tone(300, 0.6, { type: 'sawtooth', gain: 0.05, glide: 3, wet: 0.4 }); noise(0.6, { gain: 0.15, freq: 400, sweep: 6 }); },
    boostRing() { noise(0.5, { gain: 0.22, freq: 2000, sweep: 0.3 }); tone(180, 0.4, { type: 'square', gain: 0.04, glide: 2.5 }); },
    gold() { [0, 4, 7, 12].forEach((s, i) => tone(mtof(84 + s), 0.4, { type: 'triangle', gain: 0.1, when: i * 0.05, wet: 0.6 })); },
    finish() { [0, 4, 7, 12, 16].forEach((s, i) => tone(mtof(72 + s), 0.9, { type: 'triangle', gain: 0.12, when: i * 0.09, wet: 0.6 })); },
    crash() { noise(0.9, { gain: 0.5, freq: 300, sweep: 0.3, type: 'lowpass' }); tone(90, 0.5, { type: 'sine', gain: 0.35, glide: 0.4, wet: 0.1 }); },
    trick(level = 0) { tone(mtof(79 + level * 2), 0.18, { type: 'square', gain: 0.05, wet: 0.3 }); tone(mtof(86 + level * 2), 0.3, { type: 'triangle', gain: 0.08, when: 0.07, wet: 0.5 }); },
    shard() { [0, 7, 12, 19, 24].forEach((s, i) => tone(mtof(81 + s), 0.6, { type: 'sine', gain: 0.1, when: i * 0.06, wet: 0.8 })); },
    medal() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone(mtof(67 + s), 0.5, { type: 'triangle', gain: 0.1, when: i * 0.1, wet: 0.5 })); },
    beep(hi) { tone(hi ? 880 : 440, hi ? 0.5 : 0.18, { type: 'square', gain: 0.07, wet: 0.2 }); },
    ui() { if (gap('ui', 40)) tone(1200, 0.05, { type: 'sine', gain: 0.05, wet: 0 }); },
    click() { tone(660, 0.08, { type: 'triangle', gain: 0.08, wet: 0.1 }); },
    levelup() { [0, 4, 7, 11, 14].forEach((s, i) => tone(mtof(72 + s), 0.7, { type: 'triangle', gain: 0.1, when: i * 0.07, wet: 0.7 })); },
    stall() { if (gap('stall', 600)) tone(520, 0.12, { type: 'square', gain: 0.05, wet: 0 }); },
    near(pan) { if (gap('near', 300)) noise(0.4, { gain: 0.3, freq: 1500, sweep: 0.4, q: 1.2 }); },
    gate() { [0, 5, 9, 12].forEach((s, i) => tone(mtof(76 + s), 0.5, { type: 'triangle', gain: 0.1, when: i * 0.04, wet: 0.6 })); },
    whoosh() { if (gap('whoosh', 200)) noise(0.5, { gain: 0.18, freq: 700, sweep: 2.5 }); },
    thunder(dist) { if (!ctx) return; const d = clamp(dist / 900, 0, 1); noise(2.4, { gain: 0.5 * (1 - d * 0.6), freq: 140, type: 'lowpass', when: d * 0.8, attack: 0.05, sweep: 0.5 }); },
    join() { tone(mtof(76), 0.25, { type: 'triangle', gain: 0.08 }); tone(mtof(83), 0.35, { type: 'triangle', gain: 0.08, when: 0.08 }); }
  };

  function setFlight(speed, boosting, stall, skim, active) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = active ? clamp(speed / 100, 0, 1.3) : 0;
    windGain.gain.setTargetAtTime(active ? 0.03 + s * s * 0.22 + (boosting ? 0.06 : 0) : 0, t, 0.15);
    windFilter.frequency.setTargetAtTime(250 + s * 1400 + (boosting ? 400 : 0), t, 0.15);
    sprayGain.gain.setTargetAtTime(active ? skim * 0.1 : 0, t, 0.1);
  }

  /* ---------- generative music ---------- */
  let musicRoot = 62, musicMode = 'major', musicTimer = null, nextBar = 0, bar = 0, intensity = 0, chordIdx = 0;
  const PROG = [[0, 4, 2], [5, 2, 4], [3, 5, 0], [4, 1, 6]]; // scale degrees for chords (root, third-ish, fifth-ish)
  function setSong(root, mode) { musicRoot = root; musicMode = mode; }
  function setIntensity(i) { intensity = i; }
  function deg(d) { const sc = MODES[musicMode] || MODES.major; const oct = Math.floor(d / sc.length); return sc[((d % sc.length) + sc.length) % sc.length] + 12 * oct; }
  function pad(freq, t0, dur, g) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + intensity * 500; f.Q.value = 0.3;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.linearRampToValueAtTime(g, t0 + dur * 0.35); gn.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      o.connect(f); o.start(t0); o.stop(t0 + dur + 0.1);
    }
    f.connect(gn); gn.connect(musicBus);
    const w = ctx.createGain(); w.gain.value = 0.6; gn.connect(w); w.connect(verbSend);
  }
  function pluck(freq, t0, g) {
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(g, t0 + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
    o.connect(gn); gn.connect(musicBus);
    const w = ctx.createGain(); w.gain.value = 0.9; gn.connect(w); w.connect(verbSend);
    o.start(t0); o.stop(t0 + 1.5);
  }
  function scheduleBar(t0) {
    const barLen = 4.8;
    const ch = PROG[chordIdx % PROG.length];
    chordIdx++;
    const rootDeg = ch[0];
    [0, 2, 4].forEach((k, i) => pad(mtof(musicRoot - 12 + deg(rootDeg + k)), t0, barLen + 0.6, 0.028 - i * 0.004));
    pad(mtof(musicRoot - 24 + deg(rootDeg)), t0, barLen + 0.4, 0.03);
    const notes = 4 + Math.round(intensity * 6);
    for (let i = 0; i < notes; i++) {
      if (Math.random() < 0.25) continue;
      const d = rootDeg + [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)];
      pluck(mtof(musicRoot + 12 + deg(d)), t0 + (i / notes) * barLen + Math.random() * 0.05, 0.035 + intensity * 0.015);
    }
    bar++;
    return barLen;
  }
  function startMusic() {
    if (musicTimer) return;
    nextBar = ctx.currentTime + 0.3;
    musicTimer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      while (nextBar < ctx.currentTime + 0.6) nextBar += scheduleBar(nextBar);
    }, 200);
  }

  return Object.assign(S, { init, setVolumes, setFlight, setSong, setIntensity, get ready() { return !!ctx; } });
})();
