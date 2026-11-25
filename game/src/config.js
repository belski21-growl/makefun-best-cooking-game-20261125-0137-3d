// Padang Kilat — configuration: canvas size, palette, stations, ingredients, recipes.
// One job: every tunable number and every piece of game data lives here.
export const W = 1280;
export const H = 720;
export const STEP = 1 / 60;
// Three shifts, not one: PAGI is slow (learn the ropes), SIANG is the
// normal lunch rush, MALAM is the fastest — and haunted (see kuntilanak).
export const STAGES = [
  { id: 'pagi',  name: 'PAGI',  subtitle: 'Buka Warung',    seconds: 120, spawn: 20, patience: 62, target: 30 },
  { id: 'siang', name: 'SIANG', subtitle: 'Jam Makan',      seconds: 150, spawn: 13, patience: 48, target: 70 },
  { id: 'malam', name: 'MALAM', subtitle: 'Rush Terakhir',  seconds: 180, spawn: 9,  patience: 40, target: 100 },
];
export const TARGET_COINS = 100;
export const MAX_FAILS = 3;
// Seating queue: a customer waits this long for a free seat. Leaving angry
// costs QUEUE_LEAVE_PENALTY coins — NOT a failed ticket (user correction
// 25 Nov ~15:32). A served customer eats for EAT_SECONDS, then frees the seat.
export const QUEUE_MAX = 30;
export const QUEUE_LEAVE_PENALTY = 10;
export const EAT_SECONDS = 5;
export const SEATS = [
  { x: 950, y: 680 },
  { x: 1080, y: 680 },
  { x: 1210, y: 680 },
];
export const QUEUE_SPOTS = [
  { x: 1180, y: 620 },
  { x: 1100, y: 620 },
  { x: 1020, y: 620 },
  { x: 940, y: 620 },
];
export const BEST_KEY = 'padang-kilat-best-coins';

export const PALETTE = {
  floor: '#f3e2c2',
  floorAlt: '#ecd9b4',
  wall: '#b4552d',
  wallDark: '#8f3f20',
  teal: '#1f7a6d',
  tealDark: '#155e53',
  cream: '#fff6e3',
  wood: '#c98a4b',
  woodDark: '#a96f36',
  ink: '#33241a',
  gold: '#f2b234',
  red: '#d64533',
  green: '#3f9e4d',
  batik: '#7a2e4d',
};

export const INGREDIENTS = {
  NASI:     { id: 'NASI',     name: 'Nasi',       color: '#fff8e6', prep: 'cook',     prepTime: 3.5 },
  DAGING:   { id: 'DAGING',   name: 'Daging',     color: '#6e3b1f', prep: 'chopcook', prepTime: 5.0 },
  AYAM:     { id: 'AYAM',     name: 'Ayam',       color: '#f7e3b0', prep: 'chopcook', prepTime: 3.5 },
  TELUR:    { id: 'TELUR',    name: 'Telur',      color: '#ffd94d', prep: 'cook',     prepTime: 3.0 },
  SAYUR:    { id: 'SAYUR',    name: 'Daun Ubi',   color: '#58b368', prep: 'chop',     prepTime: 0 },
  CABAI:    { id: 'CABAI',    name: 'Cabai',      color: '#d64533', prep: 'chop',     prepTime: 0 },
  MIE:      { id: 'MIE',      name: 'Indomie',    color: '#f2c14e', prep: 'cook',     prepTime: 3.0 },
  KETUPAT:  { id: 'KETUPAT',  name: 'Ketupat',    color: '#dfe8c8', prep: 'cook',     prepTime: 3.0 },
  SAMBAL:   { id: 'SAMBAL',   name: 'Sambal Ijo', color: '#3f9e4d', prep: 'none',     prepTime: 0 },
  ESTEH:    { id: 'ESTEH',    name: 'Es Teh',     color: '#b4552d', prep: 'none',     prepTime: 0 },
  TEHTALUA: { id: 'TEHTALUA', name: 'Teh Talua',  color: '#e8c96a', prep: 'none',     prepTime: 0 },
  ESJERUK:  { id: 'ESJERUK',  name: 'Es Jeruk',   color: '#f2a541', prep: 'none',     prepTime: 0 },
};

// A finished item is "ID:state": raw, chopped or cooked. Ready items (drinks,
// sambal ijo) are served as-is, straight from the counter.
export function itemKey(id, state) { return `${id}:${state}`; }
export function itemName(key) {
  const [id, state] = key.split(':');
  const base = INGREDIENTS[id] ? INGREDIENTS[id].name : id;
  if (state === 'chopped') return `${base} iris`;
  if (state === 'cooked') return `${base} matang`;
  return base;
}
export function itemColor(key) {
  const [id] = key.split(':');
  return INGREDIENTS[id] ? INGREDIENTS[id].color : '#cccccc';
}

// 8 Padang recipes: the same 12 ingredients combine in different ways.
// Rendang is the signature — the highest coins in the house.
export const RECIPES = [
  { id: 'rendang',     name: 'Nasi Rendang',        needs: ['NASI:cooked', 'DAGING:cooked'],                    coins: 20 },
  { id: 'indomie',     name: 'Indomie Rendang',     needs: ['MIE:cooked', 'DAGING:cooked'],                     coins: 18 },
  { id: 'ayampop',     name: 'Ayam Pop',            needs: ['AYAM:cooked', 'NASI:cooked', 'ESJERUK:ready'],     coins: 16 },
  { id: 'sate',        name: 'Sate Padang',         needs: ['DAGING:cooked', 'KETUPAT:cooked', 'SAMBAL:ready'], coins: 16 },
  { id: 'gulai',       name: 'Gulai Ayam',          needs: ['AYAM:cooked', 'CABAI:chopped'],                    coins: 14 },
  { id: 'dendeng',     name: 'Dendeng Balado',      needs: ['DAGING:chopped', 'CABAI:chopped'],                 coins: 14 },
  { id: 'sayur',       name: 'Nasi Sayur Singkong', needs: ['NASI:cooked', 'SAYUR:chopped', 'ESTEH:ready'],     coins: 14 },
  { id: 'telurbalado', name: 'Telur Balado',        needs: ['TELUR:cooked', 'CABAI:chopped', 'TEHTALUA:ready'], coins: 14 },
  // Menu rahasia: never in the random rotation — it only appears as a
  // ticket after 5 serves in a row without a fail (see kitchen.js).
  { id: 'kapau',       name: 'Nasi Kapau',          needs: ['NASI:cooked', 'DAGING:cooked', 'SAYUR:chopped'], coins: 25, secret: true },
];

export function recipeById(id) { return RECIPES.find((r) => r.id === id); }

// Station rectangles (x, y, w, h) in logical pixels. Crates line the left wall
// (3 columns: food, then drinks and sambal ijo), the stove sits top-right, the
// chopping board top-centre, assembly bottom-centre, the etalase (serve) on the
// right wall, the bin bottom-left.
export const STATIONS = {
  crates: [
    { id: 'NASI',     x: 16,  y: 186, w: 62, h: 62 },
    { id: 'DAGING',   x: 90,  y: 186, w: 62, h: 62 },
    { id: 'AYAM',     x: 164, y: 186, w: 62, h: 62 },
    { id: 'TELUR',    x: 16,  y: 260, w: 62, h: 62 },
    { id: 'SAYUR',    x: 90,  y: 260, w: 62, h: 62 },
    { id: 'CABAI',    x: 164, y: 260, w: 62, h: 62 },
    { id: 'MIE',      x: 16,  y: 334, w: 62, h: 62 },
    { id: 'KETUPAT',  x: 90,  y: 334, w: 62, h: 62 },
    { id: 'SAMBAL',   x: 164, y: 334, w: 62, h: 62 },
    { id: 'ESTEH',    x: 16,  y: 408, w: 62, h: 62 },
    { id: 'TEHTALUA', x: 90,  y: 408, w: 62, h: 62 },
    { id: 'ESJERUK',  x: 164, y: 408, w: 62, h: 62 },
  ],
  chop: { x: 520, y: 186, w: 240, h: 74 },
  stove: [
    { x: 920, y: 186, w: 150, h: 84 },
    { x: 1090, y: 186, w: 150, h: 84 },
  ],
  assembly: { x: 470, y: 600, w: 340, h: 96 },
  // The etalase starts at y340, not y300: the gap between the right stove's
  // bottom edge (270) and the etalase top must fit the 44px-wide cook, or
  // the right stove is unreachable (proven 25 Nov: 30px gap + 20px gap to
  // the left stove + the y=180 clamp boxed it in from every side).
  pass: { x: 1120, y: 340, w: 144, h: 180 },
  bin: { x: 16, y: 620, w: 110, h: 76 },
};

export const PLAYER = { speed: 270, radius: 22, startX: 640, startY: 430 };
export const INTERACT_RADIUS = 110;
export const CHOP_SECONDS = 1.1;
export const TRAY_MAX = 3;

export function spawnInterval(stage, elapsedInStage) {
  // Tickets arrive faster as the stage goes on: stage.spawn early, ~30% faster late.
  const t = Math.min(1, elapsedInStage / stage.seconds);
  return stage.spawn * (1 - 0.3 * t);
}
export function patienceMax(stage, elapsedInStage) {
  const t = Math.min(1, elapsedInStage / stage.seconds);
  return stage.patience * (1 - 0.3 * t);
}
