# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Anyone online who opens the shared link: strangers who play once and pilots who come back to beat times. They play on phones (touch) and laptops (keyboard, mouse, gamepad) about equally, in short sessions.

## Product Purpose
Aerie is an arcade 3D gliding game in the browser. You fly an engineless glider through ring courses, trade height for speed, ride thermals, and chase medals, ghosts and shared leaderboard times. Success is a first flight that feels good within seconds and a reason to fly one more run.

## Positioning
No engine: speed comes only from diving, thermals and lift rings, so every run is an energy puzzle. Seven procedural worlds, seeded courses with par times from a simulated pilot, ghost replays, and live shared skies with other pilots on the same link.

## Operating Context
Runs as a claude.ai artifact (private until the owner shares it). One HTML page plus plain JS files, Three.js r128 from cdnjs, Google Fonts only. Shared state uses the artifact runtime (db leaderboard and ghosts, room presence); without it the game runs solo with local saves.

## Capabilities and Constraints
- Modes: ring courses (line, gauntlet), Score Attack, Explore, daily course, live race, Open Sky.
- Controls: W/S pitch (stops at 70°), A/D steering with three modes (steep bank, free roll, sharp turn; T switches), Q/E barrel roll, Space boost, Shift brake, C camera, R last ring, P photo, M map. Touch stick plus BOOST/BRAKE/CAM/BACK buttons. Gamepad.
- Gameplay, physics and controls are fixed for visual work.
- Progression: XP levels, 5 frames, 24 paints, 12 trails, 42 achievements, daily challenges.

## Brand Commitments
- Name: Aerie.
- Low-poly, flat-shaded 3D geometry stays. Colour, light, fog, UI and type may change.

## Evidence on Hand
No player counts, reviews or press. Do not invent any.

## Product Principles
- Flight first: nothing on screen may block reading the sky, rings and ground.
- One more run: results and menus lead straight back into the air.
- Works the same on a phone and a laptop.

## Accessibility & Inclusion
HUD must stay readable over any sky, cloud or terrain behind it. Respect reduced motion for camera shake.
