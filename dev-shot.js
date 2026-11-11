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
    // link preview card (og.jpg, 1200x630): a real flight frame plus the game name
    if (shot === 'og') {
      const css = document.createElement('style');
      css.textContent = `#hud,#topbar,#toasts,.screen,#loading,.overlay{display:none!important}
        #gl{transform:scale(1.4);transform-origin:4% 50%}
        #og{position:fixed;inset:0;z-index:9;pointer-events:none;background:linear-gradient(90deg,rgba(8,12,30,.78) 0%,rgba(8,12,30,.45) 38%,rgba(8,12,30,0) 62%);display:flex;flex-direction:column;justify-content:center;padding:0 72px;color:#fff1d6}
        #og b{font:900 168px/0.85 var(--display);letter-spacing:.02em;text-transform:uppercase}
        #og b i{font-style:normal;color:var(--apricot)}
        #og p{font:800 30px/1.3 var(--body,Manrope),sans-serif;margin:22px 0 0;max-width:520px;color:#dfe7f7}
        #og span{margin-top:28px;align-self:flex-start;font:800 22px/1 Manrope,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:12px 20px;border-radius:12px;background:var(--apricot);color:#2a1406}`;
      document.head.appendChild(css);
      document.body.insertAdjacentHTML('beforeend', '<div id="og"><b>Flung<i>8</i></b><p>Glide past floating islands, canyons and storms.</p><span>Free · plays in your browser</span></div>');
      startRun({ mode: 'free', worldId: 'harbor' });
      await wait(3500); G.state = 'pause';
      return;
    }
    // weather look check: ?shot=wx:<kind>[:<world>]
    if (shot.startsWith('wx:')) {
      const [, kind, wid] = shot.split(':');
      startRun({ mode: 'course', courseId: (wid || 'canyon') + '-line' }); await wait(1500);
      setWeather(G.world, kind); const c = G.world.wx; c.cur = weatherLook(c.base, kind); stepWeather(G.world, 0);
      return;
    }
    if (shot === 'sheet') UI.go('fly');
    if (shot === 'flight' || shot === 'results') { startRun({ mode: 'course', courseId: 'harbor-line' }); await wait(5000); }
    if (shot === 'results') { G.run.next = G.run.rings.length; finishCourse(); }
    if (shot === 'shop') { G.save.coins = 900; UI.tab('shop'); await wait(300); const t = document.querySelector('#shop-items .sitem:not(.owned)'); if (t) t.click(); }
    if (shot === 'locker') UI.tab('locker');
    if (shot.startsWith('map')) { G.settings.menuMode = shot.startsWith('map-sky') ? 'sky' : 'courses'; UI.selWorld = shot.split(':')[1]; UI.flyNow(); }
    if (shot === 'boards') { UI.tab('boards'); UI.boardTab = 'canyon-line'; UI.render_boards(); }
    if (shot === 'drawer') UI.toggleDrawer(true);
    if (shot === 'music') $('music-btn').click();
    if (shot === 'sheet-low') { UI.go('fly'); await wait(300); document.querySelector('#scr-fly').scrollTop = 99999; }
  })();
});
