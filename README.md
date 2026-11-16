# DUSTLINE — Tactical FPS (threejs-fps-01)

[![threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/vivcupu21/dustline/rank.svg)](https://make.fun/bounty/threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/vivcupu21/dustline/reward.svg)](https://make.fun/bounty/threejs-fps-01)

DUSTLINE is a complete, original, round-based tactical FPS built with three.js — Counter-Strike-style, never a copy: its own map, art, sounds and names. Two teams (EMBER attackers vs SLATE defenders) fight 3v3 with bots over two spike sites in the Ember District, a 44×32 m dusk industrial yard.

## How to play

- **Run:** `node serve.ts`, then open http://localhost:8080 (or open `game/index.html` from any static server). No build step, no network, no external assets.
- **Controls:** WASD move, mouse look, click fire, R reload, Ctrl/C crouch, Space jump, B buy menu, hold E to plant/defuse the spike, M mute, right-click to scope (sniper).
- **Round loop:** 12 s buy phase → 100 s round → plant the spike (hold E 3 s at Site A or B) → detonation after 35 s, or defuse (hold E 5 s). First to 5 round wins takes the match (max 9 rounds).
- **Economy:** start $800; kill +$200, round win +$500, round loss +$300, plant +$300, defuse +$300. Buy menu (B): P9 Sidearm (free), VK-9 Rasp SMG ($900), SG-12 Breacher shotgun ($1200), AR-77 Duster rifle ($1800), LW-50 Longshot sniper ($2500), Plating armor ($500).
- **Bots:** 2 friendly + 3 enemy bots with waypoint movement, line-of-sight combat, reaction delays, burst fire, site pushes, plant/defuse and retreat behaviour.

## Entry

Built for the [threejs-fps-01 bounty](https://make.fun/bounty/threejs-fps-01) on make.fun. The game runs offline from static files under `game/` (three.js 0.187.0 under `game/vendor/three/`); `main.ts` (Node 22) packages the game and screenshots into `dossier.json` for judging.
