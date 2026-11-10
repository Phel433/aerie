'use strict';
/* Local-only: ?shot=<state> drives the game into one screen for headless review captures. Loaded by play.html, never published. */
window.addEventListener('load', () => {
  const shot = new URLSearchParams(location.search).get('shot');
  if (!shot) return;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  (async () => {
    while (typeof G === 'undefined' || !G.scene || !document.getElementById('loading').hidden) await wait(200);
    if (innerWidth < 700) Input.setMode('touch');
    // thumbnails: a clean 3D frame with no interface, from a course start line or a free flight in a world
    if (shot.startsWith('thumb:')) {
      const k = shot.slice(6), css = document.createElement('style');
      css.textContent = '#hud,#topbar,#toasts,.screen,#loading{display:none!important}';
      document.head.appendChild(css);
      if (k.startsWith('world-')) { startRun({ mode: 'free', worldId: k.slice(6) }); await wait(2500); G.state = 'pause'; }
      else { startRun({ mode: 'course', courseId: k }); await wait(1500); }
      return;
    }
    if (shot === 'sheet') UI.go('fly');
    if (shot === 'flight' || shot === 'results') { startRun({ mode: 'course', courseId: 'harbor-line' }); await wait(5000); }
    if (shot === 'results') { G.run.next = G.run.rings.length; finishCourse(); }
    if (shot === 'shop') { G.save.coins = 900; UI.tab('shop'); }
    if (shot === 'locker') UI.tab('locker');
    if (shot === 'map' || shot === 'map-sky') { G.settings.menuMode = shot === 'map' ? 'courses' : 'sky'; UI.flyNow(); }
    if (shot === 'boards') { UI.tab('boards'); UI.boardTab = 'canyon-line'; UI.render_boards(); }
    if (shot === 'drawer') UI.toggleDrawer(true);
    if (shot === 'music') $('music-btn').click();
    if (shot === 'sheet-low') { UI.go('fly'); await wait(300); document.querySelector('#scr-fly').scrollTop = 99999; }
  })();
});
