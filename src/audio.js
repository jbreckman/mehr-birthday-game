// Tiny Web Audio synth: all sounds are generated, no files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('mehr-muted') === '1';
    } catch {}
    this.musicOn = false;
    this.tempo = 1;
    this.step = 0;
    this.nextNoteT = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem('mehr-muted', m ? '1' : '0');
    } catch {}
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  tone(freq, dur, { type = 'square', vol = 0.2, at = 0, slide = 0, dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.2, at = 0, hp = 800) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  on() {
    this.tone(520, 0.08, { vol: 0.15 });
    this.tone(880, 0.1, { vol: 0.15, at: 0.06 });
  }
  off() {
    this.tone(300, 0.07, { type: 'triangle', vol: 0.2 });
    this.noise(0.04, 0.1, 0, 2000);
  }
  panic() {
    this.tone(900, 0.25, { type: 'sawtooth', vol: 0.12, slide: 0.3 });
    this.noise(0.12, 0.15, 0, 1500);
  }
  nope() {
    this.tone(160, 0.12, { type: 'square', vol: 0.14 });
    this.tone(120, 0.16, { type: 'square', vol: 0.14, at: 0.1 });
  }
  swivel() {
    this.noise(0.06, 0.05, 0, 3000);
  }
  coin() {
    this.tone(1320, 0.05, { vol: 0.06 });
    this.tone(1760, 0.07, { vol: 0.06, at: 0.04 });
  }
  sus(level) {
    this.tone(300 + level * 500, 0.09, { type: 'triangle', vol: 0.12 });
  }
  bust() {
    // sad trombone-ish
    [392, 370, 349, 262].forEach((f, i) => this.tone(f, i === 3 ? 0.9 : 0.28, { type: 'sawtooth', vol: 0.16, at: i * 0.3, slide: i === 3 ? 0.9 : 1 }));
    this.noise(0.3, 0.2, 0, 400);
  }
  fired() {
    [523, 494, 466, 440, 415, 392].forEach((f, i) => this.tone(f, 0.3, { type: 'square', vol: 0.1, at: i * 0.18 }));
  }
  event() {
    this.tone(660, 0.12, { type: 'sine', vol: 0.18 });
    this.tone(990, 0.2, { type: 'sine', vol: 0.18, at: 0.12 });
  }
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { vol: 0.13, at: i * 0.09 }));
  }
  alarm() {
    this.alarmBeep();
  }
  alarmBeep() {
    this.tone(880, 0.22, { type: 'square', vol: 0.08 });
    this.tone(660, 0.22, { type: 'square', vol: 0.08, at: 0.25 });
  }
  birthday() {
    // Happy Birthday melody
    const G = 392,
      A = 440,
      B = 494,
      C = 523,
      D = 587,
      E = 659,
      F = 698,
      G2 = 784;
    const notes = [
      [G, 0.5], [G, 0.5], [A, 1], [G, 1], [C, 1], [B, 2],
      [G, 0.5], [G, 0.5], [A, 1], [G, 1], [D, 1], [C, 2],
      [G, 0.5], [G, 0.5], [G2, 1], [E, 1], [C, 1], [B, 1], [A, 2],
      [F, 0.5], [F, 0.5], [E, 1], [C, 1], [D, 1], [C, 2],
    ];
    let t = 0;
    const beat = 0.3;
    for (const [f, d] of notes) {
      this.tone(f, d * beat * 0.95, { type: 'triangle', vol: 0.18, at: t });
      t += d * beat;
    }
  }

  // ---------------- background music: a light chiptune loop
  startMusic() {
    this.musicOn = true;
    if (this.ctx) this.nextNoteT = this.ctx.currentTime + 0.1;
    this.step = 0;
  }
  stopMusic() {
    this.musicOn = false;
  }
  tickMusic() {
    if (!this.musicOn || !this.ctx) return;
    const chords = [
      [262, 330, 392],
      [196, 247, 294],
      [220, 262, 330],
      [175, 220, 262],
    ];
    const spb = 0.15 / this.tempo;
    while (this.nextNoteT < this.ctx.currentTime + 0.2) {
      const s = this.step;
      const ch = chords[Math.floor(s / 16) % 4];
      const at = this.nextNoteT - this.ctx.currentTime;
      if (s % 4 === 0) this.tone(ch[0] / 2, spb * 3, { type: 'triangle', vol: 0.5, at, dest: this.musicGain });
      if (s % 2 === 0) this.tone(ch[(s / 2) % 3] * 2, spb * 0.9, { type: 'square', vol: 0.12, at, dest: this.musicGain });
      if (s % 8 === 4) this.tone(ch[2] * 2, spb * 1.5, { type: 'square', vol: 0.1, at, dest: this.musicGain });
      this.nextNoteT += spb;
      this.step++;
    }
  }
}
