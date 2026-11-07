'use strict';
/* Flung8 — ring courses: generation, meshes, pass detection, autopilot, par times. */

const RING_COLORS = { normal: null, lift: '#5ae6ff', boost: '#ff8a3a', finish: '#ffffff', gold: '#ffd84a', start: null };

function generateCourse(W, cdef) {
  const K = COURSE_KINDS[cdef.kind];
  const rnd = RNG(cdef.seed);
  const rings = [];
  const isLow = cdef.kind === 'gauntlet';
  // start: open air, roughly central
  let start = null;
  for (let a = 0; a < 400 && !start; a++) {
    const x = rnd.range(-700, 700), z = rnd.range(-700, 700);
    const fl = W.floorAt(x, z);
    const y = Math.max(fl + (isLow ? 90 : 160), W.def.spawnY * (isLow ? 0.75 : 1));
    if (W.clearance(x, y, z).d > 45 && y < 900) start = new THREE.Vector3(x, y, z);
  }
  if (!start) start = new THREE.Vector3(0, W.def.spawnY + 100, 0);
  const minClear = isLow ? 9 : 18;
  const dbg = { att: 0, bounds: 0, climb: 0, clear: 0, line: 0, near: 0, back: 0 };
  const tryPlace = (prev, heading, first) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const relax = attempt / 60;
      let h = heading + rnd.range(-1, 1) * Math.min(1.7, K.turn * (1 + relax * 1.6));
      const dc = Math.hypot(prev.x, prev.z);
      if (dc > 800) { const toC = Math.atan2(prev.x, prev.z); h = h + wrapAngle(toC - h) * smooth(800, 1250, dc) * 0.9; }
      const len = rnd.range(K.seg[0], K.seg[1]);
      const x = prev.x - Math.sin(h) * len, z = prev.z - Math.cos(h) * len;
      dbg.att++;
      if (!W.inBounds(x, z)) { dbg.bounds++; continue; }
      const fl = W.floorAt(x, z);
      const lo = fl + K.clear[0], hi = fl + K.clear[1] + (isLow ? 50 : 150) + relax * 80;
      let y = prev.y - len * (isLow ? rnd.range(0, 0.07) : rnd.range(0.03, 0.1));
      if (y > fl + K.clear[1] && rnd() < 0.5) y = lerp(y, fl + K.clear[1], 0.5);
      if (W.def.kind === 'islands') y = clamp(y, isLow ? 55 : 70, 600);
      else y = clamp(y, lo, Math.max(lo, hi));
      const climb = (y - prev.y) / len;
      if (climb > (first ? 0.05 : isLow ? 0.36 : 0.3)) { dbg.climb++; continue; }
      const P = new THREE.Vector3(x, y, z);
      if (W.clearance(x, y, z).d < (isLow ? 12 : 20)) { dbg.clear++; continue; }
      // the straight line between rings must be flyable
      let okLine = true;
      const steps = Math.ceil(len / 12);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const yy = climb > 0.05 ? prev.y + (y - prev.y) * Math.sin(t * Math.PI / 2) : lerp(prev.y, y, t);
        if (W.clearance(lerp(prev.x, x, t), yy, lerp(prev.z, z, t)).d < minClear) { okLine = false; break; }
      }
      if (!okLine) { dbg.line++; continue; }
      if (rings.some((r, k) => k < rings.length - 1 && r.pos.distanceTo(P) < 90)) { dbg.near++; continue; }
      return { P, h, climb };
    }
    return null;
  };
  let heading = rnd() * TAU, backtracks = 0;
  let bestRings = [];
  while (rings.length < K.rings && backtracks < 320) {
    if (rings.length > bestRings.length) bestRings = rings.slice();
    const last = rings[rings.length - 1];
    const placed = tryPlace(last ? last.pos : start, last ? last.h : heading, !last);
    if (placed) {
      if (placed.climb > 0.05 && last) last.type = 'lift';
      rings.push({ pos: placed.P, normal: new THREE.Vector3(), r: isLow ? 9.5 : 13, type: 'normal', idx: rings.length, h: placed.h });
    } else {
      backtracks++; dbg.back++;
      if (rings.length) rings.pop(); else heading = rnd() * TAU;
      if (rings.length && backtracks % 5 === 0) rings.pop();
      if (rings.length > 2 && backtracks % 23 === 0) rings.splice(-2);
      if (rings.length) rings[rings.length - 1].type = 'normal';
    }
  }
  if (rings.length < bestRings.length) { rings.length = 0; rings.push(...bestRings); }
  rings.forEach((r, i) => (r.idx = i));
  // a few boost rings on long straights
  rings.forEach((r, i) => { if (r.type === 'normal' && i > 1 && i < rings.length - 2 && i % 6 === 3) r.type = 'boost'; });
  rings[0].r += 3;
  rings[rings.length - 1].type = 'finish';
  rings[rings.length - 1].r += 2;
  // orient rings along the flight path
  for (let i = 0; i < rings.length; i++) {
    const a = i === 0 ? start : rings[i - 1].pos, b = rings[i].pos, c = i < rings.length - 1 ? rings[i + 1].pos : null;
    const dIn = _v.copy(b).sub(a).normalize();
    if (c) { const dOut = _v2.copy(c).sub(b).normalize(); rings[i].normal.copy(dIn).addScaledVector(dOut, 0.5).normalize(); } else rings[i].normal.copy(dIn);
    rings[i].normal.y *= 0.6; rings[i].normal.normalize();
  }
  const startDir = rings[0].pos.clone().sub(start).normalize();
  const spawn = start.clone().addScaledVector(startDir, -40);
  let length = 0; let p0 = spawn;
  for (const r of rings) { length += p0.distanceTo(r.pos); p0 = r.pos; }
  return { def: cdef, rings, start: { pos: spawn, dir: startDir }, length, kind: cdef.kind, dbg };
}

/* Daily course: any world, mixed parameters, seeded by date. */
function dailyCourseDef(key) {
  const r = RNG(hashStr('daily' + key));
  const world = WORLDS[Math.floor(r() * WORLDS.length)].id;
  return { id: 'daily-' + key, world, kind: r() < 0.5 ? 'line' : 'gauntlet', name: 'Daily ' + key.slice(4, 6) + '/' + key.slice(6, 8), seed: hashStr('dailyseed' + key), daily: true };
}

function courseDefById(id) {
  if (COURSE_BY_ID[id]) return COURSE_BY_ID[id];
  if (id.startsWith('daily-')) return dailyCourseDef(id.slice(6));
  return null;
}

/* ---------- ring meshes ---------- */
function buildRingMeshes(rings, W) {
  const group = new THREE.Group();
  const geos = {};
  for (const r of rings) {
    const key = r.r.toFixed(1);
    if (!geos[key]) geos[key] = new THREE.TorusGeometry(r.r, r.r > 12 ? 1.1 : 0.85, 8, 40);
    const base = RING_COLORS[r.type] || W.def.ringA;
    const mat = new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.95, fog: true, toneMapped: false });
    const m = new THREE.Mesh(geos[key], mat);
    m.position.copy(r.pos);
    m.lookAt(_v.copy(r.pos).add(r.normal));
    group.add(m);
    // soft disc to read the ring from far away
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r.r * 0.96, 32), new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
    m.add(disc);
    if (r.type === 'lift' || r.type === 'boost') {
      const ch = new THREE.Mesh(new THREE.ConeGeometry(r.r * 0.22, r.r * 0.35, 3), new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.85 }));
      if (r.type === 'lift') ch.position.set(0, r.r * 0.55, 0); else { ch.rotation.x = -Math.PI / 2; ch.position.set(0, 0, 0); }
      m.add(ch);
    }
    r.mesh = m; r.mat = mat; r.disc = disc; r.base = new THREE.Color(base); r.done = false; r.pop = 0;
  }
  return group;
}

/* did the segment a->b cross the ring's disc? */
function crossesRing(a, b, r, slack = 1.5, both = false) {
  const da = _v.copy(a).sub(r.pos).dot(r.normal);
  const db = _v2.copy(b).sub(r.pos).dot(r.normal);
  const fwd = da <= 0 && db >= 0, back = both && da >= 0 && db <= 0;
  if (!fwd && !back) return false;
  const t = da / (da - db || 1e-6);
  const hx = lerp(a.x, b.x, t) - r.pos.x, hy = lerp(a.y, b.y, t) - r.pos.y, hz = lerp(a.z, b.z, t) - r.pos.z;
  return Math.hypot(hx, hy, hz) < r.r + slack;
}

/* where to put a pilot after a crash: at the last ring, facing the next one, in clear air */
function respawnPose(W, course, nextIdx) {
  const from = nextIdx > 0 ? course.rings[nextIdx - 1].pos : course.start.pos;
  const to = course.rings[Math.min(nextIdx, course.rings.length - 1)].pos;
  const dir = to.clone().sub(from);
  if (dir.lengthSq() < 1) dir.copy(course.start.dir); else dir.normalize();
  dir.y = clamp(dir.y, -0.25, 0.25); dir.normalize();
  const pos = from.clone();
  for (let k = 0; k < 12 && W.clearance(pos.x, pos.y, pos.z).d < 12; k++) pos.y += 8;
  return { pos, dir };
}

/* ---------- autopilot: used for the title flyby and to set par times ---------- */
function autopilot(p, target, targetNormal, W) {
  const dist = p.pos.distanceTo(target);
  const aim = _v.copy(target);
  if (targetNormal && dist > 25) aim.addScaledVector(targetNormal, -clamp(dist * 0.3, 0, 40));
  const des = aim.sub(p.pos).normalize();
  // avoid the ground ahead
  let ahead = 1e9;
  for (const k of [0.5, 1, 1.6]) {
    const look = Math.min(Math.max(15, p.speed * k), Math.max(12, dist - 8));
    ahead = Math.min(ahead, W.clearance(p.pos.x + p.fwd.x * look, p.pos.y + p.fwd.y * look, p.pos.z + p.fwd.z * look).d);
  }
  const near = dist < 45;
  if (ahead < 10 || (!near && (ahead < 20 || p.clear < 8))) des.y = Math.max(des.y, ahead < 6 ? 0.8 : p.speed < p.frame.stall + 10 ? 0.1 : 0.5);
  const curH = Math.atan2(-p.fwd.x, -p.fwd.z), desH = Math.atan2(-des.x, -des.z);
  const eh = wrapAngle(desH - curH);
  const roll = clamp(-eh * 2.4, -1, 1); // steer straight at the heading error
  const curP = Math.asin(clamp(p.fwd.y, -1, 1)), desP = Math.asin(clamp(des.y, -1, 1));
  let pitch = clamp((desP - curP) * 3.2, -1, 1) * Math.max(0.3, Math.cos(p.bank));
  if (p.speed < p.frame.stall + 7) pitch = Math.min(pitch, -0.4);
  const boost = p.boost > 0.25 && (p.speed < 34 || des.y > 0.15);
  return { pitch, roll, yaw: 0, boost, brake: false };
}

/* Simulate the autopilot through a course to get a fair par time (ms). */
function simulatePar(W, course) {
  const p = makePilot('falcon');
  placePilot(p, course.start.pos, course.start.dir);
  const dt = 1 / 30;
  let idx = 0, t = 0, prev = new THREE.Vector3(), crashes = 0;
  const savedWind = W.wind.clone(); W.wind.set(0, 0, 0);
  while (idx < course.rings.length && t < 400) {
    const r = course.rings[idx];
    prev.copy(p.pos);
    const ctl = autopilot(p, r.pos, r.normal, W);
    const hit = flyPilot(p, ctl, dt, W, false);
    t += dt;
    if (crossesRing(prev, p.pos, r, 2.5, true)) {
      if (r.type === 'lift') p.lift = 40;
      if (r.type === 'boost') { p.speed += 12; p.boost = Math.min(1, p.boost + 0.35); }
      p.boost = Math.min(1, p.boost + 0.12);
      idx++;
    } else if (hit || p.pos.distanceTo(r.pos) > 900) {
      crashes++;
      const pose = respawnPose(W, course, idx);
      placePilot(p, pose.pos, pose.dir);
      t += 3;
      if (crashes > 12) break;
    }
  }
  W.wind.copy(savedWind);
  const ok = idx >= course.rings.length;
  const est = course.length / 40 * 1000;
  const ms = ok ? t * 1000 : est;
  return { ms: Math.round(Math.min(ms, est * 1.4)), ok, crashes };
}

function medalTimes(par) {
  return { plat: Math.round(par * 0.88), gold: Math.round(par * 0.98), silver: Math.round(par * 1.14), bronze: Math.round(par * 1.35) };
}
function medalFor(ms, m) {
  if (ms <= m.plat) return 'plat';
  if (ms <= m.gold) return 'gold';
  if (ms <= m.silver) return 'silver';
  if (ms <= m.bronze) return 'bronze';
  return null;
}
const MEDAL_NAMES = { plat: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
const MEDAL_RANK = { plat: 4, gold: 3, silver: 2, bronze: 1 };

/* ---------- Score Attack ring field ---------- */
function generateField(W, seed) {
  const rnd = RNG(seed);
  const rings = [];
  let tries = 0;
  while (rings.length < 46 && tries++ < 6000) {
    const x = rnd.range(-1150, 1150), z = rnd.range(-1150, 1150);
    const fl = W.floorAt(x, z);
    const y = W.def.kind === 'islands' ? rnd.range(50, 420) : fl + rnd.range(18, 140);
    if (W.clearance(x, y, z).d < 20) continue;
    const P = new THREE.Vector3(x, y, z);
    if (rings.some(r => r.pos.distanceTo(P) < 110)) continue;
    const a = rnd() * TAU;
    const type = rings.length < 6 ? 'gold' : rings.length < 12 ? 'lift' : rings.length < 16 ? 'boost' : 'normal';
    rings.push({ pos: P, normal: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), r: type === 'gold' ? 8 : 12, type, idx: rings.length });
  }
  return rings;
}

/* ---------- shards ---------- */
function buildShardMeshes(W, collected) {
  const group = new THREE.Group();
  const g = new THREE.OctahedronGeometry(3.2, 0);
  const beamG = new THREE.CylinderGeometry(1.2, 1.2, 400, 6, 1, true); beamG.translate(0, 200, 0);
  for (const s of W.shards) {
    if (collected && collected.includes(s.id)) { s.mesh = null; continue; }
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#7fe8ff', emissive: new THREE.Color('#3ab8ff'), emissiveIntensity: 0.9, flatShading: true, roughness: 0.2, metalness: 0.3 }));
    m.position.copy(s.pos);
    const beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: '#9af0ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.copy(s.pos);
    group.add(m, beam);
    s.mesh = m; s.beam = beam;
  }
  return group;
}
