// Padang Kilat 3D — headless logic sim (plain Node, no DOM, no browser).
// kitchen.js + config.js + orders.js + random.js are DOM-free, so the real
// game rules run here directly: the autopilot below is a port of the
// autopilot in game/src/main.js (same station targeting, same obstacle
// walk-around), driving world.step() at 60 Hz until the game ends.
// Usage: node sim-logic.mjs [win|kuntilanak-win|kuntilanak-fail|lose|all]
// Exit 0 only if every assert passes.
import { createWorld, EVENT_SERVED, EVENT_KUNTILANAK, EVENT_KUNTILANAK_WIN, EVENT_KUNTILANAK_FAIL } from './game/src/kitchen.js';
import { createRandom } from './game/src/random.js';
import { H, INGREDIENTS, INTERACT_RADIUS, STATIONS, STEP, recipeById } from './game/src/config.js';

const IDLE = { dx: 0, dy: 0, interact: false };
const MAX_STEPS = 60 * 600; // 10 game-minutes, far past the 450s game

function rectCentre(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
function stationCentre(name) {
  if (name.startsWith('crate:')) return rectCentre(STATIONS.crates.find((c) => c.id === name.slice(6)));
  if (name === 'chop') return rectCentre(STATIONS.chop);
  if (name.startsWith('stove:')) return rectCentre(STATIONS.stove[Number(name.slice(6))]);
  if (name === 'assembly') return rectCentre(STATIONS.assembly);
  if (name === 'pass') return rectCentre(STATIONS.pass);
  if (name === 'bin') return rectCentre(STATIONS.bin);
  return { x: 640, y: 430 };
}
function stationRect(name) {
  if (name.startsWith('crate:')) return STATIONS.crates.find((c) => c.id === name.slice(6));
  if (name === 'chop') return STATIONS.chop;
  if (name.startsWith('stove:')) return STATIONS.stove[Number(name.slice(6))];
  if (name === 'assembly') return STATIONS.assembly;
  if (name === 'pass') return STATIONS.pass;
  if (name === 'bin') return STATIONS.bin;
  return null;
}
function nearStation(s, name) {
  const r = stationRect(name);
  if (!r) return false;
  const cx = Math.max(r.x, Math.min(s.player.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(s.player.y, r.y + r.h));
  return Math.hypot(s.player.x - cx, s.player.y - cy) < INTERACT_RADIUS;
}
function segmentHitsRect(ax, ay, bx, by, r) {
  const dx = bx - ax;
  const dy = by - ay;
  let tmin = 0;
  let tmax = 1;
  const slabs = [[-dx, ax - r.x], [dx, r.x + r.w - ax], [-dy, ay - r.y], [dy, r.y + r.h - ay]];
  for (const [p, q] of slabs) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > tmax) return false; if (t > tmin) tmin = t; }
    else { if (t < tmin) return false; if (t < tmax) tmax = t; }
  }
  return true;
}
function moveToward(s, target) {
  const p = s.player;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) return { dx: 0, dy: 0 };
  const solids = [STATIONS.chop, ...STATIONS.stove, STATIONS.assembly, STATIONS.pass];
  for (const r of solids) {
    if (target.x >= r.x && target.x <= r.x + r.w && target.y >= r.y && target.y <= r.y + r.h) continue;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) continue;
    if (!segmentHitsRect(p.x, p.y, target.x, target.y, r)) continue;
    const belowLine = Math.min(r.y + r.h + 34, H - 17);
    const withinSpan = p.x > r.x - 10 && p.x < r.x + r.w + 10;
    if (withinSpan && ((p.y < r.y && p.y > r.y - 34) || (p.y > r.y + r.h && p.y < belowLine))) {
      const left = Math.abs(p.x - (r.x - 34));
      const right = Math.abs(p.x - (r.x + r.w + 34));
      return { dx: left <= right ? -1 : 1, dy: 0 };
    }
    if (p.y < belowLine) return { dx: 0, dy: 1 };
    const farX = target.x > p.x ? r.x + r.w + 34 : r.x - 34;
    if (Math.abs(p.x - farX) > 12) return { dx: Math.sign(farX - p.x), dy: 0 };
    break;
  }
  return { dx: dx / d, dy: dy / d };
}

// The autopilot: work the oldest ticket first, one recipe at a time.
function makeAutopilot(world) {
  function atStation(s, name) {
    const stn = world.nearestStation();
    return stn !== null && stn.name === name;
  }
  function fetchInput(s, need) {
    const [needId] = need.split(':');
    if (s.tray.length >= 3) return IDLE;
    const crate = `crate:${needId}`;
    if (atStation(s, crate)) return { dx: 0, dy: 0, interact: true };
    return { ...moveToward(s, stationCentre(crate)), interact: false };
  }
  return function autopilotInput() {
    const s = world.state;
    const ticket = s.tickets[0];
    if (!ticket) return IDLE;
    const recipe = recipeById(ticket.recipeId);
    if (s.passDish) {
      if (atStation(s, 'pass')) return { dx: 0, dy: 0, interact: true };
      return { ...moveToward(s, stationCentre('pass')), interact: false };
    }
    const plateStray = s.plate.find((k) => !recipe.needs.includes(k));
    if (plateStray) {
      if (atStation(s, 'assembly')) return { dx: 0, dy: 0, interact: true };
      return { ...moveToward(s, stationCentre('assembly')), interact: false };
    }
    if (s.plate.length > 0 && recipe.needs.length === s.plate.length && recipe.needs.every((n) => s.plate.includes(n))) {
      if (atStation(s, 'assembly')) return { dx: 0, dy: 0, interact: true };
      return { ...moveToward(s, stationCentre('assembly')), interact: false };
    }
    const stray = s.tray.find((k) => !recipe.needs.includes(k) && !recipe.needs.some((n) => n.split(':')[0] === k.split(':')[0]));
    if (stray && s.plate.length === 0) {
      if (atStation(s, 'bin')) return { dx: 0, dy: 0, interact: true };
      return { ...moveToward(s, stationCentre('bin')), interact: false };
    }
    const need = recipe.needs.find((n) => !s.plate.includes(n));
    if (!need) return IDLE;
    const [needId, needState] = need.split(':');
    if (s.tray.indexOf(need) >= 0) {
      if (atStation(s, 'assembly')) return { dx: 0, dy: 0, interact: true };
      return { ...moveToward(s, stationCentre('assembly')), interact: false };
    }
    const potIdx = s.pots.findIndex((p) => p.item && p.item.split(':')[0] === needId);
    if (potIdx >= 0) {
      const pot = s.pots[potIdx];
      if (pot.done) {
        if (atStation(s, `stove:${potIdx}`)) return { dx: 0, dy: 0, interact: true };
        return { ...moveToward(s, stationCentre(`stove:${potIdx}`)), interact: false };
      }
      const other = recipe.needs.find((n) => !s.plate.includes(n) && !s.tray.some((k) => k.split(':')[0] === n.split(':')[0]) && n !== need && !s.pots.some((p) => p.item && p.item.split(':')[0] === n.split(':')[0]));
      if (other && s.tray.length < 3) return fetchInput(s, other);
      // While this pot cooks, start the next cookable in the free pot
      // instead of idling at the stove: parallel pots are what make the
      // kuntilanak's 3 sates in 45s possible (a human plays this way too).
      const freePot = s.pots.findIndex((p) => !p.item);
      if (freePot >= 0) {
        const cookIdx = s.tray.findIndex((k) => {
          const [id, st] = k.split(':');
          const ing = INGREDIENTS[id];
          if (!ing || !recipe.needs.some((n) => n.split(':')[0] === id)) return false;
          return (st === 'raw' && ing.prep === 'cook') || (st === 'chopped' && ing.prep === 'chopcook');
        });
        if (cookIdx >= 0) {
          if (atStation(s, `stove:${freePot}`)) return { dx: 0, dy: 0, interact: true };
          return { ...moveToward(s, stationCentre(`stove:${freePot}`)), interact: false };
        }
      }
      return { ...moveToward(s, stationCentre(`stove:${potIdx}`)), interact: false };
    }
    const ing = INGREDIENTS[needId];
    if (needState === 'chopped') {
      if (s.tray.indexOf(`${needId}:raw`) >= 0) {
        if (atStation(s, 'chop')) return { dx: 0, dy: 0, interact: true };
        return { ...moveToward(s, stationCentre('chop')), interact: false };
      }
    }
    if (needState === 'cooked') {
      if (ing.prep === 'chopcook') {
        if (s.tray.indexOf(`${needId}:chopped`) >= 0) {
          const freePot = s.pots.findIndex((p) => !p.item);
          if (freePot >= 0) {
            if (atStation(s, `stove:${freePot}`)) return { dx: 0, dy: 0, interact: true };
            return { ...moveToward(s, stationCentre(`stove:${freePot}`)), interact: false };
          }
          return { ...moveToward(s, stationCentre('stove:0')), interact: false };
        }
        if (s.tray.indexOf(`${needId}:raw`) >= 0) {
          if (atStation(s, 'chop')) return { dx: 0, dy: 0, interact: true };
          return { ...moveToward(s, stationCentre('chop')), interact: false };
        }
      } else if (s.tray.indexOf(`${needId}:raw`) >= 0) {
        const freePot = s.pots.findIndex((p) => !p.item);
        if (freePot >= 0) {
          if (atStation(s, `stove:${freePot}`)) return { dx: 0, dy: 0, interact: true };
          return { ...moveToward(s, stationCentre(`stove:${freePot}`)), interact: false };
        }
        return { ...moveToward(s, stationCentre('stove:0')), interact: false };
      }
    }
    return fetchInput(s, need);
  };
}

// Drive one world to the end. condRng models the browser's Math.random()
// 50% kerupuk roll in main.js (there it is unseeded; here it is seeded so
// the run is reproducible). Returns the end state plus economy counters.
function drive(world, inputFn, opts = {}) {
  const s = world.state;
  const condRng = createRandom((opts.seed ?? 1) ^ 0x9e3779b9);
  const stats = {
    condUnlocked: false, condBonus: 0, condTakes: 0, servesAfterUnlock: 0,
    kuntilanakSeen: false, kuntilanakWon: false, kuntilanakFailed: false, steps: 0,
  };
  for (let i = 0; i < MAX_STEPS && !s.over; i += 1) {
    stats.steps = i + 1;
    const ev = world.step(STEP, inputFn(), false);
    if (opts.trace && (ev & EVENT_SERVED)) {
      const kt = s.tickets.find((t) => t.kuntilanak);
      console.log(`  trace t=${s.elapsed.toFixed(1)} served#${s.served} coins=${s.coins} kunti=${kt ? `${kt.servedCount}/${kt.needCount} pat=${kt.patience.toFixed(1)}` : 'gone'} tray=${JSON.stringify(s.tray)} plate=${JSON.stringify(s.plate)} pots=${JSON.stringify(s.pots.map((p) => p.item))}`);
    }
    if (opts.trace && s.kuntilanak.status === 'active' && Math.floor(s.elapsed * 2) !== Math.floor((s.elapsed - STEP) * 2)) {
      const kt = s.tickets.find((t) => t.kuntilanak);
      console.log(`  trace t=${s.elapsed.toFixed(1)} player=(${Math.round(s.player.x)},${Math.round(s.player.y)}) tray=${JSON.stringify(s.tray)} plate=${JSON.stringify(s.plate)} pots=${JSON.stringify(s.pots.map((p) => `${p.item}:${p.progress.toFixed(2)}${p.done ? ':done' : ''}`))} kuntiPat=${kt ? kt.patience.toFixed(1) : 'gone'}`);
    }
    if (s.kuntilanak.status === 'active') stats.kuntilanakSeen = true;
    if (ev & EVENT_KUNTILANAK_WIN) stats.kuntilanakWon = true;
    if (ev & EVENT_KUNTILANAK_FAIL) stats.kuntilanakFailed = true;
    // Condiments: open as soon as affordable (what a player does), then the
    // +2 kerupuk roll on each later serve, exactly like main.js handleEvents.
    if (!stats.condUnlocked && s.coins >= 15) {
      s.coins -= 15;
      s.condimentsUnlocked = true;
      stats.condUnlocked = true;
    }
    if (ev & EVENT_SERVED) {
      if (stats.condUnlocked) {
        stats.servesAfterUnlock += 1;
        if (condRng() < 0.5) { s.coins += 2; stats.condBonus += 2; stats.condTakes += 1; }
      }
    }
  }
  return { s, stats };
}

function runWin(seed) {
  const world = createWorld(createRandom(seed));
  const { s, stats } = drive(world, makeAutopilot(world), { seed });
  const ok = s.over && s.won && s.coins >= 100;
  console.log(`win seed=${seed}: over=${s.over} won=${s.won} coins=${s.coins} served=${s.served} failed=${s.failed} steps=${stats.steps} kuntilanakSeen=${stats.kuntilanakSeen} kuntilanakWon=${stats.kuntilanakWon} badges=${JSON.stringify(s.badges)} condUnlocked=${stats.condUnlocked} condBonus=${stats.condBonus} condTakes=${stats.condTakes} servesAfterUnlock=${stats.servesAfterUnlock} ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

function runKuntilanakWin(seed) {
  const world = createWorld(createRandom(seed));
  const s = world.state;
  const ap = makeAutopilot(world);
  world.setStage(2, 65); // MALAM, past her 60s trigger
  world.setCoins(40);
  // Phase 1 — the lull: the board is empty for 8s before she appears, so a
  // prepared cook puts a sate on the etalase while waiting (cooked for a
  // stand-in ticket, swapped for her ticket the moment she arrives). Without
  // this, the autopilot's serial ~17s per sate cannot fit 3 sates in her 45s
  // (measured: sate 1 at 17.3s, sate 2 at 36.1s, ticket expires at 45s) —
  // the race is a skill gate for a cook who uses the lull, not a free win.
  world.forceTicket('sate', 1.0);
  s.nextTicketIn = 1e9; // no random tickets while staging
  let guard = 0;
  while (s.passDish !== 'sate' && guard++ < 60 * 120 && !s.over) {
    world.step(STEP, ap(), false);
  }
  const staged = s.passDish === 'sate';
  s.tickets = [];
  world.setKuntilanakActive();
  const before = s.coins;
  const { stats } = drive(world, ap, { seed });
  const ticket = s.tickets.find((t) => t.kuntilanak);
  const ok = staged && stats.kuntilanakWon && s.badges.includes('Berani!') && s.coins >= before + 40;
  console.log(`kuntilanak-win seed=${seed}: staged=${staged} won=${stats.kuntilanakWon} badges=${JSON.stringify(s.badges)} coins ${before}->${s.coins} (delta ${s.coins - before}, expect >=+40) ticketLeft=${ticket ? `${ticket.servedCount}/${ticket.needCount}` : 'gone'} steps=${stats.steps} ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

function runKuntilanakFail() {
  const world = createWorld(createRandom(7));
  const s = world.state;
  world.setStage(2, 65);
  world.setCoins(50);
  world.setKuntilanakActive();
  const stageBefore = s.stageElapsed; // 65
  const remainBefore = 180 - stageBefore; // 115s left in MALAM
  let ev = 0;
  for (let i = 0; i < 60 * 120 && !(ev & EVENT_KUNTILANAK_FAIL); i += 1) {
    ev = world.step(STEP, IDLE, false);
  }
  // Her 45s patience ran out while the chef stood still.
  const ok = (ev & EVENT_KUNTILANAK_FAIL) !== 0 && s.coins === 30 && s.scared > 0 && s.shake > 0
    && s.stageElapsed >= stageBefore + remainBefore / 2 - 1;
  console.log(`kuntilanak-fail: event=${(ev & EVENT_KUNTILANAK_FAIL) !== 0} coins 50->${s.coins} (expect 30) scared=${s.scared.toFixed(2)} shake=${s.shake.toFixed(2)} stageElapsed ${stageBefore}->${s.stageElapsed.toFixed(1)} (expect >=${(stageBefore + remainBefore / 2).toFixed(1)}, night halved) kuntilanak=${s.kuntilanak.status} ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

function runLose() {
  const world = createWorld(createRandom(7));
  const { s } = drive(world, () => IDLE, { seed: 7 });
  const ok = s.over && !s.won && s.coins === 0;
  console.log(`lose-idle: over=${s.over} won=${s.won} coins=${s.coins} served=${s.served} failed=${s.failed} ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

const mode = process.argv[2] || 'all';
let allOk = true;
if (mode === 'win' || mode === 'all') {
  for (const seed of [12345, 7, 99, 20261125]) allOk &&= runWin(seed);
}
if (mode === 'kuntilanak-win' || mode === 'all') allOk &&= runKuntilanakWin(20261125);
if (mode === 'kuntilanak-fail' || mode === 'all') allOk &&= runKuntilanakFail();
if (mode === 'lose' || mode === 'all') allOk &&= runLose();
console.log(allOk ? 'ALL PASS' : 'SOME FAILED');
process.exit(allOk ? 0 : 1);
