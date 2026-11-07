'use strict';
/* Flung8 — shared helpers: math, seeded random, noise, storage, global state. */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (v - a) / (b - a);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const wrapAngle = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const sign = v => (v < 0 ? -1 : 1);

function RNG(seed) {
  let s = (seed >>> 0) || 1;
  const f = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  return f;
}
function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* 2D simplex noise (public-domain algorithm by Stefan Gustavson), seedable. */
function makeNoise(seed) {
  const rnd = RNG(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
  const g3 = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  function n2(xin, yin) {
    let n0 = 0, n1 = 0, n2v = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { const gi = pm12[ii + perm[jj]] * 2; t0 *= t0; n0 = t0 * t0 * (g3[gi] * x0 + g3[gi + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { const gi = pm12[ii + i1 + perm[jj + j1]] * 2; t1 *= t1; n1 = t1 * t1 * (g3[gi] * x1 + g3[gi + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { const gi = pm12[ii + 1 + perm[jj + 1]] * 2; t2 *= t2; n2v = t2 * t2 * (g3[gi] * x2 + g3[gi + 1] * y2); }
    return 70 * (n0 + n1 + n2v);
  }
  n2.fbm = (x, y, oct = 5, lac = 2, gain = 0.5) => {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * n2(x * f, y * f); norm += a; a *= gain; f *= lac; }
    return s / norm;
  };
  n2.ridged = (x, y, oct = 5, lac = 2, gain = 0.5) => {
    let a = 1, f = 1, s = 0, norm = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(n2(x * f, y * f));
      v *= v; v *= w; w = clamp(v * 1.4, 0, 1);
      s += a * v; norm += a; a *= gain; f *= lac;
    }
    return s / norm;
  };
  return n2;
}

/* localStorage that never throws (private windows, blocked storage, previews). */
const Store = {
  pre: 'aerie:',
  get(k, d) { try { const v = localStorage.getItem(this.pre + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(this.pre + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(this.pre + k); } catch (e) { /* ignore */ } }
};

function fmtTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.--';
  const neg = ms < 0; ms = Math.abs(ms);
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100;
  return (neg ? '-' : '') + m + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
}
function fmtDelta(ms) { return (ms < 0 ? '−' : '+') + (Math.abs(ms) / 1000).toFixed(2); }
function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }
function todayKey(d = new Date()) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hexToInt(h) { return parseInt(h.replace('#', ''), 16); }
function mixHex(a, b, t) {
  const A = hexToInt(a), B = hexToInt(b);
  const r = Math.round(lerp(A >> 16, B >> 16, t)), g = Math.round(lerp((A >> 8) & 255, (B >> 8) & 255, t)), bl = Math.round(lerp(A & 255, B & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
function cleanCallsign(s) {
  return String(s || '').replace(/[^A-Za-z0-9 _\-.]/g, '').trim().slice(0, 14);
}

/* The one global game state. */
const G = {
  state: 'boot',       // boot | title | menu | play | pause | results | locker
  time: 0,
  dt: 0,
  world: null,         // built world object
  worldId: null,
  run: null,           // the current run
  settings: null,
  save: null,
  W: 1, H: 1,
  quality: 'med'
};
