
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
    case 'arc_launcher': return { volume: 0.24, playbackRate: 1.34, duration: 0.26 };
    case 'smg': return { volume: 0.20, playbackRate: 1.12, duration: 0.22 };
    case 'plasma_gun': return { volume: 0.25, playbackRate: 1.18, duration: 0.24 };
    default: return { volume: 0.27, playbackRate: 1, duration: 0.3 };
  }
}

function reloadProfile(weaponId: string): ReloadProfile {
  switch (weaponId) {
    case 'combat_shotgun': return { asset: 'shotgun', volume: .82, playbackRate: 1 };
    case 'plasma_gun': return { asset: 'handgun', volume: .92, playbackRate: 1.08 };
    case 'arc_launcher': return { asset: 'rifle', volume: .82, playbackRate: 1.18 };
    case 'smg': return { asset: 'rifle', volume: .92, playbackRate: 1.10 };
    default: return { asset: 'rifle', volume: 1.16, playbackRate: 1 };
  }
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean = false;
  /** iOS and several embedded Android browsers need one silent source started
   * from a real touch event before they will output later Web Audio nodes. */
  private outputUnlocked = false;
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
  private stationCaptureOsc: OscillatorNode | null = null;
  private stationCaptureGain: GainNode | null = null;
  private stationCaptureFilter: BiquadFilterNode | null = null;
  private stationCaptureWasActive = false;
  private jetpackTurbineOsc: OscillatorNode | null = null;
  private jetpackSubOsc: OscillatorNode | null = null;
  private jetpackNoise: AudioBufferSourceNode | null = null;
  private jetpackNoiseFilter: BiquadFilterNode | null = null;
  private jetpackGain: GainNode | null = null;
  private jetpackWasActive = false;

  /**
   * Call this from a direct input handler before the first shot. Browsers only
   * permit an AudioContext to start from a user gesture; doing this up front
   * prevents a network-replicated fire event on the next frame from being
   * silently muted.
   */
  activate() {
    this.ensureRunning();
    this.unlockMobileOutput();
    void this.loadGunfireAsset();
    this.preloadReloads();
  }

  /**
   * Prime the output with an inaudible, one-sample buffer. This must be called
   * synchronously from a trusted gesture; it is harmless on desktop browsers
   * and prevents an otherwise fully-running AudioContext from remaining silent
   * on iOS PWAs and embedded Android browsers.
   */
  private unlockMobileOutput() {
    if (this.outputUnlocked || !this.ctx || !this.masterGain) return;
    const context = this.ctx;
    this.outputUnlocked = true;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    try {
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, context.sampleRate);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      source.connect(gain);
      gain.connect(this.masterGain);
      source.start(context.currentTime);
      source.stop(context.currentTime + .001);
    } catch {
      // Browsers that do not need a manual unlock keep the normal audio path.
    }
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
      if (weaponId === 'arc_launcher') this.playArcDischarge();
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
    if (weaponId === 'arc_launcher') this.playArcDischarge();
  }

  private playArcDischarge() {
    // A short rising discharge distinguishes Arc cells from ballistic fire
    // without adding the harsh sustained whine used by the old objectives.
    this.playTone(170, 'sine', .13, .09, 620, .004);
    this.playTone(760, 'triangle', .09, .035, -210, .003);
  }

  /** Layered class-artifact stingers. These are intentionally short so the
   * payoff reads as powerful without masking squad callouts or sustained fire. */
  playArtifactCast(artifactId: string) {
    this.ensureRunning();
    if (artifactId === 'reckoning') {
      this.playKick(.28, .42); this.playNoise(.22, .14, 900);
      for (let shot = 0; shot < 5; shot++) setTimeout(() => this.playTone(180 - shot * 12, 'sawtooth', .09, .075, -70, .002), shot * 34);
    } else if (artifactId === 'echo_collapse') {
      this.playTone(240, 'sine', .42, .16, 780, .025); this.playTone(960, 'triangle', .28, .08, -520, .01);
    } else if (artifactId === 'shatter_lance') {
      this.playTone(1480, 'triangle', .20, .13, 520, .002); this.playNoise(.26, .16, 5200); this.playKick(.18, .24);
    } else if (artifactId === 'stormcall') {
      this.playTone(92, 'sine', .48, .22, 310, .02); this.playNoise(.32, .12, 1800); this.playArcDischarge();
    } else if (artifactId === 'dawnwall') {
      this.playKick(.34, .34); this.playTone(150, 'square', .34, .12, 260, .008); this.playTone(620, 'sine', .45, .08, 190, .025);
    } else if (artifactId === 'hellseed') {
      this.playTone(105, 'sawtooth', .46, .18, -55, .012); this.playNoise(.38, .15, 720); this.playKick(.30, .35);
    }
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

  /** Restrained telemetry bed for the co-op arena handoff. It is intentionally
   * short and synthetic so a suspended AudioContext can fail silently without
   * changing deployment timing. */
  playDeploymentSync() {
    this.playTone(96, 'sine', .7, .08, 34, .08);
    this.playNoise(.18, .025, 1800);
    [720, 880, 1040].forEach((frequency, index) => {
      setTimeout(() => this.playTone(frequency, 'sine', .08, .025, 90, .005), 760 + index * 160);
    });
  }

  /** Final insertion impact: a low mechanical hit followed by a clean squad
   * link chirp. */
  playDeploymentRelease() {
    this.playKick(.32, .32);
    this.playNoise(.16, .10, 650);
    this.playTone(180, 'sawtooth', .18, .08, -90, .004);
    setTimeout(() => this.playTone(1320, 'sine', .12, .09, 360, .006), 95);
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

  /** Mid-air jet relight: a two-stage electronic ignition with no boot impact. */
  playDoubleJump() {
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;

    const ignition = this.ctx.createOscillator();
    const ignitionGain = this.ctx.createGain();
    ignition.type = 'sawtooth';
    ignition.frequency.setValueAtTime(190, t);
    ignition.frequency.exponentialRampToValueAtTime(760, t + .16);
    ignitionGain.gain.setValueAtTime(.01, t);
    ignitionGain.gain.linearRampToValueAtTime(.16, t + .018);
    ignitionGain.gain.exponentialRampToValueAtTime(.001, t + .17);
    ignition.connect(ignitionGain); ignitionGain.connect(this.masterGain);
    ignition.start(t); ignition.stop(t + .17);

    // The delayed second chirp makes the air relight unmistakably different
    // from the single mechanical push-off used by a ground jump.
    const confirmation = this.ctx.createOscillator();
    const confirmationGain = this.ctx.createGain();
    confirmation.type = 'square';
    confirmation.frequency.setValueAtTime(690, t + .045);
    confirmation.frequency.exponentialRampToValueAtTime(1080, t + .13);
    confirmationGain.gain.setValueAtTime(.001, t + .045);
    confirmationGain.gain.linearRampToValueAtTime(.075, t + .06);
    confirmationGain.gain.exponentialRampToValueAtTime(.001, t + .14);
    confirmation.connect(confirmationGain); confirmationGain.connect(this.masterGain);
    confirmation.start(t + .045); confirmation.stop(t + .14);

    if (!this.noiseBuffer) this.noiseBuffer = this.createNoiseBuffer();
    if (this.noiseBuffer) {
      const exhaust = this.ctx.createBufferSource(); exhaust.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 1.8;
      filter.frequency.setValueAtTime(720, t); filter.frequency.exponentialRampToValueAtTime(2600, t + .15);
      const gain = this.ctx.createGain(); gain.gain.setValueAtTime(.12, t); gain.gain.exponentialRampToValueAtTime(.001, t + .18);
      exhaust.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
      exhaust.start(t); exhaust.stop(t + .18);
    }
  }

  /**
   * Continuous local Burst Pack engine. Repeated frame updates reuse one
   * turbine/noise graph, so holding thrust cannot stack dozens of sound nodes.
   * Fuel subtly lowers the turbine pitch without turning low-fuel thrust quiet.
   */
  updateJetpack(active: boolean, fuelRatio: number = 1) {
    if (!active && !this.jetpackGain) return;
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const fuel = Math.max(0, Math.min(1, fuelRatio));

    if (active && !this.jetpackGain) {
      this.jetpackGain = this.ctx.createGain();
      this.jetpackGain.gain.setValueAtTime(0, now);
      this.jetpackGain.connect(this.masterGain);

      this.jetpackNoiseFilter = this.ctx.createBiquadFilter();
      this.jetpackNoiseFilter.type = 'bandpass';
      this.jetpackNoiseFilter.Q.value = .85;
      this.jetpackNoiseFilter.frequency.setValueAtTime(1_050, now);
      this.jetpackNoiseFilter.connect(this.jetpackGain);

      if (!this.noiseBuffer) this.noiseBuffer = this.createNoiseBuffer();
      if (this.noiseBuffer) {
        this.jetpackNoise = this.ctx.createBufferSource();
        this.jetpackNoise.buffer = this.noiseBuffer;
        this.jetpackNoise.loop = true;
        this.jetpackNoise.connect(this.jetpackNoiseFilter);
        this.jetpackNoise.start(now);
      }

      this.jetpackTurbineOsc = this.ctx.createOscillator();
      this.jetpackTurbineOsc.type = 'sawtooth';
      this.jetpackTurbineOsc.frequency.setValueAtTime(138, now);
      this.jetpackTurbineOsc.connect(this.jetpackGain);
      this.jetpackTurbineOsc.start(now);

      this.jetpackSubOsc = this.ctx.createOscillator();
      this.jetpackSubOsc.type = 'sine';
      this.jetpackSubOsc.frequency.setValueAtTime(58, now);
      this.jetpackSubOsc.connect(this.jetpackGain);
      this.jetpackSubOsc.start(now);
    }

    if (!this.jetpackGain) return;
    if (active !== this.jetpackWasActive) {
      this.jetpackGain.gain.cancelScheduledValues(now);
      this.jetpackGain.gain.setValueAtTime(this.jetpackGain.gain.value, now);
      // The engine is continuous and therefore needs far less peak gain than
      // transient weapons or impacts. Keep it as a quiet movement cue beneath
      // combat instead of letting the turbine dominate the mix.
      this.jetpackGain.gain.linearRampToValueAtTime(active ? .016 : 0, now + (active ? .045 : .11));
      this.jetpackWasActive = active;
    }
    if (active) {
      const turbinePitch = 118 + fuel * 38;
      this.jetpackTurbineOsc?.frequency.cancelScheduledValues(now);
      this.jetpackTurbineOsc?.frequency.setValueAtTime(this.jetpackTurbineOsc.frequency.value, now);
      this.jetpackTurbineOsc?.frequency.linearRampToValueAtTime(turbinePitch, now + .08);
      this.jetpackNoiseFilter?.frequency.cancelScheduledValues(now);
      this.jetpackNoiseFilter?.frequency.setValueAtTime(this.jetpackNoiseFilter.frequency.value, now);
      this.jetpackNoiseFilter?.frequency.linearRampToValueAtTime(900 + fuel * 420, now + .08);
    }
  }

  /** Tear down the persistent engine graph when leaving the arena. */
  stopJetpack() {
    if (this.jetpackGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.jetpackGain.gain.cancelScheduledValues(now);
      this.jetpackGain.gain.setValueAtTime(0, now);
    }
    try {
      this.jetpackNoise?.stop();
      this.jetpackNoise?.disconnect();
      this.jetpackTurbineOsc?.stop();
      this.jetpackTurbineOsc?.disconnect();
      this.jetpackSubOsc?.stop();
      this.jetpackSubOsc?.disconnect();
      this.jetpackNoiseFilter?.disconnect();
      this.jetpackGain?.disconnect();
    } catch {}
    this.jetpackNoise = null;
    this.jetpackTurbineOsc = null;
    this.jetpackSubOsc = null;
    this.jetpackNoiseFilter = null;
    this.jetpackGain = null;
    this.jetpackWasActive = false;
  }

  /** Wall-contact snap and lateral thrust. Pan points toward the contacted wall. */
  playWallJump(pan = 0) {
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const panner = typeof this.ctx.createStereoPanner === 'function' ? this.ctx.createStereoPanner() : undefined;
    if (panner) {
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
      panner.connect(this.masterGain);
    }
    const output = panner || this.masterGain;

    const contact = this.ctx.createOscillator();
    const contactGain = this.ctx.createGain();
    contact.type = 'triangle';
    contact.frequency.setValueAtTime(620, t);
    contact.frequency.exponentialRampToValueAtTime(85, t + .065);
    contactGain.gain.setValueAtTime(.2, t);
    contactGain.gain.exponentialRampToValueAtTime(.001, t + .07);
    contact.connect(contactGain); contactGain.connect(output);
    contact.start(t); contact.stop(t + .07);

    const lateralJet = this.ctx.createOscillator();
    const lateralGain = this.ctx.createGain();
    lateralJet.type = 'sawtooth';
    lateralJet.frequency.setValueAtTime(135, t);
    lateralJet.frequency.exponentialRampToValueAtTime(390, t + .14);
    lateralGain.gain.setValueAtTime(.12, t);
    lateralGain.gain.exponentialRampToValueAtTime(.001, t + .16);
    lateralJet.connect(lateralGain); lateralGain.connect(output);
    lateralJet.start(t); lateralJet.stop(t + .16);

    if (!this.noiseBuffer) this.noiseBuffer = this.createNoiseBuffer();
    if (this.noiseBuffer) {
      const scrape = this.ctx.createBufferSource(); scrape.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 3.2;
      filter.frequency.setValueAtTime(2400, t); filter.frequency.exponentialRampToValueAtTime(650, t + .11);
      const gain = this.ctx.createGain(); gain.gain.setValueAtTime(.14, t); gain.gain.exponentialRampToValueAtTime(.001, t + .12);
      scrape.connect(filter); filter.connect(gain); gain.connect(output);
      scrape.start(t); scrape.stop(t + .12);
    }
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

  /** Restrained uplink signal hum. One filtered sine layer replaces the old
   * three-oscillator 220–960 Hz whine and its fast LFO modulation. */
  updateTowerCharge(isCharging: boolean, progressRatio: number) {
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const clampedRatio = Math.max(0, Math.min(1, progressRatio));
    const targetPitch = 125 + 75 * Math.pow(clampedRatio, 1.1);
    this.currentTowerPitch = targetPitch;

    if (isCharging) {
      if (!this.towerChargeGain || !this.towerChargeOsc) {
        // One low sine layer leaves room for weapons, enemies and voice chat.
        this.towerChargeGain = this.ctx.createGain();
        this.towerChargeGain.gain.setValueAtTime(0, t);
        this.towerChargeGain.connect(this.masterGain);

        this.towerChargeFilter = this.ctx.createBiquadFilter();
        this.towerChargeFilter.type = 'lowpass';
        this.towerChargeFilter.frequency.setValueAtTime(320, t);
        this.towerChargeFilter.Q.value = .65;
        this.towerChargeFilter.connect(this.towerChargeGain);

        this.towerChargeOsc = this.ctx.createOscillator();
        this.towerChargeOsc.type = 'sine';
        this.towerChargeOsc.frequency.setValueAtTime(targetPitch, t);
        this.towerChargeOsc.connect(this.towerChargeFilter);
        this.towerChargeOsc.start(t);

      }

      // Smoothly fade in if not currently active
      if (!this.isTowerChargingActive && this.towerChargeGain) {
        this.towerChargeGain.gain.cancelScheduledValues(t);
        this.towerChargeGain.gain.setValueAtTime(this.towerChargeGain.gain.value, t);
        this.towerChargeGain.gain.linearRampToValueAtTime(.022, t + .4);
        this.isTowerChargingActive = true;
      }

      // Continuously glide frequency and filter to match real-time upload progress
      if (this.towerChargeOsc) {
        this.towerChargeOsc.frequency.cancelScheduledValues(t);
        this.towerChargeOsc.frequency.setValueAtTime(this.towerChargeOsc.frequency.value, t);
        this.towerChargeOsc.frequency.linearRampToValueAtTime(targetPitch, t + .16);
      }
    } else {
      // Disables charging sound smoothly (fade to 0), retaining pitch position
      if (this.isTowerChargingActive && this.towerChargeGain) {
        this.towerChargeGain.gain.cancelScheduledValues(t);
        this.towerChargeGain.gain.setValueAtTime(this.towerChargeGain.gain.value, t);
        this.towerChargeGain.gain.linearRampToValueAtTime(0, t + .18);
        this.isTowerChargingActive = false;
      }
    }
  }

  /** Continuous but restrained station cue. Capture previously reused the
   * uplink's piercing 220–960 Hz multi-oscillator whine; this is one filtered
   * sine layer in the 105–175 Hz range, audible without dominating combat. */
  updateStationCapture(isCapturing: boolean, progressRatio: number) {
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const ratio = Math.max(0, Math.min(1, progressRatio));
    const targetPitch = 105 + ratio * 70;

    if (isCapturing && (!this.stationCaptureOsc || !this.stationCaptureGain || !this.stationCaptureFilter)) {
      this.stationCaptureGain = this.ctx.createGain();
      this.stationCaptureGain.gain.setValueAtTime(0, now);
      this.stationCaptureGain.connect(this.masterGain);
      this.stationCaptureFilter = this.ctx.createBiquadFilter();
      this.stationCaptureFilter.type = 'lowpass';
      this.stationCaptureFilter.frequency.setValueAtTime(360, now);
      this.stationCaptureFilter.Q.value = .7;
      this.stationCaptureFilter.connect(this.stationCaptureGain);
      this.stationCaptureOsc = this.ctx.createOscillator();
      this.stationCaptureOsc.type = 'sine';
      this.stationCaptureOsc.frequency.setValueAtTime(targetPitch, now);
      this.stationCaptureOsc.connect(this.stationCaptureFilter);
      this.stationCaptureOsc.start(now);
    }

    if (isCapturing) {
      if (!this.stationCaptureWasActive && this.stationCaptureGain) {
        this.stationCaptureGain.gain.cancelScheduledValues(now);
        this.stationCaptureGain.gain.setValueAtTime(this.stationCaptureGain.gain.value, now);
        // Slow, low-level fade prevents an audible onset thump when entering.
        this.stationCaptureGain.gain.linearRampToValueAtTime(.028, now + .45);
        this.stationCaptureWasActive = true;
      }
      if (this.stationCaptureOsc) {
        this.stationCaptureOsc.frequency.cancelScheduledValues(now);
        this.stationCaptureOsc.frequency.setValueAtTime(this.stationCaptureOsc.frequency.value, now);
        this.stationCaptureOsc.frequency.linearRampToValueAtTime(targetPitch, now + .12);
      }
    } else if (this.stationCaptureWasActive && this.stationCaptureGain) {
      this.stationCaptureGain.gain.cancelScheduledValues(now);
      this.stationCaptureGain.gain.setValueAtTime(this.stationCaptureGain.gain.value, now);
      this.stationCaptureGain.gain.linearRampToValueAtTime(0, now + .14);
      this.stationCaptureWasActive = false;
    }
  }

  stopStationCapture() {
    if (this.stationCaptureGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.stationCaptureGain.gain.cancelScheduledValues(now);
      this.stationCaptureGain.gain.setValueAtTime(0, now);
    }
    try {
      this.stationCaptureOsc?.stop();
      this.stationCaptureOsc?.disconnect();
      this.stationCaptureFilter?.disconnect();
      this.stationCaptureGain?.disconnect();
    } catch {}
    this.stationCaptureOsc = null;
    this.stationCaptureFilter = null;
    this.stationCaptureGain = null;
    this.stationCaptureWasActive = false;
  }

  /** Short, unmistakable confirmation that the captured terminal has become
   * an operational Buy Station. Kept well below the objective fanfare. */
  playStationCaptured() {
    this.stopStationCapture();
    this.ensureRunning();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    this.playTone(330, 'sine', .22, .065, 55, .025);
    setTimeout(() => this.playTone(440, 'sine', .28, .055, 70, .025), 115);
    setTimeout(() => this.playTone(660, 'triangle', .34, .035, -45, .035), 235);
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
