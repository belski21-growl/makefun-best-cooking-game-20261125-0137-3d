// Padang Kilat 3D — screenshot scenes behind ?shot=start|play|chop|serve|horror.
// Same staging as the 2D shots.js (same seed gives the same frame).
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './scene3d.js';

const IDLE = { dx: 0, dy: 0, interact: false };

function settle(world, seconds) {
  for (let i = 0; i < seconds / STEP; i += 1) world.step(STEP, IDLE, true);
}

export function stageShot(name, world) {
  const s = world.state;
  world.reset();
  if (name === 'start') {
    settle(world, 5);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'chop') {
    world.setStage(1, 38); // SIANG, mid-rush
    world.setElapsed(38 + 120);
    world.setCoins(28);
    world.forceTicket('dendeng', 0.7);
    world.forceTicket('telurbalado', 0.5);
    world.setPlate(['SAYUR:chopped']);
    world.setTray(['DAGING:raw']);
    world.setPot(0, 'NASI:raw', 0.55, false);
    world.placePlayer(640, 300);
    s.chopping = true;
    s.chopTarget = 'DAGING:raw';
    s.chopProgress = 0.55;
    settle(world, 0.4);
    s.chopping = true;
    s.chopTarget = 'DAGING:raw';
    s.chopProgress = 0.55;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'serve' || name === 'horror') {
    world.setStage(2, 122); // MALAM, last minute: the rush reads in the timer
    world.setElapsed(122 + 120 + 150);
    world.setCoins(88);
    s.streak = 4;
    world.forceTicket('rendang', 0.3);
    world.forceTicket('ayampop', 0.65);
    world.state.tickets[0].mood = 'lesu';
    world.state.tickets[1].mood = 'tidak selera';
    world.setPassDish('indomie');
    world.setPot(1, 'TELUR:raw', 1, true);
    world.placePlayer(1090, 410);
    // The horror moment, staged: she is here — the room dims, the lamps
    // flicker, fog drifts in, and her ticket runs blood-red on black.
    world.setKuntilanakActive();
    settle(world, 0.4);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // Default: play — the cover. Mid-service in SIANG, everything in one frame:
  // 3 tickets, ingredients on the counter, a dish mid-assembly, a ready plate,
  // steam from the pots, and the haunted flying plate crossing the screen.
  world.setStage(1, 55);
  world.setElapsed(55 + 120);
  world.setCoins(42);
  s.streak = 3;
  world.forceTicket('rendang', 0.8);
  world.forceTicket('sate', 0.45);
  world.forceTicket('gulai', 0.18);
  world.state.tickets[0].mood = 'lapar';
  world.state.tickets[1].mood = 'haus';
  world.setPlate(['NASI:cooked']); // rendang, 1 of 2 — mid-assembly
  world.setPassDish('indomie'); // a finished dish glowing on the etalase, ready to serve
  world.setTray(['CABAI:chopped']);
  world.setPot(0, 'NASI:raw', 0.6, false);
  world.setPot(1, 'DAGING:chopped', 0.85, false);
  world.placePlayer(640, 500);
  settle(world, 0.5);
  s.flyingPlate = { active: true, x: 850, y: 330, vx: 230, t: 0.5, nextAt: 0 };
  return { screen: SCREEN_PLAY, best: 0 };
}
