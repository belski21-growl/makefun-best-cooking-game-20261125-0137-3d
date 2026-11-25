// Padang Kilat 3D — keyboard + mouse input, one small object.
// The kitchen only ever asks four questions: which way is the chef
// walking, is interact held, was anything clicked, and did the player
// just press confirm / mute / pause. Everything else stays here.

// Edge-triggered action bits, returned by takeActions().
export const ACTION_CONFIRM = 1;
export const ACTION_MUTE = 2;
export const ACTION_PAUSE = 4;

const GAME_W = 1280;
const GAME_H = 720;

export function createInput(canvas) {
  const held = new Set();
  let queuedActions = 0;
  const clicks = [];

  function markAction(bit) {
    queuedActions |= bit;
  }

  function onKeyDown(ev) {
    const key = (ev.key || '').toLowerCase();
    if (key === ' ' || key.startsWith('arrow')) ev.preventDefault();
    if (ev.repeat) return;
    held.add(key);
    if (key === 'e' || key === ' ' || key === 'enter') markAction(ACTION_CONFIRM);
    if (key === 'm') markAction(ACTION_MUTE);
    if (key === 'p') markAction(ACTION_PAUSE);
  }

  function onKeyUp(ev) {
    held.delete((ev.key || '').toLowerCase());
  }

  function onPointerDown(ev) {
    if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    clicks.push({
      x: ((ev.clientX - rect.left) / rect.width) * GAME_W,
      y: ((ev.clientY - rect.top) / rect.height) * GAME_H,
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }
  if (canvas && typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('pointerdown', onPointerDown);
  }

  function direction() {
    let dx = 0;
    let dy = 0;
    if (held.has('a') || held.has('arrowleft')) dx -= 1;
    if (held.has('d') || held.has('arrowright')) dx += 1;
    if (held.has('w') || held.has('arrowup')) dy -= 1;
    if (held.has('s') || held.has('arrowdown')) dy += 1;
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.hypot(dx, dy);
      dx *= inv;
      dy *= inv;
    }
    return { dx, dy };
  }

  return {
    direction,
    interactHeld() {
      return held.has('e') || held.has(' ');
    },
    takeClick() {
      return clicks.length > 0 ? clicks.shift() : null;
    },
    takeActions() {
      const bits = queuedActions;
      queuedActions = 0;
      return bits;
    },
  };
}
