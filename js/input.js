'use strict';
/* Flung8 — keyboard, mouse, touch buttons and gamepad merged into one control state. */

const Input = (() => {
  const keys = new Set(), pressed = new Set();
  const taps = new Set();
  const held = { boost: false, brake: false, left: false, right: false, up: false, down: false };
  const mouse = { x: 0, y: 0, l: false, r: false, seen: false };
  const padPrev = [];
  let padAxPrev = { x: 0, y: 0 };
  let mode = 'kb';
  const S = { pitch: 0, roll: 0, yaw: 0, boost: false, brake: false, cam: false, reset: false, pause: false, photo: false, map: false, ok: false, back: false, nav: null, board: false };

  function typing(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }

  function bind(canvas) {
    window.addEventListener('keydown', e => {
      if (typing(e)) return;
      if (!keys.has(e.code)) pressed.add(e.code);
      keys.add(e.code);
      if (mode !== 'kb') setMode('kb');
      if (G.state === 'play' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); for (const k in held) held[k] = false; mouse.l = mouse.r = false; });
    window.addEventListener('pointerdown', e => { Sfx.init(); if (e.pointerType === 'touch' && mode !== 'touch') setMode('touch'); }, true);
    try { if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) setMode('touch'); } catch (e) { /* ignore */ }

    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') { e.preventDefault(); return; }
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
      if (e.button === 0) mouse.l = true;
      if (e.button === 2) mouse.r = true;
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') { e.preventDefault(); return; }
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
    });
    const up = e => {
      if (e.pointerType !== 'touch') { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; }
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // on-screen touch buttons
    document.querySelectorAll('[data-hold]').forEach(b => {
      const k = b.dataset.hold;
      const on = e => { e.preventDefault(); held[k] = true; b.classList.add('on'); Sfx.init(); };
      const off = () => { held[k] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    });
    document.querySelectorAll('[data-tap]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); taps.add(b.dataset.tap); }));
    window.addEventListener('gamepadconnected', () => UI.toast('Gamepad connected', 'Left stick steers. Right trigger boosts, left trigger brakes.'));
  }

  function setMode(m) { mode = m; document.body.dataset.input = m; }

  function pad() {
    const ps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of ps) if (p && p.connected) return p;
    return null;
  }

  function update() {
    const k = c => keys.has(c), w = c => pressed.has(c);
    const st = G.settings || {};
    const invert = st.pitch === 'arcade' ? -1 : 1; // plane style: forward = dive
    let pitch = 0, roll = 0, yaw = 0;
    // touch arrow buttons act exactly like the arrow keys
    if (k('KeyW') || k('ArrowUp') || held.up) pitch -= 1;
    if (k('KeyS') || k('ArrowDown') || held.down) pitch += 1;
    if (k('KeyA') || held.left) roll -= 1;
    if (k('KeyD') || held.right) roll += 1;
    // barrel rolls: left/right arrows sit under the right hand while WASD flies, Q/E still work
    if (k('KeyQ') || k('ArrowLeft')) yaw += 1;
    if (k('KeyE') || k('ArrowRight')) yaw -= 1;
    pitch *= invert;
    let boost = k('Space') || held.boost, brake = k('ShiftLeft') || k('ShiftRight') || held.brake;
    if (mode === 'kb' && st.mouse && mouse.seen && G.state === 'play') {
      const mx = (mouse.x - G.W / 2) / (Math.min(G.W, G.H) * 0.35), my = (mouse.y - G.H / 2) / (Math.min(G.W, G.H) * 0.35);
      const dz = v => (Math.abs(v) < 0.06 ? 0 : clamp(v, -1, 1));
      if (!roll) roll = dz(mx);
      if (!pitch) pitch = -dz(my) * invert * -1;
      boost = boost || mouse.l; brake = brake || mouse.r;
    }
    let cam = w('KeyC') || taps.has('cam'), reset = w('KeyR') || taps.has('reset'), pause = w('Escape') || taps.has('pause');
    let photo = w('KeyP') || taps.has('photo'), map = w('KeyM') || taps.has('map'), steer = w('KeyT');
    let ok = false, back = w('Escape') || w('Backspace');
    let board = k('Tab');
    let nav = null;
    if (w('ArrowUp')) nav = 'up'; else if (w('ArrowDown')) nav = 'down'; else if (w('ArrowLeft')) nav = 'left'; else if (w('ArrowRight')) nav = 'right';

    const gp = pad();
    if (gp) {
      const dz = v => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.35));
      const e = i => b(i) && !padPrev[i];
      const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0);
      const any = lx || ly || rx || gp.buttons.some(x => x && x.pressed);
      if (any && mode !== 'pad') setMode('pad');
      if (mode === 'pad') {
        if (lx) roll = lx;
        if (ly) pitch = ly * invert;
        if (rx) yaw = -rx;
        if (b(4)) yaw = 1; if (b(5)) yaw = -1;
        boost = boost || b(7) || b(0);
        brake = brake || b(6);
      }
      cam = cam || e(3); reset = reset || e(1) && G.state === 'play'; pause = pause || e(9); photo = photo || e(2) && G.state === 'play'; map = map || e(8);
      ok = ok || e(0) && G.state !== 'play'; back = back || e(1) && G.state !== 'play';
      board = board || b(8);
      if (e(12)) nav = 'up'; else if (e(13)) nav = 'down'; else if (e(14)) nav = 'left'; else if (e(15)) nav = 'right';
      if (!nav && G.state !== 'play') {
        const sx = gp.axes[0] || 0, sy = gp.axes[1] || 0;
        if (sy < -0.6 && padAxPrev.y >= -0.6) nav = 'up'; else if (sy > 0.6 && padAxPrev.y <= 0.6) nav = 'down';
        else if (sx < -0.6 && padAxPrev.x >= -0.6) nav = 'left'; else if (sx > 0.6 && padAxPrev.x <= 0.6) nav = 'right';
        padAxPrev = { x: sx, y: sy };
      }
      for (let i = 0; i < gp.buttons.length; i++) padPrev[i] = b(i);
    }
    Object.assign(S, { pitch: clamp(pitch, -1, 1), roll: clamp(roll, -1, 1), yaw: clamp(yaw, -1, 1), boost, brake, cam, reset, pause, photo, map, ok, back, nav, board, steer });
  }
  function endFrame() { pressed.clear(); taps.clear(); }
  return { bind, update, endFrame, setMode, state: S, get mode() { return mode; } };
})();
