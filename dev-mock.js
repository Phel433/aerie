'use strict';
/* Local-only stand-in for the claude.ai runtime (db, room, user) so live play can be tested
   across browser tabs. Loaded only by play.html, never published. */
(() => {
  const params = new URLSearchParams(location.search);
  if (!params.has('mock')) return;
  const me = params.get('mock') || ('u' + Math.random().toString(36).slice(2, 7));
  const peerId = 'p' + Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel('aerie-mock');
  const send = m => bc.postMessage(m);

  /* ---------- db over localStorage ---------- */
  const KEY = 'mockdb:';
  const docListeners = new Map(), colListeners = new Map();
  const read = path => { try { const v = localStorage.getItem(KEY + path); return v ? JSON.parse(v) : undefined; } catch (e) { return undefined; } };
  const snapDoc = path => { const v = read(path); return { id: path.split('/').pop(), exists: v !== undefined, data: () => v, metadata: { fromCache: false, hasPendingWrites: false } }; };
  const snapCol = path => {
    const docs = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith(KEY + path + '/')) continue;
      const rest = k.slice(KEY.length + path.length + 1);
      if (rest.includes('/')) continue;
      docs.push(snapDoc(path + '/' + rest));
    }
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const notify = path => {
    (docListeners.get(path) || []).forEach(f => f(snapDoc(path)));
    const col = path.split('/').slice(0, -1).join('/');
    (colListeners.get(col) || []).forEach(f => f(snapCol(col)));
  };
  bc.addEventListener('message', e => { if (e.data.t === 'db') notify(e.data.path); });
  const docRef = path => ({
    id: path.split('/').pop(), path,
    get: async () => snapDoc(path),
    set: async data => { localStorage.setItem(KEY + path, JSON.stringify(data)); notify(path); send({ t: 'db', path }); },
    update: async data => { const v = Object.assign({}, read(path), data); localStorage.setItem(KEY + path, JSON.stringify(v)); notify(path); send({ t: 'db', path }); },
    delete: async () => { localStorage.removeItem(KEY + path); notify(path); send({ t: 'db', path }); },
    onSnapshot: (next) => { const l = docListeners.get(path) || []; l.push(next); docListeners.set(path, l); setTimeout(() => next(snapDoc(path)), 10); return () => {}; },
    collection: sub => colRef(path + '/' + sub)
  });
  const colRef = path => ({
    path,
    doc: id => docRef(path + '/' + (id || Math.random().toString(36).slice(2))),
    onSnapshot: (next) => { const l = colListeners.get(path) || []; l.push(next); colListeners.set(path, l); setTimeout(() => next(snapCol(path)), 10); return () => {}; },
    get: async () => snapCol(path)
  });
  const db = { doc: docRef, collection: colRef };

  /* ---------- room over BroadcastChannel ---------- */
  function makeRoom(name) {
    const peers = new Map(); // peer -> {presence, seen, by}
    let mine = {};
    const listeners = [];
    let snapshot = Object.freeze([]);
    const rebuild = () => {
      const now = Date.now();
      const arr = [{ peer: peerId, by: me, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze(Object.assign({}, mine)), updatedAt: now }];
      for (const [k, v] of peers) if (now - v.seen < 3500) arr.push({ peer: k, by: v.by, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.at });
      snapshot = Object.freeze(arr);
      listeners.forEach(f => f({ peers: snapshot, joined: [], left: [], updated: [] }));
    };
    const announce = () => send({ t: 'pr', room: name, peer: peerId, by: me, presence: mine });
    const onMsg = e => {
      const m = e.data;
      if (m.room !== name || m.peer === peerId) return;
      if (m.t === 'pr') { const prev = peers.get(m.peer); peers.set(m.peer, { presence: Object.freeze(m.presence), seen: Date.now(), at: prev && JSON.stringify(prev.presence) === JSON.stringify(m.presence) ? prev.at : Date.now(), by: m.by }); rebuild(); }
      if (m.t === 'bye') { peers.delete(m.peer); rebuild(); }
      if (m.t === 'hello') announce();
    };
    bc.addEventListener('message', onMsg);
    const hb = setInterval(() => { announce(); rebuild(); }, 1000);
    send({ t: 'hello', room: name, peer: peerId });
    setTimeout(rebuild, 20);
    let last = 0, pending = null;
    return {
      name,
      presence: async patch => {
        for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
        const now = Date.now();
        if (now - last > 33) { last = now; announce(); } else if (!pending) pending = setTimeout(() => { pending = null; last = Date.now(); announce(); }, 35);
      },
      peers: () => snapshot,
      onPeers: (fn) => { listeners.push(fn); setTimeout(() => fn({ peers: snapshot, joined: snapshot, left: [], updated: [] }), 0); return () => {}; },
      emit: async () => {}, on: () => () => {},
      connected: () => true, onConnection: fn => { setTimeout(() => fn(true), 0); return () => {}; },
      leave: async () => { clearInterval(hb); bc.removeEventListener('message', onMsg); send({ t: 'bye', room: name, peer: peerId }); }
    };
  }
  const lobby = makeRoom('lobby');
  const joined = {};
  lobby.join = async n => {
    if (!joined[n]) { const r = makeRoom('n:' + n); const lv = r.leave; r.leave = async () => { delete joined[n]; await lv(); }; joined[n] = r; }
    return joined[n];
  };
  window.addEventListener('beforeunload', () => send({ t: 'bye', room: 'lobby', peer: peerId }));

  const user = { id: async () => me, can: async () => true, isOwner: async () => false, canEdit: async () => false, me: async () => ({ id: me, name: '', isOwner: false, canEdit: false }) };
  window.claude = { use: async n => (n === 'db' ? db : n === 'room' ? lobby : n === 'user' ? user : null) };
  console.log('[mock] runtime ready as', me, peerId);
})();
