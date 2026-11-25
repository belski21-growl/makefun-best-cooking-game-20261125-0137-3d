// Padang Kilat 3D — the Three.js painter. The rules live in kitchen.js in
// flat 2D coordinates; this file only turns that state into a 3D room.
// The 2D board is 1280x720 and the chef walks it in pixels; here one world
// unit is 64 pixels, the board's centre (640, 430) sits at the origin, and
// +z runs toward the camera (the dining tables at the front).
import * as THREE from 'three';
import { INGREDIENTS, RECIPES, SEATS, QUEUE_SPOTS, STAGES, STATIONS, recipeById } from './config.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;

// 2D pixels -> world units. The board centre maps to (0, 0); y in 2D becomes
// z here, flipped so the top wall (small y) is far away (negative z).
const toWorldX = (x) => (x - 640) / 64;
const toWorldZ = (y) => (y - 430) / 64;
const PX = 1 / 64;

// Shirt colour of a dining customer, by the mood on their ticket.
const FACE_TINT = {
  haus: '#2a7fd4', lapar: '#d64533', kenyang: '#3f9e4d', lesu: '#8a8a7a',
  'tidak selera': '#b98a2e', marah: '#d61f1f', puas: '#f2b234',
};

export function createScene3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a140c);
  scene.fog = new THREE.FogExp2(0x0a0000, 0);

  const camera = new THREE.PerspectiveCamera(40, 1280 / 720, 0.1, 100);
  const CAM_BASE = new THREE.Vector3(0, 12.4, 11.6);
  const CAM_LOOK = new THREE.Vector3(0, 0, 0.7);
  camera.position.copy(CAM_BASE);
  camera.lookAt(CAM_LOOK);

  // Warm room light plus two pools of lamplight over the stove and the
  // etalase; the red horror light stays at zero until she arrives.
  const ambient = new THREE.AmbientLight(0xffe8c0, 0.85);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
  sun.position.set(6, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
  scene.add(sun);
  const lampStove = new THREE.PointLight(0xffc46b, 22, 12, 1.6);
  lampStove.position.set(toWorldX(1000), 3.2, toWorldZ(220));
  scene.add(lampStove);
  const lampPass = new THREE.PointLight(0xffd9a0, 16, 10, 1.6);
  lampPass.position.set(toWorldX(1192), 3.0, toWorldZ(420));
  scene.add(lampPass);
  const horrorLight = new THREE.PointLight(0xaa0000, 0, 14, 1.4);
  horrorLight.position.set(toWorldX(1020), 2.5, toWorldZ(350)); // on her, not the etalase — follows her shifted position
  scene.add(horrorLight);

  // ---- the room shell: checkered floor, back wall, door, dressing ----
  const floorTex = weaveFloorTexture();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3, 2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 11.5),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0.4);
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb4552d, roughness: 0.95 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(22, 4.5, 0.4), wallMat);
  backWall.position.set(0, 2.25, -5.4);
  backWall.receiveShadow = true;
  scene.add(backWall);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(22, 0.35, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x7a2e4d, roughness: 0.8 })
  );
  trim.position.set(0, 1.1, -5.38);
  scene.add(trim);
  // The door on the right wall: customers walk in from here.
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 3.2, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1c0f08, roughness: 1 })
  );
  door.position.set(10.4, 1.6, toWorldZ(620));
  scene.add(door);

  // A songket runner down the middle of the floor: flat, so the chef walks
  // over it, and it fills the empty stretch between the counters and the
  // dining tables that the cover shot looks across.
  const runnerTex = weaveSongketTexture();
  runnerTex.wrapS = runnerTex.wrapT = THREE.RepeatWrapping;
  runnerTex.repeat.set(3, 1);
  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3.4),
    new THREE.MeshStandardMaterial({ map: runnerTex, roughness: 0.9 })
  );
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, 0.015, 1.0);
  runner.receiveShadow = true;
  scene.add(runner);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.7 });
  const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x8f5a28, roughness: 0.7 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.6 });
  const tealMat = new THREE.MeshStandardMaterial({ color: 0x1f7a6d, roughness: 0.6 });

  // A station counter: a box whose footprint is the 2D rect, h tall.
  function placeBox(rect, h, mat, y0 = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(rect.w * PX, h, rect.h * PX), mat);
    m.position.set(toWorldX(rect.x + rect.w / 2), y0 + h / 2, toWorldZ(rect.y + rect.h / 2));
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  // ---- Padang dressing on the back wall: songket band, gonjong roofline,
  // menu board, hanging lamps ----
  const songketTex = weaveSongketTexture();
  songketTex.wrapS = songketTex.wrapT = THREE.RepeatWrapping;
  const songketBand = new THREE.Mesh(
    new THREE.BoxGeometry(22, 0.42, 0.46),
    new THREE.MeshStandardMaterial({ map: songketTex, roughness: 0.85 })
  );
  songketBand.position.set(0, 0.6, -5.36);
  scene.add(songketBand);
  const gonjong = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 3.2),
    new THREE.MeshStandardMaterial({ map: drawGonjongTexture(), transparent: true, roughness: 0.9 })
  );
  gonjong.name = 'gonjong';
  gonjong.position.set(0, 1.8, -5.15);
  scene.add(gonjong);
  // Menu board, right of the gonjong: it used to hang at x=-7.0, directly
  // behind the ticket column, so the tickets hid every dish name. On the
  // right wall, above the stoves, its title and prices stay visible.
  const menuBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 2.95),
    new THREE.MeshStandardMaterial({ map: drawMenuTexture(), roughness: 0.85 })
  );
  menuBoard.position.set(6.0, 1.05, -5.15);
  scene.add(menuBoard);
  // Hanging lamps: visible brass shades + bulbs; the point lights above do
  // the actual lighting, these are the fixtures you see.
  const lampShadeMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff9a2a, emissiveIntensity: 2.2 });
  [[-5, -1], [0, -0.5], [5, -1]].forEach(([lx, lz]) => {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    cord.position.set(lx, 4.0, lz);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.4, 16, 1, true), lampShadeMat);
    shade.position.set(lx, 3.35, lz);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), bulbMat);
    bulb.position.set(lx, 3.2, lz);
    scene.add(cord, shade, bulb);
  });
  const lampMid = new THREE.PointLight(0xffc46b, 12, 11, 1.6);
  lampMid.position.set(0, 3.0, -0.5);
  scene.add(lampMid);

  // ---- stations: crates, chopping board, stoves, assembly, etalase, bin ----
  // Crates: an open wood box, a mound of the ingredient, and a name label
  // floating above it so the cook can read the pantry at a glance.
  const crateProps = [];
  for (const c of STATIONS.crates) {
    const ing = INGREDIENTS[c.id];
    const base = placeBox(c, 0.55, woodDarkMat);
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(ing.color), roughness: 0.6 })
    );
    mound.scale.y = 0.55;
    mound.position.set(toWorldX(c.x + c.w / 2), 0.62, toWorldZ(c.y + c.h / 2));
    mound.castShadow = true;
    scene.add(mound);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeLabelTexture(ing.name), transparent: true, depthWrite: false,
    }));
    label.scale.set(1.5, 0.38, 1);
    label.position.set(toWorldX(c.x + c.w / 2), 1.25, toWorldZ(c.y + c.h / 2));
    scene.add(label);
    crateProps.push({ base, mound, id: c.id });
  }

  // Chopping board with a knife that bobs while something is being sliced.
  const chopBoard = placeBox(STATIONS.chop, 0.28, new THREE.MeshStandardMaterial({ color: 0xe8c890, roughness: 0.8 }));
  const knife = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.12), steelMat);
  knife.position.set(toWorldX(600), 0.36, toWorldZ(210));
  knife.castShadow = true;
  scene.add(knife);

  // Stoves: dark steel counters, a pot each, a disc of food when loaded, and
  // a glowing ring while the burner is on.
  const stoveUnits = STATIONS.stove.map((s) => {
    const base = placeBox(s, 0.85, new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.5, metalness: 0.3 }));
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.48, 0.5, 20), steelMat);
    pot.position.set(toWorldX(s.x + s.w / 2), 1.1, toWorldZ(s.y + s.h / 2));
    pot.castShadow = true;
    scene.add(pot);
    const food = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.1, 20),
      new THREE.MeshStandardMaterial({ color: 0x6e3b1f, roughness: 0.5 })
    );
    food.position.set(toWorldX(s.x + s.w / 2), 1.32, toWorldZ(s.y + s.h / 2));
    food.visible = false;
    scene.add(food);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.06, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xff7722, emissive: 0xff4400, emissiveIntensity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(toWorldX(s.x + s.w / 2), 0.88, toWorldZ(s.y + s.h / 2));
    ring.visible = false;
    scene.add(ring);
    return { base, pot, food, ring };
  });

  // Assembly counter with the white plate the dish is built on.
  const assembly = placeBox(STATIONS.assembly, 0.8, woodMat);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  plate.position.set(toWorldX(640), 0.85, toWorldZ(648));
  plate.castShadow = true;
  scene.add(plate);
  const plateFood = new THREE.Group();
  plateFood.position.set(toWorldX(640), 0.92, toWorldZ(648));
  scene.add(plateFood);

  // Etalase (the pass): teal counter, glass front, a plate for the finished
  // dish, and a window above it showing the face of the oldest ticket.
  const passBase = placeBox(STATIONS.pass, 1.0, tealMat);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(STATIONS.pass.w * PX, 0.7, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.2 })
  );
  glass.position.set(toWorldX(1192), 1.35, toWorldZ(340));
  scene.add(glass);
  const passPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  passPlate.position.set(toWorldX(1192), 1.05, toWorldZ(430));
  passPlate.castShadow = true;
  scene.add(passPlate);
  const passFood = new THREE.Group();
  passFood.position.set(toWorldX(1192), 1.12, toWorldZ(430));
  scene.add(passFood);
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 128; faceCanvas.height = 128;
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  const faceSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: faceTex, transparent: true, depthWrite: false }));
  faceSprite.scale.set(1.3, 1.3, 1);
  faceSprite.position.set(toWorldX(1192), 2.6, toWorldZ(380));
  scene.add(faceSprite);
  const faceCache = new Map();
  function faceTextureFor(mood) {
    if (!faceCache.has(mood)) faceCache.set(mood, paintFaceTexture(mood));
    return faceCache.get(mood);
  }
  function setEtalaseFace(mood) {
    const src = faceTextureFor(mood || 'netral');
    const g = faceCanvas.getContext('2d');
    g.drawImage(src.image, 0, 0);
    faceTex.needsUpdate = true;
  }
  setEtalaseFace('netral');

  // Bin for ruined ingredients.
  placeBox(STATIONS.bin, 0.7, new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.9 }));

  // Stacked plates inside the etalase, behind the glass, plus small bowls.
  const plateStackMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
  [[-0.8, 5], [0, 4], [0.8, 6]].forEach(([dx, n]) => {
    for (let i = 0; i < n; i += 1) {
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.05, 18), plateStackMat);
      pl.position.set(toWorldX(1192) + dx, 1.06 + i * 0.055, toWorldZ(372));
      pl.castShadow = true;
      scene.add(pl);
    }
  });
  const dishColors = [0x6e3b1f, 0xd64533, 0x3f9e4d];
  dishColors.forEach((c, i) => {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.18, 0.16, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    bowl.position.set(toWorldX(1150 + i * 42), 1.1, toWorldZ(400));
    const food = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 14),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
    food.position.set(toWorldX(1150 + i * 42), 1.19, toWorldZ(400));
    scene.add(bowl, food);
  });

  // ---- seats + queue markers ----
  const seatMeshes = SEATS.map((s) => {
    const grp = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.85), woodMat);
    seat.position.y = 0.45; seat.castShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.1), woodMat);
    back.position.set(0, 0.9, 0.4); back.castShadow = true;
    const legM = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 });
    [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.45, 0.09), legM);
      leg.position.set(lx, 0.22, lz);
      grp.add(leg);
    });
    grp.add(seat, back);
    grp.position.set(toWorldX(s.x), 0, toWorldZ(s.y));
    scene.add(grp);
    return grp;
  });
  // Gold rings on the floor where the queue stands.
  QUEUE_SPOTS.forEach((q) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xf2b234, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(toWorldX(q.x), 0.02, toWorldZ(q.y));
    scene.add(ring);
  });

  // ---- dining room: tables with songket cloths, chairs, condiment bowls
  // (locked until the player pays to open them), and ambient diners ----
  const tableClothTex = weaveSongketTexture();
  tableClothTex.wrapS = tableClothTex.wrapT = THREE.RepeatWrapping;
  tableClothTex.repeat.set(2, 1);
  const diningTables = [];
  const ambientDiners = [];
  const condimentLocks = [];
  const CONDIMENTS = [
    { name: 'Kerupuk Kulit', color: 0xc9a06a },
    { name: 'Peyek Udang', color: 0xd4552a },
    { name: 'Kerupuk Udang', color: 0xf2c9c9 },
  ];
  [[-8, 4.8], [4.8, 5.0], [8, 4.9]].forEach(([tx, tz], ti) => {
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.5), woodMat);
    top.position.set(tx, 0.78, tz); top.castShadow = true; top.receiveShadow = true;
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 1.6),
      new THREE.MeshStandardMaterial({ map: tableClothTex, roughness: 0.85 }));
    cloth.position.set(tx, 0.86, tz);
    scene.add(top, cloth);
    [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 }));
      leg.position.set(tx + lx, 0.39, tz + lz);
      scene.add(leg);
    });
    // A chair on each side.
    [[-0.7, -1.15], [0.7, -1.15]].forEach(([cx, cz]) => {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.6), woodMat);
      ch.position.set(tx + cx, 0.45, tz + cz); ch.castShadow = true;
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.08), woodMat);
      bk.position.set(tx + cx, 0.85, tz + cz + (cz < 0 ? 0.28 : -0.28));
      scene.add(ch, bk);
    });
    // Three little condiment bowls per table, each with a padlock sprite
    // above it until the player pays the 15 coins to open them.
    CONDIMENTS.forEach((cm, ci) => {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.12, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
      bowl.position.set(tx - 0.8 + ci * 0.8, 0.98, tz - 0.2);
      const snack = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6),
        new THREE.MeshStandardMaterial({ color: cm.color, roughness: 0.7 }));
      snack.scale.y = 0.55;
      snack.position.set(tx - 0.8 + ci * 0.8, 1.06, tz - 0.2);
      scene.add(bowl, snack);
      const lock = new THREE.Sprite(new THREE.SpriteMaterial({ map: drawLockTexture(), transparent: true, depthWrite: false }));
      lock.scale.set(0.5, 0.5, 1);
      lock.position.set(tx - 0.8 + ci * 0.8, 1.35, tz - 0.2);
      scene.add(lock);
      condimentLocks.push(lock);
    });
    diningTables.push({ x: tx, z: tz });
    // Two decorative diners per table, always eating.
    [[-0.7, 1.15, 0], [0.7, 1.15, 1]].forEach(([dx, dz, vi]) => {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 0.85, 12), new THREE.MeshStandardMaterial({ color: [0x7a2e4d, 0x2a5a8a, 0x3f7a3a, 0x8a6f2a, 0x5a3a7a, 0xa04a2a][(ti * 2 + vi) % 6], roughness: 0.75 }));
      body.position.y = 0.62; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf7c98a, roughness: 0.6 }));
      head.position.y = 1.3;
      const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintFaceTexture(['kenyang', 'puas', 'lapar'][(ti + vi) % 3]), transparent: true, depthWrite: false }));
      face.scale.set(0.7, 0.7, 1);
      face.position.set(0, 1.68, 0);
      const plateM = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.06, 16), plateStackMat);
      plateM.position.set(0, 0.95, -0.55);
      grp.add(body, head, face, plateM);
      grp.position.set(tx + dx, 0, tz + dz);
      grp.rotation.y = Math.PI; // facing the table
      scene.add(grp);
      ambientDiners.push({ grp, phase: (ti * 2 + vi) * 1.3 });
    });
  });

  // ---- the chef ----
  const chef = new THREE.Group();
  const chefBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.9, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff6e3, roughness: 0.7 }));
  chefBody.position.y = 0.75; chefBody.castShadow = true;
  const chefApron = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1f7a6d, roughness: 0.7 }));
  chefApron.position.set(0, 0.72, 0.36);
  const chefHead = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xf7c98a, roughness: 0.6 }));
  chefHead.position.y = 1.45; chefHead.castShadow = true;
  const chefHat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.35, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
  chefHat.position.y = 1.8;
  const chefHatTop = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
  chefHatTop.scale.y = 0.6; chefHatTop.position.y = 1.98;
  const chefFace = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintFaceTexture('netral'), transparent: true, depthWrite: false }));
  chefFace.scale.set(0.55, 0.55, 1);
  chefFace.position.set(0, 1.45, 0.32);
  chef.add(chefBody, chefApron, chefHead, chefHat, chefHatTop, chefFace);
  scene.add(chef);
  const chefScaredFace = paintFaceTexture('takut');
  const chefNormalFace = paintFaceTexture('netral');
  // The red "!" that pops over the chef when the kuntilanak arrives.
  const bangTex = makeCanvasTexture(96, 128, (g) => {
    g.fillStyle = '#ff2a2a'; g.font = '900 110px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#000'; g.lineWidth = 10;
    g.strokeText('!', 48, 64); g.fillText('!', 48, 64);
  });
  const bangSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTex, transparent: true, depthWrite: false }));
  bangSprite.scale.set(0.7, 0.9, 1);
  bangSprite.position.set(0, 2.7, 0);
  bangSprite.visible = false;
  chef.add(bangSprite);
  let prevKun = 'idle';
  let startleT = 0;
  let startleEver = false;
  // The tray: what the chef carries, floating over the hat.
  const trayGroup = new THREE.Group();
  trayGroup.position.y = 2.25;
  chef.add(trayGroup);

  // ---- the kuntilanak ----
  const kunti = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 16),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f5, roughness: 0.9, transparent: true, opacity: 0.96, emissive: 0x661111, emissiveIntensity: 0.6 }));
  dress.position.y = 0.85; dress.castShadow = true;
  const kHead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8d8c8, roughness: 0.6 }));
  kHead.position.y = 1.85;
  const hair = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.3, 12),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 }));
  hair.position.y = 1.95; hair.rotation.x = Math.PI;
  const kFace = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintFaceTexture('marah'), transparent: true, depthWrite: false }));
  kFace.scale.set(0.5, 0.5, 1);
  kFace.position.set(0, 1.85, 0.28);
  kunti.add(dress, kHead, hair, kFace);
  // Red halo so she reads as a figure at thumbnail size, not a smudge.
  const kGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xff5040, transparent: true, opacity: 0.55, depthWrite: false }));
  kGlow.scale.set(3.2, 3.2, 1);
  kGlow.position.set(0, 1.2, 0);
  kunti.add(kGlow);
  kunti.scale.setScalar(1.3);
  kunti.position.set(toWorldX(1020), 0.35, toWorldZ(350)); // in front of the etalase, not behind it — shifted left so the etalase + plates hide less of her
  kunti.visible = false;
  scene.add(kunti);

  // ---- the flying plate (click it for +25): gold rim + glow so the white
  // disc reads against the cream floor — it vanished in the cover thumbnail.
  const flyingPlate = new THREE.Group();
  const fpDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.08, 20),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  const fpRim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xf2b234, emissive: 0xa86f00, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.5 }));
  fpRim.rotation.x = Math.PI / 2;
  const fpGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffc46b, transparent: true, opacity: 0.8, depthWrite: false }));
  fpGlow.scale.set(2.6, 2.6, 1);
  const fpFood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a2410, roughness: 0.6 }));
  fpFood.position.y = 0.15;
  flyingPlate.add(fpGlow, fpDisc, fpRim, fpFood);
  flyingPlate.scale.setScalar(1.45); // bigger on screen — it must read at 384px thumbnail
  flyingPlate.visible = false;
  scene.add(flyingPlate);

  // ---- steam and cold mist: a pool of reusable soft sprites ----
  const softTex = makeGlowTexture();
  const steamPool = [];
  for (let i = 0; i < 90; i += 1) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softTex, transparent: true, opacity: 0, depthWrite: false, color: 0xffffff,
    }));
    sp.visible = false;
    scene.add(sp);
    steamPool.push({ sp, life: 0, max: 1, vy: 0.8, vx: 0, size: 0.5 });
  }
  let steamIdx = 0;
  function spawnSteam(x, y, z, cold = false) {
    const p = steamPool[steamIdx];
    steamIdx = (steamIdx + 1) % steamPool.length;
    p.sp.position.set(x, y, z);
    p.sp.material.color.setHex(cold ? 0x9fd8ff : 0xffffff);
    p.life = 0.9 + Math.random() * 0.6;
    p.max = p.life;
    p.vy = cold ? 0.25 : 0.7 + Math.random() * 0.5;
    p.vx = cold ? (Math.random() - 0.5) * 0.4 : (Math.random() - 0.5) * 0.15;
    p.size = cold ? 0.7 : 0.6 + Math.random() * 0.4;
    p.sp.visible = true;
  }

  // ---- dining customers: one mesh per ticket, built on demand ----
  const custMeshes = new Map(); // ticketId -> { group, face, timerRing, timerFill }
  const bodyGeo = new THREE.CylinderGeometry(0.26, 0.36, 0.85, 12);
  const headGeo = new THREE.SphereGeometry(0.26, 14, 10);
  function tintFor(mood) {
    return new THREE.Color(FACE_TINT[mood] || 0x8a6f4d);
  }
  function makeCustomer(c) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: tintFor(c.mood), roughness: 0.75 }));
    body.position.y = 0.62; body.castShadow = true;
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xf7c98a, roughness: 0.6 }));
    head.position.y = 1.3; head.castShadow = true;
    const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintFaceTexture(c.mood || 'netral'), transparent: true, depthWrite: false }));
    face.scale.set(0.85, 0.85, 1);
    face.position.set(0, 1.75, 0);
    // The queue timer: a ring over the head that shrinks as patience runs out.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0xf2b234, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.position.set(0, 2.2, 0);
    ring.visible = false;
    grp.add(body, head, face, ring);
    scene.add(grp);
    const rec = { grp, face, ring, mood: c.mood || 'netral', body };
    custMeshes.set(c.ticketId, rec);
    return rec;
  }

  // ---- food item meshes, one per item key ----
  const itemGeoCache = new Map();
  function itemMesh(key) {
    const [id, st] = key.split(':');
    const ing = INGREDIENTS[id];
    const color = new THREE.Color(ing ? ing.color : '#cccccc');
    let geo; let mat;
    if (st === 'ready' && (id === 'ESTEH' || id === 'ESJERUK')) {
      // Cold drink: glass, coloured liquid, two ice cubes.
      const grp = new THREE.Group();
      const glassM = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.34, 12),
        new THREE.MeshStandardMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.45, roughness: 0.1 }));
      glassM.position.y = 0.17;
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.26, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.2 }));
      liquid.position.y = 0.15;
      grp.add(glassM, liquid);
      for (let i = 0; i < 2; i += 1) {
        const ice = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09),
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 0.1 }));
        ice.position.set((i ? 0.05 : -0.05), 0.3, (i ? -0.04 : 0.04));
        ice.rotation.set(0.4, 0.3, 0.2);
        grp.add(ice);
      }
      return grp;
    }
    if (st === 'ready') {
      // Warm drink or sambal: a small bowl with something steaming in it.
      const grp = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
      bowl.position.y = 0.08;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
      top.position.y = 0.17;
      grp.add(bowl, top);
      return grp;
    }
    if (st === 'chopped') {
      geo = new THREE.BoxGeometry(0.3, 0.12, 0.3);
    } else if (st === 'cooked') {
      geo = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14);
    } else {
      geo = new THREE.SphereGeometry(0.19, 12, 8);
    }
    mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }
  // Rebuild a group's children only when the item list actually changed.
  function rebuildGroup(group, keys, spacing = 0.42) {
    const sig = keys.join('|');
    if (group.userData.sig === sig) return;
    group.userData.sig = sig;
    while (group.children.length) group.remove(group.children[0]);
    keys.forEach((k, i) => {
      const m = itemMesh(k);
      m.position.set((i - (keys.length - 1) / 2) * spacing, 0, 0);
      group.add(m);
    });
  }

  // ---- per-frame paint ----
  const bgNormal = new THREE.Color(0x2a140c);
  const bgHorror = new THREE.Color(0x050000);
  const tmpV = new THREE.Vector3();
  let steamAcc = 0;
  let lastW = 0; let lastH = 0;

  function resize() {
    const w = canvas.clientWidth || 1280;
    const h = canvas.clientHeight || 720;
    if (w !== lastW || h !== lastH) {
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  // height is the world height to project at (default 0.6, ground level). The
  // flying plate floats at 2.6 — projecting it at 0.6 puts its click target
  // ~90px below where it is actually drawn, so clicks on the visible plate
  // used to miss (proven 25 Nov in the plate sim).
  function project(x, y, height = 0.6) {
    tmpV.set(toWorldX(x), height, toWorldZ(y)).project(camera);
    const w = canvas.clientWidth || 1280;
    const h = canvas.clientHeight || 720;
    return { x: (tmpV.x * 0.5 + 0.5) * w, y: (-tmpV.y * 0.5 + 0.5) * h };
  }

  function draw(state, world, screen, best) {
    resize();
    const dt = 1 / 60;
    const horror = state.horror || 0;
    const flicker = state.flicker ?? 1;

    // Horror mood, kept readable: the old dimming (ambient ×0.45, fog 0.065)
    // turned the horror screenshot nearly black and hid the kuntilanak.
    // Brighter now (ambient ×0.70, fog 0.038) so she still reads in a still.
    scene.fog.density = horror * 0.038;
    scene.background.lerpColors(bgNormal, bgHorror, horror);
    ambient.intensity = 0.85 * (1 - 0.30 * horror) * flicker;
    sun.intensity = 1.6 * (1 - 0.30 * horror) * flicker;
    lampStove.intensity = 22 * flicker * (1 - 0.25 * horror);
    lampPass.intensity = 16 * flicker * (1 - 0.25 * horror);
    horrorLight.intensity = horror * 55;

    // Camera: a slow sway while she is here, plus shake on scares and fails.
    const shake = (state.shake || 0) + horror * 0.12;
    camera.position.set(
      CAM_BASE.x + Math.sin(state.elapsed * 1.3) * 0.18 * horror + (Math.random() - 0.5) * shake * 0.5,
      CAM_BASE.y + (Math.random() - 0.5) * shake * 0.3,
      CAM_BASE.z + (Math.random() - 0.5) * shake * 0.5
    );
    camera.lookAt(CAM_LOOK);

    // The chef. When she arrives the cook jumps back, the "!" pops up, and
    // the face goes scared until the fright wears off.
    if (state.kuntilanak.status === 'active' && prevKun !== 'active') {
      startleT = 1.0;
      startleEver = true;
    }
    prevKun = state.kuntilanak.status;
    if (startleT > 0) startleT = Math.max(0, startleT - dt);
    const p = state.player;
    const jumpBack = startleT > 0 ? Math.sin((1 - startleT) * Math.PI) * 0.9 : 0;
    const hop = startleT > 0 ? Math.sin((1 - startleT) * Math.PI) * 0.45 : 0;
    chef.position.set(toWorldX(p.x) - jumpBack, hop + (p.moving ? Math.abs(Math.sin(state.elapsed * 10)) * 0.06 : 0), toWorldZ(p.y));
    chef.rotation.y = p.face >= 0 ? 0 : Math.PI;
    chefFace.material.map = (state.scared > 0 || startleT > 0) ? chefScaredFace : chefNormalFace;
    bangSprite.visible = startleT > 0.25;
    rebuildGroup(trayGroup, state.tray, 0.4);
    trayGroup.visible = state.tray.length > 0;

    // The knife chops while chopping.
    if (state.chopping) {
      knife.position.y = 0.36 + Math.abs(Math.sin(state.elapsed * 18)) * 0.22;
      knife.rotation.z = Math.sin(state.elapsed * 18) * 0.4;
    } else {
      knife.position.y = 0.36;
      knife.rotation.z = 0;
    }

    // Pots: food shows when loaded, the burner ring while cooking, steam
    // rising either way once the food is in.
    steamAcc += dt;
    state.pots.forEach((pot, i) => {
      const sm = stoveUnits[i];
      if (pot.item) {
        const [id] = pot.item.split(':');
        const ing = INGREDIENTS[id];
        sm.food.visible = true;
        sm.food.material.color.setHex(new THREE.Color(ing ? ing.color : '#888888').getHex());
        sm.ring.visible = !pot.done;
      } else {
        sm.food.visible = false;
        sm.ring.visible = false;
      }
      if (pot.item && steamAcc > 0.1) {
        const c = STATIONS.stove[i];
        spawnSteam(toWorldX(c.x + c.w / 2), 1.5, toWorldZ(c.y + c.h / 2), false);
      }
    });
    if (state.passDish && steamAcc > 0.22) spawnSteam(toWorldX(1192), 1.3, toWorldZ(430), false);
    // Cold mist off the cold drinks the chef is carrying or has plated.
    const coldKeys = [...state.tray, ...state.plate].filter((k) => k === 'ESTEH:ready' || k === 'ESJERUK:ready');
    if (coldKeys.length && steamAcc > 0.3) {
      spawnSteam(toWorldX(p.x), 2.4, toWorldZ(p.y), true);
    }
    if (steamAcc > 0.3) steamAcc = 0;

    // Plate and pass-dish contents.
    rebuildGroup(plateFood, state.plate, 0.42);
    if (state.passDish) {
      const recipe = recipeById(state.passDish);
      rebuildGroup(passFood, recipe ? recipe.needs.slice(0, 3) : [], 0.34);
    } else {
      rebuildGroup(passFood, [], 0.34);
    }

    // Customers: build, move, and drop them as the kitchen state changes.
    const seen = new Set();
    for (const c of state.customers) {
      seen.add(c.ticketId);
      let rec = custMeshes.get(c.ticketId);
      if (!rec) rec = makeCustomer(c);
      rec.grp.position.set(toWorldX(c.x), 0, toWorldZ(c.y));
      const moodNow = c.angry ? 'marah' : (c.mood || 'netral');
      if (rec.mood !== moodNow) {
        rec.mood = moodNow;
        rec.face.material.map = paintFaceTexture(moodNow);
      }
      // A customer who is eating is happy: KENYANG face.
      if (c.state === 'eating' && rec.mood !== 'kenyang') {
        rec.mood = 'kenyang';
        rec.face.material.map = paintFaceTexture('kenyang');
      }
      // Queue timer ring: shown while queuing, shrinking as patience runs out.
      if (c.state === 'queue') {
        rec.ring.visible = true;
        const frac = Math.max(0, c.queueLeft / c.queueMax);
        rec.ring.material.color.setHex(frac < 0.35 ? 0xd61f1f : 0xf2b234);
        rec.ring.scale.setScalar(0.6 + frac * 0.6);
      } else {
        rec.ring.visible = false;
      }
      // Face the room (toward the kitchen) while seated or eating.
      rec.grp.rotation.y = c.state === 'leaving' ? Math.PI / 2 : -Math.PI / 2;
    }
    for (const [id, rec] of [...custMeshes]) {
      if (!seen.has(id)) {
        scene.remove(rec.grp);
        custMeshes.delete(id);
      }
    }

    // The kuntilanak: she floats at the etalase while active and lingers
    // faintly while the horror fades after she leaves.
    const kActive = state.kuntilanak.status === 'active';
    kunti.visible = kActive || horror > 0.05;
    if (kunti.visible) {
      kunti.position.y = 0.35 + Math.sin(state.elapsed * 1.8) * 0.12;
      kunti.traverse((o) => {
        if (o.material && o.material.transparent) o.material.opacity = kActive ? 0.96 : 0.25 + horror * 0.6;
      });
    }

    // The flying plate.
    const fp = state.flyingPlate;
    flyingPlate.visible = !!fp.active;
    if (fp.active) {
      flyingPlate.position.set(toWorldX(fp.x), 2.6 + Math.sin(state.elapsed * 3) * 0.15, toWorldZ(fp.y));
      flyingPlate.rotation.z += dt * 2;
    }

    // Steam sprites age and fade.
    for (const pt of steamPool) {
      if (pt.life <= 0) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.sp.visible = false; pt.sp.material.opacity = 0; continue; }
      pt.sp.position.y += pt.vy * dt;
      pt.sp.position.x += pt.vx * dt;
      const f = pt.life / pt.max;
      pt.sp.material.opacity = f * 0.7;
      const sc = pt.size * (1.6 - f * 0.7);
      pt.sp.scale.set(sc, sc, 1);
    }

    // Etalase face: what just happened wins briefly, otherwise the oldest
    // ticket's mood — and fear while she is standing there.
    let faceMood = 'netral';
    if (state.customerFace && state.customerFace.mood && state.customerFace.until > state.elapsed) {
      faceMood = state.customerFace.mood;
    } else if (state.tickets.length) {
      faceMood = state.tickets[0].mood || 'netral';
      if (state.tickets[0].patience / state.tickets[0].max < 0.25) faceMood = 'marah';
    }
    if (state.kuntilanak.status === 'active') faceMood = 'takut';
    setEtalaseFace(faceMood);

    // Ambient diners bob gently while they eat; the condiment padlocks stay
    // until the player pays to open them.
    for (const d of ambientDiners) {
      d.grp.position.y = Math.abs(Math.sin(state.elapsed * 1.4 + d.phase)) * 0.04;
    }
    const unlocked = !!state.condimentsUnlocked;
    for (const lock of condimentLocks) lock.visible = !unlocked;
    lampMid.intensity = 12 * flicker * (1 - 0.25 * horror);

    renderer.render(scene, camera);
  }

  return {
    draw, project, scene, camera, renderer,
    // Debug hooks for the sim: how fresh the entrance startle still is, and
    // whether it has ever fired in this session.
    startle: () => startleT,
    startleSeen: () => startleEver,
  };
}

// ---- canvas painters (module scope; function declarations hoist, so the
// scene builder above can call them) ----

// A canvas turned into a texture: draw with 2D calls, get a texture back.
function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// Checkered tile floor in the two cream tones from the palette.
function weaveFloorTexture() {
  return makeCanvasTexture(512, 256, (g, w, h) => {
    const t = 64;
    for (let y = 0; y < h / t; y += 1) {
      for (let x = 0; x < w / t; x += 1) {
        g.fillStyle = (x + y) % 2 ? '#ecd9b4' : '#f3e2c2';
        g.fillRect(x * t, y * t, t, t);
        g.strokeStyle = 'rgba(120,70,30,.25)';
        g.strokeRect(x * t + 0.5, y * t + 0.5, t - 1, t - 1);
      }
    }
  });
}

// A small cream sign with one line of bold text (crate labels).
function makeLabelTexture(text, fg = '#33241a', bg = '#fff6e3') {
  return makeCanvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 30px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// A face drawn from primitives (no emoji font needed in headless runs).
// Moods: haus, lapar, kenyang, lesu, tidak selera, marah, puas, takut, netral.
function paintFaceTexture(mood) {
  return makeCanvasTexture(128, 128, (g) => {
    const skin = mood === 'marah' ? '#e0785a' : mood === 'kenyang' || mood === 'puas' ? '#ffd9a0' : '#f7d7a0';
    g.fillStyle = skin;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a6a45'; g.lineWidth = 4; g.stroke();
    const eye = (x, y, r = 7) => { g.fillStyle = '#241610'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    const brow = (x, y, a) => {
      g.strokeStyle = '#241610'; g.lineWidth = 6; g.beginPath();
      g.moveTo(x - 14, y + (a > 0 ? 6 : -6)); g.lineTo(x + 14, y + (a > 0 ? -6 : 6)); g.stroke();
    };
    const mouth = (kind) => {
      g.strokeStyle = '#7a2e2e'; g.lineWidth = 5; g.fillStyle = '#7a2e2e';
      g.beginPath();
      if (kind === 'smile') { g.arc(64, 78, 20, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      else if (kind === 'big') { g.arc(64, 72, 24, 0, Math.PI); g.fill(); }
      else if (kind === 'open') { g.arc(64, 88, 10, 0, Math.PI * 2); g.fill(); }
      else if (kind === 'flat') { g.moveTo(48, 92); g.lineTo(80, 92); g.stroke(); }
      else if (kind === 'frown') { g.arc(64, 102, 18, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
    };
    const heart = (x, y, s) => {
      g.fillStyle = '#e83e6b';
      g.beginPath();
      g.moveTo(x, y + s * 0.9);
      g.bezierCurveTo(x - s, y, x - s * 0.4, y - s, x, y - s * 0.35);
      g.bezierCurveTo(x + s * 0.4, y - s, x + s, y, x, y + s * 0.9);
      g.fill();
    };
    const star = (x, y, r) => {
      g.fillStyle = '#f2b234';
      g.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
    };
    switch (mood) {
      case 'haus':
        eye(44, 52); eye(84, 52); mouth('open');
        g.fillStyle = '#2a7fd4';
        g.beginPath(); g.moveTo(108, 18); g.quadraticCurveTo(120, 38, 108, 46);
        g.quadraticCurveTo(96, 38, 108, 18); g.fill();
        break;
      case 'lapar':
        eye(44, 50); eye(84, 50); mouth('big');
        break;
      case 'kenyang':
        g.strokeStyle = '#241610'; g.lineWidth = 5;
        g.beginPath(); g.arc(44, 54, 10, Math.PI, 0); g.stroke();
        g.beginPath(); g.arc(84, 54, 10, Math.PI, 0); g.stroke();
        mouth('smile'); heart(104, 26, 12);
        break;
      case 'lesu':
        g.strokeStyle = '#241610'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(34, 56); g.lineTo(54, 56); g.stroke();
        g.beginPath(); g.moveTo(74, 56); g.lineTo(94, 56); g.stroke();
        mouth('flat');
        g.fillStyle = '#7fb8e8';
        g.beginPath(); g.arc(104, 26, 7, 0, Math.PI * 2); g.fill();
        break;
      case 'tidak selera':
        brow(44, 44, 1); eye(84, 54); mouth('flat');
        break;
      case 'marah':
        brow(44, 46, -1); brow(84, 46, 1); eye(44, 58, 6); eye(84, 58, 6); mouth('frown');
        break;
      case 'puas':
        g.strokeStyle = '#241610'; g.lineWidth = 5;
        g.beginPath(); g.arc(44, 54, 10, Math.PI, 0); g.stroke();
        g.beginPath(); g.arc(84, 54, 10, Math.PI, 0); g.stroke();
        mouth('big'); star(104, 24, 13);
        break;
      case 'takut':
        eye(44, 50, 9); eye(84, 50, 9); mouth('open');
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(47, 47, 3, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(87, 47, 3, 0, Math.PI * 2); g.fill();
        break;
      default:
        eye(44, 54); eye(84, 54); mouth('smile');
    }
  });
}

// A soft white radial blob for steam and mist sprites.
function makeGlowTexture() {
  return makeCanvasTexture(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,.9)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
}

// Songket cloth: deep red with a gold diamond lattice and gold hems.
function weaveSongketTexture() {
  return makeCanvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#7a1f2b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2b234'; g.fillStyle = '#f2b234'; g.lineWidth = 3;
    for (let x = 16; x < w; x += 32) {
      g.beginPath();
      g.moveTo(x, 8); g.lineTo(x + 10, h / 2); g.lineTo(x, h - 8); g.lineTo(x - 10, h / 2);
      g.closePath(); g.stroke();
      g.beginPath(); g.arc(x, h / 2, 3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#f2b234'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  });
}

// Rumah gadang roofline: three horn peaks (gonjong) sweeping up, a gold
// ridge line under them, and three lit windows below.
function drawGonjongTexture() {
  return makeCanvasTexture(1024, 220, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#5a3a1a';
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, 150);
    g.quadraticCurveTo(90, 60, 170, 30);   // left horn tip
    g.quadraticCurveTo(230, 90, 300, 120);
    g.quadraticCurveTo(380, 40, 512, 18);  // middle horn tip (tallest)
    g.quadraticCurveTo(644, 40, 724, 120);
    g.quadraticCurveTo(794, 90, 854, 30);  // right horn tip
    g.quadraticCurveTo(934, 60, 1024, 150);
    g.lineTo(1024, h);
    g.closePath(); g.fill();
    g.strokeStyle = '#f2b234'; g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, 150);
    g.quadraticCurveTo(90, 60, 170, 30);
    g.quadraticCurveTo(230, 90, 300, 120);
    g.quadraticCurveTo(380, 40, 512, 18);
    g.quadraticCurveTo(644, 40, 724, 120);
    g.quadraticCurveTo(794, 90, 854, 30);
    g.quadraticCurveTo(934, 60, 1024, 150);
    g.stroke();
    g.fillStyle = '#ffd94d';
    [300, 512, 724].forEach((x) => { g.fillRect(x - 14, 150, 28, 40); });
  });
}

// The menu board: dark wood, gold frame, the 8 recipes plus the drinks.
function drawMenuTexture() {
  return makeCanvasTexture(512, 420, (g, w, h) => {
    g.fillStyle = '#2c1a0c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2b234'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#f2b234'; g.font = 'bold 44px sans-serif';
    g.textAlign = 'center'; g.fillText('MENU PADANG', w / 2, 62);
    g.strokeStyle = '#f2b234'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(60, 80); g.lineTo(w - 60, 80); g.stroke();
    const items = [
      ['Nasi Rendang', '20'], ['Indomie Rendang', '18'], ['Ayam Pop', '16'],
      ['Sate Padang', '16'], ['Gulai Ayam', '14'], ['Dendeng Balado', '14'],
      ['Nasi Sayur Singkong', '14'], ['Telur Balado', '14'],
      ['Es Teh Manis', '5'], ['Teh Talua', '6'], ['Es Jeruk', '5'],
    ];
    g.font = 'bold 27px sans-serif';
    items.forEach(([name, price], i) => {
      const y = 122 + i * 27;
      g.fillStyle = '#fff6e3'; g.textAlign = 'left'; g.fillText(name, 36, y);
      g.fillStyle = '#ffd94d'; g.textAlign = 'right'; g.fillText(price, w - 36, y);
    });
  });
}

// A gold padlock on a dark disc: the condiment bowls are locked until paid.
function drawLockTexture() {
  return makeCanvasTexture(96, 96, (g) => {
    g.fillStyle = 'rgba(20,10,5,.85)';
    g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f2b234'; g.lineWidth = 6;
    g.beginPath(); g.arc(48, 40, 16, Math.PI, 0); g.stroke();
    g.fillStyle = '#f2b234'; g.fillRect(30, 40, 36, 30);
    g.fillStyle = '#241610'; g.beginPath(); g.arc(48, 52, 5, 0, Math.PI * 2); g.fill();
    g.fillRect(45, 52, 6, 12);
  });
}
