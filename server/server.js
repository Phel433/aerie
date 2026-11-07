'use strict';
/* Flung8 live server: named rooms where every player shares a small "presence" object (position, name, mode).
   Same idea as claude.ai's room capability, so the game code treats both alike. Run: node server.js (PORT env, default 8787). */
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const MAX_ROOMS_PER_CLIENT = 4;      // lobby + one game room, with headroom
const MAX_PRESENCE_BYTES = 2048;
const MAX_MSGS_PER_SEC = 40;
const ROOM_NAME = /^[a-z0-9_.-]{1,48}$/;
const TICK_MS = 66;                  // peer lists go out at most ~15 times a second per room

const rooms = new Map();             // name -> Map(clientId -> { by, presence, at })
const dirty = new Set();
const clients = new Map();           // clientId -> { ws, uid, rooms: Set }
let nextId = 1;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end('Flung8 live server ok. Players online: ' + clients.size + '\n');
});
const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });

wss.on('connection', ws => {
  const id = 'p' + (nextId++).toString(36);
  const c = { ws, uid: null, rooms: new Set(), alive: true, msgs: 0, window: Date.now() };
  clients.set(id, c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', raw => {
    // simple rate limit: drop anything past MAX_MSGS_PER_SEC
    const now = Date.now();
    if (now - c.window > 1000) { c.window = now; c.msgs = 0; }
    if (++c.msgs > MAX_MSGS_PER_SEC) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      c.uid = typeof m.uid === 'string' ? m.uid.slice(0, 40) : id;
      send(ws, { t: 'welcome', id });
      return;
    }
    if (!c.uid) return; // must say hello first
    const room = m.room;
    if (typeof room !== 'string' || !ROOM_NAME.test(room)) return;
    if (m.t === 'join') {
      if (c.rooms.has(room) || c.rooms.size >= MAX_ROOMS_PER_CLIENT) return;
      if (!rooms.has(room)) rooms.set(room, new Map());
      rooms.get(room).set(id, { by: c.uid, presence: {}, at: now });
      c.rooms.add(room); dirty.add(room);
    } else if (m.t === 'leave') {
      leave(id, room);
    } else if (m.t === 'presence') {
      const r = rooms.get(room), me = r && r.get(id);
      if (!me || !m.p || typeof m.p !== 'object' || Array.isArray(m.p)) return;
      const next = Object.assign({}, me.presence);
      for (const k of Object.keys(m.p)) { if (m.p[k] === null) delete next[k]; else next[k] = m.p[k]; }
      if (JSON.stringify(next).length > MAX_PRESENCE_BYTES) return;
      me.presence = next; me.at = now; dirty.add(room);
    }
  });
  ws.on('close', () => { for (const r of [...c.rooms]) leave(id, r); clients.delete(id); });
});

function leave(id, room) {
  const c = clients.get(id), r = rooms.get(room);
  if (c) c.rooms.delete(room);
  if (!r) return;
  r.delete(id);
  if (r.size) dirty.add(room); else rooms.delete(room);
}
function send(ws, m) { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }

setInterval(() => {
  for (const room of dirty) {
    const r = rooms.get(room);
    if (!r) continue;
    const peers = [...r].map(([id, v]) => ({ id, by: v.by, presence: v.presence, at: v.at }));
    const msg = JSON.stringify({ t: 'peers', room, peers });
    for (const id of r.keys()) { const c = clients.get(id); if (c && c.ws.readyState === 1) c.ws.send(msg); }
  }
  dirty.clear();
}, TICK_MS);

// drop connections that stopped answering
setInterval(() => {
  for (const [id, c] of clients) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false; c.ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log('Flung8 live server on port ' + PORT));
