
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
  private towerChargeOsc: OscillatorNode | null = null;
  private towerChargeSubOsc: OscillatorNode | null = null;
  private towerChargeLfo: OscillatorNode | null = null;
  private towerChargeLfoGain: GainNode | null = null;
  private towerChargeGain: GainNode | null = null;
  private towerChargeFilter: BiquadFilterNode | null = null;
  private isTowerChargingActive: boolean = false;
  private currentTowerPitch: number = 220;

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

  playTacticalPing(isDanger: boolean = false) {
    if (isDanger) {
      // Sharp, urgent dual danger alert with aggressive sawtooth bite
      this.playTone(880, 'sawtooth', 0.08, 0.24, 120, 0.005);
      setTimeout(() => this.playTone(1174, 'sawtooth', 0.12, 0.26, -180, 0.005), 55);
    } else {
      // Sharp high-tech tactical sonar chime
      this.playTone(1760, 'sine', 0.08, 0.22, 220, 0.005);
      setTimeout(() => this.playTone(2637, 'sine', 0.12, 0.18, -120, 0.005), 45);
    }
  }

  playLevelUp() {
    // Arpeggio with square wave for retro feel
    [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'square', 0.25, 0.06, 50, 0.01), i * 120);
    });
  }

  playHeal() {
    // Warm harmonic ascending arpeggio for full health recovery
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'sine', 0.22, 0.12, 80, 0.01), i * 65);
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

  playRespiratorBreathing() {
    // Muffled respirator valve cycle
    this.playNoise(0.55, 0.06, 550);
    this.playTone(90, 'sine', 0.45, 0.03, -20, 0.08);
  }

  playFilterDegradation() {
    // Sizzling chemical neutralization hiss
    this.playNoise(0.18, 0.08, 2600);
    this.playTone(320, 'triangle', 0.12, 0.03, -100, 0.01);
  }

  playMaskShatter() {
    // Glass fracture and pressurized air seal blowout
    this.playTone(1600, 'sawtooth', 0.28, 0.22, -1100, 0.005);
    this.playNoise(0.35, 0.25, 4500);
    this.playTone(220, 'square', 0.18, 0.12, -140, 0.01);
  }

  playToxicCough() {
    // Choking / coughing on toxic chemical vapor
    this.playTone(95, 'sawtooth', 0.2, 0.14, -40, 0.01);
    this.playNoise(0.25, 0.12, 700);
  }

  playHazardKlaxon() {
    // Two-tone industrial emergency containment alarm
    this.ensureRunning();
    this.playTone(680, 'sawtooth', 0.25, 0.12, 0, 0.01);
    setTimeout(() => this.playTone(520, 'sawtooth', 0.35, 0.14, 0, 0.01), 260);
  }

  /**
   * Crisp, athletic tactical suit jump with mechanical boot takeoff snap
   * and ascending aerodynamic air swoosh.
   */
  playJump() {
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;

    // 1. Transient push-off boot contact snap
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(360, t);
    clickOsc.frequency.exponentialRampToValueAtTime(70, t + 0.05);
    clickGain.gain.setValueAtTime(0.18, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(t);
    clickOsc.stop(t + 0.05);

    // 2. Ascending aerodynamic air swoosh (bandpass filtered noise)
    if (!this.noiseBuffer) this.noiseBuffer = this.createNoiseBuffer();
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bpf = this.ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.Q.value = 2.4;
      bpf.frequency.setValueAtTime(420, t);
      bpf.frequency.exponentialRampToValueAtTime(1450, t + 0.18);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.08, t);
      noiseGain.gain.linearRampToValueAtTime(0.22, t + 0.03);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

      noise.connect(bpf);
      bpf.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(t);
      noise.stop(t + 0.20);
    }

    // 3. Resonant kinetic lift impulse (ascending tone)
    const liftOsc = this.ctx.createOscillator();
    const liftGain = this.ctx.createGain();
    liftOsc.type = 'sine';
    liftOsc.frequency.setValueAtTime(145, t);
    liftOsc.frequency.exponentialRampToValueAtTime(360, t + 0.16);
    liftGain.gain.setValueAtTime(0.01, t);
    liftGain.gain.linearRampToValueAtTime(0.22, t + 0.03);
    liftGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    liftOsc.connect(liftGain);
    liftGain.connect(this.masterGain);
    liftOsc.start(t);
    liftOsc.stop(t + 0.18);
  }

  /**
   * "Very dof" landing impact: heavy, muffled, low-frequency thud with heavy
   * lowpass filtering and zero harsh high-frequency clatter.
   */
  playLanding(volume: number = 1) {
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const vol = Math.max(0.1, Math.min(1.5, volume));

    // 1. Heavy sub-bass body impact thud
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, t);
    subOsc.frequency.exponentialRampToValueAtTime(36, t + 0.15);
    subGain.gain.setValueAtTime(0.46 * vol, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(t);
    subOsc.stop(t + 0.16);

    // 2. Muffled lowpass filtered impact noise (strictly damped below 200 Hz)
    if (!this.noiseBuffer) this.noiseBuffer = this.createNoiseBuffer();
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const lpf = this.ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(200, t);
      lpf.frequency.exponentialRampToValueAtTime(45, t + 0.13);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.34 * vol, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

      noise.connect(lpf);
      lpf.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(t);
      noise.stop(t + 0.13);
    }

    // 3. Compact chest thump
    const kickOsc = this.ctx.createOscillator();
    const kickGain = this.ctx.createGain();
    kickOsc.type = 'sine';
    kickOsc.frequency.setValueAtTime(80, t);
    kickOsc.frequency.exponentialRampToValueAtTime(26, t + 0.11);
    kickGain.gain.setValueAtTime(0.32 * vol, t);
    kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    kickOsc.connect(kickGain);
    kickGain.connect(this.masterGain);
    kickOsc.start(t);
    kickOsc.stop(t + 0.11);
  }

  /**
   * Distinct tactical round alert fanfare: 3-chord ascending progression with
   * sub impact and digital alert harmonic.
   */
  playNewRound() {
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;

    // Cinematic low-end sub impact
    this.playKick(0.35, 0.45);

    // 3-chord tactical progression
    const chords = [
      { time: 0, notes: [146.8, 293.7], dur: 0.15, vol: 0.14 },
      { time: 0.16, notes: [220.0, 440.0], dur: 0.15, vol: 0.16 },
      { time: 0.32, notes: [293.7, 370.0, 587.3], dur: 0.65, vol: 0.22 },
    ];

    for (const { time, notes, dur, vol } of chords) {
      const startTime = t + time;
      for (const freq of notes) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, startTime);
        filter.frequency.exponentialRampToValueAtTime(320, startTime + dur);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + dur);
      }
    }

    // High digital alert chime overlay
    setTimeout(() => {
      this.playTone(880, 'sine', 0.4, 0.07, 180, 0.01);
      this.playTone(1174.7, 'sine', 0.45, 0.05, 90, 0.02);
    }, 320);
  }

  /**
   * Continuous charging hum for the Tower/Uplink mission.
   * While holding in the capture circle, emits a rising sci-fi drone/whine whose
   * pitch tracks capture progress (220 Hz -> 960 Hz).
   * Leaving the circle cleanly disables the sound; re-entering resumes at the
   * pitch where we left.
   */
  updateTowerCharge(isCharging: boolean, progressRatio: number) {
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const clampedRatio = Math.max(0, Math.min(1, progressRatio));
    const targetPitch = 220 + (960 - 220) * Math.pow(clampedRatio, 1.15);
    this.currentTowerPitch = targetPitch;

    if (isCharging) {
      if (!this.towerChargeGain || !this.towerChargeOsc) {
        // Construct the continuous charging synthesizer graph
        this.towerChargeGain = this.ctx.createGain();
        this.towerChargeGain.gain.setValueAtTime(0, t);
        this.towerChargeGain.connect(this.masterGain);

        this.towerChargeFilter = this.ctx.createBiquadFilter();
        this.towerChargeFilter.type = 'lowpass';
        this.towerChargeFilter.frequency.setValueAtTime(Math.max(600, targetPitch * 2.2), t);
        this.towerChargeFilter.Q.value = 2.5;
        this.towerChargeFilter.connect(this.towerChargeGain);

        this.towerChargeOsc = this.ctx.createOscillator();
        this.towerChargeOsc.type = 'triangle';
        this.towerChargeOsc.frequency.setValueAtTime(targetPitch, t);
        this.towerChargeOsc.connect(this.towerChargeFilter);
        this.towerChargeOsc.start(t);

        this.towerChargeSubOsc = this.ctx.createOscillator();
        this.towerChargeSubOsc.type = 'sine';
        this.towerChargeSubOsc.frequency.setValueAtTime(targetPitch * 1.5, t);
        const subGain = this.ctx.createGain();
        subGain.gain.value = 0.38;
        this.towerChargeSubOsc.connect(subGain);
        subGain.connect(this.towerChargeFilter);
        this.towerChargeSubOsc.start(t);

        this.towerChargeLfo = this.ctx.createOscillator();
        this.towerChargeLfo.type = 'sine';
        this.towerChargeLfo.frequency.setValueAtTime(3.5 + 12.5 * clampedRatio, t);
        this.towerChargeLfoGain = this.ctx.createGain();
        this.towerChargeLfoGain.gain.value = 40;
        this.towerChargeLfo.connect(this.towerChargeLfoGain);
        this.towerChargeLfoGain.connect(this.towerChargeFilter.frequency);
        this.towerChargeLfo.start(t);
      }

      // Smoothly fade in if not currently active
      if (!this.isTowerChargingActive && this.towerChargeGain) {
        this.towerChargeGain.gain.cancelScheduledValues(t);
        this.towerChargeGain.gain.setValueAtTime(this.towerChargeGain.gain.value, t);
        this.towerChargeGain.gain.linearRampToValueAtTime(0.18, t + 0.08);
        this.isTowerChargingActive = true;
      }

      // Continuously glide frequency and filter to match real-time upload progress
      if (this.towerChargeOsc && this.towerChargeSubOsc && this.towerChargeFilter && this.towerChargeLfo) {
        this.towerChargeOsc.frequency.cancelScheduledValues(t);
        this.towerChargeOsc.frequency.setValueAtTime(this.towerChargeOsc.frequency.value, t);
        this.towerChargeOsc.frequency.linearRampToValueAtTime(targetPitch, t + 0.06);

        this.towerChargeSubOsc.frequency.cancelScheduledValues(t);
        this.towerChargeSubOsc.frequency.setValueAtTime(this.towerChargeSubOsc.frequency.value, t);
        this.towerChargeSubOsc.frequency.linearRampToValueAtTime(targetPitch * 1.5, t + 0.06);

        this.towerChargeFilter.frequency.cancelScheduledValues(t);
        this.towerChargeFilter.frequency.setValueAtTime(this.towerChargeFilter.frequency.value, t);
        this.towerChargeFilter.frequency.linearRampToValueAtTime(Math.max(600, targetPitch * 2.2), t + 0.06);

        this.towerChargeLfo.frequency.cancelScheduledValues(t);
        this.towerChargeLfo.frequency.setValueAtTime(this.towerChargeLfo.frequency.value, t);
        this.towerChargeLfo.frequency.linearRampToValueAtTime(3.5 + 12.5 * clampedRatio, t + 0.06);
      }
    } else {
      // Disables charging sound smoothly (fade to 0), retaining pitch position
      if (this.isTowerChargingActive && this.towerChargeGain) {
        this.towerChargeGain.gain.cancelScheduledValues(t);
        this.towerChargeGain.gain.setValueAtTime(this.towerChargeGain.gain.value, t);
        this.towerChargeGain.gain.linearRampToValueAtTime(0, t + 0.07);
        this.isTowerChargingActive = false;
      }
    }
  }

  /** Fully clean up continuous tower charging sound nodes. */
  stopTowerCharge() {
    if (this.towerChargeGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.towerChargeGain.gain.cancelScheduledValues(t);
      this.towerChargeGain.gain.setValueAtTime(this.towerChargeGain.gain.value, t);
      this.towerChargeGain.gain.linearRampToValueAtTime(0, t + 0.05);
    }
    setTimeout(() => {
      try {
        this.towerChargeOsc?.stop();
        this.towerChargeOsc?.disconnect();
        this.towerChargeSubOsc?.stop();
        this.towerChargeSubOsc?.disconnect();
        this.towerChargeLfo?.stop();
        this.towerChargeLfo?.disconnect();
        this.towerChargeLfoGain?.disconnect();
        this.towerChargeGain?.disconnect();
        this.towerChargeFilter?.disconnect();
      } catch {}
      this.towerChargeOsc = null;
      this.towerChargeSubOsc = null;
      this.towerChargeLfo = null;
      this.towerChargeLfoGain = null;
      this.towerChargeGain = null;
      this.towerChargeFilter = null;
      this.isTowerChargingActive = false;
    }, 65);
  }

  /** Triumphant fanfare when the tower/uplink objective completes. */
  playObjectiveComplete() {
    this.stopTowerCharge();
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    // Power surge sub drop
    this.playTone(90, 'sine', 0.45, 0.35, -55, 0.02);
    this.playKick(0.3, 0.4);

    // Ascending major electronic fanfare
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, 'triangle', 0.28, 0.12, 10, 0.01);
        this.playTone(freq * 1.5, 'sine', 0.22, 0.05, 5, 0.01);
      }, index * 65);
    });

    // Crystalline victory ring-out
    setTimeout(() => {
      this.playTone(1568.0, 'sine', 0.65, 0.08, 0, 0.01);
      this.playTone(2093.0, 'sine', 0.70, 0.06, 0, 0.02);
      this.playNoise(0.18, 0.05, 3000);
    }, 360);
  }
}

export const soundManager = new SoundManager();
