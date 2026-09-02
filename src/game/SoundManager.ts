
type GunfireProfile = { volume: number; playbackRate: number; duration: number };
type ReloadSoundId = 'handgun' | 'rifle' | 'shotgun';
type ReloadProfile = { asset: ReloadSoundId; volume: number; playbackRate: number };

const RELOAD_SOUND_URL: Record<ReloadSoundId, string> = {
  handgun: '/audio/cc0-handgun-reload.wav',
  rifle: '/audio/cc0-rifle-reload.wav',
  shotgun: '/audio/cc0-shotgun-reload.wav',
};

function gunfireProfile(weaponId: string): GunfireProfile {
  switch (weaponId) {
    case 'assault_rifle': return { volume: 0.27, playbackRate: 0.98, duration: 0.28 };
    case 'combat_shotgun': return { volume: 0.42, playbackRate: 0.78, duration: 0.44 };
    case 'sniper_rifle': return { volume: 0.38, playbackRate: 0.70, duration: 0.42 };
    case 'smg': return { volume: 0.20, playbackRate: 1.12, duration: 0.22 };
    case 'plasma_gun': return { volume: 0.25, playbackRate: 1.18, duration: 0.24 };
    default: return { volume: 0.27, playbackRate: 1, duration: 0.3 };
  }
}

function reloadProfile(weaponId: string): ReloadProfile {
  switch (weaponId) {
    case 'combat_shotgun': return { asset: 'shotgun', volume: .82, playbackRate: 1 };
    case 'plasma_gun': return { asset: 'handgun', volume: .92, playbackRate: 1.08 };
    case 'sniper_rifle': return { asset: 'rifle', volume: 1.08, playbackRate: .82 };
    case 'smg': return { asset: 'rifle', volume: .92, playbackRate: 1.10 };
    default: return { asset: 'rifle', volume: 1.16, playbackRate: 1 };
  }
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean = false;
  private gunfireBuffer: AudioBuffer | null = null;
  private gunfireLoad: Promise<void> | null = null;
  private gunfireAssetUnavailable = false;
  private readonly reloadBuffers = new Map<ReloadSoundId, AudioBuffer>();
  private readonly reloadLoads = new Map<ReloadSoundId, Promise<void>>();
  private readonly unavailableReloadAssets = new Set<ReloadSoundId>();

  constructor() {
    // We'll initialize on first user interaction to comply with browser policies
  }

  private noiseBuffer: AudioBuffer | null = null;

  /**
   * Call this from a direct input handler before the first shot. Browsers only
   * permit an AudioContext to start from a user gesture; doing this up front
   * prevents a network-replicated fire event on the next frame from being
   * silently muted.
   */
  activate() {
    this.ensureRunning();
    void this.loadGunfireAsset();
    this.preloadReloads();
  }

  /** Start loading the bundled CC0 firearm sound without playing it. */
  preloadGunfire() {
    this.ensureRunning();
    void this.loadGunfireAsset();
  }

  /** Pre-decodes all reload recordings while the arena is loading. */
  preloadReloads() {
    this.ensureRunning();
    (Object.keys(RELOAD_SOUND_URL) as ReloadSoundId[]).forEach(id => void this.loadReloadAsset(id));
  }

  private init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.3;
    this.enabled = true;
    this.noiseBuffer = this.createNoiseBuffer();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private ensureRunning() {
    if (!this.enabled || !this.ctx) {
      this.init();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private loadGunfireAsset(): Promise<void> {
    if (this.gunfireBuffer || this.gunfireAssetUnavailable) return Promise.resolve();
    if (this.gunfireLoad) return this.gunfireLoad;
    if (!this.ctx) return Promise.resolve();

    const context = this.ctx;
    this.gunfireLoad = fetch('/audio/cc0-gunfire.wav')
      .then(response => {
        if (!response.ok) throw new Error(`Gunfire asset unavailable (${response.status})`);
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(buffer => { this.gunfireBuffer = buffer; })
      .catch(() => { this.gunfireAssetUnavailable = true; })
      .finally(() => { this.gunfireLoad = null; });
    return this.gunfireLoad;
  }

  private loadReloadAsset(id: ReloadSoundId): Promise<void> {
    if (this.reloadBuffers.has(id) || this.unavailableReloadAssets.has(id)) return Promise.resolve();
    const existing = this.reloadLoads.get(id);
    if (existing) return existing;
    if (!this.ctx) return Promise.resolve();

    const context = this.ctx;
    const load = fetch(RELOAD_SOUND_URL[id])
      .then(response => {
        if (!response.ok) throw new Error(`Reload asset unavailable (${response.status})`);
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(buffer => { this.reloadBuffers.set(id, buffer); })
      .catch(() => { this.unavailableReloadAssets.add(id); })
      .finally(() => { this.reloadLoads.delete(id); });
    this.reloadLoads.set(id, load);
    return load;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 1, slide: number = 0, attack: number = 0.01) {
    this.ensureRunning();
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
    this.ensureRunning();
    if (!this.ctx || !this.masterGain) return;

    if (!this.noiseBuffer) {
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (!this.noiseBuffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

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
    this.ensureRunning();
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

  /**
   * Plays the bundled CC0 gunfire recording. A short, punchy portion of the
   * source is used so automatic weapons remain crisp instead of stacking its
   * long room tail. Every co-op firearm uses this method with a small,
   * weapon-specific playback variation.
   */
  playGunfire(weaponId: string = '') {
    this.ensureRunning();
    void this.loadGunfireAsset();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    if (!this.gunfireBuffer) {
      // The asset is normally preloaded on arena mount. Keep firing audible if
      // a first shot races a slow asset fetch or an older browser cannot decode it.
      this.playShoot();
      return;
    }

    const profile = gunfireProfile(weaponId);
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = this.gunfireBuffer;
    source.playbackRate.value = profile.playbackRate * (0.98 + Math.random() * 0.04);
    gain.gain.setValueAtTime(profile.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + profile.duration);
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(this.ctx.currentTime, 0, Math.min(profile.duration, this.gunfireBuffer.duration));
  }

  /** Plays a firearm-specific CC0 reload recording after a host-approved reload. */
  playReload(weaponId: string = '') {
    this.ensureRunning();
    const profile = reloadProfile(weaponId);
    void this.loadReloadAsset(profile.asset);
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const buffer = this.reloadBuffers.get(profile.asset);
    if (!buffer) {
      // A compact mechanical fallback keeps a first reload responsive while a
      // slow connection is still decoding its bundled recording.
      this.playTone(220, 'square', .07, .04, -120, .002);
      return;
    }

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = profile.playbackRate;
    gain.gain.setValueAtTime(profile.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.01, this.ctx.currentTime + buffer.duration / profile.playbackRate);
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
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
    this.ensureRunning();
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
