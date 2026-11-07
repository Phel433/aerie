'use strict';
/* Flung8 — online: shared leaderboard + ghosts (db), live pilots and races (room). Everything degrades to solo. */

const Net = (() => {
  let db = null, room = null, user = null, uid = null;
  let canPost = null;              // null = unknown, false = refused once
  const board = new Map();         // uid -> pilot doc
  const listeners = new Set();
  let sky = null, race = null;     // named rooms
  let lobbyPeers = [];
  let lastSend = 0;
  const remote = new Map();        // peer -> remote glider state (Open Sky / race)
  let status = 'offline';

  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  async function init() {
    if (!window.claude || !window.claude.use) { status = 'solo'; emit(); return; }
    try {
      const [d, r, u] = await Promise.all([claude.use('db'), claude.use('room'), claude.use('user')]);
      db = d; room = r; user = u;
      if (user) uid = await user.id();
      if (db) subscribeBoard();
      if (room) {
        room.onPeers(ch => { lobbyPeers = ch.peers; emit(); }, () => { room = null; emit(); });
        setLobbyPresence();
      }
      status = db || room ? 'online' : 'solo';
      if (user && db) { try { const c = await user.can('data.write'); if (c === false) canPost = false; } catch (e) { /* ignore */ } }
    } catch (e) { status = 'solo'; }
    emit();
  }

  function subscribeBoard() {
    let timer = setTimeout(() => { if (!board.size) { status = db ? 'online' : status; emit(); } }, 10000);
    db.collection('pilots').onSnapshot(snap => {
      clearTimeout(timer);
      board.clear();
      for (const d of snap.docs) { const v = d.data(); if (v && typeof v === 'object') board.set(d.id, v); }
      emit();
    }, () => { emit(); });
  }

  function me() { return { cs: G.save.callsign || 'Pilot', paint: G.save.paint, frame: G.save.frame, trail: G.save.trail, lvl: G.save.level }; }

  /* ---------- leaderboard ---------- */
  function rankings(courseId) {
    const rows = [];
    for (const [id, v] of board) {
      const b = v.best && v.best[courseId];
      if (b && typeof b.t === 'number' && b.t > 1000) rows.push({ uid: id, cs: cleanCallsign(v.cs) || 'Pilot', paint: v.paint, frame: v.frame, lvl: v.lvl | 0, t: b.t, at: b.at || 0, me: id === uid });
    }
    rows.sort((a, b) => a.t - b.t || a.at - b.at);
    return rows;
  }
  function attackRankings(worldId) {
    const rows = [];
    for (const [id, v] of board) {
      const s = v.attack && v.attack[worldId];
      if (typeof s === 'number' && s > 0) rows.push({ uid: id, cs: cleanCallsign(v.cs) || 'Pilot', paint: v.paint, lvl: v.lvl | 0, score: s, me: id === uid });
    }
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }

  let writing = Promise.resolve();
  function postProfile(extra) {
    if (!db || !uid || canPost === false) return Promise.resolve(false);
    const ref = db.doc('pilots/' + uid);
    const cur = board.get(uid) || {};
    const doc = Object.assign({}, cur, me(), { best: Object.assign({}, cur.best || {}), attack: Object.assign({}, cur.attack || {}), upd: Date.now() }, extra || {});
    if (extra && extra.best) doc.best = Object.assign({}, cur.best || {}, extra.best);
    if (extra && extra.attack) doc.attack = Object.assign({}, cur.attack || {}, extra.attack);
    writing = writing.then(() => ref.set(doc)).then(() => true).catch(e => {
      if (e && (e.code === 'invalid_argument' || e.code === 'not_granted')) canPost = false;
      return false;
    });
    return writing;
  }
  async function postTime(courseId, ms, ghost) {
    if (!db || !uid || canPost === false) return { posted: false, reason: !db ? 'offline' : 'readonly' };
    const cur = board.get(uid);
    const prev = cur && cur.best && cur.best[courseId];
    if (prev && prev.t <= ms) { postProfile(); return { posted: false, reason: 'slower' }; }
    const ok = await postProfile({ best: { [courseId]: { t: ms, at: Date.now() } } });
    if (ok && ghost) {
      try { await db.doc('pilots/' + uid + '/ghosts/' + courseId).set({ t: ms, d: ghost, frame: G.save.frame, paint: G.save.paint }); } catch (e) { /* ghost is optional */ }
    }
    return { posted: ok, reason: ok ? 'ok' : 'readonly' };
  }
  async function postAttack(worldId, score) {
    if (!db || !uid || canPost === false) return false;
    const cur = board.get(uid);
    const prev = cur && cur.attack && cur.attack[worldId];
    if (prev && prev >= score) return false;
    return postProfile({ attack: { [worldId]: score } });
  }
  async function fetchGhost(pilotId, courseId) {
    if (!db) return null;
    try {
      const s = await db.doc('pilots/' + pilotId + '/ghosts/' + courseId).get();
      if (!s.exists) return null;
      const v = s.data();
      return v && typeof v.d === 'string' ? v : null;
    } catch (e) { return null; }
  }

  /* ---------- presence ---------- */
  function setLobbyPresence(extra) {
    if (!room) return;
    const p = Object.assign({ cs: me().cs, w: G.worldId || '', m: G.run ? G.run.mode : 'menu', rc: G.run && G.run.cdef ? G.run.cdef.id : '' }, extra || {});
    room.presence(p).catch(() => {});
  }
  function lobbyCounts() {
    const counts = { total: 0, worlds: {} };
    for (const p of lobbyPeers) {
      if (p.kind !== 'viewer') continue;
      counts.total++;
      const w = p.presence && p.presence.w;
      if (w && p.presence.m && p.presence.m !== 'menu') counts.worlds[w] = (counts.worlds[w] || 0) + 1;
    }
    return counts;
  }

  /* Open Sky: a named room per world; everyone streams their glider via presence. */
  async function joinSky(worldId) {
    await leaveAll();
    if (!room) return false;
    try {
      sky = await room.join('sky-' + worldId);
      sky.onPeers(ch => { syncRemote(ch.peers); emit(); }, () => { sky = null; emit(); });
      return true;
    } catch (e) { sky = null; return false; }
  }
  async function joinRace(courseId) {
    await leaveAll();
    if (!room) return false;
    try {
      race = await room.join('race-' + courseId.replace(/[^a-z0-9_.-]/g, ''));
      race.onPeers(ch => { syncRemote(ch.peers); emit(); }, () => { race = null; emit(); });
      return true;
    } catch (e) { race = null; return false; }
  }
  async function leaveAll() {
    const rs = [sky, race].filter(Boolean);
    sky = race = null;
    remote.clear();
    for (const r of rs) { try { await r.leave(); } catch (e) { /* ignore */ } }
    emit();
  }
  function current() { return sky || race; }

  function syncRemote(peers) {
    const seen = new Set();
    for (const p of peers) {
      if (p.sameTab || p.kind !== 'viewer') continue;
      const pr = p.presence || {};
      seen.add(p.peer);
      let r = remote.get(p.peer);
      if (!r) { r = { peer: p.peer, isMe: p.isMe, guest: p.guest, pos: null, q: null, tpos: null, tq: null, mesh: null, tag: null, frame: null, paint: null }; remote.set(p.peer, r); }
      r.data = pr;
      r.cs = cleanCallsign(pr.cs) || 'Pilot';
      r.updatedAt = p.updatedAt;
      if (Array.isArray(pr.p) && pr.p.length === 3 && pr.p.every(Number.isFinite)) {
        r.tpos = new THREE.Vector3(pr.p[0], pr.p[1], pr.p[2]);
        if (!r.pos) r.pos = r.tpos.clone();
      }
      if (Array.isArray(pr.q) && pr.q.length === 4 && pr.q.every(Number.isFinite)) {
        r.tq = new THREE.Quaternion(pr.q[0], pr.q[1], pr.q[2], pr.q[3]).normalize();
        if (!r.q) r.q = r.tq.clone();
      }
      r.speed = Number.isFinite(pr.v) ? pr.v : 0;
    }
    for (const k of [...remote.keys()]) if (!seen.has(k)) { const r = remote.get(k); r.gone = true; remote.delete(k); goneQueue.push(r); }
  }
  const goneQueue = [];

  /* stream my glider (about 12 times a second) */
  function streamPilot(p, extra) {
    const rm = current();
    if (!rm || !p) return;
    const now = performance.now();
    if (now - lastSend < 80) return;
    lastSend = now;
    const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
    const m = me();
    rm.presence(Object.assign({
      cs: m.cs, pa: m.paint, fr: m.frame, tr: m.trail, lv: m.lvl,
      p: [r1(p.pos.x), r1(p.pos.y), r1(p.pos.z)], q: [r3(p.q.x), r3(p.q.y), r3(p.q.z), r3(p.q.w)], v: Math.round(p.speed)
    }, extra || {})).catch(() => {});
  }
  function setRacePresence(patch) { if (race) race.presence(patch).catch(() => {}); }
  function racePeers() { return race ? race.peers() : []; }
  function myPeer() { const rm = race || sky; if (!rm) return null; const me = rm.peers().find(p => p.sameTab); return me ? me.peer : null; }

  return {
    init, rankings, attackRankings, postTime, postAttack, postProfile, fetchGhost,
    setLobbyPresence, lobbyCounts, joinSky, joinRace, leaveAll, streamPilot, setRacePresence, racePeers, myPeer,
    remote, goneQueue, lobbyPeers: () => lobbyPeers, on: f => { listeners.add(f); return () => listeners.delete(f); },
    get status() { return status; }, get uid() { return uid; }, get hasDb() { return !!db; }, get hasRoom() { return !!room; },
    get canPost() { return canPost; }, get inSky() { return !!sky; }, get inRace() { return !!race; }, get boardSize() { return board.size; }
  };
})();

/* ---------- ghost encoding: 10 samples/s, int16 positions (0.5 m) + int8 quaternion ---------- */
const Ghost = {
  RATE: 10,
  encode(frames) {
    // frames: [{x,y,z,qx,qy,qz,qw}]
    const n = Math.min(frames.length, 6000);
    const buf = new Int16Array(n * 5);
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      buf[i * 5] = clamp(Math.round(f.x * 2), -32767, 32767);
      buf[i * 5 + 1] = clamp(Math.round(f.y * 2), -32767, 32767);
      buf[i * 5 + 2] = clamp(Math.round(f.z * 2), -32767, 32767);
      // pack quaternion xyz as two int16 (x,y in one, z,w-sign in other) at 8 bits each
      const q8 = v => clamp(Math.round(v * 127), -127, 127) & 255;
      const qw = f.qw < 0 ? -1 : 1;
      buf[i * 5 + 3] = (q8(f.qx * qw) << 8 | q8(f.qy * qw)) << 16 >> 16;
      buf[i * 5 + 4] = (q8(f.qz * qw) << 8) << 16 >> 16;
    }
    const bytes = new Uint8Array(buf.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  decode(str) {
    try {
      const bin = atob(str);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
      const out = [];
      const s8 = v => ((v & 255) << 24 >> 24) / 127;
      for (let i = 0; i + 4 < buf.length; i += 5) {
        const qx = s8(buf[i + 3] >> 8), qy = s8(buf[i + 3]), qz = s8(buf[i + 4] >> 8);
        const qw = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy - qz * qz));
        out.push({ x: buf[i] / 2, y: buf[i + 1] / 2, z: buf[i + 2] / 2, qx, qy, qz, qw });
      }
      return out;
    } catch (e) { return null; }
  },
  sample(frames, t) {
    if (!frames || !frames.length) return null;
    const f = t * this.RATE, i = Math.floor(f);
    if (i >= frames.length - 1) return { a: frames[frames.length - 1], b: frames[frames.length - 1], k: 0, done: true };
    if (i < 0) return { a: frames[0], b: frames[0], k: 0 };
    return { a: frames[i], b: frames[i + 1], k: f - i };
  }
};
