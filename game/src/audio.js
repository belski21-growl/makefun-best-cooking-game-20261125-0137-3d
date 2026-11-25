// Padang Kilat 3D — live WebAudio synth, no audio files at all.
// The backsound is Minang pentatonic in D minor: a saluang-style flute
// (sine + vibrato) carries the melody, talempong plucks mark the beat,
// and a low gong opens each stage. Sizzle is filtered noise; the
// kuntilanak gets a dissonant sting and a cold laugh. Everything is
// built from oscillators at runtime, so the game ships zero samples.

// D-minor pentatonic (D F G A C), one octave plus the top D.
const SCALE = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33];
// A slow, wandering saluang line over the scale (index + hold in beats).
const MELODY = [
  [0, 2], [2, 1], [3, 1], [4, 2], [3, 1], [2, 1],
  [1, 2], [2, 1], [0, 1], [1, 2], [3, 2], [5, 2],
  [4, 1], [3, 1], [2, 2], [0, 2],
];
const BEAT = 0.42; // seconds per beat at the kitchen's easy tempo

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let muted = false;
  let musicTimer = null;
  let melodyStep = 0;
  let sizzleNodes = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.32;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.6;
      sfxBus.connect(master);
    } catch (err) {
      ctx = null;
      return false;
    }
    return true;
  }

  function tone(freq, dur, opts = {}) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opts.vol || 0.25, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(opts.music ? musicBus : sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return { osc, gain };
  }

  // Saluang: a sine flute with a slow vibrato wobbling its pitch.
  function saluang(freq, dur, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 4.5;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(musicBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
  }

  // Talempong: a short bright pluck that dies fast.
  function talempong(freq, delay = 0, vol = 0.2) {
    tone(freq, 0.5, { type: 'triangle', delay, vol, music: true });
    tone(freq * 2, 0.28, { type: 'sine', delay, vol: vol * 0.4, music: true });
  }

  // Gong: a low sine with a very long tail, plus a faint upper partial.
  function gong(delay = 0) {
    tone(73.42, 3.5, { type: 'sine', delay, vol: 0.4, music: true });
    tone(110.0, 2.2, { type: 'sine', delay, vol: 0.12, music: true });
  }

  function noiseBurst(dur, freq, vol = 0.3, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start(t0);
  }

  function playMelodyStep() {
    if (!ctx) return;
    const [idx, beats] = MELODY[melodyStep % MELODY.length];
    melodyStep += 1;
    saluang(SCALE[idx], beats * BEAT * 0.95);
    if (melodyStep % 2 === 0) talempong(SCALE[(idx + 2) % SCALE.length], 0, 0.1);
  }

  return {
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    click() {
      tone(660, 0.07, { type: 'square', vol: 0.12 });
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      gong();
      playMelodyStep();
      musicTimer = setInterval(playMelodyStep, BEAT * 1000);
    },
    stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    startSizzle() {
      if (!ensure() || sizzleNodes) return;
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 5200;
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.4);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(sfxBus);
      src.start();
      sizzleNodes = { src, gain };
    },
    stopSizzle() {
      if (!sizzleNodes || !ctx) return;
      const { src, gain } = sizzleNodes;
      sizzleNodes = null;
      gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      setTimeout(() => { try { src.stop(); } catch (err) { /* already stopped */ } }, 300);
    },
    serve() {
      tone(523.25, 0.18, { vol: 0.22 });
      tone(659.25, 0.18, { delay: 0.09, vol: 0.22 });
      tone(783.99, 0.3, { delay: 0.18, vol: 0.25 });
    },
    fail() {
      tone(392.0, 0.25, { type: 'triangle', vol: 0.22 });
      tone(311.13, 0.4, { type: 'triangle', delay: 0.2, vol: 0.22 });
    },
    ding() {
      tone(880, 0.5, { vol: 0.25 });
      tone(1318.5, 0.35, { vol: 0.12 });
    },
    chop() {
      noiseBurst(0.09, 900, 0.35);
      tone(180, 0.08, { type: 'square', vol: 0.1 });
    },
    pickup() {
      tone(440, 0.08, { type: 'triangle', vol: 0.18 });
    },
    drop() {
      tone(330, 0.1, { type: 'triangle', vol: 0.15 });
    },
    rush() {
      [0, 2, 3, 4, 5].forEach((idx, i) => talempong(SCALE[idx], i * 0.09, 0.2));
    },
    stage() {
      gong();
      saluang(SCALE[5], 0.8, 0.1);
      saluang(SCALE[4], 0.8, 0.6);
    },
    sting() {
      tone(110, 1.6, { type: 'sawtooth', vol: 0.14 });
      tone(116.54, 1.6, { type: 'sawtooth', vol: 0.14 });
      tone(55, 2.0, { type: 'sine', vol: 0.3 });
    },
    laugh() {
      if (!ensure()) return;
      [880, 830, 880, 740, 622].forEach((f, i) => {
        const t0 = ctx.currentTime + i * 0.16;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t0);
        osc.frequency.exponentialRampToValueAtTime(f * 0.94, t0 + 0.14);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        osc.connect(gain);
        gain.connect(sfxBus);
        osc.start(t0);
        osc.stop(t0 + 0.2);
      });
    },
    plate() {
      tone(1567.98, 0.6, { vol: 0.2 });
      tone(2093.0, 0.4, { vol: 0.1 });
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.value = muted ? 0 : 0.9;
      return muted;
    },
  };
}
