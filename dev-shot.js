'use strict';
/* Local-only: ?shot=<state> drives the game into one screen for headless review captures. Loaded by play.html, never published. */
window.addEventListener('load', () => {
  const shot = new URLSearchParams(location.search).get('shot');
  if (!shot) return;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  (async () => {
    while (typeof G === 'undefined' || !G.scene || !document.getElementById('loading').hidden) await wait(200);
    if (innerWidth < 700) Input.setMode('touch');
    if (shot === 'sheet') UI.go('fly');
    if (shot === 'flight' || shot === 'results') { startRun({ mode: 'course', courseId: 'harbor-line' }); await wait(5000); }
    if (shot === 'results') { G.run.next = G.run.rings.length; finishCourse(); }
    if (shot === 'sheet-low') { UI.go('fly'); await wait(300); document.querySelector('#scr-fly').scrollTop = 99999; }
  })();
});
