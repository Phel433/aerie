'use strict';
/* Aerie — save data, settings, XP and levels, unlocks, achievements, daily challenges. */

const DEFAULT_SETTINGS = { master: 0.8, music: 0.5, sfx: 0.8, pitch: 'plane', steer: 'bank', assist: true, mouse: false, fov: 72, quality: 'med', units: 'kmh', others: true, shake: true, trails: true };

function newSave() {
  return {
    v: 1, callsign: '', frame: 'falcon', paint: 'dawn', trail: 'mist',
    xp: 0, level: 1, best: {}, medals: {}, attack: {}, shards: {}, ach: {},
    stats: { km: 0, rings: 0, rolls: 0, loops: 0, thermal: 0, crashes: 0, flights: 0, maxSpeed: 0, races: 0, raceWins: 0, dailyDays: [], challenges: 0, time: 0 },
    daily: { key: '', prog: {}, done: [] }, lastWorld: 'harbor', seenHelp: false
  };
}

function loadProgress() {
  const s = Object.assign(newSave(), Store.get('save', {}));
  s.stats = Object.assign(newSave().stats, s.stats || {});
  s.daily = Object.assign({ key: '', prog: {}, done: [] }, s.daily || {});
  G.save = s;
  G.settings = Object.assign({}, DEFAULT_SETTINGS, Store.get('settings', {}));
  rollDaily();
}
let saveTimer = null;
function saveProgress() { clearTimeout(saveTimer); saveTimer = setTimeout(() => Store.set('save', G.save), 250); }
function saveSettings() { Store.set('settings', G.settings); }

/* ---------- medals & unlock checks ---------- */
function medalCount(min = 'bronze') {
  const need = MEDAL_RANK[min];
  return Object.entries(G.save.medals).filter(([id, m]) => COURSE_BY_ID[id] && MEDAL_RANK[m] >= need).length;
}
function totalShards() { return Object.values(G.save.shards).reduce((a, l) => a + l.length, 0); }
function worldUnlocked(w) { return medalCount('bronze') >= w.unlock; }

function unlockMet(u) {
  if (!u) return true;
  if (u.level) return G.save.level >= u.level;
  if (u.shards) return totalShards() >= u.shards;
  if (u.golds) return medalCount('gold') >= u.golds;
  if (u.plats) return medalCount('plat') >= u.plats;
  if (u.ach) return !!G.save.ach[u.ach];
  return false;
}
function unlockText(u) {
  if (!u) return '';
  if (u.level) return 'Pilot level ' + u.level;
  if (u.shards) return u.shards + ' Sky Shards';
  if (u.golds) return u.golds + ' gold medals';
  if (u.plats) return u.plats + ' platinum medals';
  if (u.ach) return 'Achievement: ' + (ACH_BY_ID[u.ach] ? ACH_BY_ID[u.ach].name : u.ach);
  return '';
}
/* every cosmetic in one list, so we can announce new unlocks */
function allItems() {
  return [
    ...FRAMES.map(f => ({ kind: 'Frame', id: f.id, name: f.name, unlock: f.unlock })),
    ...PAINTS.map(p => ({ kind: 'Paint', id: p.id, name: p.name, unlock: p.unlock })),
    ...TRAILS.map(t => ({ kind: 'Trail', id: t.id, name: t.name, unlock: t.unlock }))
  ];
}
let knownUnlocks = null;
function checkNewUnlocks(announce = true) {
  const now = new Set(allItems().filter(i => unlockMet(i.unlock)).map(i => i.kind + ':' + i.id));
  WORLDS.forEach(w => { if (worldUnlocked(w)) now.add('World:' + w.id); });
  if (knownUnlocks && announce) {
    for (const k of now) if (!knownUnlocks.has(k)) {
      const [kind, id] = k.split(':');
      const name = kind === 'World' ? WORLD_BY_ID[id].name : (allItems().find(i => i.kind === kind && i.id === id) || {}).name;
      UI.toast('Unlocked: ' + name, kind === 'World' ? 'A new world is open in Fly.' : 'New ' + kind.toLowerCase() + ' in the Locker.', '#ffcf5a');
    }
  }
  knownUnlocks = now;
}

/* ---------- XP and levels ---------- */
function addXp(n) {
  if (!n) return 0;
  n = Math.round(n);
  const s = G.save;
  s.xp += n;
  let ups = 0;
  while (s.level < MAX_LEVEL && s.xp >= xpForLevel(s.level)) { s.xp -= xpForLevel(s.level); s.level++; ups++; }
  if (s.level >= MAX_LEVEL) s.xp = Math.min(s.xp, xpForLevel(MAX_LEVEL));
  if (ups) {
    Sfx.levelup();
    UI.toast('Pilot level ' + s.level, levelRewardText(s.level) || 'Keep flying.', '#7fd6ff');
    if (s.level >= 10) grantAch('level10');
    if (s.level >= 25) grantAch('level25');
    if (s.level >= 40) grantAch('level40');
    checkNewUnlocks(false);
  }
  saveProgress();
  return ups;
}
function levelRewardText(l) {
  const it = allItems().filter(i => i.unlock && i.unlock.level === l);
  return it.length ? 'Unlocked ' + it.map(i => i.name + ' ' + i.kind.toLowerCase()).join(', ') + '.' : '';
}

/* ---------- achievements ---------- */
function grantAch(id) {
  if (G.save.ach[id] || !ACH_BY_ID[id]) return;
  G.save.ach[id] = Date.now();
  UI.toast('Achievement: ' + ACH_BY_ID[id].name, ACH_BY_ID[id].desc, '#ffcf5a');
  Sfx.gold();
  addXp(150);
  saveProgress();
  checkNewUnlocks(true);
}

/* ---------- daily challenges ---------- */
function rollDaily() {
  const key = todayKey();
  if (G.save.daily.key === key) return;
  G.save.daily = { key, prog: {}, done: [] };
  saveProgress();
}
function dailyChallenges() {
  const r = RNG(hashStr('ch' + todayKey()));
  const pool = CHALLENGES.slice();
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
/* stat updates: add (or max) a value toward today's challenges */
function challengeStat(stat, value, isMax) {
  rollDaily();
  const d = G.save.daily;
  for (const c of dailyChallenges()) {
    if (c.stat !== stat || d.done.includes(c.id)) continue;
    const cur = d.prog[c.id] || 0;
    d.prog[c.id] = (c.max || isMax) ? Math.max(cur, value) : cur + value;
    if (d.prog[c.id] >= c.goal) {
      d.done.push(c.id);
      G.save.stats.challenges++;
      UI.toast('Challenge done', c.text + '. +' + c.xp + ' XP', '#7affc8');
      addXp(c.xp);
      if (G.save.stats.challenges >= 10) grantAch('challenges');
    }
  }
  saveProgress();
}
