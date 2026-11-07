'use strict';
/* Flung8 — runs: modes, rings, tricks, scoring, crashes, ghosts, races, camera, effects and HUD. */

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/* ---------- world loading ---------- */
function loadWorld(id) {
  if (G.worldId === id && G.world) return G.world;
  if (G.world) disposeWorld(G.world, G.scene);
  const def = WORLD_BY_ID[id] || WORLDS[0];
  const W = buildWorld(def, G.settings.quality);
  G.world = W; G.worldId = def.id;
  G.scene.add(W.group); G.scene.add(W.skyGroup);
  G.scene.fog = new THREE.Fog(def.fog.color, def.fog.near * 1.4, def.fog.far * 1.15 * (G.settings.quality === 'low' ? 0.8 : 1));
  G.scene.background = new THREE.Color(def.fog.color);
  W.mapImg = makeMapImage(W);
  Sfx.setSong(def.music.root, def.music.mode);
  Net.setLobbyPresence();
  return W;
}

function makeMapImage(W) {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  const L = W.def.land;
  const low = new THREE.Color(L.low), high = new THREE.Color(L.peak), wat = new THREE.Color(W.def.water ? W.def.water.color : W.def.cloudSea || '#ffffff');
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -WORLD_HALF + (i + 0.5) / n * WORLD_SIZE, z = -WORLD_HALF + (j + 0.5) / n * WORLD_SIZE;
    const h = W.heightAt(x, z);
    if (h <= W.waterLevel || h < W.softFloor) _col.copy(wat).multiplyScalar(0.8);
    else _col.copy(low).lerp(high, clamp(h / 500, 0, 1));
    const k = (j * n + i) * 4;
    img.data[k] = _col.r * 255; img.data[k + 1] = _col.g * 255; img.data[k + 2] = _col.b * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (W.islands) {
    g.fillStyle = W.def.kind === 'islands' ? L.mid : '#b8b29a';
    for (const isl of W.islands) { g.beginPath(); g.arc((isl.x + WORLD_HALF) / WORLD_SIZE * n, (isl.z + WORLD_HALF) / WORLD_SIZE * n, Math.max(1.5, isl.r / WORLD_SIZE * n), 0, TAU); g.fill(); }
  }
  for (const c2 of W.colliders) if (c2.t === 'cyl') { g.fillStyle = '#3a3a3a'; g.fillRect((c2.x + WORLD_HALF) / WORLD_SIZE * n - 1, (c2.z + WORLD_HALF) / WORLD_SIZE * n - 1, 2, 2); }
  return c;
}

/* ---------- player glider ---------- */
function rebuildPlayerMesh() {
  const P = G.player;
  if (P.mesh) { G.scene.remove(P.mesh); }
  P.mesh = buildGliderMesh(G.save.frame, G.save.paint);
  G.scene.add(P.mesh);
  const cols = trailColors(G.save.trail, G.save.paint);
  for (const t of P.trails) { G.scene.remove(t.mesh); t.mesh.geometry.dispose(); }
  P.trails = [makeTrail(cols), makeTrail(cols)];
  P.trails.forEach(t => G.scene.add(t.mesh));
  P.p.frame = FRAME_BY_ID[G.save.frame] || FRAMES[0];
}
function syncPlayerMesh(dt, strength) {
  const P = G.player, p = P.p;
  P.mesh.position.copy(p.pos);
  P.mesh.quaternion.copy(p.q);
  P.mesh.visible = p.alive && G.camMode !== 'cockpit';
  if (G.settings.trails) {
    const s = p.alive ? strength : 0;
    ['tipL', 'tipR'].forEach((k, i) => {
      _a.copy(P.mesh.userData[k]).applyQuaternion(p.q).add(p.pos);
      pushTrail(P.trails[i], _a, p.up, s);
    });
  }
  P.trails.forEach(t => (t.mesh.visible = G.settings.trails));
}

/* ---------- particles ---------- */
const FX = {
  n: 1800, i: 0, list: [], pts: null,
  init() {
    const n = this.n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-1e5), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { map: { value: glowTex() }, scale: { value: 400 } },
      vertexShader: 'attribute float alpha; attribute float size; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); }'
    });
    this.pts = new THREE.Points(g, m);
    this.pts.frustumCulled = false;
    for (let k = 0; k < n; k++) this.list.push({ life: 0 });
    G.scene.add(this.pts);
  },
  spawn(x, y, z, vx, vy, vz, life, color, size = 2, drag = 1, grav = 0) {
    const p = this.list[this.i]; this.i = (this.i + 1) % this.n;
    Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, size, drag, grav });
    _col.set(color); p.r = _col.r; p.g = _col.g; p.b = _col.b;
  },
  burst(pos, color, count, speed, life = 0.8, size = 2.5, grav = 0) {
    for (let k = 0; k < count; k++) {
      const u = Math.random() * TAU, v = Math.acos(Math.random() * 2 - 1), s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(pos.x, pos.y, pos.z, Math.sin(v) * Math.cos(u) * s, Math.cos(v) * s, Math.sin(v) * Math.sin(u) * s, life * (0.6 + Math.random() * 0.6), color, size, 2.2, grav);
    }
  },
  ring(r, color) {
    const tmpQ = r.mesh ? r.mesh.quaternion : new THREE.Quaternion();
    for (let k = 0; k < 40; k++) {
      const a = k / 40 * TAU;
      _a.set(Math.cos(a) * r.r, Math.sin(a) * r.r, 0).applyQuaternion(tmpQ);
      this.spawn(r.pos.x + _a.x, r.pos.y + _a.y, r.pos.z + _a.z, _a.x * 1.2, _a.y * 1.2, _a.z * 1.2, 0.7, color, 3, 2.5);
    }
  },
  update(dt) {
    const g = this.pts.geometry, P = g.attributes.position.array, C = g.attributes.color.array, A = g.attributes.alpha.array, S = g.attributes.size.array;
    for (let k = 0; k < this.n; k++) {
      const p = this.list[k];
      if (p.life <= 0) { if (A[k] !== 0) { A[k] = 0; P[k * 3 + 1] = -1e5; } continue; }
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      P[k * 3] = p.x; P[k * 3 + 1] = p.y; P[k * 3 + 2] = p.z;
      C[k * 3] = p.r; C[k * 3 + 1] = p.g; C[k * 3 + 2] = p.b;
      A[k] = clamp(p.life / p.max, 0, 1);
      S[k] = p.size;
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.size.needsUpdate = true;
  },
  clear() { for (const p of this.list) p.life = 0; }
};

/* speed lines, drawn in camera space */
const SpeedLines = {
  n: 70, seg: null, data: [],
  init() {
    const pos = new Float32Array(this.n * 6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.seg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.seg.frustumCulled = false;
    G.camera.add(this.seg);
    for (let i = 0; i < this.n; i++) this.data.push(this.fresh({}, true));
  },
  fresh(d, init) {
    const a = Math.random() * TAU, r = 3 + Math.random() * 9;
    d.x = Math.cos(a) * r; d.y = Math.sin(a) * r; d.z = init ? -Math.random() * 80 : -80; d.len = 2 + Math.random() * 5;
    return d;
  },
  update(dt, speed, boost) {
    const k = smooth(48, 95, speed) + (boost ? 0.25 : 0);
    this.seg.material.opacity = clamp(k, 0, 0.6) * 0.55;
    if (k <= 0) return;
    const P = this.seg.geometry.attributes.position.array;
    for (let i = 0; i < this.n; i++) {
      const d = this.data[i];
      d.z += speed * 1.4 * dt;
      if (d.z > 0) this.fresh(d);
      const l = d.len * (speed / 50);
      P[i * 6] = d.x; P[i * 6 + 1] = d.y; P[i * 6 + 2] = d.z; P[i * 6 + 3] = d.x; P[i * 6 + 4] = d.y; P[i * 6 + 5] = d.z - l;
    }
    this.seg.geometry.attributes.position.needsUpdate = true;
  }
};

/* ---------- runs ---------- */
function newRunStats() { return { rings: 0, rolls: 0, loops: 0, skim: 0, wave: 0, needles: 0, inverted: 0, thermal: 0, maxSpeed: 0, crashes: 0, km: 0, shards: 0, gates: 0, combo: 0, style: 0 }; }

function startRun(opts) {
  const mode = opts.mode;
  let cdef = null, worldId = opts.worldId;
  if (opts.courseId) { cdef = courseDefById(opts.courseId); worldId = cdef.world; }
  const W = loadWorld(worldId);
  G.save.lastWorld = worldId;
  const run = {
    mode, cdef, world: W, t: 0, phase: 'count', count: mode === 'free' || mode === 'sky' ? 0 : 3.2,
    next: 0, lastRing: null, combo: 0, comboT: 0, score: 0, stats: newRunStats(), xpPending: 0,
    rollAcc: 0, rollIdle: 0, rollCount: 0, pitchAcc: 0, pitchIdle: 0, invT: 0, invBest: 0, skimT: 0, skimChain: 0,
    nearCool: 0, diveCool: 0, stallT: 0, gateCool: new Map(), trickFeed: [], splits: [], record: [], recT: 0,
    ghost: null, rings: [], ringGroup: null, shardGroup: null, invuln: 0, crashT: 0, flockT: 0,
    timeLimit: mode === 'attack' ? 120000 : 0, finished: false, results: null, boardGhost: opts.ghost || null
  };
  G.run = run;
  // clean previous objects
  if (G.ringGroup) { G.scene.remove(G.ringGroup); G.ringGroup = null; }
  if (G.shardGroup) { G.scene.remove(G.shardGroup); G.shardGroup = null; }
  if (G.ghostMesh) { G.scene.remove(G.ghostMesh); G.ghostMesh = null; }
  FX.clear();
  const P = G.player;
  if (cdef) {
    run.course = getCourse(cdef, W);
    run.rings = run.course.rings;
    for (const r of run.rings) { r.done = false; }
    G.ringGroup = buildRingMeshes(run.rings, W);
    G.scene.add(G.ringGroup);
    placePilot(P.p, run.course.start.pos, run.course.start.dir);
    run.medals = run.course.medals;
    if (mode !== 'race') setupGhost(run);
  } else if (mode === 'attack') {
    run.rings = generateField(W, hashStr(worldId + 'field'));
    run.rings.forEach(r => { r.done = false; r.respawn = 0; });
    G.ringGroup = buildRingMeshes(run.rings, W);
    G.scene.add(G.ringGroup);
    spawnOpenAir(P.p, W);
  } else {
    G.shardGroup = buildShardMeshes(W, G.save.shards[worldId] || []);
    G.scene.add(G.shardGroup);
    spawnOpenAir(P.p, W);
  }
  P.p.boost = 1;
  P.trails.forEach(resetTrail);
  G.camPos = null;
  if (mode === 'race') { run.phase = 'lobby'; run.goSeen = {}; run.raceStart = 0; Net.setRacePresence({ st: 'lobby', ri: 0, ft: null }); }
  Sfx.setIntensity(mode === 'free' || mode === 'sky' ? 0.3 : 0.7);
  G.state = 'play';
  UI.enterPlay(run);
  Net.setLobbyPresence();
  G.save.stats.flights++;
  saveProgress();
}

function spawnOpenAir(p, W) {
  let pos = null;
  const r = Math.random;
  for (let i = 0; i < 200 && !pos; i++) {
    const x = (r() - 0.5) * 900, z = (r() - 0.5) * 900, y = Math.max(W.floorAt(x, z) + 140, W.def.spawnY);
    if (W.clearance(x, y, z).d > 50) pos = new THREE.Vector3(x, y, z);
  }
  pos = pos || new THREE.Vector3(0, W.def.spawnY + 200, 0);
  const a = r() * TAU;
  placePilot(p, pos, new THREE.Vector3(Math.sin(a), -0.05, Math.cos(a)));
}

/* course cache: generation + par time is deterministic, so do it once per session */
const COURSE_CACHE = {};
function getCourse(cdef, W) {
  if (COURSE_CACHE[cdef.id]) return COURSE_CACHE[cdef.id];
  const c = generateCourse(W, cdef);
  const par = simulatePar(W, c);
  c.par = par.ms; c.medals = medalTimes(par.ms);
  COURSE_CACHE[cdef.id] = c;
  return c;
}

function setupGhost(run) {
  let g = null, label = 'Your best';
  if (run.boardGhost && run.boardGhost.frames) { g = run.boardGhost; label = run.boardGhost.cs || 'Ghost'; }
  else {
    const local = Store.get('ghost:' + run.cdef.id, null);
    if (local && local.d) g = { frames: Ghost.decode(local.d), t: local.t, frame: local.frame, paint: local.paint };
  }
  if (!g || !g.frames || !g.frames.length || !G.settings.others) return;
  run.ghost = g;
  const mesh = buildGliderMesh(g.frame || 'falcon', g.paint || 'gull', { ghost: true });
  const tag = makeNameTag(label, '#c8d0ff'); tag.position.set(0, 4, 0); mesh.add(tag);
  G.ghostMesh = mesh; G.scene.add(mesh);
  run.splitsPB = Store.get('splits:' + run.cdef.id, null);
}

/* ---------- per-frame play update ---------- */
function stepPlay(dt) {
  const run = G.run, P = G.player, p = P.p, W = run.world, I = Input.state;
  if (I.cam) cycleCamera();
  if (I.steer) {
    const modes = ['bank', 'roll', 'sharp'], names = { bank: 'Steep bank', roll: 'Free roll', sharp: 'Sharp turn' };
    G.settings.steer = modes[(modes.indexOf(G.settings.steer) + 1) % modes.length]; saveSettings();
    UI.toast('Steering: ' + names[G.settings.steer], 'Press T to switch. Also in Settings.', '#7fd6ff');
  }
  if (I.photo) { enterPhoto(); return; }
  if (I.pause) { pauseGame(); return; }
  if (run.mode === 'race' && run.phase === 'lobby') { stepRaceLobby(dt); return; }

  if (run.phase === 'count') {
    const before = Math.ceil(run.count);
    run.count -= dt;
    const after = Math.ceil(run.count);
    if (after !== before && after > 0 && after <= 3) { Sfx.beep(false); UI.countdown(after); }
    if (run.count <= 0) { run.phase = 'fly'; Sfx.beep(true); UI.countdown('GO'); if (run.mode === 'race') Net.setRacePresence({ st: 'racing', ri: 0, ft: null }); }
    // hold the glider at the start
    syncPlayerMesh(dt, 0);
    updateGhost(run);
    return;
  }
  if (run.phase === 'done') { syncPlayerMesh(dt, 0.3); stepRaceAfter(dt); return; }

  run.t += dt * 1000;
  if (run.timeLimit && run.t >= run.timeLimit) { finishAttack(); return; }

  // crashed: wait, then respawn
  if (!p.alive) {
    run.crashT -= dt;
    if (run.crashT <= 0) respawn();
    syncPlayerMesh(dt, 0);
    updateGhost(run);
    return;
  }
  const prev = _c.copy(p.pos);
  const ctl = { pitch: I.pitch, roll: I.roll, yaw: I.yaw, boost: I.boost, brake: I.brake, mode: G.settings.steer };
  const hit = flyPilot(p, ctl, dt, W, G.settings.assist);
  run.invuln = Math.max(0, run.invuln - dt);
  if (hit && run.invuln <= 0) { crash(); return; }
  if (W.def.kind === 'islands' && p.pos.y < 3 && run.invuln <= 0) { crash('cloud'); return; }

  const st = run.stats;
  st.km += prev.distanceTo(p.pos) / 1000;
  st.maxSpeed = Math.max(st.maxSpeed, p.speed);
  detectTricks(run, p, dt);
  // rings
  if (run.mode === 'attack') stepAttackRings(run, prev, p);
  else if (run.rings.length && run.next < run.rings.length) {
    const r = run.rings[run.next];
    if (crossesRing(prev, p.pos, r, 1.5, true)) passRing(run, r);
  }
  // gates
  for (const gt of W.gates) {
    const cool = run.gateCool.get(gt) || 0;
    if (run.t < cool) continue;
    if (crossesRing(prev, p.pos, { pos: gt.pos, normal: gt.normal, r: gt.r }, 0, true)) {
      run.gateCool.set(gt, run.t + 8000);
      st.gates++;
      award(run, gt.name, gt.pts);
      Sfx.gate();
      FX.burst(p.pos, '#ffd36b', 30, 20);
    }
  }
  // shards
  if (G.shardGroup) {
    for (const s of W.shards) {
      if (!s.mesh) continue;
      s.mesh.rotation.y += dt * 2; s.mesh.position.y = s.pos.y + Math.sin(W.time * 2 + s.id) * 0.8;
      if (p.pos.distanceTo(s.pos) < 9) collectShard(run, s);
    }
  }
  // combo decay
  if (run.combo > 0 && run.t - run.comboT > (run.mode === 'attack' ? 6000 : 8000)) { run.combo = 0; }
  // ghost & recording
  run.recT += dt;
  if (run.cdef && run.recT >= 1 / Ghost.RATE) {
    run.recT -= 1 / Ghost.RATE;
    run.record.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z, qx: p.q.x, qy: p.q.y, qz: p.q.z, qw: p.q.w });
  }
  updateGhost(run);
  // boost trickle in free modes
  if (run.mode === 'free' || run.mode === 'sky') p.boost = Math.min(1, p.boost + dt * 0.04);
  // warnings
  if (p.stall > 0.6) Sfx.stall();
  // Open Sky / race streaming
  if (run.mode === 'sky') {
    Net.streamPilot(p, { m: 'sky' });
    if (Net.remote.size > 0) { run.flockT += dt; if (run.flockT > 10) grantAch('flock'); }
    run.skyT = (run.skyT || 0) + dt;
  }
  if (run.mode === 'race') Net.streamPilot(p, { st: 'racing', ri: run.next });
  syncPlayerMesh(dt, 0.55 + smooth(30, 90, p.speed) * 0.45 + (p.boosting ? 0.3 : 0));
}

function passRing(run, r) {
  const p = G.player.p;
  r.done = true; r.pop = 1;
  run.next++;
  run.lastRing = r;
  run.splits.push(run.t);
  run.stats.rings++;
  run.combo = run.t - run.comboT < 8000 || run.combo === 0 ? Math.min(run.combo + 1, 8) : 1;
  run.comboT = run.t;
  run.stats.combo = Math.max(run.stats.combo, run.combo);
  FX.ring(r, r.type === 'lift' ? '#5ae6ff' : r.type === 'boost' ? '#ff8a3a' : run.world.def.ringA);
  p.boost = Math.min(1, p.boost + 0.12);
  if (r.type === 'lift') { p.lift = 40 * p.frame.lift; Sfx.lift(); }
  else if (r.type === 'boost') { p.speed += 12; p.boost = Math.min(1, p.boost + 0.35); Sfx.boostRing(); }
  else Sfx.ring(run.combo);
  run.xpPending += 6;
  if (run.splitsPB && run.splitsPB[run.next - 1] != null) UI.splitDelta(run.t - run.splitsPB[run.next - 1]);
  if (r.type === 'finish' || run.next >= run.rings.length) {
    if (run.mode === 'race') finishRace(); else finishCourse();
  }
}

function stepAttackRings(run, prev, p) {
  for (const r of run.rings) {
    if (r.done) {
      if (run.t > r.respawn) { r.done = false; r.mesh.visible = true; r.mesh.scale.setScalar(0.01); }
      continue;
    }
    if (crossesRing(prev, p.pos, r, 1.5, true)) {
      r.done = true; r.pop = 1; r.respawn = run.t + 25000;
      run.combo = run.t - run.comboT < 6000 ? Math.min(run.combo + 1, 8) : 1;
      run.comboT = run.t;
      run.stats.combo = Math.max(run.stats.combo, run.combo);
      run.stats.rings++;
      const base = r.type === 'gold' ? 800 : 250;
      run.score += base * (1 + run.combo * 0.5);
      p.boost = Math.min(1, p.boost + (r.type === 'gold' ? 0.5 : 0.15));
      FX.ring(r, r.type === 'gold' ? '#ffd84a' : run.world.def.ringA);
      if (r.type === 'lift') { p.lift = 40 * p.frame.lift; Sfx.lift(); }
      else if (r.type === 'boost') { p.speed += 12; Sfx.boostRing(); }
      else if (r.type === 'gold') { Sfx.gold(); UI.feed('Gold Ring', Math.round(base * (1 + run.combo * 0.5))); }
      else Sfx.ring(run.combo);
      if (run.combo >= 8) grantAch('combo8');
    }
  }
}

/* award style points; multiplier from ring combo */
function award(run, name, pts) {
  const mult = 1 + run.combo * 0.25;
  const v = Math.round(pts * mult);
  run.score += v; run.stats.style += v;
  run.xpPending += pts / 40;
  UI.feed(name, v, mult > 1 ? 'x' + mult.toFixed(2).replace(/\.?0+$/, '') : '');
}

function detectTricks(run, p, dt) {
  const st = run.stats;
  // barrel rolls
  if (Math.abs(p.wr) > 0.8) {
    if (run.rollAcc && Math.sign(p.wr) !== Math.sign(run.rollAcc)) { run.rollAcc = 0; run.rollCount = 0; }
    run.rollAcc += p.wr * dt; run.rollIdle = 0;
    const full = Math.floor(Math.abs(run.rollAcc) / (TAU * 0.93));
    if (full > run.rollCount) {
      run.rollCount = full;
      st.rolls++; G.save.stats.rolls++;
      const key = full >= 3 ? 'roll3' : full === 2 ? 'roll2' : 'roll';
      award(run, full > 3 ? 'Roll x' + full : TRICKS[key].name, full > 3 ? 900 * full : TRICKS[key].pts);
      Sfx.trick(Math.min(full, 4));
      grantAch('roll'); if (full >= 3) grantAch('roll3');
      challengeStat('rolls', 1);
      run.rolledAt = run.t;
    }
  } else { run.rollIdle += dt; if (run.rollIdle > 0.5) { run.rollAcc = 0; run.rollCount = 0; } }
  // loops
  if (Math.abs(p.wp) > 0.6) {
    if (run.pitchAcc && Math.sign(p.wp) !== Math.sign(run.pitchAcc)) run.pitchAcc = 0;
    run.pitchAcc += p.wp * dt; run.pitchIdle = 0;
    if (Math.abs(run.pitchAcc) > TAU * 0.92) {
      run.pitchAcc = 0;
      st.loops++; G.save.stats.loops++;
      const withRoll = run.rolledAt && run.t - run.rolledAt < 5000;
      award(run, withRoll ? TRICKS.bigloop.name : TRICKS.loop.name, withRoll ? TRICKS.bigloop.pts : TRICKS.loop.pts);
      Sfx.trick(3);
      grantAch('loop'); if (withRoll) grantAch('loopRoll');
      challengeStat('loops', 1);
    }
  } else { run.pitchIdle += dt; if (run.pitchIdle > 0.8) run.pitchAcc = 0; }
  // inverted
  if (p.up.y < -0.55) {
    run.invT += dt; st.inverted += dt;
    if (Math.floor(run.invT) > Math.floor(run.invT - dt)) { award(run, 'Inverted ' + Math.floor(run.invT) + 's', 150); challengeStat('inverted', 1); }
    if (run.invT >= 5) grantAch('invert');
  } else run.invT = 0;
  // skimming
  const skimming = p.clear < 9 && p.speed > 24 && p.clearKind !== 'cloud';
  if (skimming) {
    const water = p.clearKind === 'water';
    run.skimT += dt;
    if (water) st.wave += dt; else st.skim += dt;
    const k = 1 + (9 - p.clear) / 9;
    run.skimAcc = (run.skimAcc || 0) + 220 * k * dt;
    if (run.skimAcc > 150) { award(run, water ? 'Wave Skim' : 'Skim', run.skimAcc); run.skimAcc = 0; }
    if (Math.random() < dt * 40) {
      const fl = run.world.floorAt(p.pos.x, p.pos.z);
      FX.spawn(p.pos.x + (Math.random() - 0.5) * 3, fl + 0.5, p.pos.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6 - p.vel.x * 0.15, 6 + Math.random() * 6, (Math.random() - 0.5) * 6 - p.vel.z * 0.15, 0.7, water ? '#dff4ff' : run.world.def.land.high, 2.2, 1.5, 14);
    }
    if (st.skim >= 10) grantAch('skim10');
    if (st.wave >= 5) grantAch('wave');
  } else run.skimT = 0;
  // near misses on objects
  run.nearCool = Math.max(0, run.nearCool - dt);
  if (p.clearKind === 'object' && p.clear < 4.5 && run.nearCool <= 0 && p.speed > 25) {
    run.nearCool = 1.5; st.needles++;
    award(run, TRICKS.needle.name, TRICKS.needle.pts); Sfx.near();
    challengeStat('needles', 1);
    if (st.needles >= 5) grantAch('needle');
  }
  // power dive
  run.diveCool = Math.max(0, run.diveCool - dt);
  if (p.speed > 85 && run.diveCool <= 0) { run.diveCool = 10; award(run, TRICKS.dive.name, TRICKS.dive.pts); Sfx.whoosh(); }
  if (p.speed >= 80) grantAch('speed80');
  if (p.speed >= 100) grantAch('speed100');
  // stall recovery
  if (p.stall > 0.85) run.stallT += dt;
  else if (run.stallT > 0.6 && p.speed > p.frame.stall + 10) { award(run, TRICKS.stallrec.name, TRICKS.stallrec.pts); grantAch('stall'); run.stallT = 0; }
  else if (p.stall < 0.1) run.stallT = 0;
  // thermals
  if (p.inThermal) {
    st.thermal += dt; G.save.stats.thermal += dt;
    run.thermAcc = (run.thermAcc || 0) + 60 * dt;
    if (run.thermAcc > 120) { award(run, TRICKS.thermal.name, run.thermAcc); run.thermAcc = 0; }
    if (G.save.stats.thermal >= 60) grantAch('thermal60');
  }
}

function crash(kind) {
  const run = G.run, p = G.player.p;
  p.alive = false;
  run.crashT = 1.4;
  run.stats.crashes++; G.save.stats.crashes++;
  run.combo = 0;
  const col = G.player.mesh.userData.paint;
  FX.burst(p.pos, col.a, 50, 26, 1.1, 3, 10);
  FX.burst(p.pos, col.b, 30, 18, 0.9, 2.5, 10);
  FX.burst(p.pos, '#ffffff', 30, 10, 0.6, 4);
  Sfx.crash();
  G.shake = 1;
  UI.flash(kind === 'cloud' ? 'Into the clouds' : 'Crashed');
}

function respawn() {
  const run = G.run, p = G.player.p, W = run.world;
  if (run.rings.length && run.mode !== 'attack') {
    const pose = respawnPose(W, run.course, run.next);
    placePilot(p, pose.pos, pose.dir);
  } else {
    const x = p.pos.x, z = p.pos.z;
    const y = Math.max(W.floorAt(x, z) + 100, p.pos.y + 40);
    let pos = new THREE.Vector3(x, y, z);
    if (W.clearance(x, y, z).d < 30) { spawnOpenAir(p, W); pos = null; }
    if (pos) placePilot(p, pos, _a.copy(p.fwd).setY(0).normalize());
  }
  p.boost = Math.max(p.boost, 0.4);
  run.invuln = 1.2;
  G.player.trails.forEach(resetTrail);
  G.camPos = null;
}

function collectShard(run, s) {
  const id = G.worldId;
  const list = G.save.shards[id] = G.save.shards[id] || [];
  if (!list.includes(s.id)) list.push(s.id);
  G.shardGroup.remove(s.mesh); G.shardGroup.remove(s.beam);
  s.mesh = null;
  FX.burst(s.pos, '#7fe8ff', 60, 24, 1.2, 3);
  Sfx.shard();
  run.stats.shards++;
  award(run, TRICKS.shard.name, TRICKS.shard.pts);
  UI.toast('Sky Shard ' + list.length + ' / ' + run.world.shards.length, WORLD_BY_ID[id].name, '#7fe8ff');
  addXp(100);
  grantAch('shard1');
  if (totalShards() >= 25) grantAch('shard25');
  if (list.length >= run.world.shards.length) grantAch('shardWorld');
  if (totalShards() >= WORLDS.length * 20) grantAch('shardAll');
  challengeStat('shards', 1);
  checkNewUnlocks(true);
  saveProgress();
}

function updateGhost(run) {
  if (!run.ghost || !G.ghostMesh) return;
  const s = Ghost.sample(run.ghost.frames, run.t / 1000);
  if (!s) return;
  G.ghostMesh.visible = !s.done;
  const tag = G.ghostMesh.children.find(c => c.isSprite);
  if (tag) { const d = G.camera.position.distanceTo(G.ghostMesh.position); tag.scale.set(16, 4, 1).multiplyScalar(clamp(d / 70, 0.25, 5)); tag.visible = d > 18; }
  G.ghostMesh.position.set(lerp(s.a.x, s.b.x, s.k), lerp(s.a.y, s.b.y, s.k), lerp(s.a.z, s.b.z, s.k));
  const qa = new THREE.Quaternion(s.a.qx, s.a.qy, s.a.qz, s.a.qw), qb = new THREE.Quaternion(s.b.qx, s.b.qy, s.b.qz, s.b.qw);
  G.ghostMesh.quaternion.copy(qa.slerp(qb, s.k));
}

/* ---------- finishing ---------- */
function commitRunStats(run) {
  const st = run.stats, s = G.save.stats;
  s.km += st.km; s.rings += st.rings; s.maxSpeed = Math.max(s.maxSpeed, st.maxSpeed); s.time += run.t / 1000;
  challengeStat('rings', st.rings); challengeStat('km', st.km); challengeStat('skim', st.skim + st.wave);
  challengeStat('thermal', st.thermal); challengeStat('speed', st.maxSpeed, true); challengeStat('combo', st.combo, true);
  if (s.km >= 100) grantAch('dist100');
  if (s.km >= 500) grantAch('dist500');
}

function finishCourse() {
  const run = G.run;
  run.phase = 'done'; run.finished = true;
  const ms = Math.round(run.t);
  const id = run.cdef.id;
  const medal = medalFor(ms, run.medals);
  const prevBest = G.save.best[id];
  const pb = prevBest == null || ms < prevBest;
  const prevMedal = G.save.medals[id];
  if (pb) {
    G.save.best[id] = ms;
    Store.set('ghost:' + id, { t: ms, d: Ghost.encode(run.record), frame: G.save.frame, paint: G.save.paint });
    Store.set('splits:' + id, run.splits);
  }
  if (medal && (!prevMedal || MEDAL_RANK[medal] > MEDAL_RANK[prevMedal])) G.save.medals[id] = medal;
  let xp = 150 + Math.round(run.xpPending) + (medal ? { bronze: 80, silver: 160, gold: 280, plat: 420 }[medal] : 0) + Math.round(run.stats.style / 60);
  if (medal && (!prevMedal || MEDAL_RANK[medal] > MEDAL_RANK[prevMedal])) xp += 150;
  Sfx.finish();
  if (medal) setTimeout(() => Sfx.medal(), 500);
  commitRunStats(run);
  challengeStat('courses', 1);
  if (run.cdef.kind === 'gauntlet') challengeStat('gauntlets', 1);
  if (medal === 'gold' || medal === 'plat') challengeStat('golds', 1);
  grantAch('first');
  if (medal) grantAch('bronze');
  if (medal === 'gold' || medal === 'plat') grantAch('gold1');
  if (medal === 'plat') grantAch('plat1');
  if (medalCount('gold') >= 7) grantAch('gold7');
  if (medalCount('gold') >= COURSES.length) grantAch('allgold');
  if (medalCount('plat') >= COURSES.length) grantAch('allplat');
  if (run.cdef.kind === 'gauntlet' && run.stats.crashes === 0) grantAch('nocrash');
  if (run.cdef.world === 'fjord') grantAch('night');
  if (G.save.medals['storm-line'] && G.save.medals['storm-gauntlet'] && ['gold', 'plat'].includes(G.save.medals['storm-line']) && ['gold', 'plat'].includes(G.save.medals['storm-gauntlet'])) grantAch('storm_gold');
  if (run.cdef.daily) {
    grantAch('daily1');
    const days = G.save.stats.dailyDays;
    const k = id.slice(6);
    if (!days.includes(k)) days.push(k);
    if (days.length >= 3) grantAch('daily3');
  }
  let beatGhost = false;
  if (run.boardGhost && run.boardGhost.t && ms < run.boardGhost.t) { beatGhost = true; grantAch('beat_ghost'); }
  const ups = addXp(xp);
  checkNewUnlocks(true);
  saveProgress();
  run.results = { kind: 'course', ms, medal, pb, prevBest, xp, levelUps: ups, beatGhost, posting: true, rank: null };
  UI.showResults(run);
  // post to the shared board (only when it beats this pilot's posted time)
  Net.postTime(id, ms, pb ? Ghost.encode(run.record) : null).then(res => {
    run.results.posting = false; run.results.post = res;
    UI.refreshResults(run);
  });
}

function finishAttack() {
  const run = G.run;
  run.phase = 'done'; run.finished = true;
  const score = Math.round(run.score);
  const wid = G.worldId;
  const prev = G.save.attack[wid] || 0;
  const pb = score > prev;
  if (pb) G.save.attack[wid] = score;
  const xp = 120 + Math.round(score / 70) + Math.round(run.xpPending);
  commitRunStats(run);
  challengeStat('attack', score, true);
  if (score >= 25000) grantAch('score25');
  if (score >= 60000) grantAch('score60');
  Sfx.finish();
  const ups = addXp(xp);
  saveProgress();
  run.results = { kind: 'attack', score, pb, prev, xp, levelUps: ups, posting: true };
  UI.showResults(run);
  Net.postAttack(wid, score).then(ok => { run.results.posting = false; run.results.post = { posted: !!ok }; UI.refreshResults(run); });
}

function endFreeFlight() {
  const run = G.run;
  run.phase = 'done'; run.finished = true;
  const xp = 40 + Math.round(run.xpPending) + Math.round(run.stats.km * 25);
  commitRunStats(run);
  if (run.mode === 'sky') challengeStat('opensky', run.skyT || 0);
  const ups = addXp(xp);
  saveProgress();
  run.results = { kind: 'free', xp, levelUps: ups };
  UI.showResults(run);
}

/* ---------- live races ---------- */
function raceInfo() {
  return Net.racePeers().filter(p => p.kind === 'viewer').map(p => {
    const pr = p.presence || {};
    return { peer: p.peer, me: p.sameTab, cs: cleanCallsign(pr.cs) || 'Pilot', st: pr.st || 'lobby', go: pr.go | 0, ri: pr.ri | 0, ft: Number.isFinite(pr.ft) ? pr.ft : null, p: Array.isArray(pr.p) ? pr.p : null, pa: pr.pa };
  });
}
function raceHost(info) {
  const lob = info.filter(i => i.st === 'lobby').sort((a, b) => (a.peer < b.peer ? -1 : 1));
  return lob[0] || null;
}
function stepRaceLobby(dt) {
  const run = G.run, p = G.player.p;
  // hover at the start line
  placePilot(p, run.course.start.pos, run.course.start.dir);
  syncPlayerMesh(dt, 0);
  const info = raceInfo();
  for (const i of info) if (!(i.peer in run.goSeen)) run.goSeen[i.peer] = i.go;
  const host = raceHost(info);
  run.isHost = !!(host && host.me) || info.length <= 1;
  // whoever started a race bumped their "go" counter: everyone still in the lobby joins that start
  const starter = info.find(i => !i.me && i.go > (run.goSeen[i.peer] || 0));
  if (starter) {
    for (const i of info) run.goSeen[i.peer] = i.go;
    beginRaceCountdown();
  }
  Net.streamPilot(p, { st: 'lobby', ri: 0 });
  UI.raceLobby(info, run.isHost);
}
function hostStartRace() {
  const run = G.run;
  if (!run || run.mode !== 'race' || run.phase !== 'lobby') return;
  run.myGo = (run.myGo || 0) + 1 + Math.floor(Math.random() * 3);
  Net.setRacePresence({ go: run.myGo });
  beginRaceCountdown();
}
function beginRaceCountdown() {
  const run = G.run;
  run.phase = 'count'; run.count = 3.2; run.t = 0; run.next = 0; run.lastRing = null; run.finished = false;
  run.stats = newRunStats(); run.splits = []; run.record = [];
  run.rings.forEach(r => { r.done = false; r.mesh.visible = true; r.mesh.scale.setScalar(1); });
  run.racers = raceInfo().filter(i => i.st === 'lobby').length;
  placePilot(G.player.p, run.course.start.pos, run.course.start.dir);
  Net.setRacePresence({ st: 'count', ri: 0, ft: null });
  UI.raceLobby(null);
  UI.enterPlay(run);
}
function finishRace() {
  const run = G.run;
  run.phase = 'done'; run.finished = true; run.doneAt = performance.now();
  const ms = Math.round(run.t);
  Net.setRacePresence({ st: 'done', ft: ms, ri: run.rings.length });
  Net.streamPilot(G.player.p, { st: 'done', ft: ms, ri: run.rings.length });
  Sfx.finish();
  commitRunStats(run);
  G.save.stats.races++;
  grantAch('race_done');
  // personal best on the course counts too
  const id = run.cdef.id;
  if (G.save.best[id] == null || ms < G.save.best[id]) { G.save.best[id] = ms; Net.postTime(id, ms, null); }
  const xp = 200 + Math.round(run.xpPending);
  run.results = { kind: 'race', ms, xp, levelUps: addXp(xp) };
  saveProgress();
  UI.showRaceWait(run);
}
function stepRaceAfter(dt) {
  const run = G.run;
  if (run.mode !== 'race' || !run.results || run.results.final) return;
  const info = raceInfo();
  const racing = info.filter(i => i.st === 'racing' || i.st === 'count');
  const done = info.filter(i => i.st === 'done' && i.ft != null).sort((a, b) => a.ft - b.ft);
  UI.raceStandings(info, run);
  if (!racing.length || performance.now() - run.doneAt > 60000) {
    run.results.final = true;
    const place = done.findIndex(d => d.me) + 1;
    run.results.place = place; run.results.field = done.length;
    if (place === 1 && done.length >= 2) { G.save.stats.raceWins++; grantAch('race_win'); }
    saveProgress();
    UI.showResults(run);
  }
}
function backToLobby() {
  const run = G.run;
  if (!run || run.mode !== 'race') return;
  run.phase = 'lobby'; run.results = null; run.finished = false; run.t = 0;
  for (const i of raceInfo()) run.goSeen[i.peer] = i.go;
  Net.setRacePresence({ st: 'lobby', ri: 0, ft: null });
  UI.enterPlay(run);
}
function raceStandingsList() {
  const info = raceInfo();
  const pos = G.run.rings;
  const score = i => {
    if (i.st === 'done' && i.ft != null) return 1e9 - i.ft;
    const r = pos[Math.min(i.ri, pos.length - 1)];
    let d = 0;
    if (i.p && r) d = Math.hypot(i.p[0] - r.pos.x, i.p[1] - r.pos.y, i.p[2] - r.pos.z);
    return i.ri * 1e5 - d;
  };
  return info.filter(i => i.st !== 'lobby').sort((a, b) => score(b) - score(a));
}

/* ---------- remote pilots ---------- */
function updateRemotes(dt) {
  while (Net.goneQueue.length) {
    const r = Net.goneQueue.pop();
    if (r.mesh) G.scene.remove(r.mesh);
    if (r.trail) G.scene.remove(r.trail.mesh);
  }
  const show = G.settings.others && G.run && (G.run.mode === 'sky' || G.run.mode === 'race');
  for (const r of Net.remote.values()) {
    if (!show || !r.pos) { if (r.mesh) r.mesh.visible = false; continue; }
    const fr = FRAME_BY_ID[r.data.fr] ? r.data.fr : 'falcon', pa = PAINT_BY_ID[r.data.pa] ? r.data.pa : 'gull';
    if (!r.mesh || r.frame !== fr || r.paint !== pa) {
      if (r.mesh) G.scene.remove(r.mesh);
      r.mesh = buildGliderMesh(fr, pa); r.frame = fr; r.paint = pa;
      r.tag = makeNameTag(r.cs, PAINT_BY_ID[pa].a); r.tag.position.set(0, 4.5, 0); r.mesh.add(r.tag);
      G.scene.add(r.mesh);
      if (!r.trail) { r.trail = makeTrail([PAINT_BY_ID[pa].a, '#ffffff'], 50); G.scene.add(r.trail.mesh); }
      Sfx.join();
    }
    // dead reckoning between updates
    if (r.tpos && r.tq) {
      _a.set(0, 0, -1).applyQuaternion(r.tq);
      r.tpos.addScaledVector(_a, (r.speed || 0) * dt);
      r.pos.lerp(r.tpos, 1 - Math.exp(-8 * dt));
      r.q.slerp(r.tq, 1 - Math.exp(-8 * dt));
    }
    r.mesh.visible = true;
    r.mesh.position.copy(r.pos); r.mesh.quaternion.copy(r.q);
    const d = G.camera.position.distanceTo(r.pos);
    r.tag.scale.set(16, 4, 1).multiplyScalar(clamp(d / 60, 0.6, 6));
    if (r.trail && G.settings.trails) { _b.set(0, 1, 0).applyQuaternion(r.q); pushTrail(r.trail, r.pos, _b, 0.6); }
  }
}

/* ---------- camera ---------- */
const CAM_MODES = ['chase', 'far', 'cockpit', 'cine'];
const CAM_NAMES = { chase: 'Chase camera', far: 'Wide camera', cockpit: 'Cockpit camera', cine: 'Cinematic camera' };
function cycleCamera() {
  G.camMode = CAM_MODES[(CAM_MODES.indexOf(G.camMode) + 1) % CAM_MODES.length];
  G.camPos = null; G.cinePos = null;
  UI.flash(CAM_NAMES[G.camMode], true);
}
function updateCamera(dt) {
  const cam = G.camera, p = G.player.p, W = G.world;
  let mode = G.camMode;
  if (G.state === 'title' || G.state === 'menu') mode = 'title';
  if (G.state === 'locker') mode = 'locker';
  if (G.run && G.run.mode === 'race' && G.run.phase === 'lobby') mode = 'locker';
  let fov = G.settings.fov + clamp((p.speed - 32) * 0.28, -4, 24) + (p.boosting ? 5 : 0);
  if (mode === 'cockpit') {
    cam.position.copy(p.pos).addScaledVector(p.up, -0.55).addScaledVector(p.fwd, -0.4);
    cam.quaternion.copy(p.q);
  } else if (mode === 'chase' || mode === 'far') {
    const far = mode === 'far';
    const dist = (far ? 26 : 12) + p.speed * (far ? 0.08 : 0.05), h = far ? 7 : 3.4;
    _a.copy(WORLD_UP).multiplyScalar(0.65).addScaledVector(p.up, 0.35).normalize();
    _b.copy(p.pos).addScaledVector(p.fwd, -dist).addScaledVector(_a, h);
    if (!G.camPos) G.camPos = _b.clone();
    G.camPos.lerp(_b, 1 - Math.exp(-(far ? 4 : 7) * dt));
    const fl = W.floorAt(G.camPos.x, G.camPos.z) + 2;
    if (G.camPos.y < fl) G.camPos.y = fl;
    // the floor check misses mesas, pillars and canyon walls: slide the camera in toward the glider until it's in clear air
    for (let k = 0; k < 10 && W.clearance(G.camPos.x, G.camPos.y, G.camPos.z).d < 3; k++) G.camPos.lerp(p.pos, 0.3);
    cam.position.copy(G.camPos);
    cam.up.copy(_a);
    cam.lookAt(_c.copy(p.pos).addScaledVector(p.fwd, 30).addScaledVector(_a, far ? 2 : 3));
  } else if (mode === 'cine') {
    if (!G.cinePos || G.cinePos.distanceTo(p.pos) > 240) {
      G.cinePos = p.pos.clone().addScaledVector(p.fwd, 150 + p.speed).add(_a.set((Math.random() - 0.5) * 70, 10 + Math.random() * 20, (Math.random() - 0.5) * 70));
      const fl = W.floorAt(G.cinePos.x, G.cinePos.z) + 6;
      if (G.cinePos.y < fl) G.cinePos.y = fl;
    }
    cam.position.copy(G.cinePos); cam.up.copy(WORLD_UP); cam.lookAt(p.pos);
    fov = clamp(40 * 120 / Math.max(40, cam.position.distanceTo(p.pos)), 18, 60);
  } else if (mode === 'title') {
    const t = performance.now() / 1000;
    _a.set(Math.sin(t * 0.13) * 18, 5 + Math.sin(t * 0.21) * 3, Math.cos(t * 0.13) * 18);
    _b.copy(p.pos).addScaledVector(p.fwd, -14).add(_a);
    if (!G.camPos) G.camPos = _b.clone();
    G.camPos.lerp(_b, 1 - Math.exp(-2 * dt));
    const fl = W.floorAt(G.camPos.x, G.camPos.z) + 3; if (G.camPos.y < fl) G.camPos.y = fl;
    cam.position.copy(G.camPos); cam.up.copy(WORLD_UP); cam.lookAt(p.pos);
    fov = 55;
  } else if (mode === 'locker') {
    const t = performance.now() / 1000;
    const R = G.state === 'locker' ? 13 : 22;
    cam.position.set(p.pos.x + Math.sin(t * 0.35) * R, p.pos.y + 3.5, p.pos.z + Math.cos(t * 0.35) * R);
    cam.up.copy(WORLD_UP);
    // keep the glider in the open right-hand side of the screen when a panel covers the left
    const shift = G.state === 'locker' && G.W > 700 ? 4.8 : 0;
    _a.set(Math.cos(t * 0.35), 0, -Math.sin(t * 0.35)).multiplyScalar(-shift);
    cam.lookAt(_b.copy(p.pos).add(_a));
    fov = 45;
  }
  if (G.shake > 0 || (p.speed > 75 && G.state === 'play')) {
    const s = (G.shake * 1.2 + smooth(75, 120, p.speed) * 0.08) * (G.settings.shake ? 1 : 0);
    cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
    G.shake = Math.max(0, G.shake - dt * 2.5);
  }
  cam.fov = damp(cam.fov, fov, 4, dt);
  cam.updateProjectionMatrix();
}

/* ---------- photo mode ---------- */
function enterPhoto() {
  G.state = 'photo';
  G.photo = { yaw: Math.atan2(-G.player.p.fwd.x, -G.player.p.fwd.z) + Math.PI, pitch: 0.2, dist: 16 };
  grantAch('photo');
  UI.photo(true);
}
function exitPhoto() { G.state = 'play'; UI.photo(false); }
function updatePhotoCam() {
  const ph = G.photo, p = G.player.p, cam = G.camera;
  cam.position.set(p.pos.x + Math.sin(ph.yaw) * Math.cos(ph.pitch) * ph.dist, p.pos.y + Math.sin(ph.pitch) * ph.dist, p.pos.z + Math.cos(ph.yaw) * Math.cos(ph.pitch) * ph.dist);
  cam.up.copy(WORLD_UP); cam.lookAt(p.pos);
  cam.fov = damp(cam.fov, 50, 4, 1 / 60); cam.updateProjectionMatrix();
}

/* ---------- title attract mode: autopilot on a course ---------- */
function startAttract(worldId) {
  const W = loadWorld(worldId || G.save.lastWorld || 'harbor');
  const cdef = COURSE_BY_ID[W.def.id + '-line'];
  const course = getCourse(cdef, W);
  G.attract = { course, idx: 0 };
  if (G.ringGroup) { G.scene.remove(G.ringGroup); G.ringGroup = null; }
  if (G.shardGroup) { G.scene.remove(G.shardGroup); G.shardGroup = null; }
  if (G.ghostMesh) { G.scene.remove(G.ghostMesh); G.ghostMesh = null; }
  placePilot(G.player.p, course.start.pos, course.start.dir);
  G.player.trails.forEach(resetTrail);
  G.camPos = null;
  G.run = null;
  Sfx.setIntensity(0.1);
}
function stepAttract(dt) {
  const A = G.attract, p = G.player.p, W = G.world;
  if (!A) return;
  const r = A.course.rings[A.idx];
  const prev = _c.copy(p.pos);
  const ctl = autopilot(p, r.pos, r.normal, W);
  const hit = flyPilot(p, ctl, dt, W, false);
  if (crossesRing(prev, p.pos, r, 3, true)) {
    if (r.type === 'lift') p.lift = 40;
    if (r.type === 'boost') p.speed += 12;
    p.boost = Math.min(1, p.boost + 0.15);
    A.idx++;
    if (A.idx >= A.course.rings.length) { A.idx = 0; placePilot(p, A.course.start.pos, A.course.start.dir); G.player.trails.forEach(resetTrail); G.camPos = null; }
  } else if (hit || p.pos.distanceTo(r.pos) > 900) {
    const pose = respawnPose(W, A.course, A.idx);
    placePilot(p, pose.pos, pose.dir);
    G.player.trails.forEach(resetTrail); G.camPos = null;
  }
  syncPlayerMesh(dt, 0.8);
}

/* locker: park the glider in clear sky */
function showLocker() {
  G.state = 'locker';
  const p = G.player.p, W = G.world;
  let spot = null;
  for (let i = 0; i < 300 && !spot; i++) {
    const a = i * 2.4, r = i * 6, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = Math.max(W.floorAt(x, z) + 120, W.def.spawnY);
    if (W.clearance(x, y, z).d > 60) spot = new THREE.Vector3(x, y, z);
  }
  placePilot(p, spot || new THREE.Vector3(0, 700, 0), new THREE.Vector3(0, 0, -1));
  G.player.trails.forEach(resetTrail);
}

/* ---------- ring visuals each frame ---------- */
function updateRingVisuals(dt) {
  const run = G.run;
  if (!run || !run.rings.length) return;
  const t = performance.now() / 1000;
  run.rings.forEach((r, i) => {
    if (!r.mesh) return;
    if (r.done) {
      if (r.pop > 0) { r.pop -= dt * 3; r.mesh.scale.setScalar(1 + (1 - r.pop) * 0.6); r.mat.opacity = r.pop * 0.9; if (r.pop <= 0) r.mesh.visible = false; }
      return;
    }
    if (run.mode === 'attack') {
      r.mesh.visible = true;
      if (r.mesh.scale.x < 1) r.mesh.scale.setScalar(Math.min(1, r.mesh.scale.x + dt * 2));
      r.mat.opacity = 0.85;
      if (r.type === 'gold') r.mesh.rotation.z += dt * 1.5;
      return;
    }
    const k = i - run.next;
    r.mesh.visible = k >= 0 && k < 6;
    if (k === 0) { r.mat.opacity = 0.95; r.mesh.scale.setScalar(1 + Math.sin(t * 6) * 0.04); r.mat.color.copy(r.base); r.disc.material.opacity = 0.14; }
    else { r.mat.opacity = Math.max(0.18, 0.6 - k * 0.1); r.mesh.scale.setScalar(1); r.mat.color.copy(r.base).lerp(_col.set('#ffffff'), 0.3); r.disc.material.opacity = 0.04; }
  });
}
