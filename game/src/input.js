// Padang Kilat — keyboard + mouse input. WASD/arrows move, E or Space interacts
// (hold E to chop), M mutes, P/Esc pauses. Clicking a station walks toward it;
// clicking it again up close interacts.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let clickTarget = null; // {x, y} in logical canvas pixels, or null
  let clickStation = null; // station key the player clicked, or null

  function key(e) { return e.key.length === 1 ? e.key.toLowerCase() : e.key; }

  window.addEventListener('keydown', (e) => {
    const k = key(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (!e.repeat) {
      if (k === ' ' || k === 'enter') actions |= ACTION_CONFIRM;
      if (k === 'p' || k === 'escape') actions |= ACTION_PAUSE;
      if (k === 'm') actions |= ACTION_MUTE;
    }
    keys.add(k);
    keys.add(e.key);
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(key(e));
    keys.delete(e.key);
  });
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    clickTarget = { x, y };
    clickStation = null;
  });

  return {
    direction() {
      let dx = 0;
      let dy = 0;
      if (keys.has('a') || keys.has('ArrowLeft')) dx -= 1;
      if (keys.has('d') || keys.has('ArrowRight')) dx += 1;
      if (keys.has('w') || keys.has('ArrowUp')) dy -= 1;
      if (keys.has('s') || keys.has('ArrowDown')) dy += 1;
      if (dx !== 0 && dy !== 0) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
      return { dx, dy };
    },
    interactHeld() { return keys.has('e') || keys.has(' '); },
    takeActions() { const a = actions; actions = 0; return a; },
    takeClick() {
      const t = clickTarget;
      clickTarget = null;
      return t;
    },
    setClickStation(name) { clickStation = name; },
    takeClickStation() { const s = clickStation; clickStation = null; return s; },
    clearClick() { clickTarget = null; clickStation = null; },
  };
}
