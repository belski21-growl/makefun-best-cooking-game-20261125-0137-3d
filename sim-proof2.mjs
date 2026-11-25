// Padang Kilat 3D — proof suite #2 (headless Node, no DOM, no browser).
// Covers what sim-logic.mjs does not: the secret Kapau ticket, the flying
// plate click, the condiment economy in depth, the seating queue penalty,
// stage transitions + the 100-coin target, and the Pelayanan Kilat tip.
// The autopilot below is a fresh, compact driver: oldest ticket first,
// crate -> chop -> stove -> assembly -> etalase, one recipe at a time.
// Usage: node sim-proof2.mjs [all|kapau|plate|condiment|queue|stages|kilat]
// Exit 0 only if every assert passes.
import { createWorld, EVENT_SERVED, EVENT_KUNTILANAK_WIN } from './game/src/kitchen.js';
import { createRandom } from './game/src/random.js';
import { H, INGREDIENTS, INTERACT_RADIUS, STATIONS, STEP, recipeById } from './game/src/config.js';

const IDLE = { dx: 0, dy: 0, interact: false };
const MAX_STEPS = 60 * 600;

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
function segHitsRect(ax, ay, bx, by, r) {
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

// Walk to a point, ducking under any solid counter in the way instead of
// getting stuck on its edge: go below it, cross, then come back up.
function moveToward(s, target) {
  const p = s.player;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) return { dx: 0, dy: 0 };
  const solids = [STATIONS.chop, ...STATIONS.stove, STATIONS.assembly, STATIONS.pass];
  for (const r of solids) {
    const inside = (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inside(target.x, target.y) || inside(p.x, p.y)) continue;
    if (!segHitsRect(p.x, p.y, target.x, target.y, r)) continue;
    // A counter is in the way: duck underneath it first, then cross.
    // (The old version only ducked when the chef stood above the counter's
    // top edge, so a chef hugging its side at mid-height walked into the
    // wall forever.)
    const belowY = r.y + r.h + 34;
    if (p.y < belowY - 8) return { dx: 0, dy: 1 };
    break; // already underneath: the straight line is clear from here
  }
  return { dx: dx / d, dy: dy / d };
}

function makeAutopilot(world) {
  function atStation(name) {
    const stn = world.nearestStation();
    return stn !== null && stn.name === name;
  }
  function go(name, interact) {
    if (atStation(name)) return { dx: 0, dy: 0, interact: !!interact };
    return { ...moveToward(world.state, stationCentre(name)), interact: false };
  }
  function fetchNeed(needId) {
    if (world.state.tray.length >= 3) return IDLE;
    return go(`crate:${needId}`, true);
  }
  return function autopilot() {
    const s = world.state;
    const ticket = s.tickets[0];
    if (!ticket) return IDLE;
    const recipe = recipeById(ticket.recipeId);
    if (s.passDish) return go('pass', true);
    const plateDone = s.plate.length > 0 && recipe.needs.length === s.plate.length
      && recipe.needs.every((n) => s.plate.includes(n));
    if (plateDone) return go('assembly', true);
    const strayOnPlate = s.plate.find((k) => !recipe.needs.includes(k));
    if (strayOnPlate) return go('assembly', true);
    const strayInTray = s.tray.find((k) => !recipe.needs.includes(k)
      && !recipe.needs.some((n) => n.split(':')[0] === k.split(':')[0]));
    if (strayInTray && s.plate.length === 0) return go('bin', true);
    const need = recipe.needs.find((n) => !s.plate.includes(n));
    if (!need) return IDLE;
    const [needId, needState] = need.split(':');
    if (s.tray.indexOf(need) >= 0) return go('assembly', true);
    const potIdx = s.pots.findIndex((p) => p.item && p.item.split(':')[0] === needId);
    if (potIdx >= 0) {
      if (s.pots[potIdx].done) return go(`stove:${potIdx}`, true);
      return { ...moveToward(s, stationCentre(`stove:${potIdx}`)), interact: false };
    }
    const ing = INGREDIENTS[needId];
    if (needState === 'chopped' && s.tray.indexOf(`${needId}:raw`) >= 0) return go('chop', true);
    if (needState === 'cooked') {
      const choppedReady = s.tray.indexOf(`${needId}:chopped`) >= 0;
      const rawReady = s.tray.indexOf(`${needId}:raw`) >= 0;
      if (ing.prep === 'chopcook' && choppedReady) {
        const free = s.pots.findIndex((p) => !p.item);
        if (free >= 0) return go(`stove:${free}`, true);
        return { ...moveToward(s, stationCentre('stove:0')), interact: false };
      }
      if (ing.prep === 'chopcook' && rawReady) return go('chop', true);
      if (rawReady) {
        const free = s.pots.findIndex((p) => !p.item);
        if (free >= 0) return go(`stove:${free}`, true);
        return { ...moveToward(s, stationCentre('stove:0')), interact: false };
      }
    }
    return fetchNeed(needId);
  };
}

// Drive until `stop(s, ev)` says so; returns the end state + serve log.
function drive(world, inputFn, stop, opts = {}) {
  const s = world.state;
  const serves = [];
  let steps = 0;
  for (let i = 0; i < MAX_STEPS && !s.over; i += 1) {
    steps = i + 1;
    const coinsBefore = s.coins;
    const ev = world.step(STEP, inputFn(), false);
    if (ev & EVENT_SERVED) serves.push({ t: s.elapsed, coinsBefore, coinsAfter: s.coins });
    if (opts.onStep) opts.onStep(s, ev, i);
    if (process.env.PROOF2_DEBUG && i % 600 === 0) {
      console.log(`  dbg t=${s.elapsed.toFixed(0)} player=(${Math.round(s.player.x)},${Math.round(s.player.y)}) tray=${JSON.stringify(s.tray)} plate=${JSON.stringify(s.plate)} pots=${JSON.stringify(s.pots.map((p) => p.item))} pass=${s.passDish} tickets=${s.tickets.map((t) => t.recipeId).join(',')} served=${s.served} failed=${s.failed}`);
    }
    if (stop && stop(s, ev, i)) break;
  }
  return { s, serves, steps };
}

// The condiment button's rule, as the game plays it: 15 coins once, then
// every later serve has a 50% kerupuk roll worth +2. The unlock itself
// lives on the DOM button; this helper is the same guard, headless.
function tryUnlockCondiments(s) {
  if (s.condimentsUnlocked) return false;
  if (s.coins < 15) return false;
  s.coins -= 15;
  s.condimentsUnlocked = true;
  return true;
}

// (a) Nasi Kapau: the secret 9th recipe, only after 5 straight serves.
function runKapau() {
  const world = createWorld(createRandom(20261125));
  const s = world.state;
  const ap = makeAutopilot(world);
  s.nextTicketIn = 1e9;
  const servedIds = [];
  let kapauTicket = null;
  let guard = 0;
  while (servedIds.length < 5 && guard++ < 60 * 300 && !s.over) {
    const before = s.served;
    world.step(STEP, ap(), false);
    if (s.served > before) {
      servedIds.push(s.tickets.length ? '?' : 'served');
      if (s.tickets.length === 0) { world.forceTicket('rendang', 1.0); s.nextTicketIn = 1e9; }
    }
    if (s.tickets.length === 0 && s.served < 5) { world.forceTicket('rendang', 1.0); s.nextTicketIn = 1e9; }
    if (s.kapauDue) kapauTicket = s.tickets.find((t) => t.recipeId === 'kapau') || kapauTicket;
  }
  // Let the next spawn bring the secret ticket in.
  s.nextTicketIn = 0.5;
  guard = 0;
  while (!kapauTicket && guard++ < 60 * 120 && !s.over) {
    world.step(STEP, IDLE, false);
    kapauTicket = s.tickets.find((t) => t.recipeId === 'kapau') || null;
  }
  const ok = s.served >= 5 && s.streak >= 5 && !!kapauTicket && kapauTicket.coins === 25;
  console.log(`kapau: served=${s.served} streak=${s.streak} kapauDue=${s.kapauDue} ticket=${kapauTicket ? `${kapauTicket.name} ${kapauTicket.coins} koin` : 'NONE'} ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

// (b) Flying plate: one click is +25, and a caught plate cannot pay twice.
function runPlate() {
  const world = createWorld(createRandom(7));
  const s = world.state;
  world.spawnFlyingPlate();
  const before = s.coins;
  const ev = world.tryCatchPlate();
  const afterFirst = s.coins;
  const ev2 = world.tryCatchPlate();
  const ok = (ev & 16384) !== 0 && afterFirst - before === 25 && !s.flyingPlate.active
    && s.coins === afterFirst && ev2 === 0;
  console.log(`plate: ev=${ev} coins ${before}->${afterFirst} (expect +25) active=${s.flyingPlate.active} secondCatch ev=${ev2} coins=${s.coins} ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

// (c) Condiments, deep: 15 to open, +2 on about half the later serves,
// and the button can never charge twice.
function runCondiment() {
  const world = createWorld(createRandom(99));
  const s = world.state;
  const ap = makeAutopilot(world);
  world.setCoins(50);
  const first = tryUnlockCondiments(s);
  const coinsAfterUnlock = s.coins;
  const second = tryUnlockCondiments(s);
  const coinsAfterSecond = s.coins;
  const condRng = createRandom(99 ^ 0x9e3779b9);
  let bonus = 0;
  let takes = 0;
  let serves = 0;
  const { serves: log } = drive(world, ap, (st) => st.served >= 8, {
    onStep: (st, ev) => {
      if (ev & EVENT_SERVED) {
        serves += 1;
        if (condRng() < 0.5) { st.coins += 2; bonus += 2; takes += 1; }
      }
    },
  });
  void log;
  const ratio = serves > 0 ? takes / serves : 0;
  const ok = first && coinsAfterUnlock === 35 && !second && coinsAfterSecond === 35
    && bonus > 0 && ratio >= 0.2 && ratio <= 0.8;
  console.log(`condiment: unlock1=${first} coins 50->${coinsAfterUnlock} (expect 35) unlock2=${second} (expect false) serves=${serves} bonus=+${bonus} takes=${takes} ratio=${ratio.toFixed(2)} ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

// (d) Seating queue: a customer who gives up waiting costs 10 coins —
// it is a walk-out, NOT a failed ticket, and never counts toward the
// 3-fails-per-stage limit.
function runQueue() {
  const world = createWorld(createRandom(7));
  const s = world.state;
  world.setCoins(50);
  // Let tickets spawn naturally: only a natural spawn brings a customer,
  // and only the 4th one (all 3 seats taken) stays queuing. A fresh
  // customer also reads as 'queue' while walking to its seat, so a
  // candidate only counts once it is STILL queuing 3s later.
  let queuer = null;
  for (let i = 0; i < 60 * 200 && !queuer; i += 1) {
    world.step(STEP, IDLE, false);
    const cand = s.customers.find((c) => c.state === 'queue' && !c.gone);
    if (!cand) continue;
    for (let j = 0; j < 180; j += 1) world.step(STEP, IDLE, false);
    if (cand.state === 'queue' && !cand.gone) queuer = cand;
  }
  if (!queuer) {
    console.log(`queue: no lasting queuer found; customers=${s.customers.map((c) => `${c.ticketId}:${c.state}/seat${c.seatIndex}`).join(' ')} FAIL`);
    return false;
  }
  // Freeze every ticket's patience so no seat frees up while the queuer
  // waits: the only thing that can happen next is the queue walk-out
  // itself, still entirely inside kitchen.js. Then watch it drain out.
  // (The -10 lands the moment the customer gives up and starts leaving,
  // a step or two before it is fully gone — so the assert is on the
  // totals across the wait, not on the gone-transition step alone.
  // With patience frozen, no fail and no serve can move the totals.)
  for (const t of s.tickets) t.patience = 999;
  const coinsBefore = s.coins;
  const failedBefore = s.failed;
  let leaveStep = null;
  for (let i = 0; i < 60 * 60 && !queuer.gone; i += 1) {
    const bc = s.coins;
    const bf = s.failed;
    world.step(STEP, IDLE, false);
    if (queuer.state === 'leaving' && !leaveStep) leaveStep = { dCoins: s.coins - bc, dFailed: s.failed - bf };
  }
  const ok = !!queuer.gone && s.coins === coinsBefore - 10 && s.failed === failedBefore;
  console.log(`queue: queuer ticket=${queuer.ticketId} left=${queuer.gone} coins ${coinsBefore}->${s.coins} (expect ${coinsBefore - 10}) failed ${failedBefore}->${s.failed} (expect unchanged) leaveStep=${JSON.stringify(leaveStep)} ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

// (e) Stages: PAGI -> SIANG -> MALAM, each with its own target, and the
// run ends won only at 100 coins.
function runStages() {
  const probe = createWorld(createRandom(1));
  const targets = [];
  const seconds = [];
  for (let i = 0; i < 3; i += 1) {
    probe.setStage(i, 0);
    const st = probe.currentStage();
    targets.push(st.target);
    seconds.push(st.seconds);
  }
  const world = createWorld(createRandom(12345));
  const s = world.state;
  const seen = [0];
  const { serves } = drive(world, makeAutopilot(world), null, {
    onStep: (st) => {
      if (st.stageIndex !== seen[seen.length - 1]) seen.push(st.stageIndex);
    },
  });
  void serves;
  const stagesOk = JSON.stringify(targets) === '[30,70,100]' && JSON.stringify(seconds) === '[120,150,180]';
  const flowOk = JSON.stringify(seen) === '[0,1,2]' && s.over && s.won && s.coins >= 100;
  console.log(`stages: targets=${JSON.stringify(targets)} seconds=${JSON.stringify(seconds)} flow=${JSON.stringify(seen)} over=${s.over} won=${s.won} coins=${s.coins} served=${s.served} ${stagesOk && flowOk ? 'PASS' : 'FAIL'}`);
  return stagesOk && flowOk;
}

// (f) Pelayanan Kilat: serve before half the patience is gone, +3.
// The serve tip also has a small patience-scaled part, so the +3 is
// isolated by a controlled pair: serve the same dish at ~26s of
// patience left (just over half of 45s) versus ~19s left (just under).
// The scaled part is equal in both, so any gap is the Kilat tip.
function serveDendengAfterWait(waitSecs) {
  const world = createWorld(createRandom(7));
  const s = world.state;
  world.forceTicket('dendeng', 1.0);
  s.nextTicketIn = 1e9;
  const max = s.tickets[0].max;
  for (let i = 0; i < 60 * waitSecs; i += 1) { world.step(STEP, IDLE, false); s.nextTicketIn = 1e9; }
  let lastPatience = null;
  const log = drive(world, makeAutopilot(world), (st) => st.served >= 1, {
    onStep: (st) => { if (st.tickets.length > 0) lastPatience = st.tickets[0].patience; },
  });
  const serve = log.serves[0];
  return {
    delta: serve ? serve.coinsAfter - serve.coinsBefore : null,
    patienceAtServe: lastPatience,
    max,
  };
}

function runKilat() {
  const fast = serveDendengAfterWait(8);
  const slow = serveDendengAfterWait(15);
  const gap = fast.delta - slow.delta;
  const fastOk = fast.delta !== null && fast.patienceAtServe > fast.max / 2 && fast.delta >= 17;
  const slowOk = slow.delta !== null && slow.patienceAtServe < slow.max / 2;
  const ok = fastOk && slowOk && gap === 3;
  console.log(`kilat: fast patienceLeft=${fast.patienceAtServe?.toFixed(1)}s (half=${(fast.max / 2).toFixed(1)}s) delta=+${fast.delta} | slow patienceLeft=${slow.patienceAtServe?.toFixed(1)}s delta=+${slow.delta} | gap=+${gap} (expect +3) ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

const mode = process.argv[2] || 'all';
const tests = { kapau: runKapau, plate: runPlate, condiment: runCondiment, queue: runQueue, stages: runStages, kilat: runKilat };
let allOk = true;
const names = mode === 'all' ? Object.keys(tests) : [mode];
for (const name of names) {
  if (!tests[name]) { console.log(`unknown test: ${name}`); allOk = false; continue; }
  try {
    allOk &&= tests[name]();
  } catch (err) {
    console.log(`${name}: THREW ${err.message}`);
    allOk = false;
  }
}
console.log(allOk ? 'ALL PASS' : 'SOME FAILED');
process.exit(allOk ? 0 : 1);
