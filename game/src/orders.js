// Padang Kilat — order tickets: spawning, patience, expiry and serve scoring.
// One job: everything about the order board, nothing about the kitchen floor.
import { RECIPES, patienceMax, spawnInterval } from './config.js';
import { pickRandom } from './random.js';

export function createTicket(rng, stage, stageElapsed, id) {
  // The secret menu (Nasi Kapau) never rolls here — it only appears when
  // the kitchen asks for it by id (see createSecretTicket).
  const pool = RECIPES.filter((r) => !r.secret);
  const roll = rng();
  let recipe;
  let mood = null;
  if (roll < 0.20) {
    // HAUS: the ticket always carries a drink.
    const thirsty = pool.filter((r) => r.needs.some((n) => n.endsWith(':ready') && (n.startsWith('ESJERUK') || n.startsWith('ESTEH') || n.startsWith('TEHTALUA'))));
    recipe = pickRandom(rng, thirsty.length ? thirsty : pool);
    mood = 'haus';
  } else if (roll < 0.40) {
    // LAPAR: double portion — more coins.
    recipe = pickRandom(rng, pool);
    mood = 'lapar';
  } else if (roll < 0.55) {
    // TIDAK SELERA: small order (2 needs) but a long patience.
    const small = pool.filter((r) => r.needs.length === 2);
    recipe = pickRandom(rng, small.length ? small : pool);
    mood = 'tidak selera';
  } else if (roll < 0.70) {
    // LESU: a tired customer — long patience, normal coins.
    recipe = pickRandom(rng, pool);
    mood = 'lesu';
  } else {
    recipe = pickRandom(rng, pool);
  }
  let max = patienceMax(stage, stageElapsed);
  let coins = recipe.coins;
  if (mood === 'lapar') coins = Math.round(coins * 1.25);
  if (mood === 'tidak selera') max = Math.round(max * 1.5);
  if (mood === 'lesu') max = Math.round(max * 1.25);
  return { id, recipeId: recipe.id, name: recipe.name, needs: recipe.needs, coins, patience: max, max, mood };
}

export function createSecretTicket(recipeId, stage, stageElapsed, id) {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  const max = patienceMax(stage, stageElapsed);
  return { id, recipeId, name: recipe.name, needs: recipe.needs, coins: recipe.coins, patience: max, max };
}

// The kuntilanak's order: 3× Sate Padang on one ticket, 45 seconds to
// serve them all (25s would be unwinnable: one sate alone needs ~20s of
// chopping, cooking and walking — 3 need ~45s even played well).
// Served count lives on the ticket itself.
export function createKuntilanakTicket(id) {
  const recipe = RECIPES.find((r) => r.id === 'sate');
  return {
    id, recipeId: 'sate', name: 'Sate Padang ×3', needs: recipe.needs, coins: recipe.coins,
    patience: 45, max: 45, kuntilanak: true, needCount: 3, servedCount: 0,
  };
}

export function ticketUrgency(ticket) { return ticket.patience / ticket.max; }

export function comboMultiplier(streak) { return Math.min(2, 1 + 0.15 * streak); }

export function serveValue(recipe, streak, ticket) {
  const patienceBonus = Math.round(4 * (ticket.patience / ticket.max));
  // The ticket's own coins (a LAPAR ticket pays 25% more) — not the base.
  const base = ticket.coins ?? recipe.coins;
  return Math.round(base * comboMultiplier(streak)) + patienceBonus;
}

// Advance all tickets one step; returns the tickets that just expired.
// frozenIds: tickets whose patience does NOT tick down (their customer is
// still queuing for a seat — the patience only runs once they are seated).
export function updateTickets(tickets, dt, frozenIds = null) {
  const expired = [];
  for (let i = tickets.length - 1; i >= 0; i -= 1) {
    if (frozenIds && frozenIds.has(tickets[i].id)) continue;
    tickets[i].patience -= dt;
    if (tickets[i].patience <= 0) expired.push(tickets.splice(i, 1)[0]);
  }
  return expired;
}

export function findTicketForRecipe(tickets, recipeId) {
  let best = null;
  for (const t of tickets) {
    if (t.recipeId === recipeId && (best === null || t.patience < best.patience)) best = t;
  }
  return best;
}

export function nextSpawnDelay(rng, stage, stageElapsed) {
  return spawnInterval(stage, stageElapsed) * (0.85 + rng() * 0.3);
}
