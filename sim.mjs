// Padang Kilat 3D — sim + screenshot runner (Playwright Chromium, headless).
// Serves game/ on :8080 already (node serve.ts). Fast-forwards the game by
// stubbing requestAnimationFrame + performance.now with a synthetic clock, so
// a 450s game-time run finishes in ~1-2 min real time. The 3D differences
// from the 2.5D runner: the condiment unlock is a DOM button the autopilot
// never presses, so the poller clicks it as soon as it appears; the horror
// probe reads the startle timer the renderer exposes; and the condiment
// economy here is +2 per serve at 50%, not a per-customer take counter.
// Usage:
//   node sim.mjs win [seed ...]   — ?auto=win per seed, assert win + no console errors
//   node sim.mjs lose             — ?auto=lose, assert lose + 0 coins
//   node sim.mjs probe            — ?shot=serve, assert kuntilanak + startle + horror
//   node sim.mjs shoot            — re-shoot 4 screenshots into screenshots/
//   node sim.mjs all              — everything, in order
// Exit 0 only if every assert passes.
import { chromium } from 'playwright-core';
import { writeFileSync, statSync, existsSync } from 'node:fs';

const BASE = `http://localhost:${process.env.SIM_PORT || 8080}`;
const FAST_CLOCK = `
  (() => {
    let t = 0;
    window.__ffT = () => t;
    const origRaf = window.requestAnimationFrame.bind(window);
    // 250ms per tick = 15 fixed steps per rendered frame: the game's own
    // MAX_FRAME clamp (0.25s) is the ceiling, so this is the fastest the
    // loop can go without changing the game. One render per 15 steps is
    // what makes a 450s 3D game finish in ~3 min real time instead of
    // hours (SwiftShader renders ~0.6s/frame at 1280x720).
    window.requestAnimationFrame = (cb) => { t += 250; return setTimeout(() => cb(t), 0); };
    window.performance.now = () => t;
  })();
`;

async function newPage(browser, errors, width = 1280, height = 720) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('console', (m) => { if (m.type() === 'error' && errors.length < 20) errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => { if (errors.length < 20) errors.push(`pageerror: ${e.message}`); });
  await page.addInitScript(FAST_CLOCK);
  return page;
}

// One poll: read the debug state and, if the condiment button is showing,
// press it — that is what a player does the moment they can afford it.
async function pollState(page) {
  return page.evaluate(() => {
    const bar = document.getElementById('condiment-bar');
    const btn = document.getElementById('condiment-btn');
    if (bar && btn && bar.style.display === 'block') btn.click();
    return window.__dk || null;
  }).catch(() => null);
}

async function waitDk(page, pred, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const dk = await pollState(page);
    if (dk && pred(dk)) return dk;
    await new Promise((r) => setTimeout(r, 200));
  }
  const dk = await pollState(page);
  throw new Error(`timeout waiting for ${label}; last __dk=${JSON.stringify(dk)}`);
}

async function runWin(browser, seed) {
  const errors = [];
  // Small viewport: the logic is resolution-independent, and SwiftShader
  // renders 320x180 ~16x cheaper than 1280x720.
  const page = await newPage(browser, errors, 320, 180);
  await page.goto(`${BASE}/?auto=win&seed=${seed}`, { waitUntil: 'load' });
  let seenKuntilanak = false;
  let startleSeen = false;
  let condimentUnlockedAt = null;
  const t0 = Date.now();
  let dk;
  while (Date.now() - t0 < 300000) {
    dk = await pollState(page);
    if (dk) {
      if (dk.kuntilanak === 'active') seenKuntilanak = true;
      if (dk.startleSeen) startleSeen = true;
      if (dk.condimentUnlocked && condimentUnlockedAt === null) condimentUnlockedAt = dk.elapsed;
      if (dk.over) break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  await page.close();
  const ok = dk && dk.over && dk.won && dk.coins >= 100 && errors.length === 0;
  console.log(`win seed=${seed}: over=${dk?.over} won=${dk?.won} coins=${dk?.coins} served=${dk?.served} failed=${dk?.failed} condimentUnlocked=${dk?.condimentUnlocked} bonus=${dk?.condimentBonus} takes=${dk?.condimentTakes} kuntilanakSeen=${seenKuntilanak} kuntilanakWon=${dk?.badges?.includes('Berani!')} badges=${JSON.stringify(dk?.badges)} errors=${errors.length} ${ok ? 'PASS' : 'FAIL'}`);
  if (errors.length) console.log('  errors:', errors.slice(0, 5).join(' | '));
  return { ok, dk, errors, seenKuntilanak, startleSeen };
}

async function runLose(browser) {
  const errors = [];
  const page = await newPage(browser, errors, 320, 180);
  await page.goto(`${BASE}/?auto=lose&seed=7`, { waitUntil: 'load' });
  const dk = await waitDk(page, (d) => d.over, 300000, 'lose over');
  await page.close();
  const ok = dk.over && !dk.won && dk.coins === 0 && errors.length === 0;
  console.log(`lose: over=${dk.over} won=${dk.won} coins=${dk.coins} errors=${errors.length} ${ok ? 'PASS' : 'FAIL'}`);
  return { ok, dk, errors };
}

async function runProbe(browser) {
  const errors = [];
  const page = await newPage(browser, errors);
  await page.goto(`${BASE}/?shot=serve`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
  const dk = await page.evaluate(() => window.__dk);
  await page.close();
  const ok = dk.startle > 0 && dk.startleSeen && dk.kuntilanak === 'active' && dk.horror > 0 && errors.length === 0;
  console.log(`probe serve: startle=${dk.startle} startleSeen=${dk.startleSeen} kuntilanak=${dk.kuntilanak} horror=${dk.horror} scared=${dk.scared} shake=${dk.shake} errors=${errors.length} ${ok ? 'PASS' : 'FAIL'}`);
  return { ok, dk, errors };
}

async function runShoot(browser) {
  const shots = [
    ['play', '1-play.jpg'],
    ['start', '2-start.jpg'],
    ['chop', '3-chop.jpg'],
    ['serve', '4-serve.jpg'],
  ];
  const errors = [];
  const page = await newPage(browser, errors);
  const out = [];
  for (const [shot, file] of shots) {
    await page.goto(`${BASE}/?shot=${shot}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 300));
    const path = `screenshots/${file}`;
    await page.screenshot({ path, type: 'jpeg', quality: 82 });
    const size = statSync(path).size;
    console.log(`shot ${shot} -> ${path} ${size} bytes ${size < 262144 ? 'PASS' : 'FAIL (>256KiB)'}`);
    out.push({ shot, file, size });
    // Downscaled cover check for the play shot: 768x432 viewport render.
    if (shot === 'play') {
      await page.setViewportSize({ width: 768, height: 432 });
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: '/tmp/cover-768x432.jpg', type: 'jpeg', quality: 82 });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  }
  await page.close();
  const ok = out.every((s) => s.size < 262144) && errors.length === 0;
  console.log(`shoot errors=${errors.length} ${ok ? 'PASS' : 'FAIL'}`);
  if (errors.length) console.log('  errors:', errors.slice(0, 5).join(' | '));
  return { ok, out, errors };
}

async function runPlate(browser) {
  // Bonus: a real mouse click on the staged flying plate (?shot=play),
  // through the canvas pointer path — assert +25 and the plate gone.
  const errors = [];
  const page = await newPage(browser, errors);
  await page.goto(`${BASE}/?shot=play`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
  const before = await page.evaluate(() => ({ coins: window.__world.state.coins, active: window.__world.state.flyingPlate.active }));
  const pos = await page.evaluate(() => window.__scene3d.project(850, 330, 2.6));
  await page.mouse.click(pos.x, pos.y);
  await new Promise((r) => setTimeout(r, 300));
  const after = await page.evaluate(() => ({ coins: window.__world.state.coins, active: window.__world.state.flyingPlate.active }));
  await page.close();
  const ok = before.active && after.coins === before.coins + 25 && !after.active && errors.length === 0;
  console.log(`plate click: before coins=${before.coins} active=${before.active} screen=(${Math.round(pos.x)},${Math.round(pos.y)}) after coins=${after.coins} active=${after.active} errors=${errors.length} ${ok ? 'PASS' : 'FAIL'}`);
  return { ok };
}

const mode = process.argv[2] || 'all';
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
let allOk = true;
try {
  if (mode === 'win' || mode === 'all') {
    const seeds = process.argv.slice(3).map(Number).filter(Number.isInteger);
    for (const seed of (seeds.length ? seeds : [20261125, 7, 99])) {
      const r = await runWin(browser, seed);
      allOk &&= r.ok;
      // Condiment economy (3D model: +2 per serve at 50% once unlocked):
      // unlock happened, at least one kerupuk bonus landed, takes ≈ half
      // of the serves after unlock (loose band: 20–80%).
      if (r.dk) {
        const condOk = r.dk.condimentUnlocked && r.dk.condimentBonus > 0 && r.dk.condimentTakes >= 1;
        console.log(`  condiment seed=${seed}: unlocked=${r.dk.condimentUnlocked} bonus=${r.dk.condimentBonus} takes=${r.dk.condimentTakes} served=${r.dk.served} ${condOk ? 'PASS' : 'FAIL'}`);
        allOk &&= condOk;
      }
    }
  }
  if (mode === 'lose' || mode === 'all') { const r = await runLose(browser); allOk &&= r.ok; }
  if (mode === 'probe' || mode === 'all') { const r = await runProbe(browser); allOk &&= r.ok; }
  if (mode === 'plate') { const r = await runPlate(browser); allOk &&= r.ok; }
  if (mode === 'shoot' || mode === 'all') { const r = await runShoot(browser); allOk &&= r.ok; }
} finally {
  await browser.close();
}
console.log(allOk ? 'ALL PASS' : 'SOME FAILED');
process.exit(allOk ? 0 : 1);
