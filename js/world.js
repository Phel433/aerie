'use strict';
/* Flung8 — world building: terrain, water, sky, clouds, props, colliders, thermals, shards. */

const WORLD_SIZE = 3200;
const WORLD_HALF = WORLD_SIZE / 2;
const GRID_N = 200;
const GRID_CELL = WORLD_SIZE / GRID_N;

const _col = new THREE.Color();
const _col2 = new THREE.Color();

function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)')); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}
let GLOW_TEX = null;
function glowTex() { if (!GLOW_TEX) GLOW_TEX = glowTexture(); return GLOW_TEX; }

/* ---------- height functions per world kind ---------- */
function makeHeightFn(kind, n) {
  const edge = (x, z, amt) => {
    const d = Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF;
    return smooth(0.8, 1.0, d) * amt;
  };
  switch (kind) {
    case 'islands':
      return () => -60;
    case 'canyon':
      return (x, z) => {
        const base = 220 + 50 * n.fbm(x * 0.0009, z * 0.0009, 3);
        const wx = x + 220 * n(x * 0.0011 + 50, z * 0.0011), wz = z + 220 * n(x * 0.0011, z * 0.0011 + 90);
        const r = Math.abs(n.fbm(wx * 0.00095, wz * 0.00095, 3));
        const r2 = Math.abs(n.fbm(wx * 0.0019 + 7, wz * 0.0019 - 3, 2));
        const c1 = smooth(0.03, 0.2, r), c2 = smooth(0.02, 0.12, r2);
        let h = lerp(12, base, Math.min(c1, lerp(1, c2, 0.75)));
        const step = 36, tq = Math.floor(h / step) * step, f = (h - tq) / step;
        const terr = tq + step * (f * f * f * (f * (f * 6 - 15) + 10));
        h = lerp(h, terr, 0.7);
        h += 4 * n(x * 0.007, z * 0.007);
        return h + edge(x, z, 420);
      };
    case 'peaks':
      return (x, z) => {
        const r = n.ridged(x * 0.00068, z * 0.00068, 5);
        let h = 30 + 660 * Math.pow(r, 1.7) + 50 * n.fbm(x * 0.003, z * 0.003, 3);
        return h + edge(x, z, 500);
      };
    case 'bay':
      return (x, z) => {
        const f = n.fbm(x * 0.0012, z * 0.0012, 5) + 0.18 * n(x * 0.0004, z * 0.0004);
        let h = (f - 0.1) * 520;
        if (h > 0) h = h * (0.6 + 0.4 * smooth(0, 60, h)) + 6 * n(x * 0.03, z * 0.03);
        return Math.max(h, -40);
      };
    case 'storm':
      return (x, z) => {
        let h = 70 + 150 * n.fbm(x * 0.0008, z * 0.0008, 4) + 25 * n(x * 0.005, z * 0.005);
        const tor = Math.max(0, n(x * 0.0026 + 30, z * 0.0026 - 11) - 0.55) * 520;
        return h + tor + edge(x, z, 380);
      };
    case 'fjord':
      return (x, z) => {
        const wx = x + 160 * n(x * 0.001 + 20, z * 0.001), wz = z + 160 * n(x * 0.001, z * 0.001 + 40);
        const c = Math.abs(n.fbm(wx * 0.0008, wz * 0.0008, 3));
        const cliff = smooth(0.05, 0.13, c);
        const top = 250 + 220 * n.fbm(x * 0.0016, z * 0.0016, 4) + 140 * Math.pow(n.ridged(x * 0.0012, z * 0.0012, 3), 2);
        const h = lerp(-25, top, cliff);
        return h + edge(x, z, 300);
      };
    case 'spires':
      return (x, z) => {
        const h = 22 + 55 * n.fbm(x * 0.0014, z * 0.0014, 4) + 8 * n(x * 0.01, z * 0.01);
        return h + edge(x, z, 360);
      };
  }
  return () => 0;
}

/* ---------- world construction ---------- */
function buildWorld(def, quality) {
  const seed = hashStr(def.id + ':world');
  const rnd = RNG(seed);
  const noise = makeNoise(seed);
  const hf = makeHeightFn(def.kind, noise);
  const N = GRID_N, V = N + 1;
  const heights = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) heights[j * V + i] = hf(-WORLD_HALF + i * GRID_CELL, -WORLD_HALF + j * GRID_CELL);

  const W = {
    def, heights, colliders: [], thermals: [], shards: [], gates: [], anim: [],
    group: new THREE.Group(), skyGroup: new THREE.Group(),
    waterLevel: def.water ? def.water.level : -Infinity,
    softFloor: def.kind === 'islands' ? 6 : -Infinity,
    time: 0, wind: new THREE.Vector3(), windTarget: new THREE.Vector3(), gustT: 0,
    lightning: 0, lightningCool: 6
  };

  W.heightAt = (x, z) => {
    const gx = clamp((x + WORLD_HALF) / GRID_CELL, 0, N - 0.0001), gz = clamp((z + WORLD_HALF) / GRID_CELL, 0, N - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const h00 = heights[j * V + i], h10 = heights[j * V + i + 1], h01 = heights[(j + 1) * V + i], h11 = heights[(j + 1) * V + i + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  };
  W.floorAt = (x, z) => Math.max(W.heightAt(x, z), W.waterLevel, W.softFloor);
  W.slopeAt = (x, z) => {
    const e = 6;
    const dx = W.heightAt(x + e, z) - W.heightAt(x - e, z), dz = W.heightAt(x, z + e) - W.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  };

  /* clearance from a point to the nearest solid thing; negative = inside */
  W.clearance = (x, y, z) => {
    let best = y - W.floorAt(x, z), kind = 'ground';
    if (y - W.heightAt(x, z) > y - W.waterLevel && W.waterLevel > -1e5 && W.waterLevel >= W.heightAt(x, z)) kind = 'water';
    if (W.softFloor > -1e5 && W.heightAt(x, z) < W.softFloor) kind = 'cloud';
    for (let k = 0; k < W.colliders.length; k++) {
      const c = W.colliders[k];
      let d;
      if (c.t === 'sphere') {
        d = Math.hypot(x - c.x, y - c.y, z - c.z) - c.r;
      } else {
        const dh = Math.hypot(x - c.x, z - c.z);
        if (dh > c.r + best + 4 && best > 0) continue;
        if (c.t === 'cyl') {
          const rr = lerp(c.r, c.r1 == null ? c.r : c.r1, clamp((y - c.y0) / (c.y1 - c.y0), 0, 1));
          if (y > c.y1) d = dh < rr ? y - c.y1 : Math.hypot(dh - rr, y - c.y1);
          else if (y < c.y0) d = dh < rr ? c.y0 - y : Math.hypot(dh - rr, c.y0 - y);
          else d = dh - rr;
        } else { // island cone: flat top, tapering underside
          if (y > c.top) d = dh < c.r ? y - c.top : Math.hypot(dh - c.r, y - c.top);
          else if (y < c.bottom) d = Math.hypot(dh, c.bottom - y);
          else d = dh - c.r * Math.pow((y - c.bottom) / (c.top - c.bottom), 0.75);
        }
      }
      if (d < best) { best = d; kind = 'object'; }
    }
    return { d: best, kind };
  };
  W.inBounds = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < WORLD_HALF - 120;

  buildTerrain(W, def);
  buildWater(W, def, quality);
  buildSky(W, def);
  buildClouds(W, def, rnd, quality);
  buildFeatures(W, def, rnd, noise, quality);
  buildTrees(W, def, rnd, quality);
  buildThermals(W, def, rnd);
  placeShards(W, def, rnd);
  buildLights(W, def);
  if (def.rain) buildRain(W);
  return W;
}

function buildTerrain(W, def) {
  if (def.kind === 'islands') return;
  const V = GRID_N + 1;
  const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = j * V + i;
    pos[k * 3] = -WORLD_HALF + i * GRID_CELL; pos[k * 3 + 1] = W.heights[k]; pos[k * 3 + 2] = -WORLD_HALF + j * GRID_CELL;
  }
  const idx = new Uint32Array(GRID_N * GRID_N * 6);
  let p = 0;
  for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
    const v00 = j * V + i, v10 = v00 + 1, v01 = v00 + V, v11 = v01 + 1;
    idx[p++] = v00; idx[p++] = v01; idx[p++] = v10;
    idx[p++] = v10; idx[p++] = v01; idx[p++] = v11;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal.array;
  const L = def.land;
  const cLow = new THREE.Color(L.low), cMid = new THREE.Color(L.mid), cHigh = new THREE.Color(L.high), cPeak = new THREE.Color(L.peak), cCliff = new THREE.Color(L.cliff);
  const bands = {
    canyon: [20, 90, 180, 260], peaks: [40, 160, 330, 430], bay: [4, 30, 90, 170], storm: [40, 120, 220, 330],
    fjord: [5, 90, 260, 360], spires: [15, 45, 80, 140]
  }[def.kind] || [20, 80, 160, 260];
  const jitter = RNG(hashStr(def.id + 'jit'));
  for (let k = 0; k < V * V; k++) {
    const h = pos[k * 3 + 1], ny = nrm[k * 3 + 1];
    if (h < bands[0]) _col.copy(cLow);
    else if (h < bands[1]) _col.copy(cLow).lerp(cMid, smooth(bands[0], bands[1], h));
    else if (h < bands[2]) _col.copy(cMid).lerp(cHigh, smooth(bands[1], bands[2], h));
    else _col.copy(cHigh).lerp(cPeak, smooth(bands[2], bands[3], h));
    const steep = smooth(0.82, 0.55, ny);
    if (def.kind === 'peaks' && h > bands[2]) _col.lerp(cCliff, steep * 0.6); else _col.lerp(cCliff, steep);
    const jv = 0.92 + jitter() * 0.14;
    col[k * 3] = _col.r * jv; col[k * 3 + 1] = _col.g * jv; col[k * 3 + 2] = _col.b * jv;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  W.group.add(mesh);
  W.terrain = mesh;
}

function buildWater(W, def, quality) {
  if (def.kind === 'islands') {
    // a sea of cloud below the islands
    const g = new THREE.PlaneGeometry(WORLD_SIZE * 2.2, WORLD_SIZE * 2.2, 60, 60);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: def.cloudSea, roughness: 1, flatShading: true, emissive: new THREE.Color('#9fb8d0'), emissiveIntensity: 0.25 });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = -2;
    W.group.add(mesh);
    W.water = { mesh, base: g.attributes.position.array.slice(), amp: 5, speed: 0.25, scale: 0.006 };
    return;
  }
  if (!def.water) return;
  const seg = quality === 'low' ? 40 : 72;
  const g = new THREE.PlaneGeometry(WORLD_SIZE * 2.2, WORLD_SIZE * 2.2, seg, seg);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshPhongMaterial({ color: def.water.color, shininess: 90, specular: new THREE.Color('#ffffff').multiplyScalar(0.55), flatShading: true, transparent: true, opacity: 0.92 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = def.water.level;
  W.group.add(mesh);
  W.water = { mesh, base: g.attributes.position.array.slice(), amp: def.kind === 'storm' ? 1.6 : 0.9, speed: def.kind === 'storm' ? 1.2 : 0.7, scale: 0.012 };
}

function buildSky(W, def) {
  const g = new THREE.SphereGeometry(5200, 32, 18);
  const sd = new THREE.Vector3(...def.sun.dir).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(def.sky.top) }, mid: { value: new THREE.Color(def.sky.mid) }, bottom: { value: new THREE.Color(def.sky.bottom) },
      sunDir: { value: sd }, sunCol: { value: new THREE.Color(def.sun.color) }, night: { value: def.night ? 1 : 0 }
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night;',
      'varying vec3 vDir;',
      'void main(){',
      ' float h = vDir.y;',
      ' vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*1.6,0.0,1.0),0.8)) : mix(mid, bottom, clamp(-h*5.0,0.0,1.0));',
      ' float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);',
      ' float disc = smoothstep(0.9985, 0.9992, s);',
      ' c += sunCol * (pow(s, 12.0) * 0.35 + pow(s, 200.0) * 0.6) * (1.0 - night*0.6);',
      ' c = mix(c, sunCol * (night > 0.5 ? 0.95 : 1.4), disc);',
      ' gl_FragColor = vec4(c, 1.0);',
      '}'
    ].join('\n')
  });
  const sky = new THREE.Mesh(g, mat);
  sky.renderOrder = -10;
  W.skyGroup.add(sky);
  W.skyMat = mat;
  if (def.night) {
    const n = 1400, pos = new Float32Array(n * 3), r = RNG(77);
    for (let i = 0; i < n; i++) {
      const u = r() * TAU, v = Math.acos(r() * 0.95);
      pos[i * 3] = Math.sin(v) * Math.cos(u) * 5000; pos[i * 3 + 1] = Math.cos(v) * 5000; pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 5000;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
    W.skyGroup.add(stars);
    // aurora ribbons
    W.auroras = [];
    for (let a = 0; a < 3; a++) {
      const segs = 80, w = 2600, hgt = 520;
      const ag = new THREE.PlaneGeometry(w, hgt, segs, 1);
      const am = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { t: { value: 0 }, off: { value: a * 3.1 } },
        vertexShader: 'uniform float t; uniform float off; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x*0.003 + t*0.3 + off)*220.0 + sin(p.x*0.0071 - t*0.2)*90.0; p.y += sin(p.x*0.004 + t*0.5 + off)*40.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
        fragmentShader: 'uniform float t; uniform float off; varying vec2 vUv; void main(){ float f = pow(vUv.y, 1.6) * (1.0 - smoothstep(0.85, 1.0, vUv.y)); float band = 0.55 + 0.45*sin(vUv.x*40.0 + t*1.3 + off); vec3 c = mix(vec3(0.1,1.0,0.6), vec3(0.6,0.3,1.0), vUv.y); float edge = smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x); gl_FragColor = vec4(c, f*band*0.38*edge); }'
      });
      const am2 = new THREE.Mesh(ag, am);
      am2.position.set(-600 + a * 700, 1000 + a * 120, -1400 + a * 500);
      am2.rotation.y = 0.4 - a * 0.35;
      W.skyGroup.add(am2);
      W.auroras.push(am);
    }
    // moon
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(235,242,255,1)', 'rgba(200,220,255,0)', 128), fog: false, depthWrite: false, transparent: true }));
    const md = new THREE.Vector3(...def.sun.dir).normalize().multiplyScalar(4600);
    moon.position.copy(md); moon.scale.set(700, 700, 1);
    W.skyGroup.add(moon);
  }
}

function buildClouds(W, def, rnd, quality) {
  const count = (quality === 'low' ? 40 : quality === 'high' ? 110 : 75) * (def.kind === 'storm' ? 1.4 : 1) | 0;
  const puffs = [];
  for (let c = 0; c < count; c++) {
    const cx = rnd.range(-WORLD_HALF * 1.1, WORLD_HALF * 1.1), cz = rnd.range(-WORLD_HALF * 1.1, WORLD_HALF * 1.1);
    let cy = def.kind === 'islands' ? (rnd() < 0.55 ? rnd.range(-15, 25) : rnd.range(650, 950)) : rnd.range(560, 950);
    if (def.kind === 'storm') cy = rnd.range(380, 700);
    if (def.kind === 'peaks') cy = rnd.range(650, 1000);
    const n = rnd.int(4, 9), size = rnd.range(30, 70) * (def.kind === 'islands' && cy < 40 ? 1.6 : 1);
    for (let i = 0; i < n; i++) {
      puffs.push({ x: cx + rnd.range(-1.6, 1.6) * size, y: cy + rnd.range(-0.3, 0.5) * size, z: cz + rnd.range(-1, 1) * size, s: size * rnd.range(0.55, 1.1) });
    }
  }
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const col = def.night ? '#3a4a66' : def.kind === 'storm' ? '#6a7484' : '#ffffff';
  const mat = new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 1, emissive: new THREE.Color(def.night ? '#0a1424' : def.sky.mid), emissiveIntensity: def.night ? 0.6 : 0.28 });
  // clouds dissolve near the camera (screen-door fade, no transparency sorting), so flying through one never blanks the screen
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\n float cFade = smoothstep(15.0, 60.0, length(vViewPosition));\n if (cFade < 1.0 && cFade < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, puffs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  puffs.forEach((pf, i) => {
    p.set(pf.x, pf.y, pf.z); s.set(pf.s, pf.s * 0.62, pf.s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * TAU);
    m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  W.group.add(mesh);
  W.clouds = mesh;
}

/* ---------- islands, ruins, spires, lighthouses, arches, windmills ---------- */
function islandGeometry(list, def, rnd, style) {
  const pos = [], col = [];
  const L = def.land;
  const top = new THREE.Color(style === 'ruin' ? '#b8b29a' : L.mid), rim = new THREE.Color(style === 'ruin' ? '#9a957f' : L.high), under = new THREE.Color(style === 'ruin' ? '#7d7868' : L.under), cliff = new THREE.Color(L.cliff);
  const tri = (a, b, c, color) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const j = 0.9 + rnd() * 0.18;
    for (let i = 0; i < 3; i++) col.push(color.r * j, color.g * j, color.b * j);
  };
  for (const isl of list) {
    const seg = style === 'ruin' ? 6 : 14;
    const rings = [];
    const levels = style === 'ruin' ? [0, 0.15, 1] : [0, 0.12, 0.45, 0.8, 1];
    for (let li = 0; li < levels.length; li++) {
      const t = levels[li];
      const ring = [];
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * TAU + isl.rot;
        let rr = isl.r * (li === 0 ? 1 : Math.pow(1 - t, 0.75 * 1.0)) * (style === 'ruin' ? 1 : 0.85 + rnd() * 0.3);
        if (li === levels.length - 1) rr = 0;
        const y = isl.top - t * (isl.top - isl.bottom) + (li === 0 && style !== 'ruin' ? rnd.range(-2, 3) : 0);
        ring.push([isl.x + Math.cos(a) * rr, y, isl.z + Math.sin(a) * rr]);
      }
      rings.push(ring);
    }
    // top cap with a gentle dome
    const c = [isl.x, isl.top + (style === 'ruin' ? 0 : isl.r * 0.06), isl.z];
    for (let s = 0; s < seg; s++) {
      const a = rings[0][s], b = rings[0][(s + 1) % seg];
      tri(c, b, a, top);
    }
    for (let li = 0; li < rings.length - 1; li++) {
      const A = rings[li], B = rings[li + 1];
      const cc = li === 0 ? rim : li === 1 ? cliff : under;
      for (let s = 0; s < seg; s++) {
        const a0 = A[s], a1 = A[(s + 1) % seg], b0 = B[s], b1 = B[(s + 1) % seg];
        tri(a0, a1, b0, cc);
        tri(a1, b1, b0, cc);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function addIslands(W, def, rnd, count, style) {
  const list = [];
  let tries = 0;
  while (list.length < count && tries++ < 4000) {
    const r = style === 'ruin' ? rnd.range(14, 40) : rnd.range(32, 115);
    const x = rnd.range(-WORLD_HALF + 200, WORLD_HALF - 200), z = rnd.range(-WORLD_HALF + 200, WORLD_HALF - 200);
    const topY = style === 'ruin' ? W.heightAt(x, z) + rnd.range(90, 260) : rnd.range(70, 400);
    if (list.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r + 70)) continue;
    if (Math.hypot(x, z) < 160) continue; // keep spawn open
    if (style === 'ruin' && W.colliders.some(o => o.t === 'cyl' && Math.hypot(o.x - x, o.z - z) < o.r + r + 30)) continue;
    const bottom = topY - r * rnd.range(0.9, 1.5) * (style === 'ruin' ? 0.7 : 1);
    list.push({ x, z, r, top: topY, bottom, rot: rnd() * TAU });
  }
  const g = islandGeometry(list, def, rnd, style);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  W.group.add(mesh);
  for (const i of list) W.colliders.push({ t: 'cone', x: i.x, z: i.z, r: i.r, top: i.top, bottom: i.bottom, island: true });
  return list;
}

function buildFeatures(W, def, rnd, noise, quality) {
  const stoneMat = new THREE.MeshStandardMaterial({ color: def.land.cliff, flatShading: true, roughness: 1 });
  if (def.kind === 'islands') {
    W.islands = addIslands(W, def, rnd, 48, 'island');
    // windmills on some islands
    const towerG = new THREE.CylinderGeometry(2.2, 3.2, 26, 6);
    const bladeG = new THREE.BoxGeometry(1.2, 22, 0.4); bladeG.translate(0, 11, 0);
    const wm = new THREE.MeshStandardMaterial({ color: '#f4efe6', flatShading: true });
    const bm = new THREE.MeshStandardMaterial({ color: '#d0643a', flatShading: true });
    W.islands.filter((_, i) => i % 5 === 0).forEach(isl => {
      const t = new THREE.Mesh(towerG, wm);
      const x = isl.x + isl.r * 0.35, z = isl.z;
      t.position.set(x, isl.top + 13 + isl.r * 0.04, z);
      W.group.add(t);
      const hub = new THREE.Group(); hub.position.set(x, isl.top + 25 + isl.r * 0.04, z + 3.5);
      for (let b = 0; b < 4; b++) { const bl = new THREE.Mesh(bladeG, bm); bl.rotation.z = b * Math.PI / 2; hub.add(bl); }
      W.group.add(hub);
      W.anim.push(dt => { hub.rotation.z += dt * 1.2; });
      W.colliders.push({ t: 'cyl', x, z, r: 3.2, y0: isl.top - 2, y1: isl.top + 27 });
    });
    // drifting balloons (decor)
    const envG = new THREE.SphereGeometry(9, 10, 8); const basG = new THREE.BoxGeometry(3, 2.5, 3);
    const colors = ['#ff7a4a', '#ffd34a', '#4ac8ff', '#ff5a8a', '#7cc35a'];
    for (let b = 0; b < 9; b++) {
      const grp = new THREE.Group();
      const e = new THREE.Mesh(envG, new THREE.MeshStandardMaterial({ color: colors[b % colors.length], flatShading: true }));
      e.scale.y = 1.2; grp.add(e);
      const bs = new THREE.Mesh(basG, new THREE.MeshStandardMaterial({ color: '#7a5a3a', flatShading: true })); bs.position.y = -15; grp.add(bs);
      const sx = rnd.range(-1200, 1200), sz = rnd.range(-1200, 1200), sy = rnd.range(150, 450), ph = rnd() * TAU;
      grp.position.set(sx, sy, sz); W.group.add(grp);
      W.anim.push((dt, t) => { grp.position.set(sx + Math.sin(t * 0.03 + ph) * 160, sy + Math.sin(t * 0.2 + ph) * 8, sz + Math.cos(t * 0.025 + ph) * 160); });
    }
    // a gate between some island pairs: decorative arch rings with bonus
    for (let gi = 0; gi < 6; gi++) {
      const isl = W.islands[(gi * 7 + 3) % W.islands.length];
      const gx = isl.x, gz = isl.z, gy = isl.bottom - 30;
      const tor = new THREE.Mesh(new THREE.TorusGeometry(16, 1.6, 6, 20), new THREE.MeshStandardMaterial({ color: '#c8a46a', flatShading: true, emissive: new THREE.Color('#ffcf5a'), emissiveIntensity: 0.25 }));
      tor.position.set(gx, gy, gz); const ang = rnd() * Math.PI; tor.rotation.y = ang;
      W.group.add(tor);
      W.gates.push({ pos: new THREE.Vector3(gx, gy, gz), normal: new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), r: 15, name: 'Keel Gate', pts: 1200 });
    }
  }
  if (def.kind === 'canyon') {
    // natural arches over the canyon floor
    let made = 0, tries = 0;
    while (made < 9 && tries++ < 3000) {
      const x = rnd.range(-1300, 1300), z = rnd.range(-1300, 1300);
      const h = W.heightAt(x, z);
      if (h > 60) continue;
      const ang = rnd() * Math.PI, span = rnd.range(40, 70), height = rnd.range(45, 90);
      const dx = Math.cos(ang) * span / 2, dz = Math.sin(ang) * span / 2;
      const g = new THREE.TorusGeometry(span / 2, 7, 6, 16, Math.PI);
      const arch = new THREE.Mesh(g, stoneMat);
      arch.scale.set(1, height / (span / 2), 1);
      arch.position.set(x, h - 4, z); arch.rotation.y = -ang;
      W.group.add(arch);
      for (let s = 0; s <= 10; s++) {
        const a = (s / 10) * Math.PI;
        const lx = Math.cos(a) * span / 2, ly = Math.sin(a) * height;
        W.colliders.push({ t: 'sphere', x: x + Math.cos(ang) * lx, y: h - 4 + ly, z: z + Math.sin(ang) * lx, r: 7.5 });
      }
      W.gates.push({ pos: new THREE.Vector3(x, h + height * 0.4, z), normal: new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)), r: Math.min(span / 2 - 9, height * 0.6), name: 'Arch Pass', pts: 1500 });
      made++;
    }
    // hoodoo pillars
    const pg = new THREE.CylinderGeometry(1, 1.25, 1, 7);
    for (let i = 0; i < 40; i++) {
      const x = rnd.range(-1350, 1350), z = rnd.range(-1350, 1350), h = W.heightAt(x, z);
      if (h > 120) continue;
      const r = rnd.range(6, 14), ht = rnd.range(50, 140);
      const m = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: mixHex(def.land.mid, def.land.cliff, rnd()), flatShading: true }));
      m.scale.set(r, ht, r); m.position.set(x, h + ht / 2 - 3, z); W.group.add(m);
      W.colliders.push({ t: 'cyl', x, z, r: r * 1.25, r1: r, y0: h - 5, y1: h + ht - 3 });
    }
  }
  if (def.kind === 'bay') {
    // lighthouses on coasts, floating lanterns over the water
    const lhG = new THREE.CylinderGeometry(4, 6, 46, 10), capG = new THREE.ConeGeometry(5.5, 8, 10);
    const lhM = new THREE.MeshStandardMaterial({ color: '#f4f0e8', flatShading: true }), capM = new THREE.MeshStandardMaterial({ color: '#c83a2a', flatShading: true });
    const beamG = new THREE.ConeGeometry(14, 160, 16, 1, true); beamG.translate(0, -80, 0); beamG.rotateZ(Math.PI / 2);
    const beamM = new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    let made = 0, tries = 0;
    while (made < 10 && tries++ < 6000) {
      const x = rnd.range(-1400, 1400), z = rnd.range(-1400, 1400), h = W.heightAt(x, z);
      if (h < 4 || h > 22) continue;
      if (W.colliders.some(c => Math.hypot(c.x - x, c.z - z) < 300)) continue;
      const t = new THREE.Mesh(lhG, lhM); t.position.set(x, h + 23, z); W.group.add(t);
      const cap = new THREE.Mesh(capG, capM); cap.position.set(x, h + 50, z); W.group.add(cap);
      const beam = new THREE.Mesh(beamG, beamM); beam.position.set(x, h + 44, z); W.group.add(beam);
      const ph = rnd() * TAU;
      W.anim.push((dt, tt) => { beam.rotation.y = tt * 0.6 + ph; });
      W.colliders.push({ t: 'cyl', x, z, r: 6.5, r1: 5, y0: h - 3, y1: h + 54 });
      made++;
    }
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = rnd.range(-1500, 1500); pos[i * 3 + 1] = rnd.range(8, 40); pos[i * 3 + 2] = rnd.range(-1500, 1500); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lan = new THREE.Points(lg, new THREE.PointsMaterial({ map: glowTex(), color: '#ffb35a', size: 9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    W.group.add(lan);
    const base = pos.slice();
    W.anim.push((dt, t) => { for (let i = 0; i < n; i++) pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.6 + i) * 2.5; lg.attributes.position.needsUpdate = true; });
    // sailboats
    const hullG = new THREE.BoxGeometry(4, 2, 12), sailG = new THREE.ConeGeometry(4, 14, 3);
    for (let i = 0; i < 12; i++) {
      const x = rnd.range(-1400, 1400), z = rnd.range(-1400, 1400);
      if (W.heightAt(x, z) > -3) continue;
      const b = new THREE.Group();
      b.add(new THREE.Mesh(hullG, new THREE.MeshStandardMaterial({ color: '#8a5a3a', flatShading: true })));
      const s = new THREE.Mesh(sailG, new THREE.MeshStandardMaterial({ color: '#fff4e0', flatShading: true })); s.position.y = 8; s.scale.z = 0.2; b.add(s);
      b.position.set(x, 1, z); b.rotation.y = rnd() * TAU; W.group.add(b);
      const ph = rnd() * TAU;
      W.anim.push((dt, t) => { b.rotation.z = Math.sin(t + ph) * 0.06; b.position.y = 1 + Math.sin(t * 1.3 + ph) * 0.5; });
    }
  }
  if (def.kind === 'spires') {
    const sg = new THREE.CylinderGeometry(0.78, 1, 1, 8, 4);
    // jag the spire sides
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) { const k = 1 + (noise(sp.getX(i) * 3 + i, sp.getY(i) * 5) * 0.08); sp.setX(i, sp.getX(i) * k); sp.setZ(i, sp.getZ(i) * k); }
    sg.computeVertexNormals();
    const tops = [];
    let made = 0, tries = 0;
    while (made < 70 && tries++ < 5000) {
      const x = rnd.range(-1350, 1350), z = rnd.range(-1350, 1350);
      if (Math.hypot(x, z) < 140) continue;
      const r = rnd.range(12, 32);
      if (W.colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + r + 45)) continue;
      const h = W.heightAt(x, z), ht = rnd.range(130, 400);
      const m = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: mixHex('#8a8672', '#5c6650', rnd()), flatShading: true }));
      m.scale.set(r, ht, r); m.position.set(x, h + ht / 2 - 5, z); W.group.add(m);
      // a crown of greenery on top
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: def.trees, flatShading: true }));
      crown.scale.set(r * 0.85, r * 0.35, r * 0.85); crown.position.set(x, h + ht - 4, z); W.group.add(crown);
      W.colliders.push({ t: 'cyl', x, z, r, r1: r * 0.8, y0: h - 6, y1: h + ht - 2 });
      tops.push({ x, y: h + ht, z, r });
      made++;
    }
    W.spireTops = tops;
    W.islands = addIslands(W, def, rnd, 18, 'ruin');
    // temple gates between neighbouring spires
    const gateM = new THREE.MeshStandardMaterial({ color: '#c8b88a', flatShading: true, emissive: new THREE.Color('#ffd36b'), emissiveIntensity: 0.12 });
    let gates = 0;
    for (let i = 0; i < tops.length && gates < 10; i++) {
      for (let j = i + 1; j < tops.length && gates < 10; j++) {
        const a = tops[i], b = tops[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < 70 || d > 130) continue;
        const y = Math.min(a.y, b.y) - 50;
        if (y < W.heightAt((a.x + b.x) / 2, (a.z + b.z) / 2) + 40) continue;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ang = Math.atan2(b.z - a.z, b.x - a.x);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(d, 6, 8), gateM);
        beam.position.set(mx, y, mz); beam.rotation.y = -ang; W.group.add(beam);
        for (let s = 0; s <= 8; s++) { const t = s / 8; W.colliders.push({ t: 'sphere', x: lerp(a.x, b.x, t), y, z: lerp(a.z, b.z, t), r: 4.5 }); }
        W.gates.push({ pos: new THREE.Vector3(mx, y - 22, mz), normal: new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)), r: Math.min(d / 2 - Math.max(a.r, b.r) - 4, 18), name: 'Temple Gate', pts: 1400 });
        gates++;
      }
    }
  }
  if (def.kind === 'storm') {
    // lightning bolt pool
    W.bolts = [];
    const bm = new THREE.LineBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0, fog: false });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
      const l = new THREE.Line(g, bm.clone()); l.frustumCulled = false; W.group.add(l); W.bolts.push({ line: l, life: 0 });
    }
    // standing stones
    const stG = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 30; i++) {
      const x = rnd.range(-1300, 1300), z = rnd.range(-1300, 1300), h = W.heightAt(x, z);
      const s = rnd.range(5, 10), ht = rnd.range(18, 40);
      const m = new THREE.Mesh(stG, stoneMat); m.scale.set(s, ht, s * 0.6); m.position.set(x, h + ht / 2 - 2, z); m.rotation.y = rnd() * TAU; W.group.add(m);
      W.colliders.push({ t: 'cyl', x, z, r: s * 0.6, y0: h - 3, y1: h + ht - 2 });
    }
  }
  if (def.kind === 'peaks' || def.kind === 'fjord') {
    // a few lone rock needles and, in the fjord, glowing cabins
    const pg = new THREE.ConeGeometry(1, 1, 6);
    for (let i = 0; i < 18; i++) {
      const x = rnd.range(-1300, 1300), z = rnd.range(-1300, 1300), h = W.heightAt(x, z);
      if (h < 20 || h > 300) continue;
      const r = rnd.range(8, 16), ht = rnd.range(60, 120);
      const m = new THREE.Mesh(pg, stoneMat); m.scale.set(r, ht, r); m.position.set(x, h + ht / 2 - 4, z); W.group.add(m);
      W.colliders.push({ t: 'cyl', x, z, r, r1: 1, y0: h - 5, y1: h + ht - 6 });
    }
    if (def.kind === 'fjord') {
      const n = 90, pos = new Float32Array(n * 3);
      let k = 0, tries = 0;
      while (k < n && tries++ < 4000) {
        const x = rnd.range(-1400, 1400), z = rnd.range(-1400, 1400), h = W.heightAt(x, z);
        if (h < 2 || h > 60) continue;
        pos[k * 3] = x; pos[k * 3 + 1] = h + 4; pos[k * 3 + 2] = z; k++;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      W.group.add(new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex(), color: '#ffc87a', size: 14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    }
  }
}

function buildTrees(W, def, rnd, quality) {
  const target = { low: 500, med: 1100, high: 2000 }[quality] || 1100;
  const spots = [];
  const round = def.kind === 'bay' || def.kind === 'spires' || def.kind === 'islands' || def.kind === 'storm';
  let tries = 0;
  if (def.kind === 'islands') {
    for (const isl of W.islands) {
      const n = Math.floor(isl.r / 8);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * isl.r * 0.75;
        spots.push([isl.x + Math.cos(a) * d, isl.top + isl.r * 0.04, isl.z + Math.sin(a) * d, rnd.range(5, 10)]);
      }
    }
  } else {
    const band = { canyon: [20, 60], peaks: [40, 320], bay: [6, 120], storm: [10, 260], fjord: [4, 260], spires: [12, 120] }[def.kind];
    while (spots.length < target && tries++ < target * 12) {
      const x = rnd.range(-WORLD_HALF + 60, WORLD_HALF - 60), z = rnd.range(-WORLD_HALF + 60, WORLD_HALF - 60);
      const h = W.heightAt(x, z);
      if (h < band[0] || h > band[1] || h < W.waterLevel + 2) continue;
      if (W.slopeAt(x, z) > 0.7) continue;
      spots.push([x, h, z, rnd.range(6, 13) * (def.kind === 'spires' ? 1.4 : 1)]);
    }
  }
  if (!spots.length) return;
  const geo = round ? new THREE.IcosahedronGeometry(1, 0) : new THREE.ConeGeometry(0.55, 1.6, 6);
  if (!round) geo.translate(0, 0.8, 0); else geo.translate(0, 0.9, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const base = new THREE.Color(def.trees);
  spots.forEach((sp, i) => {
    p.set(sp[0], sp[1] - 0.5, sp[2]);
    s.set(sp[3], sp[3] * (round ? 0.9 : 1.6), sp[3]);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * TAU);
    m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
    _col.copy(base).offsetHSL(rnd.range(-0.03, 0.03), rnd.range(-0.08, 0.05), rnd.range(-0.06, 0.06));
    if (def.kind === 'peaks' && sp[1] > 260) _col.lerp(_col2.set('#f2f6fa'), 0.6);
    mesh.setColorAt(i, _col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  W.group.add(mesh);
  W.trees = spots;
}

function buildThermals(W, def, rnd) {
  const n = def.thermals;
  let tries = 0;
  while (W.thermals.length < n && tries++ < 3000) {
    let x = rnd.range(-1350, 1350), z = rnd.range(-1350, 1350);
    if (def.kind === 'islands' && W.islands.length) {
      const isl = W.islands[W.thermals.length % W.islands.length];
      const a = rnd() * TAU; x = isl.x + Math.cos(a) * (isl.r + 60); z = isl.z + Math.sin(a) * (isl.r + 60);
    }
    if (W.thermals.some(t => Math.hypot(t.x - x, t.z - z) < 220)) continue;
    const c = W.clearance(x, W.floorAt(x, z) + 80, z);
    if (c.d < 30) continue;
    const base = W.floorAt(x, z);
    W.thermals.push({ x, z, r: rnd.range(28, 46), str: rnd.range(10, 16), y0: base, y1: base + rnd.range(380, 620) });
  }
  addThermalVisuals(W);
}
function addThermalVisuals(W) {
  if (W.thermalPts) { W.group.remove(W.thermalPts); W.thermalPts.geometry.dispose(); }
  const per = 46, total = W.thermals.length * per;
  const pos = new Float32Array(total * 3), meta = [];
  const r = RNG(99);
  W.thermals.forEach((t, ti) => {
    for (let i = 0; i < per; i++) {
      const k = ti * per + i, a = r() * TAU, d = Math.sqrt(r()) * t.r;
      meta.push({ t, a, d, y: r(), sp: r.range(0.06, 0.12) });
      pos[k * 3] = t.x + Math.cos(a) * d; pos[k * 3 + 1] = t.y0; pos[k * 3 + 2] = t.z + Math.sin(a) * d;
    }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex(), color: W.def.night ? '#7affc8' : '#fff6d8', size: 7, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  W.group.add(pts);
  W.thermalPts = pts; W.thermalMeta = meta;
}

function placeShards(W, def, rnd) {
  const want = 20;
  let tries = 0;
  const ok = (x, y, z) => W.clearance(x, y, z).d > 5 && W.inBounds(x, z) && !W.shards.some(s => s.pos.distanceTo(new THREE.Vector3(x, y, z)) < 160);
  while (W.shards.length < want && tries++ < 8000) {
    const mode = rnd();
    let x, y, z;
    if (W.islands && W.islands.length && mode < 0.4) {
      const isl = rnd.pick(W.islands);
      if (rnd() < 0.5) { x = isl.x; z = isl.z; y = isl.bottom - rnd.range(8, 16); } else { const a = rnd() * TAU; x = isl.x + Math.cos(a) * isl.r * 0.4; z = isl.z + Math.sin(a) * isl.r * 0.4; y = isl.top + rnd.range(10, 16); }
    } else if (W.spireTops && mode < 0.65) {
      const s = rnd.pick(W.spireTops); x = s.x; z = s.z; y = s.y + 12;
    } else {
      x = rnd.range(-1300, 1300); z = rnd.range(-1300, 1300);
      y = W.floorAt(x, z) + rnd.range(8, 22);
      if (def.kind === 'islands') y = rnd.range(30, 120);
    }
    if (!ok(x, y, z)) continue;
    W.shards.push({ id: W.shards.length, pos: new THREE.Vector3(x, y, z), mesh: null, beam: null });
  }
}

function buildLights(W, def) {
  const hemi = new THREE.HemisphereLight(def.amb.sky, def.amb.ground, def.amb.int * 0.8);
  const sun = new THREE.DirectionalLight(def.sun.color, def.sun.int);
  sun.position.set(...def.sun.dir).multiplyScalar(1000);
  W.group.add(hemi, sun, sun.target);
  W.sun = sun; W.hemi = hemi;
}

function buildRain(W) {
  const n = 1800, pos = new Float32Array(n * 3);
  const r = RNG(5);
  for (let i = 0; i < n; i++) { pos[i * 3] = r.range(-160, 160); pos[i * 3 + 1] = r.range(-120, 120); pos[i * 3 + 2] = r.range(-160, 160); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe0f0', size: 1.4, transparent: true, opacity: 0.55, depthWrite: false }));
  pts.frustumCulled = false;
  W.group.add(pts); W.rain = pts;
}

/* ---------- per-frame world animation ---------- */
function updateWorld(W, dt, camPos) {
  W.time += dt;
  const t = W.time;
  for (const f of W.anim) f(dt, t);
  if (W.water && G.quality !== 'low') {
    const wa = W.water, arr = wa.mesh.geometry.attributes.position.array, base = wa.base;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], z = base[i + 2];
      arr[i + 1] = Math.sin(x * wa.scale + t * wa.speed) * wa.amp + Math.cos(z * wa.scale * 1.3 + t * wa.speed * 0.8) * wa.amp;
    }
    wa.mesh.geometry.attributes.position.needsUpdate = true;
    wa.mesh.geometry.computeVertexNormals();
  }
  if (W.thermalPts) {
    const arr = W.thermalPts.geometry.attributes.position.array;
    for (let i = 0; i < W.thermalMeta.length; i++) {
      const m = W.thermalMeta[i];
      m.y += m.sp * dt; if (m.y > 1) m.y -= 1;
      const a = m.a + t * 0.4;
      arr[i * 3] = m.t.x + Math.cos(a) * m.d; arr[i * 3 + 1] = m.t.y0 + m.y * (m.t.y1 - m.t.y0); arr[i * 3 + 2] = m.t.z + Math.sin(a) * m.d;
    }
    W.thermalPts.geometry.attributes.position.needsUpdate = true;
  }
  if (W.auroras) for (const a of W.auroras) a.uniforms.t.value = t;
  if (camPos) W.skyGroup.position.copy(camPos);
  if (W.def.wind) {
    W.gustT -= dt;
    if (W.gustT <= 0) {
      W.gustT = 3 + Math.random() * 5;
      const a = Math.random() * TAU, s = 4 + Math.random() * 9;
      W.windTarget.set(Math.cos(a) * s, (Math.random() - 0.5) * 2, Math.sin(a) * s);
    }
    W.wind.lerp(W.windTarget, 1 - Math.exp(-0.8 * dt));
  }
  if (W.rain && camPos) {
    const arr = W.rain.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= 70 * dt; arr[i] += W.wind.x * dt; arr[i + 2] += W.wind.z * dt;
      if (arr[i + 1] < -120) arr[i + 1] += 240;
      if (arr[i] < -160) arr[i] += 320; if (arr[i] > 160) arr[i] -= 320;
      if (arr[i + 2] < -160) arr[i + 2] += 320; if (arr[i + 2] > 160) arr[i + 2] -= 320;
    }
    W.rain.position.copy(camPos);
    W.rain.geometry.attributes.position.needsUpdate = true;
  }
  if (W.bolts && camPos) {
    W.lightningCool -= dt;
    if (W.lightningCool <= 0) {
      W.lightningCool = 4 + Math.random() * 7;
      const b = W.bolts.find(x => x.life <= 0);
      if (b) {
        const a = Math.random() * TAU, d = 300 + Math.random() * 600;
        let x = camPos.x + Math.cos(a) * d, z = camPos.z + Math.sin(a) * d, y = 650;
        const ground = W.heightAt(x, z), arr = b.line.geometry.attributes.position.array;
        for (let i = 0; i < 30; i++) {
          const f = i / 29;
          arr[i * 3] = x + (Math.random() - 0.5) * 30 * (i > 0 ? 1 : 0); arr[i * 3 + 1] = lerp(y, ground, f); arr[i * 3 + 2] = z + (Math.random() - 0.5) * 30 * (i > 0 ? 1 : 0);
          x = arr[i * 3]; z = arr[i * 3 + 2];
        }
        b.line.geometry.attributes.position.needsUpdate = true;
        b.life = 0.35; W.lightning = 1;
        if (typeof Sfx !== 'undefined') Sfx.thunder(d);
      }
    }
    for (const b of W.bolts) { b.life -= dt; b.line.material.opacity = b.life > 0 ? (Math.random() * 0.6 + 0.4) : 0; }
    W.lightning = Math.max(0, W.lightning - dt * 3);
    W.hemi.intensity = W.def.amb.int + W.lightning * 1.4;
  }
}

function disposeWorld(W, scene) {
  scene.remove(W.group); scene.remove(W.skyGroup);
  const kill = o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && m.map !== GLOW_TEX) m.map.dispose(); m.dispose(); });
  };
  W.group.traverse(kill); W.skyGroup.traverse(kill);
}
