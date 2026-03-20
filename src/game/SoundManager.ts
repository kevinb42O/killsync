
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean = false;

  constructor() {
    // We'll initialize on first user interaction to comply with browser policies
  }

  private init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.3;
    this.enabled = true;
  }

  private createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 1, slide: number = 0, attack: number = 0.01) {
    if (!this.enabled) this.init();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slide !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + slide), this.ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(duration: number, volume: number = 1, lowPass: number = 1000) {
    if (!this.enabled) this.init();
    if (!this.ctx || !this.masterGain) return;

    const buffer = this.createNoiseBuffer();
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lowPass, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    source.start();
    source.stop(this.ctx.currentTime + duration);
  }

  private playKick(duration: number, volume: number = 1) {
    if (!this.enabled) this.init();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playShoot() {
    // High-pitched laser with a bit of noise
    this.playTone(800, 'sine', 0.1, 0.08, -600, 0.005);
    this.playNoise(0.04, 0.04, 3000);
  }

  playHit() {
    // Sharp impact
    this.playTone(120, 'triangle', 0.06, 0.15, -80, 0.002);
    this.playNoise(0.04, 0.1, 1500);
    this.playKick(0.1, 0.2);
  }

  playExplosion() {
    // Deep rumble with noise and kick
    this.playTone(50, 'sine', 0.6, 0.4, -30, 0.05);
    this.playNoise(0.6, 0.3, 400);
    this.playKick(0.3, 0.5);
  }

  playCollect() {
    // Sparkly chime
    this.playTone(1200, 'sine', 0.15, 0.08, 400, 0.01);
    this.playTone(1800, 'sine', 0.1, 0.04, 200, 0.02);
  }

  playLevelUp() {
    // Arpeggio with square wave for retro feel
    [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'square', 0.25, 0.06, 50, 0.01), i * 120);
    });
  }

  playDamage() {
    // Low-pitched grunt/crunch
    this.playTone(70, 'sawtooth', 0.25, 0.15, -30, 0.01);
    this.playNoise(0.25, 0.15, 300);
  }

  playDash() {
    // Fast whoosh
    this.playDashTone(150, 'sine', 0.2, 0.1, 1200, 0.05);
    this.playNoise(0.15, 0.08, 4000);
  }

  playSlash() {
    // Metallic energetic slash
    this.playTone(180, 'sawtooth', 0.15, 0.1, -150, 0.005);
    this.playNoise(0.12, 0.15, 4000);
    this.playTone(800, 'sine', 0.08, 0.05, -600, 0.01);
  }

  private playDashTone(freq: number, type: OscillatorType, duration: number, volume: number = 1, slide: number = 0, attack: number = 0.01) {
    // Helper since playDash was using playTone but it was private
    this.playTone(freq, type, duration, volume, slide, attack);
  }

  playEnemySpawn() {
    // Subtle digital blip
    this.playTone(400, 'sine', 0.15, 0.02, -200, 0.05);
  }

  playTreasureSpawn() {
    // High-pitched sparkly sound
    if (!this.ctx) this.init();
    [1200, 1500, 1800, 2100].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'sine', 0.15, 0.04, 200, 0.01), i * 50);
    });
  }

  playUIHover() {
    this.playTone(1200, 'sine', 0.04, 0.02, 0, 0.005);
  }

  playUIClick() {
    this.playTone(800, 'sine', 0.12, 0.08, -400, 0.005);
  }

  playChestOpen() {
    this.playTone(400, 'sine', 0.1, 0.1, 200, 0.01);
    this.playTone(600, 'sine', 0.1, 0.1, 300, 0.05);
    this.playTone(800, 'sine', 0.1, 0.1, 400, 0.1);
    this.playNoise(0.5, 0.1, 1000);
  }
}

export const soundManager = new SoundManager();
