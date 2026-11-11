'use strict';
/* Flung8 — boot, renderer, main loop. */

function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'pause';
  UI.pause();
}
function resumeGame() {
  $('ov-pause').hidden = true;
  G.state = 'play';
}

function resize() {
  G.W = window.innerWidth; G.H = window.innerHeight;
  G.renderer.setSize(G.W, G.H, false);
  G.camera.aspect = G.W / G.H;
  G.camera.updateProjectionMatrix();
  FX.pts && (FX.pts.material.uniforms.scale.value = G.H * 0.6);
}

let lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now;
  G.dt = dt;
  try { tick(dt); } catch (e) { console.error(e); }
  Input.endFrame();
}

function tick(dt) {
  Input.update();
  const I = Input.state;
  const p = G.player.p;
  switch (G.state) {
    case 'play':
      stepPlay(dt);
      if (!$('ov-results').hidden || !$('lobby').hidden) UI.handleNav();
      break;
    case 'menu':
      stepAttract(dt);
      UI.handleNav();
      break;
    case 'title': case 'locker':
      if (G.park) flyParked(dt);
      syncPlayerMesh(dt, 0.4);
      UI.handleNav();
      break;
    case 'pause': {
      const inSettings = UI.fromPause; // Esc there goes back to the pause menu, not straight into the flight
      UI.handleNav();
      if (I.pause && !inSettings) resumeGame();
      break;
    }
    case 'photo':
      if (I.photo || I.pause) exitPhoto();
      break;
  }
  if (G.world) updateWorld(G.world, dt, G.camera.position);
  FX.update(dt);
  updateRingVisuals(dt);
  updateRemotes(dt);
  if (G.state === 'photo') updatePhotoCam(); else updateCamera(dt);
  const flying = G.state === 'play' && G.run && G.run.phase === 'fly' && p.alive;
  SpeedLines.update(dt, flying ? p.speed : 0, flying && p.boosting);
  Sfx.setFlight(p.speed, p.boosting, p.stall, flying && p.clear < 9 ? 1 - p.clear / 9 : 0, G.state === 'play' || G.state === 'menu');
  UI.updateHud(dt);
  G.renderer.render(G.scene, G.camera);
}

function boot() {
  loadProgress();
  const q = G.settings.quality;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: q !== 'low', powerPreference: 'high-performance' });
  } catch (e) {
    $('loading-text').textContent = 'This browser could not start 3D graphics (WebGL). Try another browser or turn on hardware acceleration.';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'med' ? 1.5 : 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(70, 1, 0.4, 9000);
  G.scene.add(G.camera);
  G.camMode = 'chase';
  G.quality = q;
  Input.bind($('gl'));
  UI.init();
  FX.init();
  SpeedLines.init();
  G.player = { p: makePilot(G.save.frame), mesh: null, trails: [] };
  rebuildPlayerMesh();
  Sfx.setVolumes(G.settings.muted ? 0 : G.settings.master, G.settings.music, G.settings.sfx);
  startAttract(G.save.lastWorld || 'harbor');
  checkNewUnlocks(false);
  resize();
  window.addEventListener('resize', () => { resize(); UI.layoutStage(); });
  UI.open('title');
  $('loading').hidden = true;
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });
  Net.init();
  // stop sounds and the clock while the tab is hidden
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play' && G.run && G.run.mode !== 'race' && G.run.mode !== 'sky') pauseGame(); });
  window.LF = { G, startRun, Net };
}

if (typeof THREE === 'undefined') {
  document.getElementById('loading-text').textContent = 'Could not load the 3D engine. Check your connection and reload.';
} else {
  setTimeout(boot, 30);
}
