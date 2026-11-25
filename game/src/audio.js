// Padang Kilat 3D — WebAudio synth: no audio files, everything synthesized.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let sizzle = null;
  let musicTimer = null;
  let musicOn = false;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (muted) return;
    try {
      const c = ac(); const t = c.currentTime + when;
      const o = c.createOscillator(); const g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch { /* audio unavailable */ }
  }
  function noise(dur, vol = 0.15, freq = 1200, when = 0) {
    if (muted) return;
    try {
      const c = ac(); const t = c.currentTime + when;
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = vol;
      src.connect(f).connect(g).connect(c.destination);
      src.start(t);
    } catch { /* audio unavailable */ }
  }

  // Original Padang-flavoured loop (D minor pentatonic — saluang-like flute
  // lead with vibrato, talempong-like plucks, a low gong every cycle).
  // Composed here, not a recording: no copyrighted material.
  const PENTA = { D4: 293.66, F4: 349.23, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, F5: 698.46, G5: 783.99, A5: 880.0, C6: 1046.5 };
  // 32 eighth-notes; 0 = rest. A lilting saluang phrase in D minor pentatonic.
  const LEAD = [
    PENTA.D5, 0, PENTA.F5, PENTA.G5, PENTA.A5, 0, PENTA.G5, PENTA.F5,
    PENTA.D5, 0, PENTA.F5, PENTA.A5, PENTA.G5, PENTA.F5, PENTA.D5, 0,
    PENTA.F5, 0, PENTA.G5, PENTA.A5, PENTA.C6, PENTA.A5, PENTA.G5, 0,
    PENTA.F5, PENTA.D5, PENTA.C5, PENTA.D5, 0, PENTA.F5, PENTA.D5, 0,
  ];
  const PLUCK = [PENTA.D5, PENTA.A4, PENTA.F4, PENTA.C5, PENTA.G4, PENTA.A4, PENTA.F4, PENTA.D4];
  function flute(freq, dur, vol = 0.06) {
    if (muted) return;
    try {
      const c = ac(); const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      const lfo = c.createOscillator(); lfo.frequency.value = 5.5;
      const lg = c.createGain(); lg.gain.value = freq * 0.008;
      lfo.connect(lg).connect(o.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.05);
      g.gain.setValueAtTime(vol, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + dur + 0.05);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    } catch { /* noop */ }
  }
  function gong() {
    tone(73.42, 2.4, 'sine', 0.12);
    tone(110.0, 1.8, 'sine', 0.05, 0.05);
    tone(146.83, 1.2, 'sine', 0.04, 0.02);
  }
  function startMusic() {
    if (musicOn || muted) return;
    musicOn = true;
    let i = 0;
    const STEP_MS = 230;
    const tick = () => {
      if (!musicOn) return;
      const n = LEAD[i % LEAD.length];
      if (n) flute(n, 0.34, 0.055);
      if (i % 2 === 0) tone(PLUCK[(i / 2) % PLUCK.length], 0.16, 'triangle', 0.035);
      if (i % 32 === 0) gong();
      if (i % 8 === 0) tone(146.83, 0.5, 'sine', 0.03); // low D drone pulse
      i += 1;
      musicTimer = setTimeout(tick, STEP_MS);
    };
    tick();
  }
  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  }

  return {
    unlock() { try { ac(); } catch { /* noop */ } },
    click() { tone(700, 0.08, 'square', 0.08); },
    pickup() { tone(520, 0.07, 'sine', 0.12); },
    drop() { tone(340, 0.09, 'sine', 0.12); },
    chop() { noise(0.09, 0.25, 900); },
    ding() { tone(1180, 0.5, 'sine', 0.16); tone(1760, 0.4, 'sine', 0.08, 0.02); },
    serve() { tone(660, 0.12, 'sine', 0.16); tone(880, 0.12, 'sine', 0.16, 0.1); tone(1320, 0.25, 'sine', 0.14, 0.2); },
    fail() { tone(220, 0.3, 'sawtooth', 0.14, 0, 110); },
    rush() { tone(440, 0.15, 'square', 0.12); tone(440, 0.15, 'square', 0.12, 0.18); tone(660, 0.3, 'square', 0.12, 0.36); },
    stage() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, i * 0.09)); },
    plate() { tone(990, 0.1, 'sine', 0.16); tone(1480, 0.3, 'sine', 0.14, 0.08); },
    // Kuntilanak: dissonant sting + a long eerie laugh (descending wails).
    sting() {
      tone(110, 1.6, 'sawtooth', 0.16, 0, 55);
      tone(116, 1.6, 'sawtooth', 0.14, 0, 58);
      tone(2200, 0.4, 'sine', 0.06, 0.05, 900);
      stopMusic();
    },
    laugh() {
      // "hihihi" — three short high wails sliding down, then one long one.
      [1250, 1150, 1050].forEach((f, i) => tone(f, 0.22, 'sine', 0.09, 0.15 + i * 0.22, f - 250));
      tone(980, 0.9, 'sine', 0.08, 0.9, 420);
    },
    startSizzle() {
      if (sizzle || muted) return;
      try {
        const c = ac();
        const len = c.sampleRate * 1.2;
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3800;
        const g = c.createGain(); g.gain.value = 0.035;
        src.connect(f).connect(g).connect(c.destination);
        src.start();
        sizzle = { src, g };
      } catch { /* noop */ }
    },
    stopSizzle() {
      if (!sizzle) return;
      try { sizzle.src.stop(); } catch { /* noop */ }
      sizzle = null;
    },
    startMusic,
    stopMusic,
    toggleMute() {
      muted = !muted;
      if (muted) { this.stopSizzle(); stopMusic(); }
      return muted;
    },
    get muted() { return muted; },
  };
}
