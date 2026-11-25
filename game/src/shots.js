// Padang Kilat 3D — staged screenshots.
// Each shot arranges the live world into one readable frame, then says
// which screen the renderer should draw. Nothing here plays the game:
// it only poses it, like setting a table before a photo.
//   start — title screen: the whole day ahead, kuntilanak only a tease.
//   play  — a busy SIANG shift: tickets up, 42 coins in the till.
//   chop  — the chef at the chopping board, mid-slice on daging.
//   serve — MALAM horror: she is here, 3× Sate Padang, chef startled.

export function stageShot(name, world) {
  const s = world && world.state ? world.state : world;
  const safe = (fn) => { try { fn(); } catch (err) { /* pose, don't crash */ } };
  const coins = (n) => safe(() => { if (world.setCoins) world.setCoins(n); else if (s) s.coins = n; });
  const stage = (i, t) => safe(() => { if (world.setStage) world.setStage(i, t); else if (s) { s.stageIndex = i; s.stageElapsed = t; } });
  const ticket = (id) => safe(() => { if (world.forceTicket) world.forceTicket(id, 1.0); });

  if (name === 'start') {
    safe(() => { if (world.reset) world.reset(); });
    stage(0, 0);
    coins(0);
    safe(() => { if (s) { s.horror = 0; s.scared = 0; s.shake = 0; } });
    return { screen: 'title', best: 0 };
  }

  if (name === 'chop') {
    stage(0, 45);
    coins(18);
    ticket('rendang');
    safe(() => {
      if (world.placePlayer) world.placePlayer(640, 300);
      if (world.setTray) world.setTray(['DAGING:raw']);
      if (s) {
        s.chopping = true;
        s.chopTarget = 'DAGING';
        s.chopProgress = 0.55;
      }
    });
    return { screen: 'play', best: 18 };
  }

  if (name === 'serve') {
    stage(2, 65);
    coins(60);
    safe(() => { if (world.setKuntilanakActive) world.setKuntilanakActive(); });
    safe(() => {
      if (world.placePlayer) world.placePlayer(640, 430);
      if (s) {
        s.horror = 1;
        s.flicker = 1;
        s.scared = 1.2;
        s.shake = 1;
      }
    });
    return { screen: 'play', best: 60 };
  }

  // Default: 'play' — a healthy SIANG shift mid-rush.
  stage(1, 30);
  coins(42);
  ticket('rendang');
  ticket('ayampop');
  ticket('sate');
  safe(() => { if (world.spawnFlyingPlate) world.spawnFlyingPlate(); });
  return { screen: 'play', best: 42 };
}
