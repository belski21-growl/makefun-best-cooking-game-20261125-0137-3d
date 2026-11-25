# Top-10 analysis — best-cooking-game-20261125-0137 (3D entry, "Make the best cooking game")

Written 25 Nov 2026 ~17:15 WIB, during the 3D adaptation (½ window passed).
Competition: opens 25 Nov 08:37 WIB, deadline 25 Nov 20:37 WIB (12-hour
window), $250 (10 places: $60/$40/$30/$25/$20/$15×5), sponsor make.fun
(verified). Blind rounds 11:37 / 14:37 / 17:37 / 20:37 WIB. Result due
10 Des 01:37 UTC. This entry is the 3D sibling of the 2.5D Padang Kilat
entry (same kitchen rules, same tickets, same kuntilanak — the renderer is
Three.js instead of a 2D canvas). Target submit: final round 20:37 WIB.

## What could actually be observed (honest limitation)

The leaderboard is BLIND: `GET /api/competitions/<slug>/leaderboard` returns
`entries: []`, `metrics_withheld: true`, `scores_visible: false`. `GET .../rounds`
returns `judged: 1` (round 11:37 done), `ranked: [648, null, null, null]`,
`board: "hidden"` — no own entry yet, so the ±5 board is unavailable. The
bounty page's Feed (judged entries' screenshots) is JS-rendered and not
reachable through any public API route (`/api/activity/entries` ignores the
competition filter; `/feed` route does not exist). **No live top-10 entry,
screenshot, or playable top-10 game could be seen.** This analysis is therefore
built on (a) the judge's five published criteria, verbatim from
competition.yaml, (b) the known house baseline — the kit starter, whose
defaults (a plain canvas, one dish, no fail state) are the floor every entry
must clear, and (c) the 2.5D sibling entry, which shares this game's rules
and was itself built against the same blind board. Where a claim below is
inference rather than observation, it says so.

## The five criteria, and where this entry stands on each

1. **Fun / playability — the game must be playable end to end, and fun
   for a first-time player in the first minute.** PAGI opens slow on
   purpose: one ticket every ~20s, 62s of patience, so a new player learns
   crate → chop → stove → assembly → etalase without failing. The loop is
   one verb (E) everywhere, movement is WASD or click-to-walk, and the
   first serve lands in under a minute. Risk: the kitchen is big and the
   walk between crates (left wall) and etalase (right wall) is long; the
   autopilot playtest shows a serve takes ~17s even played well, so a
   slow player will fail tickets in MALAM — but that is the difficulty
   curve working, not a dead end: 3 fails end one stage, not the game.
2. **Visual polish — does it look like a finished game, not a prototype?**
   This is the 3D entry's whole reason to exist: a real room instead of a
   flat board — gonjong roofline, songket band and table cloths, menu
   board with prices, hanging lamps with real point lights, an etalase
   with stacked plates and a customer face in the window, steam on hot
   food, cold mist and ice on cold drinks, shadows, a chef who walks,
   chops and jumps back scared. The cover shot shows all of it in one
   frame (3 tickets, mid-assembly plate, steaming pots, flying plate).
   Weak spot, admitted: the middle of the floor was empty in the first
   cover, so a songket runner was added down the centre — flat, so the
   chef walks over it instead of clipping through furniture.
3. **Originality — a game, not a reskin of the starter.** A Rumah Makan
   Padang is not a generic burger joint: the menu (rendang, sate, ayam
   pop, nasi kapau), the ingredients (daun ubi, cabai, ketupat, sambal
   ijo, teh talua), the room (gonjong, songket, etalase) and the
   kuntilanak are all specific to one place. The secret menu (Nasi Kapau,
   only after 5 straight serves) and the flying plate (+25) are easter
   eggs the starter never had.
4. **Completeness — win, lose, stages, and a reason to keep playing.**
   Three stages with their own targets, a win (100 coins by the end of
   MALAM) and two ways to lose (3 fails in MALAM, or missing the target),
   a seating queue with its own −10 penalty (not a fail), customer moods
   that change the economics (HAUS always carries a drink, LAPAR pays
   +25%, TIDAK SELERA is a small order with 1.5× patience, LESU 1.25×),
   a combo multiplier, a Pelayanan Kilat +3 tip, condiments to unlock,
   and the kuntilanak arc with a badge. Every system is exercised by the
   sims (see the numbers in the repo: full wins on 4 seeds, both
   kuntilanak paths, idle-lose at 0 coins).
5. **Technical quality — does it run clean, offline, without errors?**
   Static files, one local Three.js build, no network at all; the
   browser playtest asserts 0 console errors and 0 page errors on a full
   win, a lose, and the horror probe. The headless logic sim runs the
   same rules in Node with no DOM. Known sharp edge, documented in the
   sim: the kuntilanak's 3 sates in 45s are a skill gate, not a free win
   — the built-in autopilot's serial ~17s per sate cannot fit all three
   (measured: sate 1 at 17.3s, sate 2 at 36.1s, expiry at 45s); a cook
   who uses the 8s quiet lull to stage a sate on the etalase wins it
   (proven in sim-logic.mjs: +95 coins, "Berani!" badge). A human who
   pre-cooks during the lull can do the same; a human who does not will
   eat the −20 and half the night — which is the intended sting.

## Fix round — Goldfish review 25 Nov ~17:27 (verdict: LAYAK LANJUT, BELUM LAYAK SUBMIT)

One blocker (B1): the kuntilanak was unwinnable cold — autopilot sate 1 at
17.3s, sate 2 at 36.1s, ticket expired at 45s, and the game never said she
wanted Sate Padang ×3. Fix: (a) the 8s lull now telegraphs her order on
screen (banner "DIA LAPAR... SATE PADANG ×3 — MASAK SEKARANG!" + floating
text) so the cook — and the autopilot — can pre-cook and stage sate during
the quiet; (b) her patience 45 → 55s, so one imperfect sate still fits.
Measured (25 Nov, `sim-logic.mjs all` PASS): cold autopilot wins 4/4
seeds, sates served at 9.4s / 28.1s / 46.9s after she arrives — the third
sate at 46.9s is why 55s (not 45s) is the budget; 45s would have cut it.
Full wins 552/464/435/449 coins (4 seeds); staged kuntilanak-win +96;
fail path −20 + night halved; idle-lose 0 coins. Browser playtest: win
seed 20261125, 368 coins, 0 console errors; horror probe PASS; flying-plate
click live 42 → 67 (+25). Screenshots re-shot: 1-play 136.746 B, 4-serve
106.606 B, all four <256 KiB; thumbnails checked at 384px (menu board +
plate dot read on the cover; pale red-halo figure + "DIA DATANG..." +
red ticket read on the horror shot).
Also fixed: the stale `kitchen.js` comment ("25 seconds"), the horror
lighting (was nearly black in the serve shot — ambient ×0.45, fog 0.065;
now ×0.70 / 0.038 so she reads in a still), the flying plate (gold rim +
glow — it vanished white-on-cream in the cover thumbnail), and the menu
board (moved right of the gonjong, above the stoves — the ticket column
used to hide every dish name).

## What the 3D entry does that the 2.5D sibling does not

- A navigable 3D room with depth, shadows and a moving camera (sway +
  shake), so the horror moment reads as a scene, not an overlay.
- The chef, the customers and the kuntilanak are characters in the room
  (walk, eat, queue, float) rather than tokens on a board.
- The cover shot is a photograph of a place, not a diagram of a kitchen.

## What it deliberately does not do

- No paid step, no account, no leaderboard of its own: the game is the
  entry, and the dossier is the handoff.
- No difficulty select: PAGI *is* the tutorial, and the stages are the
  difficulty curve.
- No sound files: the saluang/talempong/gong backsound is synthesised
  live in WebAudio (original, no recording), with a mute key.

## Risks, stated plainly

- **Blind board.** No top-10 entry could be seen, so this entry is
  judged against the criteria and the starter, not against the actual
  leaders. If the leaders are all polished 3D games, this entry's edge
  is its specificity (Padang + kuntilanak); if they are all 2D, its edge
  is the room.
- **The kuntilanak race is tight by design.** 45s for 3 sates is
  winnable only with preparation (see criterion 5). If the judge plays
  it cold and fails her, the −20 + halved night could read as unfair
  rather than tense. Mitigation in the game: the lull is 8s of visible
  quiet (no tickets, spawning paused) — a prepared player has time to
  stage — and the fail costs coins and time, never the whole run.
- **WebGL dependence.** The game needs WebGL; a judge on a machine
  without it sees nothing. Mitigation: the screenshots carry the room
  even if the live game cannot run, and the logic sim proves the rules
  independently of the renderer.
- **Performance on weak machines.** 90 steam sprites, shadows and a
  1.4MB Three.js build are modest, but the renderer caps pixel ratio
  at 2 and the frame loop is fixed-step, so a slow machine degrades to
  fewer frames, not a broken game.

Classification: BERAT (full multi-system game + 3D art + screenshot +
dossier). half_at 2026-11-25T14:37:00+07:00. Target submit: final round
20:37 WIB; this 3D entry is the second entry from the same kitchen, after
the 2.5D one.
