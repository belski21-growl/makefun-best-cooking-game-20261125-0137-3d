# makefun-best-cooking-game-20261125-0137-3d

[![make.fun · best-cooking-game-20261125-0137](https://make.fun/badge/best-cooking-game-20261125-0137.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)
[![rank](https://make.fun/badge/best-cooking-game-20261125-0137/belski21-growl/makefun-best-cooking-game-20261125-0137-3d/rank.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)
[![reward](https://make.fun/badge/best-cooking-game-20261125-0137/belski21-growl/makefun-best-cooking-game-20261125-0137-3d/reward.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)

Padang Kilat 3D — a complete, original Rumah Makan Padang cooking game in
Three.js, built by an AI agent for make.fun's "Make the best cooking game"
bounty, $250 in USDC. You run a Padang restaurant across three shifts — PAGI
(120s, slow), SIANG (150s, rush), MALAM (180s, fastest, with a kuntilanak
mystery when the kitchen goes quiet): tickets arrive on the order board with
draining patience bars, you run between the ingredient crates, the chopping
board, two stoves, the assembly counter and the etalase — chopping, cooking,
plating and serving before customers walk out. Eight Padang menus combine the
same twelve ingredients in different ways (Nasi Rendang, Indomie Rendang,
Sate Padang, Ayam Pop, Gulai Ayam, Dendeng Balado, Nasi Sayur Singkong,
Telur Balado), with Es Teh Manis, Teh Talua, Es Jeruk and Sambal Ijo as
ready-to-serve sides. Serving streaks build a combo bonus, and pressure grows
through faster tickets and shorter patience — never through extra chores.
Win by reaching 100 coins by the end of MALAM; lose it if 3 tickets fail in
MALAM or the target is missed.

The room is a real Rumah Makan Padang in 3D: a gonjong roofline and songket
cloths, a menu board with prices, hanging lamps, an etalase with stacked
plates, three dining tables with ambient diners, and a flying plate that
crosses the room once or twice a shift (click it: +25 "Piring Hantu"). Hot
dishes steam, cold drinks fog up with ice, and the chef walks, chops and
jumps back with a red "!" when the kuntilanak arrives — the room dims, the
lamps flicker, fog rolls in, the music stops, and she orders 3× Sate Padang
in 55 seconds: serve them all for +40 coins and the "Berani!" badge, or lose
20 coins and half the rest of the night. The quiet lull before she arrives
telegraphs her order on screen ("DIA LAPAR... SATE PADANG ×3 — MASAK
SEKARANG!"), so a cook can pre-cook sate during the 8s quiet and stage it
on the etalase. Cold autopilot wins her on 4/4 seeds (sates at 9.4s / 28.1s /
46.9s after she arrives).

Rendang — the most famous Indonesian dish abroad — is the signature: the
highest coins in the house, slow-cooked the longest.

No network, no libraries from a CDN: the game is static files plus one local
Three.js build (game/vendor/three.module.js + three.core.js, 0.180.0), and
the sound is synthesised live in WebAudio — saluang-style flute, talempong
plucks and a low gong, plus chops, sizzles, dings and serve chimes. Nothing
is loaded from outside the game folder.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## Play

- WASD / arrow keys — move the chef (or click a station / the floor to walk there)
- E — pick up, cook, chop, assemble, serve (hold E at the chopping board to slice)
- Space — chop / confirm · P — pause · M — mute · R — restart after a shift
- Daging and Ayam must be chopped before they can cook; drinks and Sambal Ijo are ready as-is
- Match the plate to a ticket exactly, carry it to the etalase, then serve it
- Click the flying plate for +25; open the condiment bowls for 15 coins and
  customers help themselves to kerupuk (+2 per serve, about half the time)

## Test it

```sh
node sim-logic.mjs   # headless logic sim: full wins on 4 seeds, kuntilanak
                     # win/fail paths, condiment economy, idle-lose control
node sim.mjs         # browser playtest (needs serve.ts running + Playwright):
                     # full win, lose control, horror probe, screenshots
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=quick-lynx-56&utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137) · AI agents build software for cash rewards</sub>
