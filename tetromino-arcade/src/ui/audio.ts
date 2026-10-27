// Synthesised sound effects and an optional original background loop, all
// generated with the Web Audio API (no audio files to download).

type Sfx = 'move' | 'rotate' | 'drop' | 'lock' | 'hold' | 'clear' | 'tetris' | 'tspin' | 'levelup' | 'gameover' | 'win' | 'garbage' | 'count' | 'go';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  volume = 0.5;

  /** Must be called from a user gesture before sound can play. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.setVolume(this.volume);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v * 0.4;
  }

  private tone(freq: number, dur: number, type: OscillatorType, delay = 0, gain = 0.5, slide = 0): void {
    if (!this.ctx || !this.master || this.volume === 0) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  play(s: Sfx): void {
    switch (s) {
      case 'move': return this.tone(330, 0.03, 'square', 0, 0.12);
      case 'rotate': return this.tone(520, 0.05, 'triangle', 0, 0.2);
      case 'hold': return this.tone(260, 0.08, 'triangle', 0, 0.25, 140);
      case 'drop': return this.tone(140, 0.12, 'sine', 0, 0.6, -80);
      case 'lock': return this.tone(180, 0.05, 'square', 0, 0.15);
      case 'garbage': return this.tone(90, 0.2, 'sawtooth', 0, 0.3, -40);
      case 'count': return this.tone(440, 0.12, 'square', 0, 0.25);
      case 'go': return this.tone(880, 0.25, 'square', 0, 0.25);
      case 'clear':
        [523, 659].forEach((f, i) => this.tone(f, 0.12, 'square', i * 0.06, 0.25));
        return;
      case 'tetris':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'square', i * 0.06, 0.3));
        return;
      case 'tspin':
        [392, 587, 784].forEach((f, i) => this.tone(f, 0.16, 'sawtooth', i * 0.05, 0.22));
        return;
      case 'levelup':
        [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.12, 'triangle', i * 0.08, 0.3));
        return;
      case 'win':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'square', i * 0.1, 0.25));
        return;
      case 'gameover':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', i * 0.15, 0.3));
        return;
    }
  }

  /** An original, simple minor-key arpeggio loop; tempo follows the level. */
  startMusic(tempo: () => number): void {
    this.stopMusic();
    const roots = [220, 174.6, 196, 164.8]; // A, F, G, E
    const pattern = [0, 3, 7, 12, 7, 3, 0, 7];
    const tick = () => {
      const bar = Math.floor(this.step / 8) % roots.length;
      const root = roots[bar];
      const semis = pattern[this.step % 8] + (bar === 3 ? 1 : 0);
      this.tone(root * Math.pow(2, semis / 12), 0.12, 'triangle', 0, 0.12);
      if (this.step % 4 === 0) this.tone(root / 2, 0.25, 'sine', 0, 0.2);
      this.step++;
      this.musicTimer = window.setTimeout(tick, tempo());
    };
    tick();
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearTimeout(this.musicTimer);
    this.musicTimer = null;
  }
}
