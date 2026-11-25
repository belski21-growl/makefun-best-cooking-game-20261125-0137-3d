// Pick one element of a list using the given rng stream.
export function pickRandom(rng, list) {
  if (!list || list.length === 0) return undefined;
  return list[Math.floor(rng() * list.length) % list.length];
}

// One seed in, the same stream of [0, 1) numbers out, every run.
// The kitchen, the ticket spawner and the sims all share this so a seed
// fully determines a game: same seed, same customers, same moods.
export function createRandom(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
