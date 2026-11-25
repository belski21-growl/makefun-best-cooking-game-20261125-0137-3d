// Padang Kilat — the kitchen world: player movement, stations, chopping, cooking,
// assembly, serving, tickets, particles and win/lose. One job: the rules.
import {
  CHOP_SECONDS, EAT_SECONDS, H, INGREDIENTS, INTERACT_RADIUS, MAX_FAILS, PLAYER,
  QUEUE_LEAVE_PENALTY, QUEUE_MAX, QUEUE_SPOTS, RECIPES, SEATS, STAGES, STATIONS,
  TARGET_COINS, TRAY_MAX, W, recipeById,
} from './config.js';
import { createKuntilanakTicket, createSecretTicket, createTicket, findTicketForRecipe, nextSpawnDelay, serveValue, updateTickets } from './orders.js';

export const EVENT_NONE = 0;
export const EVENT_SERVED = 1;
export const EVENT_FAILED = 2;
export const EVENT_WIN = 4;
export const EVENT_LOSE = 8;
export const EVENT_DING = 16;
export const EVENT_CHOP = 32;
export const EVENT_PICKUP = 64;
export const EVENT_DROP = 128;
export const EVENT_NO_ORDER = 256;
export const EVENT_RUSH = 512;
export const EVENT_STAGE = 1024;
export const EVENT_KUNTILANAK = 2048;
export const EVENT_KUNTILANAK_WIN = 4096;
export const EVENT_KUNTILANAK_FAIL = 8192;
export const EVENT_PLATE = 16384;

function rectCentre(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

export function createWorld(rng) {
  const state = freshState();

  function freshState() {
    return {
      elapsed: 0, coins: 0, streak: 0, fails: 0, served: 0, failed: 0,
      tickets: [], ticketSeq: 0, nextTicketIn: 1.5,
      // Seating queue: one customer per ticket, waiting at the door for a
      // free seat. Their ticket's patience only runs once they are seated.
      customers: [],
      player: { x: PLAYER.startX, y: PLAYER.startY, face: 1, moving: false },
      tray: [], plate: [], passDish: null,
      pots: [{ item: null, progress: 0, done: false }, { item: null, progress: 0, done: false }],
      chopProgress: 0, chopping: false, chopTarget: null,
      particles: [], floats: [], rush: false, rushAnnounced: false,
      over: false, won: false, moveTarget: null,
      // Three shifts: stageIndex 0 PAGI, 1 SIANG, 2 MALAM. `fails` is the
      // current stage's count (it ends the stage at 3, not the game).
      stageIndex: 0, stageElapsed: 0, transition: 0,
      // Kuntilanak (MALAM only): idle → lull (spawning paused, waiting for
      // the board to empty) → active (her ticket is on the board) → done.
      kuntilanak: { status: 'idle', quiet: 0, lull: false },
      // Horror atmosphere while she is here: 1 while active, fading after.
      // flicker dims the lamps (1 = normal light, down to 0.4 when she is).
      horror: 0, flicker: 1,
      kapauDue: false, badges: [],
      // The customer face in the etalase window: the oldest ticket's mood
      // by default, briefly overridden by what just happened (PUAS after a
      // lightning serve, KENYANG after a normal one, MARAH after a fail).
      customerFace: { mood: null, until: 0 },
      // Flying plate easter egg: 1–2 crossings per stage, click it for +25.
      flyingPlate: { active: false, x: -100, y: 210, vx: 0, t: 0, nextAt: 25 + rng() * 20 },
      shake: 0, scared: 0,
    };
  }

  function addFloat(x, y, text, color) {
    state.floats.push({ x, y, text, color, life: 1.4 });
  }
  function addSteam(x, y) {
    for (let i = 0; i < 3; i += 1) {
      state.particles.push({ x: x + (rng() - 0.5) * 30, y, vy: -26 - rng() * 18, life: 0.9 + rng() * 0.5, max: 1.4, size: 5 + rng() * 5 });
    }
  }

  // Seating queue helpers: one customer per ticket, starting at the door.
  function customerFor(ticketId) {
    return state.customers.find((c) => c.ticketId === ticketId);
  }
  function freeSeatIndex() {
    return SEATS.findIndex((s, i) => !state.customers.some((o) => o.seatIndex === i && (o.state === 'seated' || o.state === 'eating')));
  }
  function addQueueCustomer(ticket) {
    const spotIdx = state.customers.filter((c) => c.state === 'queue').length;
    const spot = QUEUE_SPOTS[Math.min(spotIdx, QUEUE_SPOTS.length - 1)];
    state.customers.push({
      ticketId: ticket.id, state: 'queue',
      x: 1264, y: 620, tx: spot.x, ty: spot.y,
      seatIndex: -1, queueLeft: QUEUE_MAX, queueMax: QUEUE_MAX, eatLeft: 0,
      mood: ticket.mood || null, angry: false, gone: false,
    });
  }
  function seatCustomer(c) {
    // A served customer eats where they are, or at a free seat if one is open.
    const seat = freeSeatIndex();
    if (seat >= 0) {
      c.seatIndex = seat;
      c.tx = SEATS[seat].x;
      c.ty = SEATS[seat].y;
    } else {
      c.tx = c.x;
      c.ty = c.y;
    }
    c.state = 'eating';
    c.eatLeft = EAT_SECONDS;
  }

  function plateMatchesRecipe() {
    if (state.plate.length === 0) return null;
    for (const r of RECIPES) {
      if (r.needs.length !== state.plate.length) continue;
      if (r.needs.every((n) => state.plate.includes(n))) return r;
    }
    return null;
  }

  // Near a station means near its edge, not its centre: the chopping board
  // is 240px wide, so its centre is 142px from a player standing at its
  // left edge — centre distance made it unusable from the side, for the
  // autopilot and for a human alike.
  function rectDist(px, py, r) {
    const cx = Math.max(r.x, Math.min(px, r.x + r.w));
    const cy = Math.max(r.y, Math.min(py, r.y + r.h));
    return dist(px, py, cx, cy);
  }
  function nearestStation() {
    const p = state.player;
    let best = null;
    let bestD = INTERACT_RADIUS;
    function consider(name, rect, extra) {
      const d = rectDist(p.x, p.y, rect);
      if (d < bestD) { bestD = d; best = { name, rect, ...extra }; }
    }
    for (const c of STATIONS.crates) consider(`crate:${c.id}`, c, { ingredient: c.id });
    consider('chop', STATIONS.chop);
    STATIONS.stove.forEach((s, i) => consider(`stove:${i}`, s, { pot: i }));
    consider('assembly', STATIONS.assembly);
    consider('pass', STATIONS.pass);
    consider('bin', STATIONS.bin);
    return best;
  }

  function choppableInTray() {
    for (let i = 0; i < state.tray.length; i += 1) {
      const [id, st] = state.tray[i].split(':');
      const ing = INGREDIENTS[id];
      if (st === 'raw' && ing && (ing.prep === 'chop' || ing.prep === 'chopcook')) return i;
    }
    return -1;
  }
  function cookableInTray() {
    for (let i = 0; i < state.tray.length; i += 1) {
      const [id, st] = state.tray[i].split(':');
      const ing = INGREDIENTS[id];
      if (!ing) continue;
      // Plain cookables go in raw; ayam must be chopped first, then cooks chopped.
      if (st === 'raw' && ing.prep === 'cook') return i;
      if (st === 'chopped' && ing.prep === 'chopcook') return i;
    }
    return -1;
  }
  function cookedInTrayFor(id) {
    return state.tray.findIndex((k) => k === `${id}:cooked`);
  }

  function interact(dt, held) {
    const stn = nearestStation();
    if (!stn) { state.chopping = false; state.chopProgress = 0; return EVENT_NONE; }
    // Every pickup needs E held (keyboard) or a mouse-held station: without
    // this, walking past the crates vacuums the wrong ingredients into the
    // tray and the shift can never be served. Chopping already required it;
    // crates, stove, assembly, pass and bin must too.
    if (!held) { state.chopping = false; state.chopProgress = 0; state.chopTicked = false; return EVENT_NONE; }
    let events = EVENT_NONE;
    if (stn.name.startsWith('crate:')) {
      if (state.tray.length < TRAY_MAX) {
        const ing = INGREDIENTS[stn.ingredient];
        const key = ing.prep === 'none' ? `${stn.ingredient}:ready` : `${stn.ingredient}:raw`;
        state.tray.push(key);
        events |= EVENT_PICKUP;
      }
      state.chopping = false;
    } else if (stn.name === 'chop') {
      const idx = choppableInTray();
      if (idx >= 0 && held) {
        state.chopping = true;
        state.chopTarget = state.tray[idx];
        state.chopProgress += dt / CHOP_SECONDS;
        if (state.chopProgress >= 0.25 && !state.chopTicked) { state.chopTicked = true; events |= EVENT_CHOP; }
        if (state.chopProgress >= 1) {
          const [id] = state.tray[idx].split(':');
          state.tray[idx] = `${id}:chopped`;
          state.chopProgress = 0;
          state.chopTicked = false;
          state.chopping = false;
          events |= EVENT_DROP;
        }
      } else {
        state.chopping = false;
        state.chopProgress = 0;
        state.chopTicked = false;
      }
    } else if (stn.name.startsWith('stove:')) {
      state.chopping = false;
      const pot = state.pots[stn.pot];
      if (pot.item && pot.done) {
        if (state.tray.length < TRAY_MAX) {
          state.tray.push(pot.item);
          pot.item = null; pot.progress = 0; pot.done = false;
          events |= EVENT_PICKUP;
        }
      } else if (!pot.item) {
        const idx = cookableInTray();
        if (idx >= 0) {
          // Ayam must be chopped first: it cooks only after chopping.
          const [id, stt] = state.tray[idx].split(':');
          if (id === 'AYAM' && stt === 'raw') {
            // raw ayam goes to the board, not the pot — nudge the player.
            addFloat(state.player.x, state.player.y - 40, 'Ayam diiris dulu!', '#d64533');
          } else {
            pot.item = state.tray.splice(idx, 1)[0];
            pot.progress = 0; pot.done = false;
            events |= EVENT_DROP;
          }
        }
      }
    } else if (stn.name === 'assembly') {
      state.chopping = false;
      const done = plateMatchesRecipe();
      if (done && !state.passDish) {
        state.passDish = done.id;
        state.plate = [];
        events |= EVENT_DROP;
        addFloat(640, 560, `${done.name} siap!`, '#1f7a6d');
      } else if (!done && state.tray.length > 0 && state.plate.length < 3) {
        // Only a real recipe ingredient goes on the plate: a raw filler
        // (NASI:raw next to a finished AYAM:cooked) must never land there
        // — it can never match a recipe, so the plate jams full and the
        // shift stalls (proven 25 Nov: the autopilot stood at the
        // assembly for 40s with a ruined plate).
        const idx = state.tray.findIndex((k) => RECIPES.some((rc) => rc.needs.includes(k)));
        if (idx >= 0) {
          const key = state.tray[idx];
          if (!state.plate.includes(key)) {
            state.plate.push(key);
            state.tray.splice(idx, 1);
            events |= EVENT_DROP;
          }
        }
      } else if (!done && state.tray.length < TRAY_MAX && state.plate.length > 0) {
        // Take a wrong item back off the plate: the first one that is not
        // a need of the oldest ticket (or of any recipe when the board is
        // empty). Taking the last item off blindly could remove a good one.
        const ticket = state.tickets[0];
        const badIdx = state.plate.findIndex((k) => (ticket ? !ticket.needs.includes(k) : !RECIPES.some((rc) => rc.needs.includes(k))));
        if (badIdx >= 0) {
          state.tray.push(state.plate.splice(badIdx, 1)[0]);
          events |= EVENT_PICKUP;
        }
      }
    } else if (stn.name === 'pass') {
      state.chopping = false;
      if (state.passDish) {
        const ticket = findTicketForRecipe(state.tickets, state.passDish);
        if (ticket) {
          const recipe = recipeById(state.passDish);
          const value = serveValue(recipe, state.streak, ticket);
          state.coins += value;
          state.streak += 1;
          state.served += 1;
          addFloat(1190, 330, `+${value} koin`, '#f2b234');
          state.passDish = null;
          events |= EVENT_SERVED;
          // Pelayanan Kilat: served before half the patience ran out — a
          // small tip, a happy customer in the etalase window. A normal
          // serve still leaves the customer full (KENYANG).
          if (ticket.patience / ticket.max > 0.5) {
            state.coins += 3;
            addFloat(1190, 300, 'Pelayanan Kilat! +3 tip', '#3f9e4d');
            state.customerFace = { mood: 'puas', until: state.elapsed + 2.5 };
          } else {
            state.customerFace = { mood: 'kenyang', until: state.elapsed + 2.5 };
          }
          if (ticket.kuntilanak) {
            // One sate down, more to go: the ticket stays until all 3 land.
            ticket.servedCount += 1;
            if (ticket.servedCount >= ticket.needCount) {
              state.tickets.splice(state.tickets.indexOf(ticket), 1);
              state.coins += 40;
              state.badges.push('Berani!');
              state.kuntilanak.status = 'done';
              addFloat(1190, 300, 'Kuntilanak puas! +40', '#f2b234');
              events |= EVENT_KUNTILANAK_WIN;
            }
          } else {
            state.tickets.splice(state.tickets.indexOf(ticket), 1);
          }
          // The customer sits down to eat (at a free seat if one is open).
          // She has no customer — customerFor returns undefined for her.
          const c = customerFor(ticket.id);
          if (c) seatCustomer(c);
          // Secret menu: 5 serves in a row without a fail unlocks Nasi
          // Kapau as the next ticket. It is the only way it ever appears.
          if (!ticket.kuntilanak && state.streak > 0 && state.streak % 5 === 0) {
            state.kapauDue = true;
          }
        } else {
          addFloat(1190, 330, 'Tidak ada pesanan ini!', '#d64533');
          events |= EVENT_NO_ORDER;
        }
      }
    } else if (stn.name === 'bin') {
      state.chopping = false;
      if (state.tray.length > 0) { state.tray = []; events |= EVENT_DROP; }
      else if (state.plate.length > 0) { state.plate = []; events |= EVENT_DROP; }
    }
    return events;
  }

  function pushOutOfCounters() {
    const p = state.player;
    const solids = [STATIONS.chop, ...STATIONS.stove, STATIONS.assembly, STATIONS.pass];
    for (const r of solids) {
      const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
      const d = dist(p.x, p.y, cx, cy);
      if (d < PLAYER.radius && d > 0.001) {
        p.x = cx + ((p.x - cx) / d) * PLAYER.radius;
        p.y = cy + ((p.y - cy) / d) * PLAYER.radius;
      } else if (d <= 0.001) {
        p.y = r.y + r.h + PLAYER.radius;
      }
    }
  }

  function currentStage() { return STAGES[state.stageIndex]; }

  function endStage() {
    // 3 fails in one stage ends THAT stage early (the next one still runs);
    // running out the clock ends it too. Only the end of MALAM ends the game.
    if (state.stageIndex < STAGES.length - 1) {
      state.stageIndex += 1;
      state.stageElapsed = 0;
      state.fails = 0;
      state.tickets = [];
      state.customers = [];
      state.nextTicketIn = 2;
      state.transition = 2.5;
      state.kuntilanak = { status: 'idle', quiet: 0, lull: false };
      state.flyingPlate = { active: false, x: -100, y: 210, vx: 0, t: 0, nextAt: 25 + rng() * 20 };
      state.passDish = null;
      return EVENT_STAGE;
    }
    state.over = true;
    state.won = state.coins >= TARGET_COINS;
    return state.won ? EVENT_WIN : EVENT_LOSE;
  }

  // Flying plate easter egg: click the plate as it crosses the screen.
  function tryCatchPlate(x, y) {
    const fp = state.flyingPlate;
    if (!fp.active) return EVENT_NONE;
    if (Math.hypot(x - fp.x, y - fp.y) > 44) return EVENT_NONE;
    fp.active = false;
    state.coins += 25;
    addFloat(fp.x, fp.y - 20, 'Piring Hantu! +25', '#f2b234');
    for (let i = 0; i < 10; i += 1) {
      state.particles.push({ x: fp.x, y: fp.y, vy: -40 - rng() * 40, life: 0.8, max: 0.8, size: 4 + rng() * 4 });
    }
    return EVENT_PLATE;
  }
  function spawnFlyingPlate() {
    const fromLeft = rng() < 0.5;
    state.flyingPlate = {
      active: true, x: fromLeft ? -40 : W + 40, y: 200 + rng() * 120,
      vx: fromLeft ? 230 : -230, t: 0, nextAt: 0,
    };
  }

  function step(dt, input, attract) {
    if (state.over) return EVENT_NONE;
    let events = EVENT_NONE;
    state.elapsed += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
    if (state.scared > 0) state.scared = Math.max(0, state.scared - dt);

    // Stage transition: the overlay shows, the kitchen waits.
    if (state.transition > 0) {
      state.transition -= dt;
      for (let i = state.particles.length - 1; i >= 0; i -= 1) {
        const pt = state.particles[i];
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) state.particles.splice(i, 1);
      }
      for (let i = state.floats.length - 1; i >= 0; i -= 1) {
        state.floats[i].life -= dt;
        state.floats[i].y -= 22 * dt;
        if (state.floats[i].life <= 0) state.floats.splice(i, 1);
      }
      return events;
    }

    const stage = currentStage();
    state.stageElapsed += dt;

    // Rush: last 60 seconds of MALAM.
    if (state.stageIndex === STAGES.length - 1 && !state.rush && stage.seconds - state.stageElapsed <= 60) {
      state.rush = true;
      events |= EVENT_RUSH;
    }

    // Flying plate: crosses the screen 1–2× per stage.
    const fp = state.flyingPlate;
    if (fp.active) {
      fp.x += fp.vx * dt;
      fp.t += dt;
      if (fp.x < -80 || fp.x > W + 80) {
        fp.active = false;
        fp.nextAt = state.stageElapsed + 25 + rng() * 30;
      }
    } else if (state.stageElapsed >= fp.nextAt && state.stageElapsed < stage.seconds - 20) {
      spawnFlyingPlate();
    }

    // Kuntilanak (MALAM only): after 60s the kitchen goes quiet — spawning
    // pauses until the board empties — and if it stays empty for 8s, she
    // appears at the etalase and orders 3× Sate Padang in 25 seconds.
    const k = state.kuntilanak;
    if (state.stageIndex === STAGES.length - 1 && k.status === 'idle') {
      if (state.stageElapsed >= 60 && !k.lull) k.lull = true;
      if (k.lull) {
        if (state.tickets.length === 0) k.quiet += dt;
        else k.quiet = 0;
        if (k.quiet >= 8) {
          k.status = 'active';
          state.ticketSeq += 1;
          state.tickets.push(createKuntilanakTicket(state.ticketSeq));
          addFloat(1190, 280, 'Dia datang...', '#e8e8f0');
          events |= EVENT_KUNTILANAK;
        }
      }
    }

    // Tickets spawn and age (paused while the kuntilanak's lull holds).
    state.nextTicketIn -= dt;
    if (state.nextTicketIn <= 0 && state.tickets.length < 4 && !k.lull) {
      state.ticketSeq += 1;
      const ticket = state.kapauDue
        ? createSecretTicket('kapau', stage, state.stageElapsed, state.ticketSeq)
        : createTicket(rng, stage, state.stageElapsed, state.ticketSeq);
      state.kapauDue = false;
      state.tickets.push(ticket);
      addQueueCustomer(ticket);
      state.nextTicketIn = nextSpawnDelay(rng, stage, state.stageElapsed);
    }
    // A ticket's patience only runs once its customer is seated.
    const frozen = new Set(state.customers.filter((c) => c.state === 'queue').map((c) => c.ticketId));
    const expired = updateTickets(state.tickets, dt, frozen);
    for (const t of expired) {
      if (t.kuntilanak) {
        // She leaves angry: -20 coins and the rest of the night is cut short.
        state.kuntilanak.status = 'done';
        state.coins = Math.max(0, state.coins - 20);
        state.stageElapsed += (stage.seconds - state.stageElapsed) / 2;
        state.shake = 0.7;
        state.scared = 1.6;
        addFloat(640, 120, 'Kuntilanak marah! -20', '#d64533');
        events |= EVENT_KUNTILANAK_FAIL;
      } else {
        state.fails += 1;
        state.failed += 1;
        state.streak = 0;
        state.shake = 0.3;
        state.customerFace = { mood: 'marah', until: state.elapsed + 2.5 };
        addFloat(640, 120, `${t.name} gagal!`, '#d64533');
        // Their customer leaves angry too, freeing the seat.
        const c = customerFor(t.id);
        if (c && (c.state === 'seated' || c.state === 'queue')) {
          c.state = 'leaving'; c.angry = true; c.tx = 1264; c.ty = 620;
        }
        events |= EVENT_FAILED;
      }
    }
    if (state.fails >= MAX_FAILS || state.stageElapsed >= stage.seconds) {
      return events | endStage();
    }

    // The seating queue: customers walk in from the door, wait in line for
    // a free seat, sit, and leave after eating. A customer who waits too
    // long leaves angry: -10 coins, shown as a floating "-10" — NOT a
    // failed ticket (user correction 25 Nov ~15:32), and their ticket goes
    // with them without counting toward the 3 fails.
    for (const c of state.customers) {
      const walkTo = (speed) => {
        const d = Math.hypot(c.tx - c.x, c.ty - c.y);
        if (d <= 2) return true;
        const v = Math.min(d, speed * dt);
        c.x += ((c.tx - c.x) / d) * v;
        c.y += ((c.ty - c.y) / d) * v;
        return false;
      };
      if (c.state === 'queue') {
        if (walkTo(140)) {
          c.queueLeft -= dt;
          const seat = freeSeatIndex();
          if (seat >= 0) {
            c.seatIndex = seat;
            c.state = 'seated';
            c.tx = SEATS[seat].x;
            c.ty = SEATS[seat].y;
          } else if (c.queueLeft <= 0) {
            c.state = 'leaving';
            c.angry = true;
            c.tx = 1264;
            c.ty = 620;
            state.coins = Math.max(0, state.coins - QUEUE_LEAVE_PENALTY);
            addFloat(c.x, c.y - 30, '-10 koin', '#d64533');
            state.customerFace = { mood: 'marah', until: state.elapsed + 2.5 };
            const ti = state.tickets.findIndex((t) => t.id === c.ticketId);
            if (ti >= 0) state.tickets.splice(ti, 1);
          }
        }
      } else if (c.state === 'seated') {
        walkTo(140);
      } else if (c.state === 'eating') {
        if (walkTo(140)) {
          c.eatLeft -= dt;
          if (c.eatLeft <= 0) {
            c.state = 'leaving';
            c.tx = 1264;
            c.ty = 620;
          }
        }
      } else if (c.state === 'leaving') {
        if (walkTo(180)) c.gone = true;
      }
    }
    state.customers = state.customers.filter((c) => !c.gone);

    // Pots cook — and keep steaming after they are done, like real food.
    for (const pot of state.pots) {
      if (pot.item && !pot.done) {
        const [id] = pot.item.split(':');
        const total = INGREDIENTS[id].prepTime || 3;
        pot.progress += dt / total;
        if (rng() < dt * 6) addSteam(rectCentre(STATIONS.stove[state.pots.indexOf(pot)]).x, 190);
        if (pot.progress >= 1) {
          pot.done = true;
          pot.item = `${id}:cooked`;
          events |= EVENT_DING;
        }
      } else if (pot.item && pot.done && rng() < dt * 2) {
        addSteam(rectCentre(STATIONS.stove[state.pots.indexOf(pot)]).x, 190);
      }
    }
    // A finished dish on the etalase steams too — hot food stays hot.
    if (state.passDish && rng() < dt * 4) addSteam(1192, 440);

    // Player movement: keyboard, or click-to-walk target.
    let dx = input.dx;
    let dy = input.dy;
    if ((dx === 0 && dy === 0) && state.moveTarget) {
      const tx = state.moveTarget.x - state.player.x;
      const ty = state.moveTarget.y - state.player.y;
      const d = Math.hypot(tx, ty);
      if (d < 8) state.moveTarget = null;
      else { dx = tx / d; dy = ty / d; }
    }
    const p = state.player;
    p.moving = dx !== 0 || dy !== 0;
    if (dx !== 0) p.face = dx > 0 ? 1 : -1;
    p.x += dx * PLAYER.speed * dt;
    p.y += dy * PLAYER.speed * dt;
    p.x = Math.max(20, Math.min(W - 20, p.x));
    p.y = Math.max(180, Math.min(H - 16, p.y));
    pushOutOfCounters();

    if (!attract) events |= interact(dt, input.interact);

    // Particles and floating text age.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floats.length - 1; i >= 0; i -= 1) {
      state.floats[i].life -= dt;
      state.floats[i].y -= 22 * dt;
      if (state.floats[i].life <= 0) state.floats.splice(i, 1);
    }
    // Horror atmosphere: while the kuntilanak is here the room dims, the
    // lamps flicker and the floor sways gently. It fades once she is gone.
    // The flicker is a pure function of elapsed time, so a screenshot of
    // the horror moment always shows the same dimmed lamps.
    if (state.kuntilanak.status === 'active') {
      state.horror = 1;
      state.shake = Math.max(state.shake, 0.2);
    } else if (state.horror > 0) {
      state.horror = Math.max(0, state.horror - dt * 0.8);
    }
    state.flicker = state.horror > 0
      ? 0.4 + 0.6 * Math.abs(Math.sin(state.elapsed * 11) * Math.sin(state.elapsed * 5.7))
      : 1;
    return events;
  }

  function reset() {
    const fresh = freshState();
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, fresh);
  }

  // ---- staging helpers: build a real scene through the game's own state ----
  function forceTicket(recipeId, patienceFrac) {
    const recipe = recipeById(recipeId);
    const max = 45;
    state.ticketSeq += 1;
    state.tickets.push({ id: state.ticketSeq, recipeId, name: recipe.name, needs: recipe.needs, coins: recipe.coins, patience: max * patienceFrac, max });
  }
  function setPlate(keys) { state.plate = [...keys]; }
  function setPassDish(recipeId) { state.passDish = recipeId; }
  function setTray(keys) { state.tray = [...keys]; }
  function setCoins(n) { state.coins = n; }
  function setElapsed(s) { state.elapsed = s; }
  function setPot(i, key, progress, done) {
    state.pots[i] = { item: key, progress, done: !!done };
  }
  function placePlayer(x, y) { state.player.x = x; state.player.y = y; state.moveTarget = null; }

  function setStage(i, elapsed) {
    state.stageIndex = i;
    state.stageElapsed = elapsed || 0;
    state.fails = 0;
    state.transition = 0;
  }
  function setKuntilanakActive() {
    state.kuntilanak = { status: 'active', quiet: 0, lull: true };
    state.ticketSeq += 1;
    state.tickets.push(createKuntilanakTicket(state.ticketSeq));
  }

  return {
    state, step, reset, nearestStation, plateMatchesRecipe, currentStage,
    tryCatchPlate, spawnFlyingPlate,
    forceTicket, setPlate, setPassDish, setTray, setCoins, setElapsed, setPot, placePlayer,
    setStage, setKuntilanakActive,
  };
}
