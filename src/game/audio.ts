// Fully synthesized audio: no assets, tiny footprint, works offline.
type MusicMode = 'off' | 'calm' | 'battle';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  sfxOn = true; musicOn = true;
  private mode: MusicMode = 'off';
  private step = 0;
  private nextT = 0;
  private timer: number | null = null;

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
      this.musBus = this.ctx.createGain(); this.musBus.gain.value = 0.32; this.musBus.connect(this.master);
      this.applyToggles();
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.nextT = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 90);
    } catch { /* no audio device */ }
  }

  applyToggles() {
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
    if (this.musBus) this.musBus.gain.value = this.musicOn ? 0.32 : 0;
  }
  setMusic(m: MusicMode) { this.mode = m; if (this.ctx) this.nextT = Math.max(this.nextT, this.ctx.currentTime + 0.05); }

  private tone(t0: number, f0: number, f1: number, dur: number, type: OscillatorType, vol: number, bus?: GainNode | null) {
    if (!this.ctx || !this.sfxBus) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(bus ?? this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  private noise(t0: number, dur: number, vol: number, freq: number, q = 1, drop = 0.5) {
    if (!this.ctx || !this.sfxBus || !this.noiseBuf) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * drop), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t0, Math.random() * 0.3); s.stop(t0 + dur + 0.02);
  }

  play(name: string) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'click': this.tone(t, 620, 520, 0.06, 'square', 0.12); break;
      case 'error': this.tone(t, 190, 120, 0.18, 'sawtooth', 0.16); break;
      case 'coin':
        this.tone(t, 880, 880, 0.06, 'square', 0.10);
        this.tone(t + 0.06, 1320, 1320, 0.12, 'square', 0.10); break;
      case 'collect':
        this.tone(t, 660, 990, 0.09, 'triangle', 0.16);
        this.tone(t + 0.09, 990, 1320, 0.12, 'triangle', 0.14); break;
      case 'place': this.noise(t, 0.14, 0.25, 900, 1, 0.3); this.tone(t, 140, 90, 0.14, 'sine', 0.3); break;
      case 'build': this.noise(t, 0.2, 0.2, 1400, 1, 0.4); this.tone(t + 0.05, 260, 240, 0.1, 'square', 0.1); break;
      case 'upgrade':
        [440, 554, 659, 880].forEach((f, i) => this.tone(t + i * 0.07, f, f, 0.14, 'triangle', 0.12)); break;
      case 'train': this.tone(t, 330, 440, 0.12, 'square', 0.12); this.tone(t + 0.1, 440, 550, 0.12, 'square', 0.1); break;
      case 'deploy': this.noise(t, 0.1, 0.18, 1800, 1, 0.5); this.tone(t, 500, 700, 0.08, 'triangle', 0.1); break;
      case 'swing': this.noise(t, 0.08, 0.12, 2600, 2, 0.6); break;
      case 'bow': this.tone(t, 900, 1400, 0.06, 'sawtooth', 0.05); this.noise(t, 0.05, 0.06, 3200, 2, 1); break;
      case 'hit': this.noise(t, 0.09, 0.2, 1100, 1, 0.35); this.tone(t, 180, 120, 0.08, 'square', 0.12); break;
      case 'udie': this.tone(t, 300, 90, 0.22, 'sawtooth', 0.1); break;
      case 'boom':
        this.noise(t, 0.55, 0.5, 700, 0.7, 0.12);
        this.tone(t, 90, 40, 0.5, 'sine', 0.5); break;
      case 'cannon':
        this.noise(t, 0.3, 0.4, 500, 0.8, 0.2); this.tone(t, 120, 55, 0.25, 'sine', 0.4); break;
      case 'wave':
        this.tone(t, 220, 220, 0.25, 'sawtooth', 0.14);
        this.tone(t + 0.22, 220, 220, 0.3, 'sawtooth', 0.14); break;
      case 'star': this.tone(t, 1046, 1568, 0.3, 'triangle', 0.14); break;
      case 'win':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(t + i * 0.11, f, f, 0.22, 'triangle', 0.14)); break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(t + i * 0.16, f, f * 0.98, 0.3, 'sawtooth', 0.1)); break;
    }
  }

  // ------- tiny music sequencer (calm kingdom / driving battle) -------
  private schedule() {
    if (!this.ctx || this.mode === 'off' || !this.musicOn) { this.step = 0; if (this.ctx) this.nextT = this.ctx.currentTime + 0.1; return; }
    const bpm = this.mode === 'battle' ? 128 : 76;
    const spb = 60 / bpm / 2; // 8th notes
    while (this.nextT < this.ctx.currentTime + 0.3) {
      this.playStep(this.step, this.nextT, spb);
      this.nextT += spb;
      this.step = (this.step + 1) % 64;
    }
  }
  private playStep(s: number, t: number, spb: number) {
    if (!this.musBus) return;
    const battle = this.mode === 'battle';
    const roots = battle ? [110, 110, 130.8, 98] : [110, 87.3, 130.8, 98]; // A A C G / A F C G
    const bar = Math.floor(s / 16), beat = Math.floor(s / 4) % 4;
    const root = roots[bar % 4];
    if (s % 8 === 0) this.tone(t, root / 2, root / 2, spb * 7, 'triangle', 0.5, this.musBus); // bass drone
    if (!battle && s % 16 === 8) this.tone(t, root * 2, root * 2, spb * 6, 'sine', 0.12, this.musBus);
    if (battle && s % 4 === 2) this.noise(t, 0.05, 0.05, 6000, 1, 0.9); // hats
    if (battle && beat === 0 && s % 8 === 0) this.tone(t, 60, 45, 0.18, 'sine', 0.5, this.musBus); // kick
    // sparse pentatonic melody
    const scale = [1, 1.2, 1.5, 1.8, 2.4];
    const seed = (s * 7919 + bar * 104729) % 13;
    if ((!battle && s % 8 === 4 && seed % 3 === 0) || (battle && s % 4 === 0 && seed % 2 === 0)) {
      const f = root * 2 * scale[seed % scale.length];
      this.tone(t, f, f, spb * (battle ? 2.5 : 5), battle ? 'square' : 'triangle', battle ? 0.06 : 0.09, this.musBus);
    }
  }
  dispose() { if (this.timer) clearInterval(this.timer); }
}

export const audio = new AudioEngine();
