'use strict';
/* Flung8 — menus, HUD, results and overlays. */

const $ = id => document.getElementById(id);
const UI = {
  screen: null, stack: [], selWorld: null, lockerTab: 'frames', boardTab: null, pilotTab: 'overview',
  hudCache: {}, feedN: 0, resetArm: false,

  init() {
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { Sfx.init(); Sfx.click(); this.go(b.dataset.go); }));
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { Sfx.click(); this.back(); }));
    $('cs-save').addEventListener('click', () => this.saveCallsign($('cs-input').value));
    $('cs-input').addEventListener('keydown', e => { if (e.key === 'Enter') this.saveCallsign($('cs-input').value); });
    $('photo-hint').addEventListener('click', () => { if (G.state === 'photo') exitPhoto(); });
    Net.on(() => this.onNet());
    // photo-mode orbit
    let drag = null;
    const cv = $('gl');
    cv.addEventListener('pointerdown', e => { if (G.state === 'photo') drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointermove', e => {
      if (!drag || G.state !== 'photo') return;
      G.photo.yaw -= (e.clientX - drag.x) * 0.008; G.photo.pitch = clamp(G.photo.pitch + (e.clientY - drag.y) * 0.006, -1.2, 1.4);
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('wheel', e => { if (G.state === 'photo') { G.photo.dist = clamp(G.photo.dist * (e.deltaY > 0 ? 1.1 : 0.9), 5, 120); e.preventDefault(); } }, { passive: false });
  },

  /* ---------- navigation ---------- */
  showOnly(name) {
    document.querySelectorAll('.screen').forEach(s => (s.hidden = s.id !== 'scr-' + name));
    this.screen = name;
  },
  go(name) {
    if (this.screen && this.screen !== name) this.stack.push(this.screen);
    this.open(name);
  },
  open(name) {
    $('hud').hidden = true; $('ov-pause').hidden = true; $('ov-results').hidden = true;
    if (name !== 'locker' && G.state === 'locker') { startAttract(G.worldId); }
    G.state = name === 'title' ? 'title' : name === 'locker' ? 'locker' : 'menu';
    this.showOnly(name);
    const r = this['render_' + name];
    if (r) r.call(this);
    if (name === 'locker') showLocker();
    this.focusFirst();
  },
  back() {
    const prev = this.stack.pop() || 'title';
    this.open(prev);
  },
  home() { this.stack = []; this.open('title'); },
  focusFirst() {
    if (Input.mode === 'touch') return;
    const scr = document.querySelector('.screen:not([hidden]), .overlay:not([hidden])');
    const b = scr && scr.querySelector('button:not([disabled]), input');
    if (b && Input.mode === 'pad') b.focus();
  },
  handleNav() {
    const I = Input.state;
    const vis = [...document.querySelectorAll('.overlay:not([hidden]) button:not([disabled]), #lobby:not([hidden]) button:not([disabled])')];
    const pool = vis.length ? vis : [...document.querySelectorAll('.screen:not([hidden]) button:not([disabled])')];
    if (I.back && G.state !== 'play') {
      if (!$('ov-results').hidden) return;
      if (this.screen && this.screen !== 'title') { this.back(); return; }
    }
    if (I.ok && document.activeElement && pool.includes(document.activeElement)) { document.activeElement.click(); return; }
    if (!I.nav || !pool.length) return;
    const cur = pool.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { pool[0].focus(); return; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bd = 1e9;
    for (const b of pool) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect(), bx = r.left + r.width / 2, by = r.top + r.height / 2;
      const dx = bx - ax, dy = by - ay;
      const ok = I.nav === 'up' ? dy < -4 : I.nav === 'down' ? dy > 4 : I.nav === 'left' ? dx < -4 : dx > 4;
      if (!ok) continue;
      const d = (I.nav === 'up' || I.nav === 'down') ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); Sfx.ui(); }
  },

  toast(title, text, color) {
    const el = document.createElement('div');
    el.className = 'toast'; el.style.setProperty('--c', color || 'var(--apricot)');
    el.innerHTML = '<b>' + escapeHtml(title) + '</b><span>' + escapeHtml(text || '') + '</span>';
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 4300);
  },

  saveCallsign(v) {
    const cs = cleanCallsign(v);
    if (!cs) { this.toast('Callsign needed', 'Use letters, numbers, spaces, dots, dashes.', '#ff6b6b'); return; }
    G.save.callsign = cs; saveProgress();
    this.toast('Callsign saved', 'You fly as ' + cs + '.', '#7affc8');
    Net.setLobbyPresence();
    if (Net.hasDb) Net.postProfile();
    this.render_title();
  },

  onNet() {
    if (this.screen === 'title') this.renderOnline();
    if (this.screen === 'live') this.render_live();
    if (this.screen === 'boards') this.renderBoard();
    if (G.run && !$('ov-results').hidden && G.run.results) this.refreshResults(G.run);
  },
  renderOnline() {
    const pill = $('online-pill');
    const c = Net.lobbyCounts();
    if (Net.hasRoom) pill.innerHTML = '<i class="dot"></i><span>' + c.total + (c.total === 1 ? ' pilot' : ' pilots') + ' here now</span>';
    else if (Net.status === 'offline') pill.innerHTML = '<i class="dot off"></i><span>Connecting…</span>';
    else pill.innerHTML = '<i class="dot off"></i><span>Solo mode</span>';
    const flying = Object.values(c.worlds).reduce((a, b) => a + b, 0);
    $('live-sub').textContent = flying ? flying + ' flying now' : 'Open Sky · Races';
  },

  /* ---------- title ---------- */
  render_title() {
    const s = G.save;
    $('cs-row').hidden = !!s.callsign;
    $('level-pill').innerHTML = 'Level <b class="num">' + s.level + '</b>' + (s.callsign ? ' · ' + escapeHtml(s.callsign) : '');
    const w = WORLD_BY_ID[G.worldId];
    $('title-world').textContent = w ? 'Now over ' + w.name : '';
    this.renderOnline();
  },

  /* ---------- fly ---------- */
  render_fly() {
    if (!this.selWorld) this.selWorld = G.save.lastWorld || 'harbor';
    const dk = todayKey(), dd = dailyCourseDef(dk), dw = WORLD_BY_ID[dd.world];
    const dBest = G.save.best[dd.id];
    $('daily-card').innerHTML = '<div class="row" style="justify-content:space-between"><div><div class="label">Daily course · ' + dk.slice(0, 4) + '-' + dk.slice(4, 6) + '-' + dk.slice(6) + '</div><div style="font-family:var(--display);font-size:30px;font-weight:800;text-transform:uppercase">' + escapeHtml(dw.name) + ' · ' + COURSE_KINDS[dd.kind].label + '</div><div class="muted">One new course a day, the same for everyone. ' + (dBest ? 'Your best today: <b class="num">' + fmtTime(dBest) + '</b>' : 'Not flown yet.') + '</div></div><button class="btn" id="daily-go">Fly daily</button></div>';
    $('daily-go').onclick = () => { Sfx.click(); this.launch({ mode: 'course', courseId: dd.id }); };
    const wrap = $('worlds');
    wrap.innerHTML = '';
    for (const w of WORLDS) {
      const ok = worldUnlocked(w);
      const b = document.createElement('button');
      b.className = 'wcard' + (w.id === this.selWorld ? ' sel' : '') + (ok ? '' : ' locked');
      b.style.background = 'linear-gradient(160deg,' + w.bgGrad[0] + ',' + w.bgGrad[1] + ')';
      const got = (G.save.shards[w.id] || []).length;
      b.innerHTML = (ok ? '' : '<span class="lk">' + w.unlock + ' medals</span>') + '<b>' + escapeHtml(w.name) + '</b><small>' + (ok ? got + '/20 shards' : 'Locked') + '</small>';
      b.onclick = () => {
        Sfx.click();
        if (!ok) { this.toast(w.name + ' is locked', 'Earn ' + w.unlock + ' medals to open it. You have ' + medalCount() + '.', '#ff9d5c'); return; }
        this.selWorld = w.id;
        $('loading').hidden = false; $('loading-text').textContent = 'Flying to ' + w.name + '…';
        setTimeout(() => { startAttract(w.id); $('loading').hidden = true; this.render_fly(); }, 30);
      };
      wrap.appendChild(b);
    }
    const w = WORLD_BY_ID[this.selWorld];
    if (G.worldId !== w.id) { setTimeout(() => { startAttract(w.id); this.render_fly(); }, 30); }
    $('w-sub').textContent = w.kind === 'islands' ? 'Floating islands' : WORLDS.indexOf(w) + 1 + ' of 7';
    $('w-name').textContent = w.name;
    $('w-blurb').textContent = w.blurb;
    $('w-shards').textContent = (G.save.shards[w.id] || []).length + ' / 20 Sky Shards';
    const modes = $('modes');
    modes.innerHTML = '';
    for (const k of ['line', 'gauntlet']) {
      const cdef = COURSE_BY_ID[w.id + '-' + k], K = COURSE_KINDS[k];
      const course = G.worldId === w.id ? getCourse(cdef, G.world) : null;
      const best = G.save.best[cdef.id], got = G.save.medals[cdef.id];
      const m = course ? course.medals : null;
      const el = document.createElement('div');
      el.className = 'mode';
      el.innerHTML = '<div class="row"><span class="tag ' + (k === 'line' ? 'easy' : 'hard') + '">' + K.diff + '</span><span class="tag">' + (course ? course.rings.length : K.rings) + ' rings</span></div>' +
        '<h3>' + escapeHtml(cdef.name) + '</h3><p>' + K.desc + '</p>' +
        '<div class="best">Best <span class="num">' + fmtTime(best) + '</span>' + (got ? ' · ' + MEDAL_NAMES[got] : '') + '</div>' +
        (m ? '<div class="medals">' + ['plat', 'gold', 'silver', 'bronze'].map(x => '<span class="medal m-' + x + (got && MEDAL_RANK[got] >= MEDAL_RANK[x] ? ' got' : '') + '"><i></i>' + fmtTime(m[x]) + '</span>').join('') + '</div>' : '') +
        '<div class="row"><button class="btn small">Fly</button></div>';
      el.querySelector('button').onclick = () => { Sfx.click(); this.launch({ mode: 'course', courseId: cdef.id }); };
      modes.appendChild(el);
    }
    const att = document.createElement('div');
    att.className = 'mode';
    att.innerHTML = '<div class="row"><span class="tag">2 minutes</span></div><h3>Score Attack</h3><p>Two minutes. Chain rings for a multiplier and add tricks for points.</p><div class="best">Best <span class="num">' + fmtNum(G.save.attack[w.id] || 0) + '</span></div><div class="row"><button class="btn small">Fly</button></div>';
    att.querySelector('button').onclick = () => { Sfx.click(); this.launch({ mode: 'attack', worldId: w.id }); };
    modes.appendChild(att);
    const fr = document.createElement('div');
    fr.className = 'mode';
    fr.innerHTML = '<div class="row"><span class="tag">No timer</span></div><h3>Explore</h3><p>No timer. Find the 20 Sky Shards and practise tricks.</p><div class="best">' + (G.save.shards[w.id] || []).length + ' / 20 shards found</div><div class="row"><button class="btn small">Fly</button></div>';
    fr.querySelector('button').onclick = () => { Sfx.click(); this.launch({ mode: 'free', worldId: w.id }); };
    modes.appendChild(fr);
  },

  launch(opts) {
    $('loading').hidden = false; $('loading-text').textContent = 'Getting airborne…';
    setTimeout(async () => {
      try {
        if (opts.mode === 'sky') { await Net.joinSky(opts.worldId, opts.server); }
        else if (opts.mode === 'race') { await Net.joinRace(opts.courseId); }
        else await Net.leaveAll();
        this.showOnly('none');
        startRun(opts);
      } catch (e) { console.error(e); this.toast('Could not start', String(e && e.message || e), '#ff6b6b'); }
      $('loading').hidden = true;
    }, 30);
  },

  /* ---------- live ---------- */
  render_live() {
    const c = Net.lobbyCounts();
    $('live-pill').innerHTML = Net.hasRoom ? '<i class="dot"></i>' + c.total + ' online' : '<i class="dot off"></i>Offline';
    $('live-note').hidden = true;
    const sw = $('sky-worlds'); sw.innerHTML = '';
    const peers = this.lobbyBy();
    for (const w of WORLDS) {
      const b = document.createElement('button');
      const n = peers.sky[w.id] || 0;
      b.className = 'wcard'; b.style.background = 'linear-gradient(160deg,' + w.bgGrad[0] + ',' + w.bgGrad[1] + ')';
      b.innerHTML = '<span class="lk">' + n + (n === 1 ? ' pilot' : ' pilots') + '</span><b>' + escapeHtml(w.name) + '</b><small>Open Sky</small>';
      b.onclick = () => { Sfx.click(); this.launch({ mode: 'sky', worldId: w.id }); };
      sw.appendChild(b);
    }
    // server list: every running Open Sky server, with a Join button until it is full
    const rows = [];
    for (const w of WORLDS) for (const s of Net.skyServers(w.id)) rows.push({ w, s });
    $('sky-servers').innerHTML = rows.length
      ? '<table><tr><th>World</th><th>Server</th><th>Pilots</th><th></th></tr>' + rows.map(({ w, s }) =>
        '<tr><td>' + escapeHtml(w.name) + '</td><td>' + s.n + '</td><td class="num">' + s.count + ' / ' + Net.SKY_CAP + '</td><td style="text-align:right"><button class="btn small sky" data-w="' + w.id + '" data-n="' + s.n + '"' + (s.full || !worldUnlocked(w) ? ' disabled' : '') + '>' + (s.full ? 'Full' : 'Join') + '</button></td></tr>').join('') + '</table>'
      : '<span class="muted">No servers running. Pick a world above to start one.</span>';
    $('sky-servers').querySelectorAll('button[data-w]').forEach(b => (b.onclick = () => { Sfx.click(); this.launch({ mode: 'sky', worldId: b.dataset.w, server: +b.dataset.n }); }));
    const rr = $('race-rooms'); rr.innerHTML = '';
    const list = COURSES.slice().sort((a, b) => (peers.race[b.id] || 0) - (peers.race[a.id] || 0));
    for (const cdef of list) {
      const w = WORLD_BY_ID[cdef.world];
      const n = peers.race[cdef.id] || 0;
      const ok = worldUnlocked(w);
      const el = document.createElement('div');
      el.className = 'mode';
      el.innerHTML = '<div class="row"><span class="tag ' + (cdef.kind === 'line' ? 'easy' : 'hard') + '">' + COURSE_KINDS[cdef.kind].diff + '</span><span class="tag">' + n + ' in room</span></div><h3>' + escapeHtml(cdef.name) + '</h3><p>' + escapeHtml(w.name) + '</p><div class="row"><button class="btn small sky"' + (ok ? '' : ' disabled') + '>' + (ok ? 'Join room' : 'Locked') + '</button></div>';
      el.querySelector('button').onclick = () => { Sfx.click(); this.launch({ mode: 'race', courseId: cdef.id }); };
      rr.appendChild(el);
    }
  },
  lobbyBy() {
    const out = { sky: {}, race: {} };
    if (!Net.hasRoom) return out;
    const peers = Net.lobbyPeers ? Net.lobbyPeers() : [];
    for (const p of peers) {
      const pr = p.presence || {};
      if (pr.m === 'sky' && pr.w) out.sky[pr.w] = (out.sky[pr.w] || 0) + 1;
      if (pr.m === 'race' && pr.rc) out.race[pr.rc] = (out.race[pr.rc] || 0) + 1;
    }
    return out;
  },

  /* ---------- locker ---------- */
  render_locker() {
    const tabs = [['frames', 'Frames'], ['paints', 'Paints'], ['trails', 'Trails']];
    $('locker-tabs').innerHTML = tabs.map(([k, n]) => '<button class="tab' + (this.lockerTab === k ? ' on' : '') + '" data-t="' + k + '">' + n + '</button>').join('');
    $('locker-tabs').querySelectorAll('button').forEach(b => (b.onclick = () => { this.lockerTab = b.dataset.t; Sfx.ui(); this.render_locker(); }));
    const box = $('locker-items'); box.innerHTML = '';
    const list = this.lockerTab === 'frames' ? FRAMES : this.lockerTab === 'paints' ? PAINTS : TRAILS;
    const cur = this.lockerTab === 'frames' ? G.save.frame : this.lockerTab === 'paints' ? G.save.paint : G.save.trail;
    for (const it of list) {
      const ok = unlockMet(it.unlock);
      const b = document.createElement('button');
      b.className = 'item' + (it.id === cur ? ' on' : '') + (ok ? '' : ' locked');
      let sw = '';
      if (this.lockerTab === 'paints') sw = '<div class="swatch" style="background:linear-gradient(90deg,' + it.a + ' 0 60%,' + it.b + ' 60%)"></div>';
      if (this.lockerTab === 'trails') { const cs = it.colors || [PAINT_BY_ID[G.save.paint].a, PAINT_BY_ID[G.save.paint].b]; sw = '<div class="swatch" style="background:linear-gradient(90deg,' + cs.join(',') + (cs.length === 1 ? ',transparent' : '') + ')"></div>'; }
      let stats = '';
      if (this.lockerTab === 'frames') stats = '<small>' + escapeHtml(it.desc) + '</small><small>Roll ' + it.roll.toFixed(1) + ' · Pitch ' + it.pitch.toFixed(1) + ' · Glide ' + (1 / it.drag).toFixed(2) + '</small>';
      b.innerHTML = sw + '<b>' + escapeHtml(it.name) + '</b>' + stats + '<small>' + (ok ? (it.id === cur ? 'Equipped' : 'Tap to equip') : 'Locked · ' + escapeHtml(unlockText(it.unlock))) + '</small>';
      b.onclick = () => {
        if (!ok) { Sfx.ui(); this.toast('Locked', unlockText(it.unlock), '#ff9d5c'); return; }
        Sfx.click();
        if (this.lockerTab === 'frames') G.save.frame = it.id; else if (this.lockerTab === 'paints') G.save.paint = it.id; else G.save.trail = it.id;
        saveProgress(); rebuildPlayerMesh(); this.render_locker();
        if (Net.hasDb) Net.postProfile();
      };
      box.appendChild(b);
    }
  },

  /* ---------- pilot ---------- */
  render_pilot() {
    const s = G.save, st = s.stats;
    const need = xpForLevel(s.level);
    const ch = dailyChallenges();
    const shards = WORLDS.map(w => '<div class="stat"><b class="num">' + (s.shards[w.id] || []).length + '/20</b><span>' + escapeHtml(w.short) + '</span></div>').join('');
    const tiers = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const it = allItems().filter(i => i.unlock && i.unlock.level === l);
      tiers.push('<div class="tier' + (s.level >= l ? ' got' : '') + (s.level === l ? ' cur' : '') + '"><b>' + l + '</b>' + (it.length ? it.map(i => escapeHtml(i.name) + ' <span class="muted">' + i.kind.toLowerCase() + '</span>').join('<br>') : '<span class="muted">+ glide time</span>') + '</div>');
    }
    const achGot = ACHIEVEMENTS.filter(a => s.ach[a.id]).length;
    $('pilot-body').innerHTML =
      '<div class="panel"><div class="row" style="justify-content:space-between"><div><div class="label">Pilot</div><div style="font-family:var(--display);font-size:40px;font-weight:900;text-transform:uppercase">' + escapeHtml(s.callsign || 'Unnamed pilot') + '</div></div><div style="text-align:right"><div class="label">Level</div><div style="font-family:var(--display);font-size:52px;font-weight:900" class="num">' + s.level + '</div></div></div>' +
      '<div class="bar" style="margin-top:8px"><i style="width:' + (s.level >= MAX_LEVEL ? 100 : Math.round(s.xp / need * 100)) + '%"></i></div><div class="muted num" style="font-size:13px;margin-top:6px">' + (s.level >= MAX_LEVEL ? 'Max level' : fmtNum(s.xp) + ' / ' + fmtNum(need) + ' XP to level ' + (s.level + 1)) + '</div></div>' +
      '<div class="panel"><div class="label" style="margin-bottom:10px">Today\'s challenges</div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">' + ch.map(c => { const v = s.daily.prog[c.id] || 0, done = s.daily.done.includes(c.id); return '<div class="chal' + (done ? ' done' : '') + '"><b>' + escapeHtml(c.text) + '</b><div class="bar"><i style="width:' + Math.min(100, v / c.goal * 100) + '%"></i></div><span class="muted num" style="font-size:12px">' + (done ? 'Done' : fmtNum(Math.min(v, c.goal)) + ' / ' + fmtNum(c.goal)) + ' · ' + c.xp + ' XP</span></div>'; }).join('') + '</div></div>' +
      '<div class="panel"><div class="label" style="margin-bottom:10px">Level rewards</div><div class="track" id="tier-track">' + tiers.join('') + '</div></div>' +
      '<div class="panel"><div class="label" style="margin-bottom:10px">Sky Shards · ' + totalShards() + ' / ' + WORLDS.length * 20 + '</div><div class="statgrid">' + shards + '</div></div>' +
      '<div class="panel"><div class="label" style="margin-bottom:10px">Flight log</div><div class="statgrid">' +
      [[st.km.toFixed(1) + ' km', 'Flown'], [fmtNum(st.rings), 'Rings'], [fmtNum(st.rolls), 'Rolls'], [fmtNum(st.loops), 'Loops'], [Math.round(st.maxSpeed * (G.settings.units === 'kmh' ? 3.6 : 1)) + (G.settings.units === 'kmh' ? ' km/h' : ' m/s'), 'Top speed'], [fmtNum(st.thermal) + ' s', 'In thermals'], [medalCount('gold') + ' / ' + COURSES.length, 'Golds'], [medalCount('plat') + ' / ' + COURSES.length, 'Platinums'], [st.races + ' / ' + st.raceWins, 'Races / wins'], [fmtNum(st.crashes), 'Crashes']].map(([v, l]) => '<div class="stat"><b class="num">' + v + '</b><span>' + l + '</span></div>').join('') + '</div></div>' +
      '<div class="panel"><div class="label" style="margin-bottom:10px">Achievements · ' + achGot + ' / ' + ACHIEVEMENTS.length + '</div><div class="achs">' + ACHIEVEMENTS.map(a => '<div class="ach' + (s.ach[a.id] ? ' got' : '') + '"><b>' + escapeHtml(a.name) + '</b><small>' + escapeHtml(a.desc) + '</small></div>').join('') + '</div></div>';
    const tr = $('tier-track');
    const cur = tr.querySelector('.cur'); if (cur) tr.scrollLeft = cur.offsetLeft - 40;
  },

  /* ---------- boards ---------- */
  render_boards() {
    if (!this.boardTab) this.boardTab = (G.save.lastWorld || 'harbor') + '-line';
    const dk = 'daily-' + todayKey();
    const tabs = [[dk, 'Daily']].concat(COURSES.map(c => [c.id, c.name])).concat(WORLDS.map(w => ['attack:' + w.id, w.short + ' Score']));
    $('board-tabs').innerHTML = tabs.map(([k, n]) => '<button class="tab' + (this.boardTab === k ? ' on' : '') + '" data-t="' + k + '">' + escapeHtml(n) + '</button>').join('');
    $('board-tabs').querySelectorAll('button').forEach(b => (b.onclick = () => { this.boardTab = b.dataset.t; Sfx.ui(); this.render_boards(); }));
    this.renderBoard();
  },
  renderBoard() {
    const body = $('board-body');
    if (!body) return;
    const t = this.boardTab;
    let note = '';
    if (!Net.hasDb) note = '<p class="muted">The shared board is not connected in this view. Your own best times are still saved on this device.</p>';
    else if (Net.canPost === false) note = '<p class="muted">You can read the board, but your account can only view this page, so your times stay on this device.</p>';
    if (t.startsWith('attack:')) {
      const wid = t.slice(7), rows = Net.attackRankings(wid).slice(0, 50);
      body.innerHTML = '<div class="label">' + escapeHtml(WORLD_BY_ID[wid].name) + ' · Score Attack · your best ' + fmtNum(G.save.attack[wid] || 0) + '</div>' + note +
        (rows.length ? '<div class="tablewrap"><table><thead><tr><th>#</th><th>Pilot</th><th>Level</th><th style="text-align:right">Score</th></tr></thead><tbody>' + rows.map((r, i) => '<tr class="' + (r.me ? 'me' : '') + '"><td class="num">' + (i + 1) + '</td><td>' + escapeHtml(r.cs) + '</td><td class="num">' + r.lvl + '</td><td class="num" style="text-align:right">' + fmtNum(r.score) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No scores yet. Be the first.</p>');
      return;
    }
    const cdef = courseDefById(t);
    const rows = Net.rankings(t).slice(0, 50);
    body.innerHTML = '<div class="row" style="justify-content:space-between"><div class="label">' + escapeHtml(WORLD_BY_ID[cdef.world].name) + ' · ' + escapeHtml(cdef.name) + ' · your best ' + fmtTime(G.save.best[t]) + '</div><button class="btn small" id="board-fly">Fly this course</button></div>' + note +
      (rows.length ? '<div class="tablewrap"><table><thead><tr><th>#</th><th>Pilot</th><th>Level</th><th style="text-align:right">Time</th><th></th></tr></thead><tbody>' + rows.map((r, i) => '<tr class="' + (r.me ? 'me' : '') + '"><td class="num">' + (i + 1) + '</td><td>' + escapeHtml(r.cs) + '</td><td class="num">' + r.lvl + '</td><td class="num" style="text-align:right">' + fmtTime(r.t) + '</td><td style="text-align:right"><button class="btn small ghost" data-ghost="' + escapeHtml(r.uid) + '" data-cs="' + escapeHtml(r.cs) + '">Race ghost</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No times yet. Fly it and claim the top spot.</p>');
    $('board-fly').onclick = () => { Sfx.click(); this.launch({ mode: 'course', courseId: t }); };
    body.querySelectorAll('[data-ghost]').forEach(b => (b.onclick = async () => {
      Sfx.click();
      if (!worldUnlocked(WORLD_BY_ID[cdef.world])) { this.toast('World locked', 'Earn more medals to fly ' + WORLD_BY_ID[cdef.world].name + '.', '#ff9d5c'); return; }
      b.disabled = true; b.textContent = 'Loading…';
      const g = await Net.fetchGhost(b.dataset.ghost, t);
      if (!g) { b.textContent = 'No ghost'; this.toast('No ghost saved', 'This pilot has a time but no saved flight path.', '#ff9d5c'); return; }
      this.launch({ mode: 'course', courseId: t, ghost: { frames: Ghost.decode(g.d), t: g.t, cs: b.dataset.cs, frame: g.frame, paint: g.paint } });
    }));
  },

  /* ---------- settings ---------- */
  render_settings() {
    const s = G.settings;
    const seg = (key, opts) => '<div class="seg" data-k="' + key + '">' + opts.map(([v, n]) => '<button data-v="' + v + '" class="' + (String(s[key]) === String(v) ? 'on' : '') + '">' + n + '</button>').join('') + '</div>';
    const rng = (key, min, max, step) => '<input type="range" id="set-' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + s[key] + '" data-k="' + key + '">';
    $('settings-body').innerHTML =
      '<label for="set-cs">Callsign</label><div class="callsign"><input id="set-cs" maxlength="14" value="' + escapeHtml(G.save.callsign) + '"><button class="btn small sky" id="set-cs-save">Save</button></div>' +
      '<label for="set-master">Master volume</label>' + rng('master', 0, 1, 0.05) +
      '<label for="set-music">Music</label>' + rng('music', 0, 1, 0.05) +
      '<label for="set-sfx">Effects and wind</label>' + rng('sfx', 0, 1, 0.05) +
      '<label>Pitch controls</label>' + seg('pitch', [['plane', 'Forward = dive'], ['arcade', 'Forward = climb']]) +
      '<label>A/D steering (T in flight)</label>' + seg('steer', [['bank', 'Steep bank'], ['roll', 'Free roll'], ['sharp', 'Sharp turn']]) +
      '<label>Auto-level assist</label>' + seg('assist', [[true, 'On'], [false, 'Off']]) +
      '<label>Mouse steering</label>' + seg('mouse', [[false, 'Off'], [true, 'On']]) +
      '<label for="set-fov">Field of view</label>' + rng('fov', 55, 95, 1) +
      '<label>Graphics</label>' + seg('quality', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']]) +
      '<label>Speed units</label>' + seg('units', [['kmh', 'km/h'], ['ms', 'm/s']]) +
      '<label>Other pilots and ghosts</label>' + seg('others', [[true, 'Show'], [false, 'Hide']]) +
      '<label>Wingtip trails</label>' + seg('trails', [[true, 'On'], [false, 'Off']]) +
      '<label>Camera shake</label>' + seg('shake', [[true, 'On'], [false, 'Off']]) +
      '<label>Progress</label><button class="btn small ghost" id="set-reset">' + (this.resetArm ? 'Tap again to erase everything' : 'Reset progress') + '</button>';
    const body = $('settings-body');
    body.querySelectorAll('.seg').forEach(sg => sg.querySelectorAll('button').forEach(b => (b.onclick = () => {
      const k = sg.dataset.k; let v = b.dataset.v;
      if (v === 'true') v = true; else if (v === 'false') v = false;
      s[k] = v; saveSettings(); Sfx.ui();
      if (k === 'quality') { G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, v === 'high' ? 2 : v === 'med' ? 1.5 : 1)); const wid = G.worldId; G.worldId = null; startAttract(wid); }
      this.render_settings();
    })));
    body.querySelectorAll('input[type=range]').forEach(r => (r.oninput = () => { s[r.dataset.k] = parseFloat(r.value); saveSettings(); Sfx.setVolumes(s.master, s.music, s.sfx); }));
    $('set-cs-save').onclick = () => this.saveCallsign($('set-cs').value);
    $('set-reset').onclick = () => {
      if (!this.resetArm) { this.resetArm = true; this.render_settings(); setTimeout(() => { this.resetArm = false; if (this.screen === 'settings') this.render_settings(); }, 4000); return; }
      this.resetArm = false;
      const cs = G.save.callsign;
      G.save = newSave(); G.save.callsign = cs;
      Object.keys(COURSE_CACHE).forEach(k => Store.del('ghost:' + k));
      saveProgress(); rebuildPlayerMesh(); checkNewUnlocks(false);
      this.toast('Progress reset', 'Levels, medals, shards and unlocks are back to the start.', '#ff9d5c');
      this.render_settings();
    };
  },

  render_howto() {
    $('howto-body').innerHTML =
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px">' +
      '<div><div class="label" style="margin-bottom:8px">Keyboard</div><div class="keys">' +
      '<span><kbd>W</kbd> <kbd>S</kbd></span><span>Dive / climb (swap in Settings)</span>' +
      '<span><kbd>A</kbd> <kbd>D</kbd></span><span>Turn left / right</span>' +
      '<span><kbd>T</kbd></span><span>Switch steering: steep bank, free roll, sharp turn</span>' +
      '<span><kbd>Q</kbd> <kbd>E</kbd></span><span>Barrel roll left / right (hold)</span>' +
      '<span><kbd>Space</kbd></span><span>Boost (uses the boost bar)</span>' +
      '<span><kbd>Shift</kbd></span><span>Air brake, tighter turns</span>' +
      '<span><kbd>C</kbd></span><span>Change camera</span>' +
      '<span><kbd>R</kbd></span><span>Back to the last ring</span>' +
      '<span><kbd>P</kbd></span><span>Photo mode</span>' +
      '<span><kbd>Esc</kbd></span><span>Pause</span></div></div>' +
      '<div><div class="label" style="margin-bottom:8px">Touch</div><p class="muted" style="margin:0 0 8px">Drag anywhere on the left half to steer: sideways turns, up dives, down climbs. Hold BOOST and BRAKE on the right. CAM changes camera, BACK returns to the last ring.</p>' +
      '<div class="label" style="margin:14px 0 8px">Gamepad</div><p class="muted" style="margin:0">Left stick steers. Right trigger or A boosts, left trigger brakes. Bumpers or right stick for barrel rolls. Y camera, B back to ring, X photo, Start pause.</p></div>' +
      '<div><div class="label" style="margin-bottom:8px">How gliding works</div><p class="muted" style="margin:0 0 8px">You have no engine. Diving turns height into speed; climbing spends it. Too slow and the wing stalls and drops its nose. Thermals (rising sparkles) and cyan lift rings give height back. Boost refills from rings and thermals.</p>' +
      '<div class="label" style="margin:14px 0 8px">Style</div><p class="muted" style="margin:0">Barrel rolls, loops, inverted flight, skimming the ground or waves, near misses, gates and power dives all score. Rings chain into a multiplier.</p></div>' +
      '</div><div class="label" style="margin:22px 0 8px">Tips</div><ul class="muted" style="margin:0;padding-left:18px;line-height:1.6;columns:2 260px">' + TIPS.map(t => '<li>' + escapeHtml(t) + '</li>').join('') + '</ul>';
    G.save.seenHelp = true; saveProgress();
  },

  /* ---------- in-play ---------- */
  enterPlay(run) {
    this.showOnly('none');
    $('ov-pause').hidden = true; $('ov-results').hidden = true;
    $('hud').hidden = false;
    const name = run.cdef ? run.cdef.name : run.mode === 'attack' ? 'Score Attack' : run.mode === 'sky' ? 'Open Sky' : 'Explore';
    $('h-mode').textContent = WORLD_BY_ID[G.worldId].short + ' · ' + name;
    $('h-score').hidden = !(run.mode === 'attack' || run.mode === 'free' || run.mode === 'sky');
    $('h-pilots').hidden = run.mode !== 'sky';
    $('standings').hidden = run.mode !== 'race';
    $('h-target').textContent = '';
    if (run.medals) {
      const best = G.save.best[run.cdef.id], got = G.save.medals[run.cdef.id];
      const next = ['bronze', 'silver', 'gold', 'plat'].find(m => !got || MEDAL_RANK[m] > MEDAL_RANK[got]);
      $('h-target').textContent = next ? MEDAL_NAMES[next] + ' ' + fmtTime(run.medals[next]) : 'Best ' + fmtTime(best);
    }
    $('lobby').hidden = !(run.mode === 'race' && run.phase === 'lobby');
    $('touch-hint').hidden = G.save.stats.flights > 3;
    $('count').hidden = true; $('warn').hidden = true;
  },
  countdown(v) {
    const el = $('count');
    el.hidden = false; el.textContent = v; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this._ct); this._ct = setTimeout(() => (el.hidden = true), 850);
  },
  splitDelta(ms) {
    const el = $('split');
    el.hidden = false; el.textContent = fmtDelta(ms); el.className = ms <= 0 ? 'ahead' : 'behind';
    clearTimeout(this._st); this._st = setTimeout(() => (el.hidden = true), 1800);
  },
  feed(name, pts, mult) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.innerHTML = escapeHtml(name) + (pts ? '<em>+' + fmtNum(pts) + '</em>' : '') + (mult ? '<i>' + escapeHtml(mult) + '</i>' : '');
    const f = $('feed'); f.appendChild(el);
    while (f.children.length > 4) f.firstChild.remove();
    setTimeout(() => el.remove(), 1650);
  },
  flash(text, small) {
    const el = $('flash');
    el.hidden = false; el.textContent = text;
    clearTimeout(this._ft); this._ft = setTimeout(() => (el.hidden = true), small ? 1100 : 1400);
  },
  photo(on) {
    $('photo-hint').hidden = !on;
    document.querySelectorAll('#hud > :not(#photo-hint)').forEach(e => (e.style.visibility = on ? 'hidden' : ''));
  },

  pause() {
    const run = G.run;
    $('ov-pause').hidden = false;
    const btns = [['Resume', () => resumeGame()]];
    if (run.mode === 'course' || run.mode === 'attack') btns.push(['Restart', () => { $('ov-pause').hidden = true; startRun({ mode: run.mode, courseId: run.cdef && run.cdef.id, worldId: G.worldId, ghost: run.boardGhost }); }]);
    btns.push(['Change camera (' + CAM_NAMES[G.camMode].replace(' camera', '') + ')', () => { cycleCamera(); this.pause(); }]);
    btns.push(['Sound: ' + (G.settings.master > 0 ? 'On' : 'Off'), () => { G.settings.master = G.settings.master > 0 ? 0 : 0.8; saveSettings(); Sfx.setVolumes(G.settings.master, G.settings.music, G.settings.sfx); this.pause(); }]);
    if (run.mode === 'free' || run.mode === 'sky') btns.push(['End flight', () => { $('ov-pause').hidden = true; G.state = 'play'; endFreeFlight(); }]);
    btns.push([run.mode === 'race' || run.mode === 'sky' ? 'Leave' : 'Quit to menu', () => this.quitToMenu()]);
    $('pause-btns').innerHTML = btns.map((b, i) => '<button class="btn ' + (i ? 'ghost' : '') + '" data-i="' + i + '">' + escapeHtml(b[0]) + '</button>').join('');
    $('pause-btns').querySelectorAll('button').forEach(b => (b.onclick = () => { Sfx.click(); btns[+b.dataset.i][1](); }));
    if (Input.mode !== 'touch') $('pause-btns').querySelector('button').focus();
  },
  quitToMenu() {
    Net.leaveAll();
    $('ov-pause').hidden = true; $('ov-results').hidden = true; $('hud').hidden = true;
    G.run = null;
    startAttract(G.worldId);
    this.stack = ['title'];
    this.open('fly');
    Net.setLobbyPresence();
  },

  /* ---------- results ---------- */
  showResults(run) {
    $('ov-results').hidden = false;
    $('lobby').hidden = true;
    this.refreshResults(run);
    const b = $('results-card').querySelector('button');
    if (b && Input.mode !== 'touch') b.focus();
  },
  refreshResults(run) {
    const R = run.results;
    if (!R) return;
    const card = $('results-card');
    const xpLine = '<div class="muted">+' + fmtNum(R.xp) + ' XP' + (R.levelUps ? ' · level ' + G.save.level + '!' : '') + '</div>';
    const st = run.stats;
    const stats = '<div class="statgrid">' + [[st.rings, 'Rings'], [st.rolls, 'Rolls'], [st.loops, 'Loops'], [(st.skim + st.wave).toFixed(1) + 's', 'Skim'], [st.needles, 'Near misses'], [Math.round(st.maxSpeed * (G.settings.units === 'kmh' ? 3.6 : 1)), 'Top ' + (G.settings.units === 'kmh' ? 'km/h' : 'm/s')], [st.crashes, 'Crashes'], [st.km.toFixed(2) + ' km', 'Distance']].map(([v, l]) => '<div class="stat"><b class="num">' + v + '</b><span>' + l + '</span></div>').join('') + '</div>';
    let html = '', btns = [];
    if (R.kind === 'course') {
      const rows = Net.rankings(run.cdef.id);
      const rank = rows.findIndex(r => r.me) + 1;
      let post = '';
      if (R.posting) post = 'Posting to the board…';
      else if (R.post && R.post.posted) post = 'Posted. You are #' + rank + ' of ' + rows.length + ' on the board.';
      else if (R.post && R.post.reason === 'slower') post = 'Your board time stays ' + fmtTime((rows.find(r => r.me) || {}).t) + (rank ? ' (#' + rank + ')' : '') + '.';
      else if (R.post && R.post.reason === 'readonly') post = 'Saved on this device. Your access to this page is view-only, so the shared board did not take it.';
      else post = 'Saved on this device.';
      html = '<div class="label">' + escapeHtml(WORLD_BY_ID[run.cdef.world].name) + ' · ' + escapeHtml(run.cdef.name) + '</div><h2>' + (R.pb ? 'New best' : 'Finished') + '</h2>' +
        '<div class="res-big num">' + fmtTime(R.ms) + '</div>' +
        (R.prevBest != null ? '<div class="muted num">' + (R.pb ? fmtDelta(R.ms - R.prevBest) + ' on your old best' : 'Best ' + fmtTime(R.prevBest) + ' (' + fmtDelta(R.ms - R.prevBest) + ')') + '</div>' : '') +
        (R.medal ? '<div class="res-medal m-' + R.medal + '"><i></i>' + MEDAL_NAMES[R.medal] + ' medal</div>' : '<div class="muted">No medal yet. Bronze is ' + fmtTime(run.medals.bronze) + '.</div>') +
        '<div class="medals">' + ['plat', 'gold', 'silver', 'bronze'].map(x => '<span class="medal m-' + x + (R.medal && MEDAL_RANK[R.medal] >= MEDAL_RANK[x] ? ' got' : '') + '"><i></i>' + fmtTime(run.medals[x]) + '</span>').join('') + '</div>' +
        (R.beatGhost ? '<div style="color:var(--mint);font-weight:800">You beat ' + escapeHtml(run.boardGhost.cs) + '\'s ghost.</div>' : '') +
        '<div class="muted">' + escapeHtml(post) + '</div>' + xpLine + stats;
      btns = [['Fly again', () => startRun({ mode: 'course', courseId: run.cdef.id, ghost: run.boardGhost })]];
      const other = run.cdef.kind === 'line' ? COURSE_BY_ID[run.cdef.world + '-gauntlet'] : null;
      if (other) btns.push(['Try ' + other.name, () => startRun({ mode: 'course', courseId: other.id })]);
      btns.push(['Board', () => { this.quitToMenu(); this.boardTab = run.cdef.id; this.go('boards'); }]);
      btns.push(['Menu', () => this.quitToMenu()]);
    } else if (R.kind === 'attack') {
      const rows = Net.attackRankings(G.worldId); const rank = rows.findIndex(r => r.me) + 1;
      html = '<div class="label">' + escapeHtml(WORLD_BY_ID[G.worldId].name) + ' · Score Attack</div><h2>' + (R.pb ? 'New best' : 'Time') + '</h2><div class="res-big num">' + fmtNum(R.score) + '</div><div class="muted">' + (R.prev ? 'Previous best ' + fmtNum(R.prev) : 'First score in this world') + (rank ? ' · #' + rank + ' on the board' : '') + '</div>' + xpLine + stats;
      btns = [['Again', () => startRun({ mode: 'attack', worldId: G.worldId })], ['Menu', () => this.quitToMenu()]];
    } else if (R.kind === 'race') {
      const list = raceStandingsList();
      html = '<div class="label">Race · ' + escapeHtml(run.cdef.name) + '</div><h2>' + (R.place === 1 && R.field > 1 ? 'You won' : R.place ? 'Place ' + R.place : 'Finished') + '</h2><div class="res-big num">' + fmtTime(R.ms) + '</div>' +
        '<div class="tablewrap"><table><tbody>' + list.map((i, k) => '<tr class="' + (i.me ? 'me' : '') + '"><td class="num">' + (k + 1) + '</td><td>' + escapeHtml(i.cs) + '</td><td class="num" style="text-align:right">' + (i.ft != null ? fmtTime(i.ft) : 'did not finish') + '</td></tr>').join('') + '</tbody></table></div>' + xpLine;
      btns = [['Back to lobby', () => { $('ov-results').hidden = true; backToLobby(); }], ['Leave', () => this.quitToMenu()]];
    } else {
      html = '<div class="label">' + escapeHtml(WORLD_BY_ID[G.worldId].name) + '</div><h2>Flight log</h2><div class="muted">' + (G.save.shards[G.worldId] || []).length + ' / 20 shards found here.</div>' + xpLine + stats;
      btns = [['Keep flying', () => startRun({ mode: run.mode, worldId: G.worldId })], ['Menu', () => this.quitToMenu()]];
    }
    card.innerHTML = html + '<div class="row">' + btns.map((b, i) => '<button class="btn' + (i ? ' ghost' : '') + '" data-i="' + i + '">' + escapeHtml(b[0]) + '</button>').join('') + '</div>';
    card.querySelectorAll('.row:last-child button').forEach(b => (b.onclick = () => { Sfx.click(); $('ov-results').hidden = true; btns[+b.dataset.i][1](); }));
  },
  showRaceWait(run) {
    this.feed('Finished', 0);
    this.flash('Finished in ' + fmtTime(run.results.ms) + '. Waiting for the others…');
  },
  raceLobby(info, isHost) {
    const el = $('lobby');
    if (!info) { el.hidden = true; return; }
    el.hidden = false;
    const now = performance.now();
    if (this._lobT && now - this._lobT < 250) return;
    this._lobT = now;
    const racing = info.filter(i => i.st !== 'lobby').length;
    const key = JSON.stringify(info.map(i => [i.cs, i.st, i.me])) + isHost;
    if (key === this._lobKey) return;
    this._lobKey = key;
    el.innerHTML = '<div class="card" style="width:100%"><div class="label">Race room · ' + escapeHtml(G.run.cdef.name) + '</div>' +
      '<div class="grid" style="gap:6px">' + info.map(i => '<div class="row" style="justify-content:space-between"><b>' + escapeHtml(i.cs) + (i.me ? ' (you)' : '') + '</b><span class="muted">' + (i.st === 'lobby' ? 'waiting' : i.st === 'done' ? 'finished' : 'racing') + '</span></div>').join('') + '</div>' +
      (racing ? '<div class="muted">A race is running. You join the next one.</div>' : '') +
      '<div class="row">' + (isHost ? '<button class="btn" id="race-start">Start race' + (info.length > 1 ? ' for ' + info.filter(i => i.st === 'lobby').length : '') + '</button>' : '<span class="muted">Waiting for the host to start…</span>') + '<button class="btn ghost" id="race-leave">Leave</button></div>' +
      (info.length <= 1 ? '<div class="muted" style="font-size:13px">Nobody else here yet. Share the page link so friends can join, or start a solo run.</div>' : '') + '</div>';
    const sb = $('race-start'); if (sb) sb.onclick = () => { Sfx.click(); hostStartRace(); };
    $('race-leave').onclick = () => { Sfx.click(); this.quitToMenu(); };
  },
  raceStandings(info, run) {
    const now = performance.now();
    if (this._rsT && now - this._rsT < 300) return;
    this._rsT = now;
    const list = raceStandingsList();
    $('standings').innerHTML = list.map((i, k) => '<div class="' + (i.me ? 'me' : '') + '"><span>' + (k + 1) + '. ' + escapeHtml(i.cs) + '</span><span class="num">' + (i.ft != null ? fmtTime(i.ft) : i.ri + '/' + run.rings.length) + '</span></div>').join('');
  },

  /* ---------- HUD each frame ---------- */
  updateHud(dt) {
    const run = G.run, p = G.player.p;
    if (!run || $('hud').hidden) return;
    const set = (id, v) => { if (this.hudCache[id] !== v) { this.hudCache[id] = v; $(id).textContent = v; } };
    const kmh = G.settings.units === 'kmh';
    set('h-speed', String(Math.round(p.speed * (kmh ? 3.6 : 1))));
    set('h-speedu', kmh ? 'km/h' : 'm/s');
    set('h-alt', String(Math.max(0, Math.round(p.pos.y - (run.world.waterLevel > -1e5 ? run.world.waterLevel : 0)))));
    $('h-boost').style.width = Math.round(p.boost * 100) + '%';
    if (run.mode === 'attack') set('h-time', fmtTime(Math.max(0, run.timeLimit - run.t)));
    else if (run.mode === 'free' || run.mode === 'sky') set('h-time', run.stats.km.toFixed(2) + ' km');
    else set('h-time', fmtTime(run.t));
    if (run.rings.length && run.mode !== 'attack') set('h-rings', Math.min(run.next, run.rings.length) + ' / ' + run.rings.length);
    else if (run.mode === 'attack') set('h-rings', run.stats.rings + ' rings');
    else set('h-rings', (G.save.shards[G.worldId] || []).length + ' / 20 shards');
    set('h-combo', run.combo > 1 ? 'Combo x' + run.combo : '');
    if (!$('h-score').hidden) set('h-score', fmtNum(run.score));
    // ghost delta (live, against the ghost's split at the same ring)
    if (run.ghost && run.splitsPB && run.next > 0 && run.splitsPB[run.next - 1] != null && run.phase === 'fly') {
      const d = run.splits[run.next - 1] - run.splitsPB[run.next - 1];
      const el = $('h-delta'); const txt = fmtDelta(d);
      if (this.hudCache.delta !== txt) { this.hudCache.delta = txt; el.textContent = txt; el.className = 'hud-delta ' + (d <= 0 ? 'ahead' : 'behind'); }
    } else if (this.hudCache.delta) { this.hudCache.delta = ''; $('h-delta').textContent = ''; }
    // pilots in Open Sky
    if (run.mode === 'sky') {
      const names = [...Net.remote.values()].map(r => r.cs);
      set('h-pilots', Net.inSky ? 'Server ' + Net.skyServer + ' · ' + (names.length ? names.length + ' flying with you: ' + names.slice(0, 5).join(', ') + (names.length > 5 ? '…' : '') : 'Nobody else here yet') : 'Live not connected · flying solo');
    }
    if (run.mode === 'race' && run.phase !== 'lobby') this.raceStandings(null, run);
    // warnings
    let warn = '';
    if (p.alive && run.phase === 'fly') {
      if (p.oob > 0.2) warn = 'Turn back';
      else if (p.stall > 0.7) warn = 'Stall — nose down';
      else {
        const look = p.speed * 1.6;
        const c = run.world.clearance(p.pos.x + p.fwd.x * look, p.pos.y + p.fwd.y * look, p.pos.z + p.fwd.z * look);
        if (c.d < 3 && p.fwd.y < 0.1 && p.clear > 6) warn = 'Pull up';
      }
    }
    if (this.hudCache.warn !== warn) { this.hudCache.warn = warn; $('warn').hidden = !warn; $('warn').textContent = warn; }
    this.updateMarker(run, p);
    this.drawMinimap(run, p);
    const sv = $('stickvis');
    if (Input.stick.id !== null) { sv.hidden = false; sv.style.left = Input.stick.ox + 'px'; sv.style.top = Input.stick.oy + 'px'; sv.firstChild.style.transform = 'translate(' + clamp(Input.stick.x - Input.stick.ox, -60, 60) + 'px,' + clamp(Input.stick.y - Input.stick.oy, -60, 60) + 'px)'; }
    else sv.hidden = true;
  },
  updateMarker(run, p) {
    const el = $('marker');
    let target = null;
    if (run.rings.length && run.mode !== 'attack' && run.next < run.rings.length && run.phase !== 'lobby') target = run.rings[run.next].pos;
    if (!target) { el.hidden = true; return; }
    el.hidden = false;
    const v = _a.copy(target).project(G.camera);
    const behind = _b.copy(target).sub(G.camera.position).dot(_c.set(0, 0, -1).applyQuaternion(G.camera.quaternion)) < 0;
    let x = (v.x * 0.5 + 0.5) * G.W, y = (-v.y * 0.5 + 0.5) * G.H;
    const m = 60;
    const on = !behind && x > m && x < G.W - m && y > m && y < G.H - m;
    let ang = 180;
    if (!on) {
      let dx = x - G.W / 2, dy = y - G.H / 2;
      if (behind) { dx = -dx; dy = -dy; if (Math.abs(dx) + Math.abs(dy) < 1) dy = 1; }
      const k = Math.min((G.W / 2 - m) / Math.abs(dx || 1e-3), (G.H / 2 - m) / Math.abs(dy || 1e-3));
      x = G.W / 2 + dx * k; y = G.H / 2 + dy * k;
      ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    } else y -= 34;
    el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    el.firstChild.style.transform = 'rotate(' + ang.toFixed(0) + 'deg)';
    const d = Math.round(p.pos.distanceTo(target));
    if (this.hudCache.mdist !== d) { this.hudCache.mdist = d; $('m-dist').textContent = d + ' m'; }
  },
  drawMinimap(run, p) {
    const cv = $('minimap'), g = cv.getContext('2d'), S = cv.width, R = S / 2;
    const scale = R / 700;
    const fl = Math.hypot(p.fwd.x, p.fwd.z) || 1;
    const fx = p.fwd.x / fl, fz = p.fwd.z / fl, rx = -fz, rz = fx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.clip();
    g.globalAlpha = 0.85;
    g.setTransform(scale * rx, -scale * fx, scale * rz, -scale * fz, R - scale * (rx * p.pos.x + rz * p.pos.z), R + scale * (fx * p.pos.x + fz * p.pos.z));
    g.imageSmoothingEnabled = true;
    g.drawImage(run.world.mapImg, -WORLD_HALF, -WORLD_HALF, WORLD_SIZE, WORLD_SIZE);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    const toS = (x, z) => [R + scale * (rx * (x - p.pos.x) + rz * (z - p.pos.z)), R - scale * (fx * (x - p.pos.x) + fz * (z - p.pos.z))];
    const dot = (x, z, r, c, ring) => { const [sx, sy] = toS(x, z); g.beginPath(); g.arc(sx, sy, r, 0, TAU); if (ring) { g.strokeStyle = c; g.lineWidth = 3; g.stroke(); } else { g.fillStyle = c; g.fill(); } };
    if (run.rings.length) {
      if (run.mode !== 'attack') {
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath();
        for (let i = Math.max(0, run.next - 1); i < Math.min(run.rings.length, run.next + 6); i++) { const [sx, sy] = toS(run.rings[i].pos.x, run.rings[i].pos.z); i === Math.max(0, run.next - 1) ? g.moveTo(sx, sy) : g.lineTo(sx, sy); }
        g.stroke();
      }
      run.rings.forEach((r, i) => {
        if (r.done) return;
        if (run.mode !== 'attack' && (i < run.next || i > run.next + 5)) return;
        dot(r.pos.x, r.pos.z, i === run.next && run.mode !== 'attack' ? 9 : 6, r.type === 'gold' ? '#ffd84a' : r.type === 'lift' ? '#5ae6ff' : run.world.def.ringA, true);
      });
    }
    if (G.shardGroup) for (const s of run.world.shards) if (s.mesh) dot(s.pos.x, s.pos.z, 5, '#7fe8ff');
    for (const th of run.world.thermals) { const [sx, sy] = toS(th.x, th.z); g.beginPath(); g.arc(sx, sy, th.r * scale, 0, TAU); g.fillStyle = 'rgba(255,240,200,0.25)'; g.fill(); }
    for (const r of Net.remote.values()) if (r.pos && r.mesh && r.mesh.visible) dot(r.pos.x, r.pos.z, 7, PAINT_BY_ID[r.paint] ? PAINT_BY_ID[r.paint].a : '#fff');
    if (G.ghostMesh && G.ghostMesh.visible) dot(G.ghostMesh.position.x, G.ghostMesh.position.z, 6, 'rgba(200,210,255,0.8)');
    g.restore();
    // me: arrow in the centre, pointing up
    g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(R, R - 13); g.lineTo(R + 9, R + 10); g.lineTo(R, R + 5); g.lineTo(R - 9, R + 10); g.closePath(); g.fill(); g.stroke();
  }
};
