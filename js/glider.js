'use strict';
/* Flung8 — glider meshes, flight model and wingtip trails. */

const FRAME_SHAPES = {
  falcon: { S: 5.0, z0: -3.0, zt: 1.1, z1: 1.3, ztt: 1.7, dih: 0.1, curve: 1, fin: 1.1 },
  kite: { S: 6.2, z0: -2.5, zt: 0.5, z1: 1.6, ztt: 1.6, dih: 0.15, curve: 1, fin: 0.9 },
  manta: { S: 4.7, z0: -3.1, zt: 0.6, z1: 1.0, ztt: 0.9, dih: 0.06, curve: 0.55, fin: 0.6 },
  swift: { S: 4.0, z0: -3.7, zt: 2.0, z1: 1.5, ztt: 2.4, dih: 0.04, curve: 1.2, fin: 1.3, winglet: true },
  phoenix: { S: 5.3, z0: -3.4, zt: 1.7, z1: 0.9, ztt: 2.8, dih: 0.12, curve: 0.8, fin: 1.2, winglet: true }
};
const STATIONS = [0, 0.16, 0.38, 0.62, 0.82, 1];

function regionColor(pat, side, s, A, B) {
  // side: -1 left, 1 right; s: 0 root .. 1 tip
  switch (pat) {
    case 'stripe': return s < 0.17 ? B : A;
    case 'tips': return s > 0.78 ? B : A;
    case 'chevron': return s > 0.3 && s < 0.65 ? B : A;
    case 'split': return side < 0 ? (s > 0.17 ? B : A) : A;
  }
  return A;
}

function buildGliderMesh(frameId, paintId, opts = {}) {
  const sh = FRAME_SHAPES[frameId] || FRAME_SHAPES.falcon;
  const paint = PAINT_BY_ID[paintId] || PAINTS[0];
  const A = new THREE.Color(paint.a), B = new THREE.Color(paint.b);
  const pos = [], col = [];
  const pt = (side, s, lead) => {
    const x = side * s * sh.S;
    const y = s * sh.S * sh.dih + (lead ? 0.12 : 0);
    const ls = Math.pow(s, sh.curve);
    const z = lead ? lerp(sh.z0, sh.zt, ls) : lerp(sh.z1, sh.ztt, s) - (frameId === 'manta' ? Math.sin(s * Math.PI) * 0.6 : 0) + (frameId === 'phoenix' && s > 0.3 && s < 0.9 ? Math.sin((s - 0.3) * 10) * 0.35 : 0);
    return [x, y, z];
  };
  const push = (a, b, c, color) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b); };
  for (const side of [-1, 1]) {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const s0 = STATIONS[i], s1 = STATIONS[i + 1];
      const l0 = pt(side, s0, true), l1 = pt(side, s1, true), t0 = pt(side, s0, false), t1 = pt(side, s1, false);
      const c = regionColor(paint.pat, side, (s0 + s1) / 2, A, B);
      if (side > 0) { push(l0, t0, l1, c); push(l1, t0, t1, c); } else { push(l0, l1, t0, c); push(l1, t1, t0, c); }
    }
  }
  // keel fin
  const fc = B;
  push([0, 0.1, 0.2], [0, 0.1 + sh.fin, sh.z1 + 0.3], [0, 0.1, sh.z1 + 0.2], fc);
  if (sh.winglet) for (const side of [-1, 1]) {
    const tip = pt(side, 1, false), tl = pt(side, 1, true);
    push([tip[0], tip[1], tip[2]], [tl[0], tl[1], tl[2]], [tip[0], tip[1] + 0.8, tip[2] + 0.2], B);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05, transparent: !!opts.ghost, opacity: opts.ghost ? 0.38 : 1, depthWrite: !opts.ghost });
  const grp = new THREE.Group();
  const wing = new THREE.Mesh(g, mat);
  grp.add(wing);
  // pilot pod
  const podMat = new THREE.MeshStandardMaterial({ color: opts.ghost ? '#ffffff' : '#2b2f3a', flatShading: true, transparent: !!opts.ghost, opacity: opts.ghost ? 0.3 : 1, depthWrite: !opts.ghost });
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 2.0, 6), podMat);
  pod.rotation.x = Math.PI / 2; pod.position.set(0, -0.85, 0.2);
  grp.add(pod);
  const helm = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: paint.a, flatShading: true, transparent: !!opts.ghost, opacity: opts.ghost ? 0.3 : 1 }));
  helm.position.set(0, -0.85, -0.9);
  grp.add(helm);
  // control struts
  const strutMat = new THREE.LineBasicMaterial({ color: '#cfd6e0', transparent: true, opacity: opts.ghost ? 0.3 : 0.8 });
  const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.4), new THREE.Vector3(-0.7, -1.2, -0.3), new THREE.Vector3(0.7, -1.2, -0.3), new THREE.Vector3(0, 0, -0.4)]);
  grp.add(new THREE.Line(sg, strutMat));
  grp.userData.tipL = new THREE.Vector3(-sh.S, sh.S * sh.dih, lerp(sh.zt, sh.ztt, 0.5));
  grp.userData.tipR = new THREE.Vector3(sh.S, sh.S * sh.dih, lerp(sh.zt, sh.ztt, 0.5));
  grp.userData.paint = paint;
  return grp;
}

/* ---------- flight model ---------- */
const V_FWD = new THREE.Vector3(0, 0, -1), V_UP = new THREE.Vector3(0, 1, 0), V_RIGHT = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function makePilot(frameId) {
  return {
    frame: FRAME_BY_ID[frameId] || FRAMES[0],
    pos: new THREE.Vector3(), q: new THREE.Quaternion(), vel: new THREE.Vector3(),
    fwd: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0),
    speed: 34, boost: 1, wp: 0, wr: 0, wy: 0,
    lift: 0, stall: 0, inThermal: false, clear: 999, clearKind: 'ground',
    boosting: false, braking: false, alive: true, crashT: 0, oob: 0, bank: 0
  };
}

function placePilot(p, pos, dir) {
  p.pos.copy(pos);
  const yaw = Math.atan2(-dir.x, -dir.z);
  const pitch = Math.asin(clamp(dir.y / (dir.length() || 1), -1, 1));
  _e.set(pitch, yaw, 0, 'YXZ');
  p.q.setFromEuler(_e);
  p.speed = 36; p.wp = p.wr = p.wy = 0; p.lift = 0; p.alive = true; p.crashT = 0; p.stall = 0;
  updateAxes(p);
  p.vel.copy(p.fwd).multiplyScalar(p.speed);
}

function updateAxes(p) {
  p.fwd.copy(V_FWD).applyQuaternion(p.q);
  p.up.copy(V_UP).applyQuaternion(p.q);
  p.right.copy(V_RIGHT).applyQuaternion(p.q);
}

const MAX_BANK = 0.52, TURN_RATE = 0.9, MAX_PITCH = 1.22; // ~30° visual bank; heading rad/s; ~70° climb/dive limit
/* ctl: {pitch, roll, yaw, boost, brake}; pitch + = nose up, roll + = steer right, yaw + = free roll left */
function flyPilot(p, ctl, dt, W, assist) {
  const F = p.frame;
  updateAxes(p);
  p.stall = smooth(F.stall + 5, F.stall - 2, p.speed);
  const auth = lerp(1, 0.4, p.stall) * (ctl.brake ? 1.15 : 1);
  let tPitch = ctl.pitch * F.pitch * auth;
  const steer = ctl.roll, spin = -ctl.yaw; // A/D steer the heading; Q/E free roll (Q = left) for barrel rolls
  const bank = Math.asin(clamp(-p.right.y, -1, 1)); // + when banked right
  p.bank = bank;
  // bank is cosmetic: it follows the steer input and never passes MAX_BANK, so A/D can't flip the wing over
  // full-range roll angle (±180), so after a Q/E roll or when upside down it rolls back the short way
  const rollA = Math.atan2(-p.right.y, p.up.y);
  // steering style (Settings / T key): 'bank' = hold longer to bank steeper and turn harder,
  // 'roll' = A/D roll freely all the way round, 'sharp' = 30° look with a tighter turn; none (autopilot) = base
  const mode = ctl.mode;
  if (Math.abs(steer) > 0.1 && Math.sign(steer) === Math.sign(p.steerDir || 0)) p.steerT = (p.steerT || 0) + dt;
  else { p.steerT = 0; p.steerDir = Math.abs(steer) > 0.1 ? Math.sign(steer) : 0; }
  const ramp = mode === 'bank' ? smooth(0.25, 1.4, p.steerT) : 0;
  const maxBank = lerp(MAX_BANK, 1.4, ramp); // up to ~80°
  const turnK = mode === 'sharp' ? 1.55 : mode === 'roll' ? 1.3 : lerp(1, 2, ramp);
  let tRoll;
  if (Math.abs(spin) > 0.08) tRoll = spin * F.roll * auth;
  else if (mode === 'roll' && Math.abs(steer) > 0.1) tRoll = steer * F.roll * auth;
  else tRoll = clamp((steer * maxBank - rollA) * 5, -F.roll, F.roll);
  if (assist && Math.abs(ctl.pitch) < 0.08 && p.up.y > 0.4 && Math.abs(p.fwd.y) < 0.5) tPitch += -p.fwd.y * 0.35;
  // a stalled wing drops its nose
  if (p.stall > 0 && p.fwd.y > -0.7) tPitch -= p.stall * 1.3;
  // W/S climb and dive stop at MAX_PITCH, so holding them can't carry the nose over into a loop
  const pa = Math.asin(clamp(p.fwd.y, -1, 1));
  tPitch *= clamp((MAX_PITCH - pa * Math.sign(tPitch)) / 0.25, 0, 1);
  if (Math.abs(pa) > MAX_PITCH && p.wp * pa > 0) p.wp = 0;
  p.wp = damp(p.wp, tPitch, 9, dt);
  p.wr = damp(p.wr, tRoll, 11, dt);
  _e.set(p.wp * dt, 0, -p.wr * dt, 'XYZ');
  _q.setFromEuler(_e);
  p.q.multiply(_q);
  // steering turns the heading about world up, same direction whatever the bank (D = right)
  const turn = -steer * TURN_RATE * turnK * (1 - p.stall * 0.6) * (ctl.brake ? 1.35 : 1);
  _q.setFromAxisAngle(V_UP, turn * dt);
  p.q.premultiply(_q);
  p.q.normalize();
  updateAxes(p);

  // energy: diving gains speed, climbing spends it
  let acc = -9.81 * p.fwd.y - 0.0007 * F.drag * p.speed * p.speed;
  p.boosting = false;
  if (ctl.boost && p.boost > 0.01) { acc += 17 * F.boost; p.boost = Math.max(0, p.boost - 0.26 * dt); p.boosting = true; }
  if (ctl.brake) acc -= p.speed * 0.55;
  if (p.speed < 22) acc += (22 - p.speed) * 0.25 * (1 - p.stall); // a little float at the bottom end
  p.speed = clamp(p.speed + acc * dt, 6, 150);
  p.braking = !!ctl.brake;

  p.vel.copy(p.fwd).multiplyScalar(p.speed);
  // sink when slow or stalled
  p.vel.y -= p.stall * 14 + Math.max(0, 20 - p.speed) * 0.25;
  // thermals
  p.inThermal = false;
  for (const t of W.thermals) {
    const d = Math.hypot(p.pos.x - t.x, p.pos.z - t.z);
    if (d < t.r && p.pos.y > t.y0 - 20 && p.pos.y < t.y1) {
      const k = (1 - (d / t.r) * (d / t.r)) * smooth(t.y1, t.y1 - 80, p.pos.y);
      p.vel.y += t.str * k * F.lift;
      p.boost = Math.min(1, p.boost + 0.07 * dt);
      p.inThermal = true;
    }
  }
  // lift rings and other impulses
  if (p.lift > 0.01) { p.vel.y += p.lift; p.lift = damp(p.lift, 0, 0.9, dt); }
  p.vel.add(W.wind);
  p.pos.addScaledVector(p.vel, dt);
  // keep inside the world: steer softly back toward the middle
  const edge = Math.max(Math.abs(p.pos.x), Math.abs(p.pos.z));
  p.oob = smooth(WORLD_HALF - 220, WORLD_HALF - 60, edge);
  if (p.oob > 0) {
    const want = Math.atan2(p.pos.x, p.pos.z); // heading toward the centre
    const cur = Math.atan2(-p.fwd.x, -p.fwd.z);
    const diff = wrapAngle(want - cur);
    _q.setFromAxisAngle(V_UP, clamp(diff, -1, 1) * p.oob * 1.4 * dt);
    p.q.premultiply(_q);
  }
  if (p.pos.y > 1400) p.pos.y = 1400;
  const c = W.clearance(p.pos.x, p.pos.y, p.pos.z);
  p.clear = c.d; p.clearKind = c.kind;
  return c.d < 0.9;
}

/* ---------- wingtip trails ---------- */
function makeTrail(colors, len = 70) {
  const n = len;
  const pos = new Float32Array(n * 2 * 3), alpha = new Float32Array(n * 2), colA = new Float32Array(n * 2 * 3);
  const idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  g.setAttribute('tcol', new THREE.BufferAttribute(colA, 3));
  g.setIndex(idx);
  const cs = colors.map(c => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1) * (cs.length - 1), k = Math.floor(f), t = f - k;
    _col.copy(cs[k]).lerp(cs[Math.min(k + 1, cs.length - 1)], t);
    for (let s = 0; s < 2; s++) { colA[(i * 2 + s) * 3] = _col.r; colA[(i * 2 + s) * 3 + 1] = _col.g; colA[(i * 2 + s) * 3 + 2] = _col.b; }
  }
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { gain: { value: 1 } },
    vertexShader: 'attribute float alpha; attribute vec3 tcol; varying float vA; varying vec3 vC; void main(){ vA = alpha; vC = tcol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float gain; varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA * gain); }'
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return { mesh, n, pts: [], width: 0.16 };
}
function pushTrail(tr, p, side, strength) {
  tr.pts.unshift({ x: p.x, y: p.y, z: p.z, sx: side.x, sy: side.y, sz: side.z, s: strength });
  if (tr.pts.length > tr.n) tr.pts.pop();
  const pos = tr.mesh.geometry.attributes.position.array, al = tr.mesh.geometry.attributes.alpha.array;
  for (let i = 0; i < tr.n; i++) {
    const q = tr.pts[Math.min(i, tr.pts.length - 1)];
    if (!q) continue;
    const w = tr.width * (1 + i * 0.015);
    pos[i * 6] = q.x - q.sx * w; pos[i * 6 + 1] = q.y - q.sy * w; pos[i * 6 + 2] = q.z - q.sz * w;
    pos[i * 6 + 3] = q.x + q.sx * w; pos[i * 6 + 4] = q.y + q.sy * w; pos[i * 6 + 5] = q.z + q.sz * w;
    const a = i < tr.pts.length ? Math.pow(1 - i / tr.n, 1.5) * q.s * 0.6 : 0;
    al[i * 2] = a; al[i * 2 + 1] = a;
  }
  tr.mesh.geometry.attributes.position.needsUpdate = true;
  tr.mesh.geometry.attributes.alpha.needsUpdate = true;
}
function resetTrail(tr) { tr.pts.length = 0; const al = tr.mesh.geometry.attributes.alpha.array; al.fill(0); tr.mesh.geometry.attributes.alpha.needsUpdate = true; }

function trailColors(trailId, paintId) {
  const t = TRAIL_BY_ID[trailId] || TRAILS[0];
  if (!t.colors) { const p = PAINT_BY_ID[paintId] || PAINTS[0]; return [p.a, p.b]; }
  return t.colors;
}

/* name tag sprite for other pilots */
function makeNameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 30px Manrope, system-ui, sans-serif';
  const w = Math.min(240, g.measureText(text).width + 30);
  g.fillStyle = 'rgba(12,16,32,0.72)';
  const x = (256 - w) / 2;
  g.beginPath(); g.moveTo(x + 14, 8); g.lineTo(x + w - 14, 8); g.quadraticCurveTo(x + w, 8, x + w, 22); g.lineTo(x + w, 42); g.quadraticCurveTo(x + w, 56, x + w - 14, 56); g.lineTo(x + 14, 56); g.quadraticCurveTo(x, 56, x, 42); g.lineTo(x, 22); g.quadraticCurveTo(x, 8, x + 14, 8); g.fill();
  g.fillStyle = color; g.fillRect(x + 12, 28, 8, 8);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText(text, x + 26, 33);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  s.scale.set(16, 4, 1);
  s.renderOrder = 10;
  return s;
}
