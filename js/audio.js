// Map each recorded sample to its MIDI pitch so other notes can be pitch-shifted from it.
const SAMPLES = {
  E2: 40,
  Gb2: 42,
  A2: 45,
  C3: 48,
  D3: 50,
  E3: 52,
  Gb3: 54,
  G3: 55,
  A3: 57,
  B3: 59,
  C4: 60,
  D4: 62,
  E4: 64,
  G4: 67,
  Ab4: 68,
  A4: 69,
  Bb4: 70,
  C5: 72,
  E5: 76,
  G5: 79,
  B5: 83,
};

// These samples live beside index.html; the remaining notes are in samples/.
const ROOT_SAMPLES = new Set(["Ab4", "Bb4", "G5", "B5"]);

export class GuitarAudio {
  constructor({ volume, reverb }) {
    this.volume = volume;
    this.reverb = reverb;
    this.buffers = new Map();
    this.voices = [];
  }

  load() {
    // Reuse the same context and sample downloads if load() is called more than once.
    return (this._ready ??= (async () => {
      const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const compressor = ctx.createDynamicsCompressor();

      this.master = ctx.createGain();
      this.master.gain.value = this.volume;

      this.bus = ctx.createGain();
      this.dry = ctx.createGain();
      this.wet = ctx.createGain();
      this.wet.gain.value = this.reverb;

      const convolver = ctx.createConvolver();
      convolver.buffer = this.impulse(1.5);

      this.bus.connect(this.dry).connect(compressor);
      this.bus.connect(convolver).connect(this.wet).connect(compressor);
      compressor.connect(this.master).connect(ctx.destination);

      await Promise.all(
        Object.entries(SAMPLES).map(async ([name, midi]) => {
          const path = ROOT_SAMPLES.has(name) ? `${name}.mp3` : `samples/${name}.mp3`;
          const response = await fetch(path);

          if (!response.ok) {
            throw new Error(`Could not load ${path} (HTTP ${response.status})`);
          }

          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          this.buffers.set(midi, buffer);
        }),
      );
    })());
  }

  impulse(seconds) {
    const sampleRate = this.ctx.sampleRate;
    const length = (sampleRate * seconds) | 0;
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    // A short random decay gives the wet signal a simple room-like reverb.
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
      }
    }

    return buffer;
  }

  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.value = value;
  }

  setReverb(value) {
    this.reverb = value;
    if (this.wet) this.wet.gain.value = value;
  }

  mute(string, time) {
    const voice = this.voices[string];
    if (!voice) return;

    voice.g.gain.cancelScheduledValues(time);
    voice.g.gain.setTargetAtTime(0, time, 0.035);
    voice.src.stop(time + 0.3);
    this.voices[string] = null;
  }

  pluck(string, midi, velocity = 0.8, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.buffers.size) return;
    if (ctx.state === "suspended") ctx.resume();

    const time = ctx.currentTime + delay;
    let nearestSample = null;

    // Choose the closest recorded pitch to minimize how far it must be shifted.
    for (const sampleMidi of this.buffers.keys()) {
      if (
        nearestSample === null ||
        Math.abs(sampleMidi - midi) < Math.abs(nearestSample - midi)
      ) {
        nearestSample = sampleMidi;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = this.buffers.get(nearestSample);
    source.playbackRate.value = 2 ** ((midi - nearestSample) / 12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(velocity, time + 0.004);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2500 + velocity * 8000;

    source.connect(lowpass).connect(gain).connect(this.bus);

    this.mute(string, time);
    source.start(time);
    this.voices[string] = { src: source, g: gain };
  }
}
