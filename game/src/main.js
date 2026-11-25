// Padang Kilat 3D — boot and the one loop. Port of the 2D main.js: same logic,
// same autopilot, same ?shot/?auto/?seed — only the renderer is Three.js.
import { BEST_KEY, H, INGREDIENTS, INTERACT_RADIUS, RECIPES, STAGES, STATIONS, STEP, itemName, recipeById } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CHOP, EVENT_DING, EVENT_DROP, EVENT_FAILED, EVENT_KUNTILANAK, EVENT_KUNTILANAK_FAIL, EVENT_KUNTILANAK_WIN, EVENT_LOSE, EVENT_NONE, EVENT_NO_ORDER, EVENT_PICKUP, EVENT_PLATE, EVENT_RUSH, EVENT_SERVED, EVENT_STAGE, EVENT_WIN } from './kitchen.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createScene3D, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './scene3d.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const autoMode = params.get('auto');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
// Condiment economy counters (module scope: exposeState reads them too).
let condimentBonus = 0;
let condimentTakes = 0;
const world = createWorld(createRandom(seed));
window.__world = world; // debug hook for the sim (like __scene3d below)
const scene3d = createScene3D(canvas);
window.__scene3d = scene3d;
const audio = createAudio();

const $ = (id) => document.getElementById(id);
const ticketsEl = $('tickets');
const floatsEl = $('floats');
// Condiments: locked until the player pays 15 coins to open them.
const condBar = $('condiment-bar');
const condBtn = $('condiment-btn');
condBtn.addEventListener('click', () => {
  const s = world.state;
  if (s.condimentsUnlocked || s.coins < 15) return;
  s.coins -= 15;
  s.condimentsUnlocked = true;
  s.floats.push({ x: 640, y: 300, text: 'Kondimen dibuka!', color: '#3f9e4d', life: 1.4 });
  audio.serve();
  condBar.style.display = 'none';
});

function readBest() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { return 0; }
}
function saveBest(value) {
  try { window.localStorage.setItem(BEST_KEY, String(value)); } catch { /* noop */ }
}

function rectCentre(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
function stationCentre(name) {
  if (name.startsWith('crate:')) {
    const c = STATIONS.crates.find((cc) => cc.id === name.slice(6));
    return rectCentre(c);
  }
  if (name === 'chop') return rectCentre(STATIONS.chop);
  if (name.startsWith('stove:')) return rectCentre(STATIONS.stove[Number(name.slice(6))]);
  if (name === 'assembly') return rectCentre(STATIONS.assembly);
  if (name === 'pass') return rectCentre(STATIONS.pass);
  if (name === 'bin') return rectCentre(STATIONS.bin);
  return { x: 640, y: 430 };
}
function stationRect(name) {
  if (name.startsWith('crate:')) return STATIONS.crates.find((cc) => cc.id === name.slice(6));
  if (name === 'chop') return STATIONS.chop;
  if (name.startsWith('stove:')) return STATIONS.stove[Number(name.slice(6))];
  if (name === 'assembly') return STATIONS.assembly;
  if (name === 'pass') return STATIONS.pass;
  if (name === 'bin') return STATIONS.bin;
  return null;
}
function nearStation(worldState, name) {
  const r = stationRect(name);
  if (!r) return false;
  const cx = Math.max(r.x, Math.min(worldState.player.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(worldState.player.y, r.y + r.h));
  return Math.hypot(worldState.player.x - cx, worldState.player.y - cy) < INTERACT_RADIUS;
}
function atStation(worldState, name) {
  const stn = world.nearestStation();
  return stn !== null && stn.name === name;
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
function moveToward(worldState, target) {
  const p = worldState.player;
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
// Build order: an ingredient that only the target recipe needs goes on the
// plate FIRST. A plate that exactly matches another recipe auto-completes
// as that recipe the moment it lands — building Nasi Kapau NASI-first
// turns [NASI, DAGING] into Rendang on the pass, jamming it with no
// matching ticket (proven 25 Nov in sim-logic: kapau expired unserved).
// SAYUR first keeps the plate from ever matching Rendang.
function buildOrder(recipe) {
  const rivals = RECIPES.filter((r) => r.id !== recipe.id && r.needs.every((n) => recipe.needs.includes(n)));
  return [...recipe.needs].sort((a, b) => {
    const ca = rivals.filter((r) => r.needs.includes(a)).length;
    const cb = rivals.filter((r) => r.needs.includes(b)).length;
    return ca - cb;
  });
}
function autopilotInput() {
  const s = world.state;
  const none = { dx: 0, dy: 0, interact: false };
  // Telegraph: during the quiet lull before she arrives there is no ticket
  // yet, but the banner already says Sate Padang ×3 — cook sate now and
  // stage it on the etalase, exactly like a human who read the warning.
  let ticket = s.tickets[0];
  if (!ticket && s.kuntilanak.lull && s.kuntilanak.status === 'idle') {
    ticket = { recipeId: 'sate', needs: recipeById('sate').needs };
  }
  if (!ticket) return { dx: 0, dy: 0, interact: false };
  const recipe = recipeById(ticket.recipeId);
  const orderedNeeds = buildOrder(recipe);
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
  const need = orderedNeeds.find((n) => !s.plate.includes(n));
  if (!need) return none;
  const [needId, needState] = need.split(':');
  const inTray = s.tray.indexOf(need);
  if (inTray >= 0) {
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
    // instead of idling at the stove (same as sim-logic.mjs).
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
    const rawIdx = s.tray.indexOf(`${needId}:raw`);
    if (rawIdx >= 0) {
      if (atStation(s, 'chop')) return { dx: 0, dy: 0, interact: true };
      return { ...moveToward(s, stationCentre('chop')), interact: false };
    }
  }
  if (needState === 'cooked') {
    if (ing.prep === 'chopcook') {
      const choppedIdx = s.tray.indexOf(`${needId}:chopped`);
      if (choppedIdx >= 0) {
        const freePot = s.pots.findIndex((p) => !p.item);
        if (freePot >= 0) {
          if (atStation(s, `stove:${freePot}`)) return { dx: 0, dy: 0, interact: true };
          return { ...moveToward(s, stationCentre(`stove:${freePot}`)), interact: false };
        }
        return { ...moveToward(s, stationCentre('stove:0')), interact: false };
      }
      const rawIdx = s.tray.indexOf(`${needId}:raw`);
      if (rawIdx >= 0) {
        if (atStation(s, 'chop')) return { dx: 0, dy: 0, interact: true };
        return { ...moveToward(s, stationCentre('chop')), interact: false };
      }
    } else {
      const rawIdx = s.tray.indexOf(`${needId}:raw`);
      if (rawIdx >= 0) {
        const freePot = s.pots.findIndex((p) => !p.item);
        if (freePot >= 0) {
          if (atStation(s, `stove:${freePot}`)) return { dx: 0, dy: 0, interact: true };
          return { ...moveToward(s, stationCentre(`stove:${freePot}`)), interact: false };
        }
        return { ...moveToward(s, stationCentre('stove:0')), interact: false };
      }
    }
  }
  return fetchInput(s, need);
}
function fetchInput(s, need) {
  const [needId] = need.split(':');
  if (s.tray.length >= 3) return { dx: 0, dy: 0, interact: false };
  const crate = `crate:${needId}`;
  if (atStation(s, crate)) return { dx: 0, dy: 0, interact: true };
  return { ...moveToward(s, stationCentre(crate)), interact: false };
}

// ---- HUD ----
const MOOD_LABEL = {
  haus: 'HAUS', lapar: 'LAPAR', kenyang: 'KENYANG', lesu: 'LESU',
  'tidak selera': 'TIDAK SELERA', marah: 'MARAH', puas: 'PUAS',
};
let lastTicketSig = '';
function updateHUD() {
  const s = world.state;
  const stage = STAGES[s.stageIndex];
  $('stage-pill').textContent = `${stage.name} · ${stage.subtitle}`;
  const remain = Math.max(0, stage.seconds - s.stageElapsed);
  const mm = Math.floor(remain / 60);
  const ss = Math.floor(remain % 60).toString().padStart(2, '0');
  const timerEl = $('timer-pill');
  timerEl.textContent = `WAKTU ${mm}:${ss}`;
  timerEl.classList.toggle('warn', remain <= 30);
  $('coins-pill').textContent = `KOIN ${s.coins}`;
  $('streak-pill').textContent = `KOMBO ${s.streak} · gagal ${s.fails}/3`;
  // Tickets.
  const sig = s.tickets.map((t) => `${t.id}:${t.recipeId}:${Math.ceil(t.patience)}:${t.mood || ''}:${t.kuntilanak ? t.servedCount : ''}`).join('|');
  if (sig !== lastTicketSig) {
    lastTicketSig = sig;
    ticketsEl.innerHTML = s.tickets.map((t) => {
      const frac = Math.max(0, t.patience / t.max);
      const mood = t.kuntilanak ? '' : `<span class="tmood">${MOOD_LABEL[t.mood] || ''}</span>`;
      const count = t.kuntilanak ? ` (${t.servedCount}/${t.needCount})` : '';
      return `<div class="ticket${t.kuntilanak ? ' kuntilanak' : ''}">
        <div class="tname"><span>${t.name}${count}</span><span>${t.coins} koin</span></div>
        ${mood}
        <div class="tneeds">${t.needs.map((n) => itemName(n)).join(' + ')}</div>
        <div class="pbar"><div class="pfill${frac < 0.25 ? ' low' : ''}" style="width:${Math.round(frac * 100)}%"></div></div>
      </div>`;
    }).join('');
  } else {
    // Update only the patience bars.
    const fills = ticketsEl.querySelectorAll('.pfill');
    s.tickets.forEach((t, i) => {
      const frac = Math.max(0, t.patience / t.max);
      if (fills[i]) {
        fills[i].style.width = `${Math.round(frac * 100)}%`;
        fills[i].classList.toggle('low', frac < 0.25);
      }
    });
  }
  // Floating texts (project 2D world coords to screen).
  floatsEl.innerHTML = s.floats.map((f) => {
    const p = scene3d.project(f.x, f.y);
    return `<div class="float" style="left:${p.x}px;top:${p.y}px;opacity:${Math.min(1, f.life)};color:${f.color}">${f.text}</div>`;
  }).join('');
  // Horror overlay.
  $('vignette').style.opacity = String(Math.min(1, (s.horror || 0) * 0.9));
  // Telegraph: while the kitchen is quiet before she arrives, the banner
  // warns what she will order (Sate Padang ×3) so the cook can pre-cook
  // during the lull instead of learning it from the ticket.
  const banner = $('horror-banner');
  if (s.kuntilanak.status === 'active') {
    banner.textContent = 'DIA DATANG...';
    banner.style.opacity = '1';
  } else if (s.kuntilanak.lull && s.kuntilanak.status === 'idle') {
    banner.textContent = 'DIA LAPAR... SATE PADANG ×3 — MASAK SEKARANG!';
    banner.style.opacity = '1';
  } else {
    banner.style.opacity = '0';
  }
  // Stage card.
  const card = $('stage-card');
  if (s.transition > 0) {
    card.style.opacity = '1';
    $('stage-big').textContent = stage.name;
    $('stage-sub').textContent = stage.subtitle;
  } else {
    card.style.opacity = '0';
  }
  // Condiment unlock button: visible while locked and affordable.
  condBar.style.display = (!s.condimentsUnlocked && s.coins >= 15) ? 'block' : 'none';
}

// Click the flying plate where it is actually drawn: its screen position
// is the 3D projection at its floating height (2.6), not its 2D floor
// coordinates — comparing raw click pixels to floor coords missed by ~90px.
function tryPlateClick(x, y) {
  const fp = world.state.flyingPlate;
  if (!fp.active) return EVENT_NONE;
  const pp = scene3d.project(fp.x, fp.y, 2.6);
  if (Math.hypot(x - pp.x, y - pp.y) > 44) return EVENT_NONE;
  return world.tryCatchPlate(fp.x, fp.y);
}

function runShot(name) {
  const scene = stageShot(name, world);
  $('overlay').style.display = 'none';
  // Clicking works in shot scenes too: the staged flying plate can be
  // caught with a real click (tryCatchPlate), like in the live game.
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    tryPlateClick(x, y);
  });
  let painted = 0;
  function paint() {
    updateHUD();
    scene3d.draw(world.state, world, scene.screen, scene.best);
    exposeState(scene.screen);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function exposeState(screen) {
  const s = world.state;
  window.__dk = {
    screen, coins: s.coins, served: s.served, failed: s.failed, fails: s.fails,
    streak: s.streak, elapsed: Math.round(s.elapsed * 10) / 10, over: s.over, won: s.won,
    tickets: s.tickets.length, tray: [...s.tray], plate: [...s.plate], passDish: s.passDish,
    stageIndex: s.stageIndex, stageElapsed: Math.round(s.stageElapsed * 10) / 10,
    transition: Math.round(s.transition * 10) / 10, kuntilanak: s.kuntilanak.status,
    kuntilanakTelegraph: s.kuntilanak.lull && s.kuntilanak.status === 'idle',
    flyingPlateX: Math.round(s.flyingPlate.x), flyingPlateY: Math.round(s.flyingPlate.y),
    badges: [...s.badges], flyingPlate: s.flyingPlate.active, kapauDue: s.kapauDue,
    horror: Math.round((s.horror || 0) * 100) / 100, customers: s.customers.length,
    condimentUnlocked: !!s.condimentsUnlocked, condimentBonus, condimentTakes,
    startle: Math.round(scene3d.startle() * 100) / 100, startleSeen: scene3d.startleSeen(),
    scared: Math.round(s.scared * 100) / 100, shake: Math.round(s.shake * 100) / 100,
  };
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let autoStarted = false;
  let mouseStation = null;
  let mouseStationSince = 0;
  const overlay = $('overlay');

  function announce(message) { status.textContent = message; }
  function showOverlay(html) {
    overlay.innerHTML = html;
    overlay.style.display = 'flex';
  }
  function hideOverlay() { overlay.style.display = 'none'; }
  function titleHTML() {
    return `<h1>PADANG KILAT 3D</h1>
    <p>Masak rendang, sate, dan ayam pop secepat kilat — sebelum pelanggan kehabisan sabar. Tiga shift: pagi, siang, dan malam... yang berhantu.</p>
    <p class="keys">WASD / panah gerak &nbsp;·&nbsp; E / Spasi pegang &amp; pakai &nbsp;·&nbsp; klik stasiun untuk jalan ke sana &nbsp;·&nbsp; P jeda &nbsp;·&nbsp; M bisu</p>
    <button id="start-btn">MULAI MASAK</button>`;
  }

  function handleEvents(events) {
    if (events & EVENT_SERVED) {
      audio.serve();
      // Condiment bonus: an unlocked table lets the customer grab kerupuk
      // themselves — half the serves earn +2 coins.
      if (world.state.condimentsUnlocked && Math.random() < 0.5) {
        world.state.coins += 2;
        condimentBonus += 2;
        condimentTakes += 1;
        world.state.floats.push({ x: 1190, y: 270, text: '+2 kerupuk!', color: '#f2b234', life: 1.4 });
      }
    }
    if (events & EVENT_FAILED) audio.fail();
    if (events & EVENT_DING) audio.ding();
    if (events & EVENT_CHOP) audio.chop();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_DROP) audio.drop();
    if (events & EVENT_NO_ORDER) audio.fail();
    if (events & EVENT_RUSH) audio.rush();
    if (events & EVENT_STAGE) audio.stage();
    if (events & EVENT_KUNTILANAK) { audio.sting(); audio.laugh(); }
    if (events & EVENT_KUNTILANAK_WIN) { audio.serve(); audio.laugh(); }
    if (events & EVENT_KUNTILANAK_FAIL) { audio.sting(); audio.fail(); }
    if (events & EVENT_PLATE) audio.plate();
    const cooking = world.state.pots.some((p) => p.item && !p.done);
    const horror = world.state.kuntilanak.status === 'active';
    if (cooking && !horror) audio.startSizzle();
    else audio.stopSizzle();
    if (horror) audio.stopMusic();
    else audio.startMusic(); // the gamelan returns once she is gone
  }

  function startGame() {
    audio.unlock();
    audio.click();
    audio.startMusic();
    world.reset();
    lastTicketSig = '';
    accumulator = 0;
    screen = SCREEN_PLAY;
    hideOverlay();
    announce('Playing. Serve the tickets before their patience runs out.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.stopSizzle();
    audio.stopMusic();
    if (world.state.coins > best) { best = world.state.coins; saveBest(best); }
    const w = world.state;
    showOverlay(`<h1>${w.won ? 'MENANG!' : 'SHIFT SELESAI'}</h1>
      <p>${w.coins} koin · ${w.served} hidangan disajikan · lencana: ${w.badges.join(', ') || '—'}<br>Rekor: ${best} koin</p>
      <button id="start-btn">MAIN LAGI</button>`);
    $('start-btn').addEventListener('click', startGame);
    announce(w.won ? `Shift complete, you win. ${w.coins} coins.` : `Shift over. ${w.coins} coins.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) audio.toggleMute();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopSizzle();
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && screen === SCREEN_OVER) startGame();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'start-btn') startGame();
  });

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { dx: 0, dy: 0, interact: false }, true);
      return;
    }
    let dir = input.direction();
    let interact = input.interactHeld();
    const click = input.takeClick();
    if (click) {
      audio.unlock();
      const plateEvents = tryPlateClick(click.x, click.y);
      if (plateEvents) {
        handleEvents(plateEvents);
        mouseStation = null;
      } else {
        const hit = hitStation(click.x, click.y);
        if (hit) {
          world.state.moveTarget = stationCentre(hit);
          mouseStation = hit;
          mouseStationSince = performance.now();
        } else {
          world.state.moveTarget = { x: click.x, y: click.y };
          mouseStation = null;
        }
      }
    }
    if (mouseStation) {
      if (nearStation(world.state, mouseStation)) {
        interact = true;
        if (mouseStation === 'chop') {
          const stillRaw = world.state.tray.some((k) => {
            const [id, st] = k.split(':');
            const ing = INGREDIENTS[id];
            return st === 'raw' && ing && (ing.prep === 'chop' || ing.prep === 'chopcook');
          });
          if (!stillRaw && !world.state.chopping) mouseStation = null;
        } else if (performance.now() - mouseStationSince > 250) {
          mouseStation = null;
        }
      } else if (dir.dx !== 0 || dir.dy !== 0) {
        mouseStation = null;
      }
    }
    if (autoMode === 'win') {
      const ai = autopilotInput();
      dir = ai;
      interact = ai.interact;
      world.state.moveTarget = null;
    } else if (autoMode === 'lose') {
      dir = { dx: 0, dy: 0 };
      interact = false;
    }
    const events = world.step(STEP, { dx: dir.dx, dy: dir.dy, interact }, false);
    handleEvents(events);
    if (events & (EVENT_WIN | EVENT_LOSE)) endGame();
  }

  function hitStation(x, y) {
    for (const c of STATIONS.crates) {
      if (x >= c.x - 8 && x <= c.x + c.w + 8 && y >= c.y - 8 && y <= c.y + c.h + 8) return `crate:${c.id}`;
    }
    const inRect = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inRect(STATIONS.chop)) return 'chop';
    if (STATIONS.stove.some((s) => inRect(s))) return `stove:${STATIONS.stove.findIndex((s) => inRect(s))}`;
    if (inRect(STATIONS.assembly)) return 'assembly';
    if (inRect(STATIONS.pass)) return 'pass';
    if (inRect(STATIONS.bin)) return 'bin';
    return null;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if ((autoMode === 'win' || autoMode === 'lose') && !autoStarted && screen === SCREEN_TITLE) {
      autoStarted = true;
      startGame();
    }
    updateHUD();
    scene3d.draw(world.state, world, screen, best);
    exposeState(screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopSizzle();
      announce('Paused.');
    }
  });

  showOverlay(titleHTML());
  $('start-btn').addEventListener('click', startGame);
  announce('Padang Kilat 3D. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
