'use strict';
/* Aerie — content tables: worlds, courses, gliders, paints, trails, rewards, achievements, challenges. */

const WORLDS = [
  {
    id: 'harbor', name: 'Cloud Harbor', short: 'Harbor',
    blurb: 'Islands floating over the clouds, with lots of warm air to climb on. Start here.',
    kind: 'islands', unlock: 0,
    sky: { top: '#2a74c9', mid: '#7db9e6', bottom: '#d4e6f4' },
    fog: { color: '#a9cbe8', near: 380, far: 2700 },
    sun: { dir: [0.4, 0.75, 0.3], color: '#fff3dc', int: 1.35 }, amb: { sky: '#bfe0ff', ground: '#e9dcc8', int: 0.75 },
    land: { low: '#6fae55', mid: '#8fc163', high: '#c9b98a', peak: '#f2efe6', cliff: '#9a8468', under: '#7d6a58' },
    water: null, cloudSea: '#dfe8f2', ringA: '#ffcf5a', ringB: '#ffffff',
    thermals: 26, spawnY: 260, trees: '#3f7f4a', music: { root: 62, mode: 'major' }, bgGrad: ['#8cc8f0', '#ffd9a8']
  },
  {
    id: 'canyon', name: 'Ember Canyon', short: 'Canyon',
    blurb: 'Red rock and a river gorge. Fly low between the walls for skim points.',
    kind: 'canyon', unlock: 0,
    sky: { top: '#2f6fb0', mid: '#e9a86b', bottom: '#f7d5a3' },
    fog: { color: '#eebb8a', near: 250, far: 2200 },
    sun: { dir: [-0.5, 0.55, 0.35], color: '#ffd7a1', int: 1.45 }, amb: { sky: '#ffc996', ground: '#8a4a2a', int: 0.7 },
    land: { low: '#c9864e', mid: '#b5532f', high: '#d0773f', peak: '#e9b57a', cliff: '#8f3b22', under: '#6a2c1a' },
    water: { level: 18, color: '#3d8f9a' }, ringA: '#ffe27a', ringB: '#ffffff',
    thermals: 12, spawnY: 330, trees: '#5a7a3a', music: { root: 57, mode: 'dorian' }, bgGrad: ['#e9a86b', '#8f3b22']
  },
  {
    id: 'peaks', name: 'Frostwing Peaks', short: 'Peaks',
    blurb: 'Snowy ridges and pine valleys. Long dives from high up.',
    kind: 'peaks', unlock: 0,
    sky: { top: '#2c5fa8', mid: '#9cc3ea', bottom: '#e8f1fb' },
    fog: { color: '#d8e6f5', near: 300, far: 2600 },
    sun: { dir: [0.3, 0.6, -0.5], color: '#ffffff', int: 1.4 }, amb: { sky: '#cfe3ff', ground: '#6b7d8f', int: 0.8 },
    land: { low: '#4d6b4a', mid: '#6b7f6a', high: '#8d97a3', peak: '#f7fbff', cliff: '#59636e', under: '#3f474f' },
    water: { level: 8, color: '#4a7fa6' }, ringA: '#7ae0ff', ringB: '#ffffff',
    thermals: 10, spawnY: 520, trees: '#2f5a3c', music: { root: 60, mode: 'lydian' }, bgGrad: ['#9cc3ea', '#f7fbff']
  },
  {
    id: 'bay', name: 'Lantern Bay', short: 'Bay',
    blurb: 'Sunset islands with lighthouses. Fly low over the water.',
    kind: 'bay', unlock: 3,
    sky: { top: '#3b3f8f', mid: '#f08a5d', bottom: '#ffd29a' },
    fog: { color: '#f2a874', near: 260, far: 2300 },
    sun: { dir: [0.0, 0.18, -1], color: '#ffb36b', int: 1.3 }, amb: { sky: '#ff9f7a', ground: '#3b3f6a', int: 0.75 },
    land: { low: '#e0bf85', mid: '#4f8a45', high: '#3f6e3c', peak: '#7a8a6a', cliff: '#6b6650', under: '#5a4a3a' },
    water: { level: 0, color: '#3f5f9a' }, ringA: '#ffbf5a', ringB: '#fff2d6',
    thermals: 14, spawnY: 220, trees: '#3f6a3a', music: { root: 58, mode: 'mixolydian' }, bgGrad: ['#f08a5d', '#3b3f8f']
  },
  {
    id: 'storm', name: 'Thunderhead', short: 'Storm',
    blurb: 'Dark hills, rain and lightning. The wind pushes you sideways.',
    kind: 'storm', unlock: 6,
    sky: { top: '#1d2433', mid: '#4a5568', bottom: '#7d8796' },
    fog: { color: '#5a6474', near: 150, far: 1700 },
    sun: { dir: [0.2, 0.8, 0.2], color: '#c9d4e6', int: 0.9 }, amb: { sky: '#8a97ad', ground: '#2e3440', int: 0.85 },
    land: { low: '#3f5a3f', mid: '#4f6a45', high: '#6a7a5a', peak: '#8a8f86', cliff: '#4a4a4a', under: '#2f2f2f' },
    water: { level: 6, color: '#2f4a5a' }, ringA: '#b8f0ff', ringB: '#ffffff',
    thermals: 16, spawnY: 300, trees: '#2a4430', music: { root: 55, mode: 'minor' }, bgGrad: ['#4a5568', '#1d2433'], wind: true, rain: true
  },
  {
    id: 'fjord', name: 'Aurora Fjord', short: 'Fjord',
    blurb: 'A night flight between cliffs, under the aurora.',
    kind: 'fjord', unlock: 9,
    sky: { top: '#060a1f', mid: '#122a4a', bottom: '#1e4a5e' },
    fog: { color: '#132a3d', near: 220, far: 2100 },
    sun: { dir: [-0.3, 0.5, -0.6], color: '#a9c8ff', int: 0.75 }, amb: { sky: '#3a6a9a', ground: '#0e1a24', int: 0.9 },
    land: { low: '#2a3f3a', mid: '#33504a', high: '#4a5a66', peak: '#cfe2f2', cliff: '#2c3640', under: '#1a2028' },
    water: { level: 0, color: '#0f2a3d' }, ringA: '#7affc8', ringB: '#c8b0ff',
    thermals: 12, spawnY: 380, trees: '#1f3a32', music: { root: 53, mode: 'minor' }, bgGrad: ['#122a4a', '#2affb0'], night: true
  },
  {
    id: 'spires', name: 'Sunken Spires', short: 'Spires',
    blurb: 'Stone pillars and ruins in the mist. Lots of tight gaps.',
    kind: 'spires', unlock: 12,
    sky: { top: '#24676e', mid: '#86bfa0', bottom: '#cfe3c4' },
    fog: { color: '#8db99c', near: 220, far: 2100 },
    sun: { dir: [0.5, 0.7, 0.1], color: '#fff0c8', int: 1.25 }, amb: { sky: '#c8f0d8', ground: '#4a5a3a', int: 0.8 },
    land: { low: '#2c5f30', mid: '#3d7337', high: '#5a8a48', peak: '#8a9878', cliff: '#6e6c5c', under: '#55544a' },
    water: { level: 10, color: '#3f8a7a' }, ringA: '#ffd36b', ringB: '#ffffff',
    thermals: 16, spawnY: 300, trees: '#2f6a35', music: { root: 59, mode: 'pentatonic' }, bgGrad: ['#a8d4b8', '#2f7a7a']
  }
];
const WORLD_BY_ID = Object.fromEntries(WORLDS.map(w => [w.id, w]));

const COURSE_KINDS = {
  line: { label: 'Line', diff: 'Easy', rings: 22, clear: [34, 70], seg: [150, 210], turn: 0.75, lift: 0.22, desc: 'Wide rings, gentle turns, plenty of height.' },
  gauntlet: { label: 'Gauntlet', diff: 'Hard', rings: 30, clear: [10, 34], seg: [115, 170], turn: 1.15, lift: 0.16, desc: 'Low, tight and fast. Skim the ground to stay ahead.' }
};
const COURSE_NAMES = {
  harbor: ['Mooring Line', 'Gull Gauntlet'],
  canyon: ['Mesa Drift', "Needle's Eye"],
  peaks: ['Pinewind', 'Avalanche Run'],
  bay: ['Harbor Lights', 'Reef Skimmer'],
  storm: ['Squall Line', 'Eye of the Storm'],
  fjord: ['Northern Glide', 'Moonlit Chasm'],
  spires: ['Temple Weave', 'Thousand Pillars']
};
const COURSES = [];
for (const w of WORLDS) {
  ['line', 'gauntlet'].forEach((k, i) => {
    COURSES.push({ id: w.id + '-' + k, world: w.id, kind: k, name: COURSE_NAMES[w.id][i], seed: hashStr(w.id + k + 'v1') });
  });
}
const COURSE_BY_ID = Object.fromEntries(COURSES.map(c => [c.id, c]));

/* Frames change handling. Everything else in the locker is cosmetic. */
const FRAMES = [
  { id: 'falcon', name: 'Falcon', desc: 'Balanced delta wing. Forgiving and steady.', roll: 2.5, pitch: 1.55, drag: 1.0, stall: 13, lift: 1.0, boost: 1.0, unlock: { level: 1 } },
  { id: 'kite', name: 'Kite', desc: 'Broad and floaty. Thermals lift it higher, but its top speed is lower.', roll: 2.2, pitch: 1.45, drag: 1.18, stall: 9, lift: 1.3, boost: 0.95, unlock: { level: 4 } },
  { id: 'manta', name: 'Manta', desc: 'Rounded ray wing. Snappy rolls and tight pitch.', roll: 3.5, pitch: 2.05, drag: 1.05, stall: 12, lift: 1.0, boost: 1.0, unlock: { level: 9 } },
  { id: 'swift', name: 'Swift', desc: 'Swept dart. Very fast in a dive, stalls early.', roll: 2.4, pitch: 1.5, drag: 0.82, stall: 17, lift: 0.85, boost: 1.1, unlock: { level: 15 } },
  { id: 'phoenix', name: 'Phoenix', desc: 'Fast and agile. Unlocks with 10 gold medals.', roll: 3.3, pitch: 1.95, drag: 0.88, stall: 13, lift: 1.05, boost: 1.15, unlock: { golds: 10 } }
];
const FRAME_BY_ID = Object.fromEntries(FRAMES.map(f => [f.id, f]));

const PAINTS = [
  { id: 'dawn', name: 'Dawn', a: '#ff8a4c', b: '#fff1d6', pat: 'stripe', unlock: { level: 1 } },
  { id: 'gull', name: 'Gull', a: '#f4f6f8', b: '#2b3440', pat: 'tips', unlock: { level: 1 } },
  { id: 'teal', name: 'Lagoon', a: '#1fb5a8', b: '#e8fff9', pat: 'stripe', unlock: { level: 2 } },
  { id: 'cobalt', name: 'Cobalt', a: '#2f5fe0', b: '#ffd34a', pat: 'chevron', unlock: { level: 3 } },
  { id: 'crimson', name: 'Crimson', a: '#d7263d', b: '#1b1b1b', pat: 'split', unlock: { level: 5 } },
  { id: 'meadow', name: 'Meadow', a: '#7cc35a', b: '#fff6c8', pat: 'tips', unlock: { level: 6 } },
  { id: 'plum', name: 'Plum', a: '#7b3fa8', b: '#ffb3e6', pat: 'chevron', unlock: { level: 8 } },
  { id: 'sand', name: 'Dune', a: '#e2b77a', b: '#7a4a2a', pat: 'stripe', unlock: { level: 10 } },
  { id: 'night', name: 'Nightjar', a: '#1c2340', b: '#7affc8', pat: 'tips', unlock: { level: 12 } },
  { id: 'koi', name: 'Koi', a: '#ffffff', b: '#ff5a36', pat: 'split', unlock: { level: 14 } },
  { id: 'ember', name: 'Ember', a: '#ff5a1f', b: '#ffd23a', pat: 'chevron', unlock: { shards: 10 } },
  { id: 'glacier', name: 'Glacier', a: '#bfe9ff', b: '#3a7ab8', pat: 'stripe', unlock: { shards: 25 } },
  { id: 'aurora', name: 'Aurora', a: '#2affb0', b: '#8a5aff', pat: 'split', unlock: { shards: 50 } },
  { id: 'jade', name: 'Jade', a: '#2f8f5a', b: '#e6d27a', pat: 'chevron', unlock: { shards: 80 } },
  { id: 'gold', name: 'Gilded', a: '#e8b93a', b: '#fff6d6', pat: 'tips', unlock: { golds: 7 } },
  { id: 'plat', name: 'Platinum', a: '#dfe6ee', b: '#7a8aa0', pat: 'chevron', unlock: { plats: 3 } },
  { id: 'storm', name: 'Stormchaser', a: '#3a4458', b: '#b8f0ff', pat: 'split', unlock: { ach: 'storm_gold' } },
  { id: 'racer', name: 'Racer', a: '#ffe14a', b: '#111111', pat: 'stripe', unlock: { ach: 'race_win' } },
  { id: 'social', name: 'Flock', a: '#ff7ab8', b: '#fff0f7', pat: 'tips', unlock: { ach: 'flock' } },
  { id: 'sky', name: 'Skyborn', a: '#7fd6ff', b: '#ffffff', pat: 'chevron', unlock: { level: 20 } },
  { id: 'obsidian', name: 'Obsidian', a: '#0f0f14', b: '#ff4a2a', pat: 'tips', unlock: { level: 25 } },
  { id: 'prism', name: 'Prism', a: '#ff4ad8', b: '#4adfff', pat: 'split', unlock: { level: 30 } },
  { id: 'daily', name: 'Daybreak', a: '#ffb36b', b: '#3b3f8f', pat: 'chevron', unlock: { ach: 'daily3' } },
  { id: 'legend', name: 'Aerie Legend', a: '#fff2c8', b: '#c8902a', pat: 'split', unlock: { level: 40 } }
];
const PAINT_BY_ID = Object.fromEntries(PAINTS.map(p => [p.id, p]));

const TRAILS = [
  { id: 'mist', name: 'Mist', colors: ['#ffffff'], unlock: { level: 1 } },
  { id: 'paint', name: 'Wing Color', colors: null, unlock: { level: 1 } },
  { id: 'sunset', name: 'Sunset', colors: ['#ffcf5a', '#ff6a4a'], unlock: { level: 3 } },
  { id: 'sea', name: 'Sea Glass', colors: ['#7affe0', '#3a9aff'], unlock: { level: 7 } },
  { id: 'rose', name: 'Rose', colors: ['#ff9ad0', '#ffffff'], unlock: { level: 11 } },
  { id: 'aurora', name: 'Aurora', colors: ['#2affb0', '#8a5aff', '#2affb0'], unlock: { shards: 35 } },
  { id: 'fire', name: 'Flare', colors: ['#fff07a', '#ff7a1a', '#c8201a'], unlock: { level: 17 } },
  { id: 'rainbow', name: 'Prism', colors: ['#ff4a4a', '#ffb84a', '#fff04a', '#4aff8a', '#4ac8ff', '#a84aff'], unlock: { level: 22 } },
  { id: 'shadow', name: 'Shadow', colors: ['#20202a', '#5a5a6a'], unlock: { level: 27 } },
  { id: 'gold', name: 'Gold Leaf', colors: ['#fff2a8', '#e8b93a'], unlock: { golds: 14 } },
  { id: 'comet', name: 'Comet', colors: ['#ffffff', '#7fd6ff', '#2a4aff'], unlock: { ach: 'speed100' } },
  { id: 'ghost', name: 'Ghostline', colors: ['#c8d0ff', '#ffffff'], unlock: { ach: 'beat_ghost' } }
];
const TRAIL_BY_ID = Object.fromEntries(TRAILS.map(t => [t.id, t]));

/* Pilot levels. Every level shows what it unlocks. */
const MAX_LEVEL = 40;
const xpForLevel = l => 350 + l * 140;

const TRICKS = {
  roll: { name: 'Barrel Roll', pts: 400 },
  roll2: { name: 'Double Roll', pts: 1100 },
  roll3: { name: 'Triple Roll', pts: 2200 },
  loop: { name: 'Loop', pts: 900 },
  bigloop: { name: 'Loop + Roll', pts: 2000 },
  inverted: { name: 'Inverted', pts: 0 },
  skim: { name: 'Skim', pts: 0 },
  water: { name: 'Wave Skim', pts: 0 },
  needle: { name: 'Near Miss', pts: 600 },
  thermal: { name: 'Thermal Ride', pts: 0 },
  dive: { name: 'Power Dive', pts: 500 },
  stallrec: { name: 'Stall Recovery', pts: 300 },
  shard: { name: 'Sky Shard', pts: 1000 },
  gold: { name: 'Gold Ring', pts: 800 }
};

const ACHIEVEMENTS = [
  { id: 'first', name: 'First Flight', desc: 'Finish any course.' },
  { id: 'bronze', name: 'On the Board', desc: 'Earn a bronze medal.' },
  { id: 'gold1', name: 'Golden Wings', desc: 'Earn a gold medal.' },
  { id: 'plat1', name: 'Above the Clouds', desc: 'Earn a platinum medal.' },
  { id: 'gold7', name: 'Seven Skies', desc: 'Earn gold on seven courses.' },
  { id: 'allgold', name: 'Sky Marshal', desc: 'Earn gold on every course.' },
  { id: 'allplat', name: 'Aerie Ascendant', desc: 'Earn platinum on every course.' },
  { id: 'roll', name: 'Corkscrew', desc: 'Do a barrel roll.' },
  { id: 'roll3', name: 'Tornado', desc: 'Land a triple roll.' },
  { id: 'loop', name: 'Loop the Loop', desc: 'Fly a full loop.' },
  { id: 'loopRoll', name: 'Showboat', desc: 'Land a Loop + Roll.' },
  { id: 'invert', name: 'Upside Down', desc: 'Fly inverted for 5 seconds straight.' },
  { id: 'skim10', name: 'Grass Cutter', desc: 'Skim the ground for 10 seconds in one run.' },
  { id: 'wave', name: 'Spray Painter', desc: 'Skim the water for 5 seconds in one run.' },
  { id: 'needle', name: 'Thread the Needle', desc: 'Get 5 near misses in one run.' },
  { id: 'speed80', name: 'Wind Shear', desc: 'Reach 80 m/s.' },
  { id: 'speed100', name: 'Sound of Wind', desc: 'Reach 100 m/s.' },
  { id: 'thermal60', name: 'Riding High', desc: 'Spend 60 seconds in thermals in total.' },
  { id: 'combo8', name: 'Ring Leader', desc: 'Reach a x8 ring combo.' },
  { id: 'score25', name: 'Showman', desc: 'Score 25,000 in Score Attack.' },
  { id: 'score60', name: 'Headliner', desc: 'Score 60,000 in Score Attack.' },
  { id: 'nocrash', name: 'Clean Line', desc: 'Finish a Gauntlet without crashing.' },
  { id: 'shard1', name: 'Shard Finder', desc: 'Collect a Sky Shard.' },
  { id: 'shard25', name: 'Prospector', desc: 'Collect 25 Sky Shards.' },
  { id: 'shardWorld', name: 'Cartographer', desc: 'Collect every shard in one world.' },
  { id: 'shardAll', name: 'Keeper of Shards', desc: 'Collect every Sky Shard.' },
  { id: 'dist100', name: 'Long Haul', desc: 'Fly 100 km in total.' },
  { id: 'dist500', name: 'Migration', desc: 'Fly 500 km in total.' },
  { id: 'daily1', name: 'Morning Flight', desc: 'Finish a Daily Course.' },
  { id: 'daily3', name: 'Regular', desc: 'Finish Daily Courses on 3 different days.' },
  { id: 'beat_ghost', name: 'Ghostbuster', desc: 'Beat a ghost from the leaderboard.' },
  { id: 'flock', name: 'Flock Together', desc: 'Fly in Open Sky with another pilot.' },
  { id: 'race_done', name: 'Racer', desc: 'Finish a live race.' },
  { id: 'race_win', name: 'Podium Top', desc: 'Win a live race against another pilot.' },
  { id: 'storm_gold', name: 'Stormchaser', desc: 'Earn gold on both Thunderhead courses.' },
  { id: 'night', name: 'Night Owl', desc: 'Finish a course in Aurora Fjord.' },
  { id: 'level10', name: 'Fledgling', desc: 'Reach pilot level 10.' },
  { id: 'level25', name: 'Wingmaster', desc: 'Reach pilot level 25.' },
  { id: 'level40', name: 'Legend of the Aerie', desc: 'Reach pilot level 40.' },
  { id: 'photo', name: 'Postcard', desc: 'Open photo mode.' },
  { id: 'stall', name: 'Steady Hands', desc: 'Recover from a stall.' },
  { id: 'challenges', name: 'Busy Bird', desc: 'Complete 10 daily challenges.' }
];
const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

/* Daily challenges: three a day, picked by date. `stat` names a per-run counter. */
const CHALLENGES = [
  { id: 'rings60', text: 'Fly through 60 rings', stat: 'rings', goal: 60, xp: 400 },
  { id: 'rolls8', text: 'Do 8 barrel rolls', stat: 'rolls', goal: 8, xp: 350 },
  { id: 'loops3', text: 'Fly 3 loops', stat: 'loops', goal: 3, xp: 350 },
  { id: 'skim20', text: 'Skim the ground for 20 seconds', stat: 'skim', goal: 20, xp: 400 },
  { id: 'gold1', text: 'Earn a gold medal', stat: 'golds', goal: 1, xp: 500 },
  { id: 'dist15', text: 'Fly 15 km', stat: 'km', goal: 15, xp: 350 },
  { id: 'shards3', text: 'Collect 3 Sky Shards', stat: 'shards', goal: 3, xp: 450 },
  { id: 'combo6', text: 'Reach a x6 ring combo', stat: 'combo', goal: 6, xp: 400, max: true },
  { id: 'courses3', text: 'Finish 3 courses', stat: 'courses', goal: 3, xp: 400 },
  { id: 'score20', text: 'Score 20,000 in Score Attack', stat: 'attack', goal: 20000, xp: 450, max: true },
  { id: 'thermal30', text: 'Ride thermals for 30 seconds', stat: 'thermal', goal: 30, xp: 300 },
  { id: 'speed90', text: 'Reach 90 m/s', stat: 'speed', goal: 90, xp: 350, max: true },
  { id: 'needle4', text: 'Get 4 near misses', stat: 'needles', goal: 4, xp: 400 },
  { id: 'invert10', text: 'Fly inverted for 10 seconds', stat: 'inverted', goal: 10, xp: 350 },
  { id: 'flock', text: 'Fly in Open Sky for 2 minutes', stat: 'opensky', goal: 120, xp: 300 },
  { id: 'gauntlet', text: 'Finish a Gauntlet course', stat: 'gauntlets', goal: 1, xp: 450 }
];

const TIPS = [
  'Dive to gain speed, then pull up to trade it for height.',
  'Cyan lift rings throw you upward. Line them up and keep your speed.',
  'Thermals are the shimmering columns. Circle inside them to climb.',
  'Fly close to the ground or water to build a skim bonus.',
  'Too slow and the wing stalls. Point the nose down to recover.',
  'Boost refills when you fly through rings and thermals.',
  'Air brake tightens your turns. Use it before sharp corners.',
  'Hold a roll for a full turn to land a barrel roll.',
  'Press C to switch camera. Cockpit view feels fastest.',
  'Lost the next ring? Follow the arrow at the edge of the screen.',
  'Press R to return to the last ring you passed.',
  'Sky Shards hide under islands, deep in canyons and on top of spires.',
  'Gold rings in Score Attack are worth extra and refill boost.',
  'Ghosts show your best line. Race them to shave off time.',
  'In Open Sky, everyone flying the same world appears beside you.',
  'Thunderhead has gusts. Watch the wind arrow and lean into it.',
  'Press P for photo mode. The world freezes and you can orbit.'
];
