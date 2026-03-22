import { Vector2D, Player, Enemy, Projectile, ExperienceGem, GameState, Weapon, WorldItem, Treasure, OperatorDefinition, Shop, Inventory, DashState } from '../types';
import { GAME_WIDTH, GAME_HEIGHT, INITIAL_PLAYER_STATS, ENEMY_TYPES, WEAPON_DEFINITIONS, UPGRADES, ITEM_TYPES, PERMANENT_UPGRADES, OPERATOR_DEFINITIONS, DASH_UPGRADES } from '../constants';
import { soundManager } from './SoundManager';
import { EventManager } from './EventManager';

export interface BalanceTuning {
  difficultyTimeScalePerMinute: number;
  difficultyKillBonusDivisor: number;
  difficultyKillBonusCap: number;
  spawnBaseIntervalMs: number;
  spawnMinIntervalMs: number;
  weaponSpawnStep: number;
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  playerDamageTakenMultiplier: number;
  bossDamagePercentMultiplier: number;
  coinDropChanceBase: number;
  treasureDropChanceBase: number;
  xpBaseRequirement: number;
  xpLevelScaling: number;
  xpGlobalGainMultiplier: number;
  xpGrowthEffectiveness: number;
  treasureXPGainMultiplier: number;
  goldGainMultiplier: number;
  bossHealthMultiplier: number;
  bossXPRewardMultiplier: number;
}

export interface AutoUpgradeNotice {
  id: string;
  name: string;
  type: 'stat' | 'weapon' | 'weapon_upgrade' | 'dash' | 'heal';
  rarity?: 'common' | 'rare' | 'legendary';
  expiresAt: number;
}

export interface SystemNotice {
  text: string;
  color: string;
  expiresAt: number;
}

export const DEFAULT_BALANCE_TUNING: BalanceTuning = {
  difficultyTimeScalePerMinute: 0.15,
  difficultyKillBonusDivisor: 2000,
  difficultyKillBonusCap: 0.5,
  spawnBaseIntervalMs: 400,
  spawnMinIntervalMs: 60,
  weaponSpawnStep: 0.0,
  enemyHealthMultiplier: 1,
  enemyDamageMultiplier: 1,
  playerDamageTakenMultiplier: 1,
  bossDamagePercentMultiplier: 1,
  coinDropChanceBase: 0.15,
  treasureDropChanceBase: 0.00035,
  xpBaseRequirement: 120,
  xpLevelScaling: 1.32,
  xpGlobalGainMultiplier: 0.78,
  xpGrowthEffectiveness: 0.7,
  treasureXPGainMultiplier: 0.65,
  goldGainMultiplier: 1,
  bossHealthMultiplier: 1,
  bossXPRewardMultiplier: 1,
};

export class GameEngine {
  private readonly DEFAULT_WEAPON_DAMAGE_MULTIPLIER = 1.2;
  private readonly MAX_ENEMIES = 500;
  private readonly MAX_PROJECTILES = 1400;
  private readonly MAX_PARTICLES = 1600;
  private readonly MAX_DAMAGE_TEXTS = 180;
  private readonly COLLISION_CELL_SIZE = 160;
  private readonly MAX_ACTIVE_TREASURES = 2;
  private readonly SHOP_MIN_DISTANCE_FROM_SPAWN = 800;
  private readonly SHOP_RING_DISTANCE = 1300;
  private readonly REROLL_COSTS = [100, 250, 500];
  private readonly MAX_REROLLS_PER_WAVE = 3;

  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  player: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  gems: ExperienceGem[] = [];
  items: WorldItem[] = [];
  treasures: Treasure[] = [];
  portals: { position: Vector2D; radius: number; active: boolean }[] = [];
  activePortalIndex: number = -1;
  shops: Shop[] = [];
  nearbyShop: Shop | null = null;
  reviveInvulnTimer: number = 0;
  hasRevived: boolean = false;
  particles: any[] = [];
  damageTexts: { x: number, y: number, text: string, life: number, maxLife: number, color: string }[] = [];
  screenShake: number = 0;
  hitStopTimer: number = 0;
  paused: boolean = false;
  chromaticAberration: number = 0;
  lastHitSoundAt: number = 0;
  
  gameState: GameState = 'MENU';
  camera: Vector2D = { x: 0, y: 0 };
  cameraZoom: number = 1;
  keys: Set<string> = new Set();
  dashSpaceWasDown: boolean = false;
  
  lastTime: number = 0;
  spawnTimer: number = 0;
  gameTime: number = 0;
  killCount: number = 0;
  difficultyMultiplier: number = 1;
  dashCooldown: number = 2000;
  dashTimer: number = 0;
  isDashing: boolean = false;
  dashDuration: number = 200;
  dashVelocity: Vector2D = { x: 0, y: 0 };
  dashStartPos: Vector2D = { x: 0, y: 0 };
  dashGhostTimer: number = 0;
  dashMomentumTimer: number = 0;
  regenTimer: number = 0;
  lastBossHitTime: number = 0;

  dashState: DashState = this.createDefaultDashState();

  waveTimer: number = 0;
  waveDuration: number = 90000;

  public weaponDamageStats: Record<string, number> = {};
  
  // Combo / Overdrive system
  comboCount: number = 0;
  comboTimer: number = 0;
  isOverdrive: boolean = false;
  overdriveTimer: number = 0;
  godModeActive: boolean = false;
  godModeTimer: number = 0;
  COMBO_MAX: number = 50; // Points to reach Overdrive
  COMBO_DECAY_TIME: number = 3000; // 3s before combo drops
  OVERDRIVE_DURATION: number = 10000; // 10s of carnage

  // Runtime-editable balancing values for admin dashboard tuning.
  balanceTuning: BalanceTuning = { ...DEFAULT_BALANCE_TUNING };
  
  // Exfill is now triggered explicitly from the UI end-of-wave screen

  // Smooth movement
  targetRotation: number = 0;

  // Per-enemy damage cooldowns for orbit weapons (key: "weaponId:enemyId")
  orbitDamageCooldowns = new Map<string, number>();

  // Event system
  eventManager: EventManager = new EventManager();

  onLevelUp: (options: any[]) => void;
  onGameOver: (stats: any) => void;
  onTreasure: (upgrade: any) => void;
  onShopEnter: () => void;
  onExfill: (coins: number, level: number) => void;
  shopInteractionCooldown: number = 0;
  public recentAutoUpgrade: AutoUpgradeNotice | null = null;
  public recentSystemNotice: SystemNotice | null = null;
  private autoUpgradeNoDashStreak: number = 0;
  private lastAutoUpgradeId: string | null = null;
  private queuedAutoSkips: number = 0;
  private queuedAutoRerolls: number = 0;

  constructor(
    canvas: HTMLCanvasElement, 
    onLevelUp: (options: any[]) => void, 
    onGameOver: (stats: any) => void, 
    onTreasure: (upgrade: any) => void,
    onShopEnter: () => void,
    onExfill: (coins: number, level: number) => void
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!; // Performance optimization
    this.onLevelUp = onLevelUp;
    this.onGameOver = onGameOver;
    this.onTreasure = onTreasure;
    this.onShopEnter = onShopEnter;
    this.onExfill = onExfill;
    
    this.portals = [];

    this.player = this.resetPlayer();
    
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  resetPlayer(level: number = 1, experience: number = 0, coins: number = 0, permanentUpgrades: Record<string, number> = {}, operatorId: string = 'phantom'): Player {
    const operator = OPERATOR_DEFINITIONS.find(op => op.id === operatorId) || OPERATOR_DEFINITIONS[0];
    const stats = { ...INITIAL_PLAYER_STATS };
    
    // Apply operator stat bonuses
    Object.entries(operator.statBonuses).forEach(([stat, value]) => {
      if (value !== undefined && stat in stats) {
        (stats as any)[stat] += value;
      }
    });

    // Apply permanent upgrades
    PERMANENT_UPGRADES.forEach(upgrade => {
      const level = permanentUpgrades[upgrade.id] || 0;
      if (level > 0) {
        if (upgrade.stat === 'health') {
          // Handled separately
        } else if (upgrade.stat === 'extra_weapon') {
          // Handled separately
        } else {
          (stats as any)[upgrade.stat] += upgrade.value * level;
        }
      }
    });

    const maxHealth = operator.baseHealth + (permanentUpgrades['perm_health'] || 0) * 20;
    
    // Operator's starting weapon
    const startWeaponDef = WEAPON_DEFINITIONS.find(w => w.id === operator.startingWeaponId) || WEAPON_DEFINITIONS[0];
    const weapons: Weapon[] = [
      {
        id: startWeaponDef.id,
        name: startWeaponDef.name,
        level: 1,
        maxLevel: 8,
        description: startWeaponDef.description,
        cooldown: startWeaponDef.baseCooldown,
        lastFired: 0,
        type: startWeaponDef.type as any,
        ...(startWeaponDef.burstCount ? { burstCount: startWeaponDef.burstCount, burstDelay: startWeaponDef.burstDelay || 200, burstRemaining: 0, burstTimer: 0 } : {})
      }
    ];

    if (permanentUpgrades['perm_starting_weapon'] > 0) {
      const otherWeapons = WEAPON_DEFINITIONS.filter(w => w.id !== operator.startingWeaponId);
      const randomWeapon = otherWeapons[Math.floor(Math.random() * otherWeapons.length)];
      weapons.push({
        id: randomWeapon.id,
        name: randomWeapon.name,
        level: 1,
        maxLevel: 8,
        description: randomWeapon.description,
        cooldown: randomWeapon.baseCooldown,
        lastFired: 0,
        type: randomWeapon.type as any
      });
    }

    return {
      id: 'player',
      position: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      radius: 18,
      health: maxHealth,
      maxHealth: maxHealth,
      color: operator.color,
      level: level,
      experience: experience,
      experienceToNextLevel: this.getXPRequiredForLevel(level),
      speed: operator.baseSpeed * stats.speed,
      weapons,
      upgrades: [],
      stats,
      coins: coins,
      permanentUpgrades: { ...permanentUpgrades },
      operatorId: operatorId,
      pendingDataCores: 0,
      currentWave: 1,
      rerolls: permanentUpgrades['perm_reroll'] || 0,
      rerollsThisWave: 0,
      banishes: permanentUpgrades['perm_banish'] || 0,
      skips: permanentUpgrades['perm_skip'] || 0,
      bannedUpgrades: new Set<string>(),
      inventory: { armorTier: 0, hasRevive: false, nukeCount: 0 },
      armorHp: 0,
      lastHitTime: 0
    };
  }

  createDefaultDashState(): DashState {
    return {
      deadlockBurst: 0,
      twinVector: 0,
      aegisSlip: 0,
      afterimageMinefield: 0,
      phaseLaceration: 0,
      nullWake: 0,
      inertiaVault: 0,
      kineticRefund: 0,
      bulwarkRam: 0,
      echoRecall: 0,
      prismGuard: 0,
      cataclysmBrake: 0,
      dashCharges: 1,
      maxDashCharges: 1,
      dashRechargeTimer: 0,
      standStillTimer: 0,
      deadlockCharged: false,
      echoRecallOrigin: null,
      echoRecallWindow: 0,
      kineticRefundWindow: 0,
      aegisShieldTimer: 0,
      prismShardTimer: 0,
      nullWakeTrail: [],
      afterimages: [],
      cataclysmPending: false,
      cataclysmMoveTimer: 0,
      bulwarkRamHit: false,
    };
  }

  private getPermanentUpgradeLevel(id: string): number {
    return this.player.permanentUpgrades?.[id] || 0;
  }

  private getDashUpgradeLevel(id: string): number {
    const rawKey = id.replace('dash_', '');
    const camelKey = rawKey.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()) as keyof DashState;
    const value = (this.dashState as any)[camelKey];
    return Number.isFinite(value) ? Number(value) : 0;
  }

  private getDashUpgradeLevelByKey(key: keyof DashState): number {
    const value = (this.dashState as any)[key];
    return Number.isFinite(value) ? Number(value) : 0;
  }

  private getDashUpgradeMaxLevel(): number {
    return 3;
  }

  private getDashAegisPostShieldMs(): number {
    return 350 + Math.max(0, this.getDashUpgradeLevelByKey('aegisSlip') - 1) * 150;
  }

  private getDashEchoRecallWindowMs(): number {
    return 700 + Math.max(0, this.getDashUpgradeLevelByKey('echoRecall') - 1) * 250;
  }

  private getDashKineticWindowMs(): number {
    return 1500 + Math.max(0, this.getDashUpgradeLevelByKey('kineticRefund') - 1) * 500;
  }

  private getDashKineticRefundFraction(): number {
    const level = this.getDashUpgradeLevelByKey('kineticRefund');
    return Math.min(0.4, 0.15 + Math.max(0, level - 1) * 0.1);
  }

  private getDashNullWakeLifeMs(): number {
    return 1200 + Math.max(0, this.getDashUpgradeLevelByKey('nullWake') - 1) * 400;
  }

  private getEffectiveDashCooldownMs(): number {
    const rechargeLevel = this.getPermanentUpgradeLevel('perm_dash_recharge');
    const rechargeMult = Math.max(0.5, 1 - rechargeLevel * 0.1);
    return this.dashCooldown * this.player.stats.dash_cooldown * rechargeMult;
  }

  private getDashImpactMultiplier(): number {
    return 1 + this.getPermanentUpgradeLevel('perm_dash_impact') * 0.15;
  }

  private syncDashChargeCapacity() {
    const baseCharges = 1 + this.getPermanentUpgradeLevel('perm_dash_charge');
    const desiredMax = baseCharges + this.getDashUpgradeLevelByKey('twinVector');
    if (this.dashState.maxDashCharges !== desiredMax) {
      const oldMax = this.dashState.maxDashCharges;
      this.dashState.maxDashCharges = desiredMax;
      if (desiredMax > oldMax) {
        this.dashState.dashCharges = desiredMax;
      } else {
        this.dashState.dashCharges = Math.min(this.dashState.dashCharges, desiredMax);
        if (this.dashState.dashCharges <= 0) {
          this.dashState.dashCharges = 1;
        }
      }
    }
  }

  hasDashUpgrade(): boolean {
    const ds = this.dashState;
      return ds.deadlockBurst > 0 || ds.twinVector > 0 || ds.aegisSlip > 0 || ds.afterimageMinefield > 0 ||
        ds.phaseLaceration > 0 || ds.nullWake > 0 || ds.inertiaVault > 0 || ds.kineticRefund > 0 ||
        ds.bulwarkRam > 0 || ds.echoRecall > 0 || ds.prismGuard > 0 || ds.cataclysmBrake > 0;
  }

  start() {
    this.gameState = 'PLAYING';
    this.paused = false;
    this.shopInteractionCooldown = 0;
    this.reviveInvulnTimer = 0;
    this.hasRevived = false;
    this.lastTime = performance.now();
    this.cameraZoom = 1;
    this.enemies = [];
    this.projectiles = [];
    this.gems = [];
    this.items = [];
    this.particles = [];
    this.gameTime = 0;
    this.killCount = 0;
    this.waveTimer = 0;
    this.weaponDamageStats = {};
    this.difficultyMultiplier = 1;
    // Reset exfill state
    this.activePortalIndex = -1;
    // Shop setup: always place shops away from spawn so the run starts clean.
    this.shops = this.generateShops();
    // Reset event system
    this.eventManager.reset();
    // Reset dash upgrades
    this.dashState = this.createDefaultDashState();
    this.syncDashChargeCapacity();
    this.dashGhostTimer = 0;
    this.dashMomentumTimer = 0;
    this.dashSpaceWasDown = false;
    this.requestUpdate();
  }

  stop() {
    this.gameState = 'MENU';
    this.paused = false;
    this.dashGhostTimer = 0;
    this.dashMomentumTimer = 0;
    this.keys.clear();
    this.dashSpaceWasDown = false;
  }

  lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    // Normalize to [-PI, PI] for shortest path
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  requestUpdate() {
    if (this.gameState !== 'PLAYING') return;
    requestAnimationFrame((time) => this.update(time));
  }

  private getViewportWorldWidth(): number {
    return this.canvas.width / this.cameraZoom;
  }

  private generateShops(): Shop[] {
    const spawn = this.player.position;
    const baseAngle = Math.random() * Math.PI * 2;
    const shops: Shop[] = [];

    for (let i = 0; i < 2; i++) {
      const angle = baseAngle + i * Math.PI;
      let distance = this.SHOP_RING_DISTANCE;
      if (distance < this.SHOP_MIN_DISTANCE_FROM_SPAWN) {
        distance = this.SHOP_MIN_DISTANCE_FROM_SPAWN;
      }

      shops.push({
        id: i === 0 ? 'shopA' : 'shopB',
        position: {
          x: spawn.x + Math.cos(angle) * distance,
          y: spawn.y + Math.sin(angle) * distance,
        },
        radius: 120,
      });
    }

    return shops;
  }

  private getViewportWorldHeight(): number {
    return this.canvas.height / this.cameraZoom;
  }

  private updateCameraPosition() {
    const viewportWidth = this.getViewportWorldWidth();
    const viewportHeight = this.getViewportWorldHeight();
    this.camera.x = this.player.position.x - viewportWidth / 2;
    this.camera.y = this.player.position.y - viewportHeight / 2;
  }

  private isScreenBoundAOEProjectile(projectileId: string): boolean {
    return projectileId === 'orbit' || projectileId === 'scythe' || projectileId === 'aura' || projectileId === 'pulse' || projectileId === 'frost_aura';
  }

  private isInView(position: Vector2D, radius: number, margin: number = 0): boolean {
    const viewportWidth = this.getViewportWorldWidth();
    const viewportHeight = this.getViewportWorldHeight();
    const left = this.camera.x - radius - margin;
    const right = this.camera.x + viewportWidth + radius + margin;
    const top = this.camera.y - radius - margin;
    const bottom = this.camera.y + viewportHeight + radius + margin;
    return position.x >= left && position.x <= right && position.y >= top && position.y <= bottom;
  }

  private getProjectileRadiusCap(id: string): number {
    switch (id) {
      case 'aura': return 120;
      case 'pulse': return 150;
      case 'orbit': return 15;
      case 'scythe': return 20;
      case 'sonic': return 80;
      case 'nano': return 10;
      case 'mirror_shard': return 10;
      case 'helix': return 8;
      case 'tendril': return 12;
      case 'flare': return 25;
      case 'echo': return 22;
      case 'frost_aura': return 200;
      case 'stardust': return 15;
      case 'blade': return 100;
      case 'gravity_well': return 200;
      case 'arc_zap': return 25;
      case 'chain_bolt': return Number.POSITIVE_INFINITY;
      case 'arc_web': return Number.POSITIVE_INFINITY;
      default: return 12;
    }
  }

  private clampProjectileRadius(projectile: Projectile) {
    const cap = this.getProjectileRadiusCap(projectile.id);
    if (projectile.radius > cap) projectile.radius = cap;
  }

  private cellKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  private getCellCoords(position: Vector2D): { x: number; y: number } {
    return {
      x: Math.floor(position.x / this.COLLISION_CELL_SIZE),
      y: Math.floor(position.y / this.COLLISION_CELL_SIZE),
    };
  }

  private buildEnemySpatialHash(): Map<string, Enemy[]> {
    const hash = new Map<string, Enemy[]>();
    for (const enemy of this.enemies) {
      if (enemy.id === 'dead') continue;
      const cell = this.getCellCoords(enemy.position);
      const key = this.cellKey(cell.x, cell.y);
      const bucket = hash.get(key);
      if (bucket) {
        bucket.push(enemy);
      } else {
        hash.set(key, [enemy]);
      }
    }
    return hash;
  }

  private getNearbyEnemies(position: Vector2D, hash: Map<string, Enemy[]>, searchRadius: number = this.COLLISION_CELL_SIZE): Enemy[] {
    const cell = this.getCellCoords(position);
    const candidates: Enemy[] = [];
    const cellRange = Math.max(1, Math.ceil(searchRadius / this.COLLISION_CELL_SIZE));
    for (let oy = -cellRange; oy <= cellRange; oy++) {
      for (let ox = -cellRange; ox <= cellRange; ox++) {
        const bucket = hash.get(this.cellKey(cell.x + ox, cell.y + oy));
        if (bucket) candidates.push(...bucket);
      }
    }
    return candidates;
  }

  setBalanceTuning(partial: Partial<BalanceTuning>) {
    const previous = this.balanceTuning;
    this.balanceTuning = {
      ...this.balanceTuning,
      ...partial,
    };

    // Apply relevant tuning deltas immediately so sliders have live in-run impact.
    const enemyHealthRatio = this.balanceTuning.enemyHealthMultiplier / Math.max(0.0001, previous.enemyHealthMultiplier);
    const enemyDamageRatio = this.balanceTuning.enemyDamageMultiplier / Math.max(0.0001, previous.enemyDamageMultiplier);
    const bossHealthRatio = this.balanceTuning.bossHealthMultiplier / Math.max(0.0001, previous.bossHealthMultiplier);
    const bossXPRatio = this.balanceTuning.bossXPRewardMultiplier / Math.max(0.0001, previous.bossXPRewardMultiplier);

    for (const enemy of this.enemies) {
      if (enemy.type === 'boss') {
        enemy.health *= bossHealthRatio;
        enemy.maxHealth *= bossHealthRatio;
        enemy.experienceValue *= bossXPRatio;
      } else {
        enemy.health *= enemyHealthRatio;
        enemy.maxHealth *= enemyHealthRatio;
        enemy.damage *= enemyDamageRatio;
      }
    }

    // Recompute current level threshold immediately when XP curve knobs change.
    this.player.experienceToNextLevel = this.getXPRequiredForLevel(this.player.level);
  }

  getBalanceTuning(): BalanceTuning {
    return { ...this.balanceTuning };
  }

  getXPRequiredForLevel(level: number): number {
    return Math.floor(this.balanceTuning.xpBaseRequirement * Math.pow(this.balanceTuning.xpLevelScaling, level - 1));
  }

  private buildUpgradePool() {
    if (!(this.player.bannedUpgrades instanceof Set)) {
      this.player.bannedUpgrades = new Set(this.player.bannedUpgrades as any);
    }

    const statUpgrades = UPGRADES.map(up => ({ ...up, type: 'stat' as const }))
      .filter(u => !this.player.bannedUpgrades.has(u.id));

    const weaponUpgrades = WEAPON_DEFINITIONS
      .filter(def => !this.player.weapons.find(w => w.id === def.id))
      .filter(def => !this.player.bannedUpgrades.has(def.id))
      .map(def => ({ id: def.id, name: def.name, description: def.description, type: 'weapon' as const, rarity: 'common' as const }));

    const existingWeaponUpgrades = this.player.weapons
      .filter(w => w.level < w.maxLevel)
      .map(w => ({ id: w.id, name: `${w.name} (Lvl ${w.level + 1})`, description: 'Increases damage and efficiency.', type: 'weapon_upgrade' as const, rarity: 'common' as const }));

    const dashPool = DASH_UPGRADES
      .filter(d => !this.player.bannedUpgrades.has(d.id))
      .map(d => {
        const level = this.getDashUpgradeLevel(d.id);
        return {
          ...d,
          type: 'dash' as const,
          level,
          maxLevel: this.getDashUpgradeMaxLevel(),
          name: level > 0 ? `${d.name} (Lvl ${level + 1})` : d.name,
        };
      })
      .filter(d => d.level < d.maxLevel);

    return [...statUpgrades, ...weaponUpgrades, ...existingWeaponUpgrades, ...dashPool];
  }

  private getUpgradeWeight(item: { rarity?: string }) {
    if (item.rarity === 'legendary') return 0.02 * this.player.stats.luck;
    if (item.rarity === 'rare') return 0.1 * this.player.stats.luck;
    return 1;
  }

  private pickWeightedItem<T extends { rarity?: string }>(pool: T[]): T | null {
    if (pool.length === 0) return null;
    const totalWeight = pool.reduce((sum, item) => sum + this.getUpgradeWeight(item), 0);
    if (totalWeight <= 0) return pool[Math.floor(Math.random() * pool.length)] ?? null;

    let r = Math.random() * totalWeight;
    for (const item of pool) {
      r -= this.getUpgradeWeight(item);
      if (r <= 0) return item;
    }
    return pool[pool.length - 1] ?? null;
  }

  private chooseAutoUpgrade() {
    return this.chooseSingleAutoUpgrade(this.buildXPOnlyUpgradePool());
  }

  private buildXPOnlyUpgradePool() {
    const pool = this.buildUpgradePool();
    const ownedStatIds = new Set(
      this.player.upgrades
        .filter((upgrade: any) => upgrade.type === 'stat')
        .map((upgrade: any) => upgrade.id)
    );

    return pool.filter((item: any) => {
      if (item.type === 'weapon_upgrade') return true;
      if (item.type === 'weapon') return false;
      if (item.type === 'dash') return (item.level || 0) > 0;
      if (item.type === 'stat') return ownedStatIds.has(item.id);
      return false;
    });
  }

  private chooseSingleAutoUpgrade(poolOverride?: any[]) {
    const pool = poolOverride ? [...poolOverride] : this.buildUpgradePool();
    if (pool.length === 0) {
      return {
        id: 'full_heal',
        name: 'Full Repair',
        description: 'Fully restores health without improving stats or weapons.',
        type: 'heal',
        icon: 'heart',
        rarity: 'common'
      };
    }

    const weaponPool = pool.filter(item => item.type === 'weapon' || item.type === 'weapon_upgrade');
    const dashPool = pool.filter(item => item.type === 'dash');
    const statPool = pool.filter(item => item.type === 'stat');

    const bucketWeights: Array<{ key: 'weapon' | 'dash' | 'stat'; weight: number; items: any[] }> = [
      { key: 'weapon', weight: 0.5, items: weaponPool },
      { key: 'dash', weight: this.autoUpgradeNoDashStreak >= 3 ? 0.55 : 0.25, items: dashPool },
      { key: 'stat', weight: this.autoUpgradeNoDashStreak >= 3 ? 0.15 : 0.25, items: statPool },
    ].filter(bucket => bucket.items.length > 0);

    if (bucketWeights.length === 0) {
      const fallback = this.pickWeightedItem(pool);
      return fallback ?? {
        id: 'full_heal',
        name: 'Full Repair',
        description: 'Fully restores health without improving stats or weapons.',
        type: 'heal',
        icon: 'heart',
        rarity: 'common'
      };
    }

    const bucketTotal = bucketWeights.reduce((sum, bucket) => sum + bucket.weight, 0);
    let roll = Math.random() * bucketTotal;
    let selectedBucket = bucketWeights[0];
    for (const bucket of bucketWeights) {
      roll -= bucket.weight;
      if (roll <= 0) {
        selectedBucket = bucket;
        break;
      }
    }

    let candidates = selectedBucket.items;
    if (selectedBucket.key === 'weapon') {
      const ownedWeaponUpgrades = candidates.filter(item => item.type === 'weapon_upgrade');
      if (ownedWeaponUpgrades.length > 0) {
        const minLevel = ownedWeaponUpgrades.reduce((min, item) => {
          const weapon = this.player.weapons.find(w => w.id === item.id);
          return Math.min(min, weapon?.level ?? Number.MAX_SAFE_INTEGER);
        }, Number.MAX_SAFE_INTEGER);

        const catchup = ownedWeaponUpgrades.filter(item => {
          const weapon = this.player.weapons.find(w => w.id === item.id);
          return (weapon?.level ?? Number.MAX_SAFE_INTEGER) === minLevel;
        });

        // Favor catching up existing low-level weapons, but still keep room for new weapon drops.
        if (catchup.length > 0 && Math.random() < 0.7) {
          candidates = catchup;
        }
      }
    }

    if (this.lastAutoUpgradeId && candidates.length > 1) {
      const withoutRepeat = candidates.filter(item => item.id !== this.lastAutoUpgradeId);
      if (withoutRepeat.length > 0) candidates = withoutRepeat;
    }

    const picked = this.pickWeightedItem(candidates) ?? this.pickWeightedItem(pool);
    return picked ?? {
      id: 'full_heal',
      name: 'Full Repair',
      description: 'Fully restores health without improving stats or weapons.',
      type: 'heal',
      icon: 'heart',
      rarity: 'common'
    };
  }

  private chooseAutoUpgradeWithRerollBoost() {
    const restrictedPool = this.buildXPOnlyUpgradePool();
    const attempts = [
      this.chooseSingleAutoUpgrade(restrictedPool),
      this.chooseSingleAutoUpgrade(restrictedPool),
      this.chooseSingleAutoUpgrade(restrictedPool),
    ];

    const rarityScore = (rarity?: string) => {
      if (rarity === 'legendary') return 4;
      if (rarity === 'rare') return 2;
      return 1;
    };

    const typeScore = (type: string) => {
      if (type === 'weapon_upgrade') return 1.35;
      if (type === 'dash') return 1.2;
      if (type === 'weapon') return 1.1;
      if (type === 'stat') return 1.0;
      return 0.5;
    };

    let best = attempts[0];
    let bestScore = rarityScore(best?.rarity) + typeScore(best?.type || 'stat');

    for (let i = 1; i < attempts.length; i++) {
      const candidate = attempts[i];
      const score = rarityScore(candidate?.rarity) + typeScore(candidate?.type || 'stat') + Math.random() * 0.03;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  processPendingXPLevelUps(maxLevels: number = 12) {
    let leveled = 0;
    while (
      leveled < maxLevels &&
      this.player.experience >= this.player.experienceToNextLevel
    ) {
      this.levelUp('xp');
      leveled++;
    }
    return leveled;
  }

  getEffectiveXPMultiplier(): number {
    const growthBonus = Math.max(0, this.player.stats.growth - 1);
    const dampenedGrowth = 1 + growthBonus * this.balanceTuning.xpGrowthEffectiveness;
    return dampenedGrowth * this.eventManager.getXPMultiplier() * this.balanceTuning.xpGlobalGainMultiplier;
  }

  update(time: number) {
    if (this.paused) {
      this.draw();
      this.requestUpdate();
      return;
    }
    const deltaTime = Math.min(time - this.lastTime, 100); // Cap delta time
    this.lastTime = time;

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= deltaTime;
      this.draw();
      this.requestUpdate();
      return;
    }

    this.gameTime += deltaTime;
    this.waveTimer += deltaTime;
    if (this.shopInteractionCooldown > 0) {
      this.shopInteractionCooldown = Math.max(0, this.shopInteractionCooldown - deltaTime);
    }

    if (this.waveTimer >= this.waveDuration) {
      this.waveTimer = 0;
      this.player.currentWave++;
      this.player.rerollsThisWave = 0;
      this.enemies = [];
      this.projectiles = [];
      // Cancel any active bounty target — the enemy no longer exists
      if (this.eventManager.bountyTarget && !this.eventManager.bountyTarget.claimed) {
        this.eventManager.bountyTarget = null;
        this.eventManager.announce('BOUNTY ESCAPED', 'Target vanished with the wave', '#ff4444');
      }
      this.createExplosion(this.player.position.x, this.player.position.y, '#ffffff', 50);
      soundManager.playExplosion();
      this.eventManager.triggerWaveEvents(this.player.currentWave, this, true);
      this.levelUp();
      return; // Wait for level up selection before continuing
    }

    // Increase difficulty over time from run performance only.
    const killBonus = Math.min(this.killCount / Math.max(1, this.balanceTuning.difficultyKillBonusDivisor), this.balanceTuning.difficultyKillBonusCap); // Capped bonus
    // Use current wave for base pacing to create distinct difficulty steps
    const waveBonus = Math.max(0, this.player.currentWave - 1) * this.balanceTuning.difficultyTimeScalePerMinute;
    this.difficultyMultiplier = 1 + waveBonus + killBonus;

    // Handle Combo Decay
    if (this.comboCount > 0 && !this.isOverdrive) {
      this.comboTimer -= deltaTime;
      if (this.comboTimer <= 0) {
        this.comboCount = Math.max(0, this.comboCount - 5);
        this.comboTimer = 200; // Decay rate
      }
    }

    // Handle Overdrive
    if (this.isOverdrive) {
      this.overdriveTimer -= deltaTime;
      if (this.overdriveTimer <= 0) {
        this.isOverdrive = false;
        this.comboCount = 0;
      }
    }

    // Handle God Mode duration
    if (this.godModeActive) {
      this.godModeTimer -= deltaTime;
      if (this.godModeTimer <= 0) {
        this.godModeActive = false;
        this.player.stats.might -= 0.5;
        this.player.stats.area -= 0.5;
        this.player.stats.cooldown /= 0.5;
        this.player.speed /= 1.3;
        this.player.stats.luck -= 0.5;
      }
    }

    // Revive Invulnerability Timer
    if (this.reviveInvulnTimer > 0) {
      this.reviveInvulnTimer -= deltaTime;
    }

    // Armor Regen Logic
    if (this.player.inventory.armorTier > 0 && this.player.armorHp < this.getMaxArmorHp()) {
      if (this.gameTime - this.player.lastHitTime > 3000) {
        // Regenerate 10% of max armor per second (or cap at max)
        this.player.armorHp = Math.min(this.getMaxArmorHp(), this.player.armorHp + this.getMaxArmorHp() * 0.1 * (deltaTime / 1000));
      }
    }

    // Shop interaction logic: player must press Enter inside the perimeter.
    this.nearbyShop = null;
    for (const shop of this.shops) {
      if (this.shopInteractionCooldown > 0) continue;
      const dx = this.player.position.x - shop.position.x;
      const dy = this.player.position.y - shop.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < shop.radius) {
        this.nearbyShop = shop;
        break;
      }
    }

    if (this.nearbyShop && this.keys.has('enter')) {
      const dx = this.player.position.x - this.nearbyShop.position.x;
      const dy = this.player.position.y - this.nearbyShop.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      this.gameState = 'SHOP';
      this.player.velocity.x = 0;
      this.player.velocity.y = 0;
      // Bump player slightly outside the radius to prevent immediate re-trigger on unpause
      const pushBase = this.nearbyShop.radius + 5; // 5px padding outside radius
      const angle = dist > 0.0001 ? Math.atan2(dy, dx) : 0;
      this.player.position.x = this.nearbyShop.position.x + Math.cos(angle) * pushBase;
      this.player.position.y = this.nearbyShop.position.y + Math.sin(angle) * pushBase;
      this.shopInteractionCooldown = 300;
      this.keys.clear();
      this.onShopEnter();
      this.draw();
      return; // Pause the engine loop here
    }

    this.handleInput();
    this.updatePlayer(deltaTime);
    this.updatePortal(deltaTime);
    this.updateEnemies(deltaTime);
    this.updateProjectiles(deltaTime);
    this.updateGems(deltaTime);
    this.updateItems(deltaTime);
    this.updateTreasures(deltaTime);
    this.updateParticles(deltaTime);
    this.updateDamageTexts(deltaTime);
    this.cleanupEntities();
    this.updateWeapons(time);
    this.checkCollisions(deltaTime);
    this.spawnEnemies(deltaTime);
    this.updateRegen(deltaTime);

    // Update event system
    this.eventManager.update(deltaTime, this);
    this.eventManager.updateDataStormSpawns(deltaTime, this);
    
    if (this.screenShake > 0) this.screenShake -= deltaTime * 0.05;
    if (this.chromaticAberration > 0) this.chromaticAberration -= deltaTime * 0.05;
    if (this.dashTimer > 0) this.dashTimer -= deltaTime;
    this.updateDashState(deltaTime);
    
    this.draw();
    this.requestUpdate();
  }

  updateDashState(dt: number) {
    const ds = this.dashState;
    const isMoving = Math.abs(this.player.velocity.x) > 0.1 || Math.abs(this.player.velocity.y) > 0.1;

    this.syncDashChargeCapacity();

    if (this.dashGhostTimer > 0) {
      this.dashGhostTimer = Math.max(0, this.dashGhostTimer - dt);
    }
    if (this.dashMomentumTimer > 0) {
      this.dashMomentumTimer = Math.max(0, this.dashMomentumTimer - dt);
    }

    // Multi-charge dash: recharge one charge per cooldown cycle.
    if (ds.maxDashCharges > 1 && ds.dashCharges < ds.maxDashCharges) {
      ds.dashRechargeTimer = Math.max(0, ds.dashRechargeTimer - dt);
      if (ds.dashRechargeTimer <= 0) {
        ds.dashCharges++;
        if (ds.dashCharges < ds.maxDashCharges) {
          ds.dashRechargeTimer = this.getEffectiveDashCooldownMs();
        }
      }
    }

    // Deadlock Burst: track stand-still time
    if (ds.deadlockBurst) {
      if (!isMoving && !this.isDashing) {
        ds.standStillTimer += dt;
        const deadlockLevel = this.getDashUpgradeLevelByKey('deadlockBurst');
        const chargeThreshold = Math.max(450, 1000 - (deadlockLevel - 1) * 220);
        if (ds.standStillTimer >= chargeThreshold && !ds.deadlockCharged) {
          ds.deadlockCharged = true;
          // Visual charge-ready indicator
          this.createExplosion(this.player.position.x, this.player.position.y, '#ff6600', 8);
        }
      } else if (isMoving && !this.isDashing) {
        ds.standStillTimer = 0;
        // Don't unset deadlockCharged — it persists until used
      }
    }

    // Echo Recall window decay
    if (ds.echoRecallWindow > 0) {
      ds.echoRecallWindow -= dt;
      if (ds.echoRecallWindow <= 0) {
        ds.echoRecallOrigin = null;
      }
    }

    // Aegis Slip shield timer decay
    if (ds.aegisShieldTimer > 0) {
      ds.aegisShieldTimer -= dt;
    }

    // Prism Guard shard timer + damage
    if (ds.prismShardTimer > 0) {
      ds.prismShardTimer -= dt;
      const prismLevel = this.getDashUpgradeLevelByKey('prismGuard');
      // Damage nearby enemies with rotating shards
      const shardRadius = (100 + Math.max(0, prismLevel - 1) * 25) * this.player.stats.area;
      const shardDmg = (15 + Math.max(0, prismLevel - 1) * 8) * this.player.stats.might * (dt / 300);
      for (const enemy of this.enemies) {
        if (enemy.id === 'dead') continue;
        const dx = this.player.position.x - enemy.position.x;
        const dy = this.player.position.y - enemy.position.y;
        if (dx * dx + dy * dy < shardRadius * shardRadius) {
          enemy.health -= shardDmg;
          if (Math.random() < 0.05) enemy.hitFlash = 60;
          if (enemy.health <= 0) this.killEnemy(enemy);
        }
      }
    }

    // Kinetic Refund window decay
    if (ds.kineticRefundWindow > 0) {
      ds.kineticRefundWindow -= dt;
    }

    // Null Wake trail decay + slow + visual particles
    const nullWakeLevel = this.getDashUpgradeLevelByKey('nullWake');
    const nullWakeSlow = Math.max(0.12, 0.3 - Math.max(0, nullWakeLevel - 1) * 0.08);
    ds.nullWakeTrail = ds.nullWakeTrail.filter(p => {
      p.life -= dt;
      if (p.life <= 0) return false;
      // Slow enemies near trail
      for (const enemy of this.enemies) {
        if (enemy.id === 'dead') continue;
        const dx = p.x - enemy.position.x;
        const dy = p.y - enemy.position.y;
        if (dx * dx + dy * dy < 3600) { // 60px radius
          enemy.slowMultiplier = Math.min(enemy.slowMultiplier || 1, nullWakeSlow);
        }
      }
      // Ambient particles
      if (Math.random() < 0.04) {
        this.particles.push({
          x: p.x + (Math.random() - 0.5) * 20,
          y: p.y + (Math.random() - 0.5) * 20,
          vx: 0, vy: -0.02,
          life: 400, maxLife: 400,
          color: 'rgba(0, 180, 255, 0.6)',
          size: 2 + Math.random() * 2
        });
      }
      return true;
    });

    // Afterimage minefield: tick and detonate
    const afterimageLevel = this.getDashUpgradeLevelByKey('afterimageMinefield');
    ds.afterimages = ds.afterimages.filter(a => {
      a.timer -= dt;
      // Tick particles
      if (Math.random() < 0.1) {
        this.particles.push({
          x: a.x + (Math.random() - 0.5) * 15,
          y: a.y + (Math.random() - 0.5) * 15,
          vx: 0, vy: -0.03,
          life: 300, maxLife: 300,
          color: 'rgba(255, 100, 255, 0.7)',
          size: 2 + Math.random() * 2
        });
      }
      if (a.timer <= 0) {
        // Detonate
        const radius = (120 + Math.max(0, afterimageLevel - 1) * 30) * this.player.stats.area;
        const dmg = (50 + Math.max(0, afterimageLevel - 1) * 20) * this.player.stats.might;
        for (const enemy of this.enemies) {
          if (enemy.id === 'dead') continue;
          const dx = a.x - enemy.position.x;
          const dy = a.y - enemy.position.y;
          if (dx * dx + dy * dy < radius * radius) {
            enemy.health -= dmg;
            enemy.hitFlash = 120;
            if (enemy.health <= 0) this.killEnemy(enemy);
          }
        }
        this.createExplosion(a.x, a.y, '#ff44ff', 20);
        this.screenShake = 5;
        return false;
      }
      return true;
    });

    // Cataclysm Brake: trigger implosion when player stops after dash
    if (ds.cataclysmPending && !this.isDashing) {
      if (!isMoving) {
        const cataclysmLevel = this.getDashUpgradeLevelByKey('cataclysmBrake');
        ds.cataclysmPending = false;
        ds.cataclysmMoveTimer = 0;
        const pullRadius = (200 + Math.max(0, cataclysmLevel - 1) * 50) * this.player.stats.area;
        const dmg = (30 + Math.max(0, cataclysmLevel - 1) * 15) * this.player.stats.might * this.getDashImpactMultiplier();
        for (const enemy of this.enemies) {
          if (enemy.id === 'dead' || enemy.type === 'boss') continue;
          const dx = this.player.position.x - enemy.position.x;
          const dy = this.player.position.y - enemy.position.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < pullRadius * pullRadius) {
            const dist = Math.sqrt(distSq) || 1;
            enemy.velocity.x += (dx / dist) * 6;
            enemy.velocity.y += (dy / dist) * 6;
            enemy.health -= dmg;
            enemy.hitFlash = 100;
            if (enemy.health <= 0) this.killEnemy(enemy);
          }
        }
        // Implosion visual
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const dist = pullRadius * 0.8;
          this.particles.push({
            x: this.player.position.x + Math.cos(a) * dist,
            y: this.player.position.y + Math.sin(a) * dist,
            vx: -Math.cos(a) * 0.5,
            vy: -Math.sin(a) * 0.5,
            life: 500, maxLife: 500,
            color: '#8b00ff',
            size: 3 + Math.random() * 3
          });
        }
        this.screenShake = 12;
        soundManager.playExplosion();
      } else {
        // Cancel implosion if player keeps moving after dash.
        ds.cataclysmMoveTimer += dt;
        if (ds.cataclysmMoveTimer >= 200) {
          ds.cataclysmPending = false;
          ds.cataclysmMoveTimer = 0;
        }
      }
    }
  }

  updateRegen(dt: number) {
    if (this.player.stats.regen > 0) {
      this.regenTimer += dt;
      if (this.regenTimer >= 5000) {
        this.regenTimer = 0;
        this.player.health = Math.min(this.player.maxHealth, this.player.health + this.player.stats.regen);
      }
    }
  }

  updateParticles(dt: number) {
    if (this.particles.length > this.MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - this.MAX_PARTICLES);
    }
    this.particles = this.particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0;
    });
  }

  updateDamageTexts(dt: number) {
    if (this.damageTexts.length > this.MAX_DAMAGE_TEXTS) {
      this.damageTexts.splice(0, this.damageTexts.length - this.MAX_DAMAGE_TEXTS);
    }
    this.damageTexts = this.damageTexts.filter(t => {
      t.y -= 0.05 * dt;
      t.life -= dt;
      return t.life > 0;
    });
  }

  cleanupEntities() {
    const cleanupDist = Math.max(this.canvas.width, this.canvas.height) * 1.5;
    const cleanupDistSq = cleanupDist * cleanupDist;

    this.enemies = this.enemies.filter(e => {
      const dx = e.position.x - this.player.position.x;
      const dy = e.position.y - this.player.position.y;
      return dx * dx + dy * dy < cleanupDistSq;
    });

    this.gems = this.gems.filter(g => {
      const dx = g.position.x - this.player.position.x;
      const dy = g.position.y - this.player.position.y;
      return dx * dx + dy * dy < cleanupDistSq;
    });

    if (this.enemies.length > this.MAX_ENEMIES) {
      this.enemies.splice(0, this.enemies.length - this.MAX_ENEMIES);
    }
    if (this.projectiles.length > this.MAX_PROJECTILES) {
      this.projectiles.splice(0, this.projectiles.length - this.MAX_PROJECTILES);
    }
  }

  createExplosion(x: number, y: number, color: string, count: number = 5) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 0.2 + 0.1;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 500 + Math.random() * 500,
        maxLife: 1000,
        color,
        size: Math.random() * 3 + 1
      });
    }
  }

  handleInput() {
    const move = { x: 0, y: 0 };
    if (this.keys.has('w') || this.keys.has('arrowup')) move.y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) move.y += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) move.x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) move.x += 1;

    const ds = this.dashState;
    this.syncDashChargeCapacity();
    const isMoving = move.x !== 0 || move.y !== 0;
    const spaceDown = this.keys.has(' ');
    const spacePressed = spaceDown && !this.dashSpaceWasDown;

    // Echo Recall: re-press space during recall window to blink back
    if (spacePressed && ds.echoRecall && ds.echoRecallWindow > 0 && ds.echoRecallOrigin && !this.isDashing) {
      // Teleport back
      this.player.position.x = ds.echoRecallOrigin.x;
      this.player.position.y = ds.echoRecallOrigin.y;
      ds.echoRecallOrigin = null;
      ds.echoRecallWindow = 0;
      this.chromaticAberration = 15;
      soundManager.playDash();
      this.createExplosion(this.player.position.x, this.player.position.y, '#a855f7', 15);
    }
    // Normal dash activation
    else if (spacePressed && isMoving && !this.isDashing) {
      // Use charge system when max charges are above one.
      const canDash = ds.maxDashCharges > 1
        ? ds.dashCharges > 0
        : this.dashTimer <= 0;

      if (canDash) {
        this.isDashing = true;
        ds.bulwarkRamHit = false;

        if (ds.maxDashCharges > 1) {
          ds.dashCharges--;
          if (ds.dashCharges < ds.maxDashCharges && ds.dashRechargeTimer <= 0) {
            ds.dashRechargeTimer = this.getEffectiveDashCooldownMs();
          }
        } else {
          this.dashTimer = this.getEffectiveDashCooldownMs();
        }

        const dashSpeedMult = 1 + this.getPermanentUpgradeLevel('perm_dash_speed') * 0.08;
        const dashDurationBonus = this.getPermanentUpgradeLevel('perm_dash_duration') * 30;

        // Inertia Vault: scale speed with current move speed
        let dashSpeed = 15 * dashSpeedMult;
        let dashDur = this.dashDuration + dashDurationBonus;
        if (ds.inertiaVault) {
          const inertiaLevel = this.getDashUpgradeLevelByKey('inertiaVault');
          const currentSpeed = Math.sqrt(this.player.velocity.x ** 2 + this.player.velocity.y ** 2);
          const speedCap = 1.5 + Math.max(0, inertiaLevel - 1) * 0.25;
          const speedBonus = Math.min(currentSpeed / this.player.speed, speedCap);
          dashSpeed = (15 + speedBonus * (8 + Math.max(0, inertiaLevel - 1) * 2)) * dashSpeedMult;
          dashDur = this.dashDuration + dashDurationBonus + speedBonus * (80 + Math.max(0, inertiaLevel - 1) * 25);
        }

        const mag = Math.sqrt(move.x * move.x + move.y * move.y);
        this.dashVelocity = { x: (move.x / mag) * dashSpeed, y: (move.y / mag) * dashSpeed };
        this.dashStartPos = { x: this.player.position.x, y: this.player.position.y };
        this.chromaticAberration = 10;
        soundManager.playDash();

        // Deadlock Burst: if charged, trigger shockwave at start
        if (ds.deadlockBurst && ds.deadlockCharged) {
          const deadlockLevel = this.getDashUpgradeLevelByKey('deadlockBurst');
          ds.deadlockCharged = false;
          ds.standStillTimer = 0;
          const radius = (180 + Math.max(0, deadlockLevel - 1) * 45) * this.player.stats.area;
          const dmg = (60 + Math.max(0, deadlockLevel - 1) * 25) * this.player.stats.might * this.getDashImpactMultiplier();
          const knockback = 8 + Math.max(0, deadlockLevel - 1) * 2;
          for (const enemy of this.enemies) {
            if (enemy.id === 'dead') continue;
            const dx = this.player.position.x - enemy.position.x;
            const dy = this.player.position.y - enemy.position.y;
            if (dx * dx + dy * dy < radius * radius) {
              enemy.health -= dmg;
              enemy.hitFlash = 150;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              enemy.velocity.x -= (dx / dist) * knockback;
              enemy.velocity.y -= (dy / dist) * knockback;
              if (enemy.health <= 0) this.killEnemy(enemy);
            }
          }
          // Shockwave visual particles
          for (let i = 0; i < 30; i++) {
            const a = (i / 30) * Math.PI * 2;
            this.particles.push({
              x: this.player.position.x + Math.cos(a) * 30,
              y: this.player.position.y + Math.sin(a) * 30,
              vx: Math.cos(a) * 0.4,
              vy: Math.sin(a) * 0.4,
              life: 600, maxLife: 600,
              color: '#ff6600',
              size: 4 + Math.random() * 3
            });
          }
          this.screenShake = 15;
        }

        // Aegis Slip: activate shield
        if (ds.aegisSlip) {
          ds.aegisShieldTimer = dashDur + this.getDashAegisPostShieldMs();
        }

        // Echo Recall: store origin
        if (ds.echoRecall) {
          ds.echoRecallOrigin = { ...this.dashStartPos };
          ds.echoRecallWindow = this.getDashEchoRecallWindowMs();
        }

        // Prism Guard: activate shards
        if (ds.prismGuard) {
          const prismLevel = this.getDashUpgradeLevelByKey('prismGuard');
          ds.prismShardTimer = 2000 + Math.max(0, prismLevel - 1) * 600;
        }

        // Cataclysm Brake: mark pending
        if (ds.cataclysmBrake) {
          ds.cataclysmPending = true;
          ds.cataclysmMoveTimer = 0;
        }

        // Kinetic Refund: open window
        if (ds.kineticRefund) {
          ds.kineticRefundWindow = this.getDashKineticWindowMs();
        }

        const dashStartSnapshot = { ...this.dashStartPos };
        setTimeout(() => {
          this.isDashing = false;
          const dashEndSnapshot = { x: this.player.position.x, y: this.player.position.y };

          const ghostFrames = this.getPermanentUpgradeLevel('perm_dash_ghost') * 80;
          if (ghostFrames > 0) {
            this.dashGhostTimer = ghostFrames;
          }

          const repairAmount = this.getPermanentUpgradeLevel('perm_dash_repair') * 3;
          if (repairAmount > 0 && this.player.health > 0) {
            this.player.health = Math.min(this.player.maxHealth, this.player.health + repairAmount);
          }

          if (this.getPermanentUpgradeLevel('perm_dash_momentum') > 0) {
            this.dashMomentumTimer = 1500;
          }

          // Afterimage Minefield: drop afterimages along dash path
          if (ds.afterimageMinefield) {
            const afterimageLevel = this.getDashUpgradeLevelByKey('afterimageMinefield');
            const dx = dashEndSnapshot.x - dashStartSnapshot.x;
            const dy = dashEndSnapshot.y - dashStartSnapshot.y;
            const afterimageCount = 3 + Math.max(0, afterimageLevel - 1);
            const mineTimer = Math.max(280, 500 - Math.max(0, afterimageLevel - 1) * 90);
            for (let i = 0; i < afterimageCount; i++) {
              const t = (i + 1) / (afterimageCount + 1);
              ds.afterimages.push({
                x: dashStartSnapshot.x + dx * t,
                y: dashStartSnapshot.y + dy * t,
                timer: mineTimer
              });
            }
          }
          // Null Wake: leave trail
          if (ds.nullWake) {
            const nullWakeLevel = this.getDashUpgradeLevelByKey('nullWake');
            const dx = dashEndSnapshot.x - dashStartSnapshot.x;
            const dy = dashEndSnapshot.y - dashStartSnapshot.y;
            const trailPoints = 8 + Math.max(0, nullWakeLevel - 1) * 2;
            const trailLife = this.getDashNullWakeLifeMs();
            for (let i = 0; i < trailPoints; i++) {
              const t = trailPoints === 1 ? 1 : i / (trailPoints - 1);
              ds.nullWakeTrail.push({
                x: dashStartSnapshot.x + dx * t,
                y: dashStartSnapshot.y + dy * t,
                life: trailLife
              });
            }
          }
        }, dashDur);
      }
    }

    this.dashSpaceWasDown = spaceDown;

    // Smooth velocity interpolation for buttery movement
    const smoothing = 0.18;
    const momentumBoost = this.dashMomentumTimer > 0
      ? 1 + this.getPermanentUpgradeLevel('perm_dash_momentum') * 0.06
      : 1;
    if (isMoving) {
      const mag = Math.sqrt(move.x * move.x + move.y * move.y);
      const targetVx = (move.x / mag) * this.player.speed * momentumBoost;
      const targetVy = (move.y / mag) * this.player.speed * momentumBoost;
      this.player.velocity.x += (targetVx - this.player.velocity.x) * smoothing;
      this.player.velocity.y += (targetVy - this.player.velocity.y) * smoothing;
      // Update target rotation for smooth turning
      this.targetRotation = Math.atan2(this.player.velocity.y, this.player.velocity.x);
    } else {
      this.player.velocity.x *= (1 - smoothing);
      this.player.velocity.y *= (1 - smoothing);
      // Snap to zero when very small to prevent drift
      if (Math.abs(this.player.velocity.x) < 0.01) this.player.velocity.x = 0;
      if (Math.abs(this.player.velocity.y) < 0.01) this.player.velocity.y = 0;
    }
  }

  updatePlayer(dt: number) {
    const dtFactor = dt / 16.67; // Normalize to ~60fps
    if (this.isDashing) {
      this.player.position.x += this.dashVelocity.x * dtFactor;
      this.player.position.y += this.dashVelocity.y * dtFactor;

      // Phase Laceration: damage enemies crossed during dash
      if (this.dashState.phaseLaceration) {
        const phaseLevel = this.getDashUpgradeLevelByKey('phaseLaceration');
        const sliceDmg = (40 + Math.max(0, phaseLevel - 1) * 18) * this.player.stats.might * this.getDashImpactMultiplier();
        const slowMult = Math.max(0.2, 0.4 - Math.max(0, phaseLevel - 1) * 0.1);
        for (const enemy of this.enemies) {
          if (enemy.id === 'dead') continue;
          const dx = this.player.position.x - enemy.position.x;
          const dy = this.player.position.y - enemy.position.y;
          const distSq = dx * dx + dy * dy;
          const touchDist = (this.player.radius + enemy.radius) * 1.5;
          if (distSq < touchDist * touchDist) {
            enemy.health -= sliceDmg * (dt / 200);
            enemy.hitFlash = 80;
            enemy.slowMultiplier = slowMult;
            if (enemy.health <= 0) this.killEnemy(enemy);
          }
        }
      }

      // Bulwark Ram: first enemy hit gets knocked back hard
      if (this.dashState.bulwarkRam && !this.dashState.bulwarkRamHit) {
        const bulwarkLevel = this.getDashUpgradeLevelByKey('bulwarkRam');
        for (const enemy of this.enemies) {
          if (enemy.id === 'dead') continue;
          const dx = this.player.position.x - enemy.position.x;
          const dy = this.player.position.y - enemy.position.y;
          const distSq = dx * dx + dy * dy;
          const touchDist = this.player.radius + enemy.radius;
          if (distSq < touchDist * touchDist) {
            this.dashState.bulwarkRamHit = true;
            const dist = Math.sqrt(distSq) || 1;
            const knockback = 20 + Math.max(0, bulwarkLevel - 1) * 7;
            enemy.velocity.x -= (dx / dist) * knockback;
            enemy.velocity.y -= (dy / dist) * knockback;
            enemy.health -= (80 + Math.max(0, bulwarkLevel - 1) * 30) * this.player.stats.might * this.getDashImpactMultiplier();
            enemy.hitFlash = 300;
            enemy.slowMultiplier = Math.max(0.05, 0.1 - Math.max(0, bulwarkLevel - 1) * 0.03); // stun-like
            this.screenShake = 10;
            this.createExplosion(enemy.position.x, enemy.position.y, '#ffaa00', 12);
            if (enemy.health <= 0) this.killEnemy(enemy);
            break;
          }
        }
      }
    } else {
      this.player.position.x += this.player.velocity.x * dtFactor;
      this.player.position.y += this.player.velocity.y * dtFactor;
    }

    // EXFILL IS NOW HANDLED IN UI between waves

    this.updateCameraPosition();
  }

  triggerExfill() {
    this.gameState = 'MENU';
    this.onExfill(this.player.coins, this.player.level);
  }

  exitShop() {
    this.gameState = 'PLAYING';
    this.paused = false;
    this.lastTime = performance.now();
    this.keys.clear();
    this.requestUpdate();
  }

  abortExfill() {
    // Current wave-based exfill doesn't require a stateful abort on the engine.
    // This is a stub to satisfy EventManager calls.
  }

  updatePortal(dt: number) {
    // Portal is permanent, no need to spawn it
  }

  updateEnemies(dt: number) {
    const dtFactor = dt / 16.67; // Normalize to ~60fps
    for (const enemy of this.enemies) {
      if (enemy.id === 'dead') continue;

      // Loot crates are stationary world objects and should never path toward the player.
      if ((enemy as any).isHolder) {
        enemy.velocity.x *= 0.9;
        enemy.velocity.y *= 0.9;
        enemy.position.x += enemy.velocity.x * dtFactor;
        enemy.position.y += enemy.velocity.y * dtFactor;
        continue;
      }
      
      const dx = this.player.position.x - enemy.position.x;
      const dy = this.player.position.y - enemy.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue; // Prevent division by zero
      
      // Hit flash decay
      if (enemy.hitFlash && enemy.hitFlash > 0) {
        enemy.hitFlash -= dt;
      }
      
      // Apply slow decay
      if (enemy.slowMultiplier && enemy.slowMultiplier < 1) {
        enemy.slowMultiplier += dt * 0.001; // Recover over 1 second
        if (enemy.slowMultiplier > 1) enemy.slowMultiplier = 1;
      }
      
      const slowMultiplier = enemy.slowMultiplier || 1;
      // Cap speed scaling to a max of 2.0x, softly scaling with difficulty
      const speedScale = enemy.type === 'boss' ? 1 : Math.min(2.0, 1 + (this.difficultyMultiplier - 1) * 0.2);
      const baseSpeed = enemy.speed * speedScale;
      const timeWarpFactor = Math.max(0.3, 1 - this.player.stats.timeWarp);
      let effectiveSpeed = baseSpeed * slowMultiplier * timeWarpFactor;

      // Event enemies and bosses should never become mathematically unavoidable.
      if ((enemy as any).isEventEnemy || enemy.type === 'boss') {
        effectiveSpeed = Math.min(effectiveSpeed, this.player.speed * 0.95);
      }
      
      // Move towards player
      const targetVx = (dx / dist) * effectiveSpeed;
      const targetVy = (dy / dist) * effectiveSpeed;
      
      // Apply existing velocity (which might include knockback) and lerp towards target velocity
      enemy.velocity.x += (targetVx - enemy.velocity.x) * 0.1;
      enemy.velocity.y += (targetVy - enemy.velocity.y) * 0.1;
      
      enemy.position.x += enemy.velocity.x * dtFactor;
      enemy.position.y += enemy.velocity.y * dtFactor;
    }
  }

  updateProjectiles(dt: number) {
    const dtFactor = dt / 16.67;

    // Reset hitEnemies for projectiles with damage tick intervals (e.g. gravity well, frost aura)
    for (const p of this.projectiles) {
      if (p.damageTickInterval && p.hitEnemies && p.lastDamageTick !== undefined) {
        if (this.gameTime - p.lastDamageTick >= p.damageTickInterval) {
          p.hitEnemies.clear();
          p.lastDamageTick = this.gameTime;
        }
      }
    }

    this.projectiles = this.projectiles.filter(p => {
      // Nano Swarm Homing
      if (p.id === 'nano') {
        let nearest: Enemy | null = null;
        let minDist = Infinity;
        for (const enemy of this.enemies) {
          if (enemy.id === 'dead') continue;
          const dx = enemy.position.x - p.position.x;
          const dy = enemy.position.y - p.position.y;
          const dist = dx * dx + dy * dy;
          if (dist < minDist && dist < 100000) { // 316px radius
            minDist = dist;
            nearest = enemy;
          }
        }
        if (nearest) {
          const dx = nearest.position.x - p.position.x;
          const dy = nearest.position.y - p.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const currentSpeed = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y);
          const targetVx = (dx / dist) * currentSpeed;
          const targetVy = (dy / dist) * currentSpeed;
          p.velocity.x += (targetVx - p.velocity.x) * 0.1 * dtFactor; // Steering force
          p.velocity.y += (targetVy - p.velocity.y) * 0.1 * dtFactor;
        }
      }
      
      // Gravity Well Pull
      if (p.id === 'gravity_well') {
        for (const enemy of this.enemies) {
          if (enemy.id === 'dead' || enemy.type === 'boss' || enemy.type === 'titan') continue;
          const dx = p.position.x - enemy.position.x;
          const dy = p.position.y - enemy.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < p.radius && dist > 10) {
            const pullForce = (1 - dist / p.radius) * 2;
            enemy.velocity.x += (dx / dist) * pullForce * dtFactor;
            enemy.velocity.y += (dy / dist) * pullForce * dtFactor;
          }
        }
      }
      
      // Mirror Shard Ricochet (bounce off visible screen edges + margin)
      if (p.id === 'mirror_shard' && p.penetration > 0) {
        const screenMargin = 100;
        const viewportWidth = this.getViewportWorldWidth();
        const viewportHeight = this.getViewportWorldHeight();
        const left = this.camera.x - screenMargin;
        const right = this.camera.x + viewportWidth + screenMargin;
        const top = this.camera.y - screenMargin;
        const bottom = this.camera.y + viewportHeight + screenMargin;
        
        let bounced = false;
        if (p.position.x < left) { p.position.x = left; p.velocity.x *= -1; p.rotation = Math.atan2(p.velocity.y, p.velocity.x); bounced = true; }
        else if (p.position.x > right) { p.position.x = right; p.velocity.x *= -1; p.rotation = Math.atan2(p.velocity.y, p.velocity.x); bounced = true; }
        
        if (p.position.y < top) { p.position.y = top; p.velocity.y *= -1; p.rotation = Math.atan2(p.velocity.y, p.velocity.x); bounced = true; }
        else if (p.position.y > bottom) { p.position.y = bottom; p.velocity.y *= -1; p.rotation = Math.atan2(p.velocity.y, p.velocity.x); bounced = true; }
        
        if (bounced) p.penetration--;
      }
      
      p.position.x += p.velocity.x * dtFactor;
      p.position.y += p.velocity.y * dtFactor;
      this.clampProjectileRadius(p);
      p.duration -= dt;
      return p.duration > 0;
    });
  }

  updateGems(dt: number) {
    for (const gem of this.gems) {
      const dx = this.player.position.x - gem.position.x;
      const dy = this.player.position.y - gem.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const magnetRange = 200 * this.player.stats.magnet_range;
      if (dist < magnetRange) {
        const speed = 8;
        gem.position.x += (dx / dist) * speed;
        gem.position.y += (dy / dist) * speed;
      }
      
      if (dist < this.player.radius + 10) {
        this.collectGem(gem);
        gem.id = 'collected';
        if (this.gameState !== 'PLAYING') {
          break;
        }
      }
    }
    this.gems = this.gems.filter(g => g.id !== 'collected');
  }

  updateItems(dt: number) {
    for (const item of this.items) {
      const dx = this.player.position.x - item.position.x;
      const dy = this.player.position.y - item.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const magnetRange = 150 * this.player.stats.magnet_range;
      if (dist < magnetRange) {
        const speed = 6;
        item.position.x += (dx / dist) * speed;
        item.position.y += (dy / dist) * speed;
      }

      if (dist < this.player.radius + 15) {
        this.collectItem(item);
        item.id = 'collected';
      }
    }
    this.items = this.items.filter(i => i.id !== 'collected');
  }

  updateTreasures(dt: number) {
    for (const treasure of this.treasures) {
      const dx = this.player.position.x - treasure.position.x;
      const dy = this.player.position.y - treasure.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Ambient sparkle particles
      const elapsed = performance.now() - treasure.spawnTime;
      if (elapsed > 400 && Math.random() < 0.15) {
        const sparkAngle = Math.random() * Math.PI * 2;
        const sparkDist = Math.random() * 22;
        const colors = treasure.tier === 'legendary' ? ['#ffe066', '#fff', '#ffaa00', '#ff66cc'] :
                        treasure.tier === 'epic' ? ['#c084fc', '#e9d5ff', '#a855f7', '#fff'] :
                        ['#ffd700', '#fff8dc', '#ffec8b', '#fff'];
        this.particles.push({
          x: treasure.position.x + Math.cos(sparkAngle) * sparkDist,
          y: treasure.position.y - 10 + Math.sin(sparkAngle) * sparkDist,
          vx: (Math.random() - 0.5) * 0.04,
          vy: -0.03 - Math.random() * 0.04,
          life: 600 + Math.random() * 400,
          maxLife: 1000,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: Math.random() * 2.5 + 0.5
        });
      }

      if (dist < this.player.radius + 28) {
        this.collectTreasure(treasure);
        treasure.id = 'collected';
      }
    }
    this.treasures = this.treasures.filter(t => t.id !== 'collected');
  }

  collectItem(item: WorldItem) {
    soundManager.playCollect();
    if (item.type === 'hp') {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + item.value);
    } else if (item.type.startsWith('coin')) {
      this.player.coins += Math.floor(item.value * this.player.stats.greed * this.balanceTuning.goldGainMultiplier);
      this.damageTexts.push({
        x: this.player.position.x,
        y: this.player.position.y - 20,
        text: `+${Math.floor(item.value * this.player.stats.greed * this.balanceTuning.goldGainMultiplier)}`,
        life: 1000,
        maxLife: 1000,
        color: '#ffd700'
      });
    } else if (item.type === 'magnet') {
      this.gems.forEach(gem => {
        this.collectGem(gem);
        gem.id = 'collected';
      });
    } else if (item.type === 'bomb') {
      this.enemies.forEach(e => {
        e.health -= 100;
        if (e.health <= 0) this.killEnemy(e);
      });
    } else if (item.type === 'data_core') {
      this.player.pendingDataCores += 1;
      this.damageTexts.push({
        x: this.player.position.x,
        y: this.player.position.y - 40,
        text: "+1 DATA CORE",
        life: 2000,
        maxLife: 2000,
        color: '#fff'
      });
    }
  }

  collectTreasure(treasure: Treasure) {
    soundManager.playLevelUp();
    this.gameState = 'TREASURE';

    // Explosion of sparkles on pickup
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 0.3 + 0.05;
      const colors = treasure.tier === 'legendary' ? ['#ffe066', '#fff', '#ffaa00', '#ff66cc'] :
                      treasure.tier === 'epic' ? ['#c084fc', '#e9d5ff', '#a855f7', '#fff'] :
                      ['#ffd700', '#fff8dc', '#ffec8b', '#fff'];
      this.particles.push({
        x: treasure.position.x,
        y: treasure.position.y - 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 800 + Math.random() * 600,
        maxLife: 1400,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 4 + 1
      });
    }
    this.screenShake = 6;

    // Bonus gold and XP based on tier
    const tierBonuses = {
      rare:      { coins: 50,  xp: 100 },
      epic:      { coins: 150, xp: 300 },
      legendary: { coins: 500, xp: 800 }
    };
    const bonus = tierBonuses[treasure.tier];
    this.player.coins += Math.floor(bonus.coins * this.player.stats.greed * this.balanceTuning.goldGainMultiplier);
    this.player.experience += bonus.xp * this.getEffectiveXPMultiplier() * this.balanceTuning.treasureXPGainMultiplier;
    this.processPendingXPLevelUps();
    this.damageTexts.push({
      x: treasure.position.x, y: treasure.position.y - 40,
      text: `+${Math.floor(bonus.coins * this.player.stats.greed * this.balanceTuning.goldGainMultiplier)} GOLD`,
      life: 2000, maxLife: 2000, color: '#ffd700'
    });

    // Pick upgrade from tier-appropriate pool
    let pool;
    if (treasure.tier === 'legendary') {
      pool = UPGRADES.filter(u => u.rarity === 'legendary');
    } else if (treasure.tier === 'epic') {
      pool = UPGRADES.filter(u => u.rarity === 'legendary' || u.rarity === 'rare');
    } else {
      pool = UPGRADES.filter(u => u.rarity === 'rare' || u.rarity === 'legendary');
    }
    const randomUpgrade = pool[Math.floor(Math.random() * pool.length)];

    this.onTreasure({ ...randomUpgrade, _treasureTier: treasure.tier, _bonusCoins: Math.floor(bonus.coins * this.player.stats.greed * this.balanceTuning.goldGainMultiplier), _bonusXP: bonus.xp });
  }

  collectGem(gem: ExperienceGem) {
    this.player.experience += gem.value * this.getEffectiveXPMultiplier();
    soundManager.playCollect();
    this.processPendingXPLevelUps();
  }

  levelUp(reason: 'wave' | 'xp' | 'free' = 'wave') {
    if (reason !== 'xp') {
      // Wave/free level-ups remain manual so reroll/banish/skip UI flow is preserved.
      this.player.level++;
      this.player.experienceToNextLevel = this.getXPRequiredForLevel(this.player.level);
      this.gameState = 'LEVEL_UP';
      soundManager.playLevelUp();

      const options = this.generateUpgrades();
      this.onLevelUp(options);
      return;
    }

    if (this.player.experience < this.player.experienceToNextLevel) return;
    this.player.experience -= this.player.experienceToNextLevel;

    this.player.level++;
    this.player.experienceToNextLevel = this.getXPRequiredForLevel(this.player.level);
    soundManager.playLevelUp();

    if (this.queuedAutoSkips > 0) {
      this.queuedAutoSkips--;
      const xpReward = 20 * this.player.level * this.getEffectiveXPMultiplier();
      this.player.experience += xpReward;
      this.recentSystemNotice = {
        text: `AUTO SKIP USED (+${Math.floor(xpReward)} XP)`,
        color: '#22d3ee',
        expiresAt: this.gameTime + 2200,
      };

      this.lastTime = performance.now();
      this.requestUpdate();
      return;
    }

    const useRerollBoost = this.queuedAutoRerolls > 0;
    if (useRerollBoost) {
      this.queuedAutoRerolls--;
    }

    const selected = useRerollBoost
      ? this.chooseAutoUpgradeWithRerollBoost()
      : this.chooseAutoUpgrade();
    this.applyUpgrade(selected, { auto: true, skipResume: true });

    if (selected.type === 'dash') {
      this.autoUpgradeNoDashStreak = 0;
    } else {
      this.autoUpgradeNoDashStreak++;
    }

    this.lastAutoUpgradeId = selected.id;
    this.recentAutoUpgrade = {
      id: selected.id,
      name: selected.name,
      type: selected.type,
      rarity: selected.rarity,
      expiresAt: this.gameTime + 2400,
    };

    if (useRerollBoost) {
      this.recentSystemNotice = {
        text: 'AUTO REROLL BOOST APPLIED',
        color: '#a78bfa',
        expiresAt: this.gameTime + 1800,
      };
    }

    if (this.gameState !== 'GAME_OVER' && this.gameState !== 'TREASURE' && this.gameState !== 'SHOP') {
      this.gameState = 'PLAYING';
    }
    this.lastTime = performance.now();
    this.requestUpdate();
  }

  generateUpgrades(isTreasure: boolean = false) {
    const pool = this.buildUpgradePool();

    const selected: any[] = [];
    const count = isTreasure ? 3 : 3;
    
    while (selected.length < count && pool.length > 0) {
      const totalWeight = pool.reduce((sum, item) => sum + this.getUpgradeWeight(item), 0);
      let r = Math.random() * totalWeight;
      for (let i = 0; i < pool.length; i++) {
        r -= this.getUpgradeWeight(pool[i]);
        if (r <= 0) {
          selected.push(pool.splice(i, 1)[0]);
          break;
        }
      }
    }

    if (!isTreasure) {
      selected.push({
        id: 'full_heal',
        name: 'Full Repair',
        description: 'Fully restores health without improving stats or weapons.',
        type: 'heal',
        icon: 'heart',
        rarity: 'common'
      });
    }

    return selected;
  }

  getQueuedAutoSkips() {
    return this.queuedAutoSkips;
  }

  getQueuedAutoRerolls() {
    return this.queuedAutoRerolls;
  }

  rerollUpgrades() {
    const rerollCost = this.getRerollCost();
    if (rerollCost !== null && this.player.coins >= rerollCost) {
      soundManager.playUIClick();
      this.player.coins -= rerollCost;
      this.player.rerollsThisWave++;
      return this.generateUpgrades();
    }
    return [];
  }

  getRerollCost() {
    if (this.player.rerollsThisWave >= this.MAX_REROLLS_PER_WAVE) {
      return null;
    }

    return this.REROLL_COSTS[this.player.rerollsThisWave] ?? this.REROLL_COSTS[this.REROLL_COSTS.length - 1];
  }

  getRemainingRerollsThisWave() {
    return Math.max(0, this.MAX_REROLLS_PER_WAVE - this.player.rerollsThisWave);
  }

  queueAutoReroll() {
    const rerollCost = this.getRerollCost();
    if (rerollCost === null || this.player.coins < rerollCost) {
      return false;
    }

    this.player.coins -= rerollCost;
    this.player.rerollsThisWave++;
    this.queuedAutoRerolls++;
    soundManager.playUIClick();
    this.recentSystemNotice = {
      text: `AUTO REROLL ARMED (-${rerollCost} COINS)`,
      color: '#a78bfa',
      expiresAt: this.gameTime + 2200,
    };
    return true;
  }

  queueAutoSkip() {
    if (this.player.skips <= 0) {
      return false;
    }
    this.player.skips--;
    this.queuedAutoSkips++;
    soundManager.playUIClick();
    this.recentSystemNotice = {
      text: 'AUTO SKIP ARMED',
      color: '#22d3ee',
      expiresAt: this.gameTime + 2200,
    };
    return true;
  }

  banishLastAutoUpgrade() {
    if (this.player.banishes <= 0 || !this.lastAutoUpgradeId) {
      return false;
    }
    this.player.banishes--;
    this.player.bannedUpgrades.add(this.lastAutoUpgradeId);
    soundManager.playUIClick();
    this.recentSystemNotice = {
      text: `BANISHED: ${this.lastAutoUpgradeId.toUpperCase()}`,
      color: '#fb7185',
      expiresAt: this.gameTime + 2400,
    };
    return true;
  }

  banishUpgrade(upgradeId: string) {
    if (this.player.banishes > 0) {
      soundManager.playUIClick();
      this.player.banishes--;
      this.player.bannedUpgrades.add(upgradeId);
      return this.generateUpgrades();
    }
    return [];
  }

  skipUpgrades() {
    if (this.player.skips > 0) {
      soundManager.playUIClick();
      this.player.skips--;
      // Grant a small XP reward based on level
      const xpReward = 20 * this.player.level * this.getEffectiveXPMultiplier();
      this.player.experience += xpReward;
      this.gameState = 'PLAYING';
      this.lastTime = performance.now();
      this.requestUpdate();
      return true;
    }
    return false;
  }

  applyUpgrade(upgrade: any, options: { auto?: boolean; skipResume?: boolean } = {}) {
    if (!options.auto) {
      soundManager.playUIClick();
    }
    if (upgrade.type === 'stat') {
      const existing = this.player.upgrades.find(u => u.id === upgrade.id);
      if (!existing) {
        this.player.upgrades.push({ ...upgrade, level: 1 } as any);
      } else {
        (existing as any).level = ((existing as any).level || 1) + 1;
      }

      if (upgrade.id === 'cooldown') {
        this.player.stats.cooldown *= 0.9;
      } else if (upgrade.id === 'amount') {
        this.player.stats.amount += 1;
      } else if (upgrade.id === 'health') {
        this.player.maxHealth *= 1.2;
        this.player.health = this.player.maxHealth;
      } else if (upgrade.id === 'regen') {
        this.player.stats.regen = (this.player.stats.regen || 0) + 1;
      } else if (upgrade.id === 'magnet_range') {
        this.player.stats.magnet_range += 0.25;
      } else if (upgrade.id === 'god_mode') {
        if (!this.godModeActive) {
          this.godModeActive = true;
          this.player.stats.might += 0.5;
          this.player.stats.area += 0.5;
          this.player.stats.cooldown *= 0.5;
          this.player.speed *= 1.3;
          this.player.stats.luck += 0.5;
        }
        this.godModeTimer = 30000;
      } else if (upgrade.id === 'instant_kill') {
        this.player.stats.luck += 0.15;
      } else if (upgrade.id === 'vampirism') {
        this.player.stats.vampirism += 3;
      } else if (upgrade.id === 'double_strike') {
        this.player.stats.might += 0.20;
      } else if (upgrade.id === 'armor') {
        this.player.stats.armor += 0.25;
      } else if (upgrade.id === 'chain_lightning') {
        this.player.stats.might += 0.10;
        this.player.stats.area += 0.15;
      } else if (upgrade.id === 'time_warp') {
        this.player.stats.timeWarp += 0.20;
      } else if (upgrade.id === 'gold_rush') {
        this.player.stats.greed += 2.0;
        // Temporary — will decay, but since we don't have a timer for this, it persists as a strong reward
      } else {
        (this.player.stats as any)[upgrade.id] += 0.15;
        if (upgrade.id === 'speed') this.player.speed += 0.3;
      }
    } else if (upgrade.type === 'heal') {
      this.player.health = this.player.maxHealth;
    } else if (upgrade.type === 'weapon') {
      const def = WEAPON_DEFINITIONS.find(d => d.id === upgrade.id)!;
      this.player.weapons.push({
        id: def.id,
        name: def.name,
        level: 1,
        maxLevel: 8,
        description: def.description,
        cooldown: def.baseCooldown,
        lastFired: 0,
        type: def.type as any
      });
    } else if (upgrade.type === 'weapon_upgrade') {
      const weapon = this.player.weapons.find(w => w.id === upgrade.id)!;
      weapon.level++;
      weapon.cooldown *= 0.9;
      // Evolve weapon at max level
      if (weapon.level >= weapon.maxLevel) {
        const def = WEAPON_DEFINITIONS.find(d => d.id === weapon.id);
        if (def?.evolution) {
          weapon.name = def.evolution.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          weapon.cooldown *= 0.6;
        }
      }
    } else if (upgrade.type === 'dash') {
      // Map dash_snake_case id to camelCase dashState key
      const rawKey = upgrade.id.replace('dash_', '');
      const camelKey = rawKey.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()) as keyof DashState;
      const maxLevel = this.getDashUpgradeMaxLevel();
      const currentLevel = this.getDashUpgradeLevel(upgrade.id);
      const nextLevel = Math.min(maxLevel, currentLevel + 1);
      (this.dashState as any)[camelKey] = nextLevel;

      const existingDashUpgrade = this.player.upgrades.find(u => u.id === upgrade.id);
      if (existingDashUpgrade) {
        (existingDashUpgrade as any).level = nextLevel;
      } else {
        this.player.upgrades.push({ ...upgrade, level: nextLevel, maxLevel } as any);
      }

      // Twin Vector: each level grants +1 dash charge capacity
      if (upgrade.id === 'dash_twin_vector') {
        this.syncDashChargeCapacity();
        this.dashState.dashCharges = this.dashState.maxDashCharges;
      }
    }

    if (!options.skipResume) {
      this.gameState = 'PLAYING';
      this.lastTime = performance.now();
      this.requestUpdate();
    }
  }

  updateWeapons(time: number) {
    for (const weapon of this.player.weapons) {
      // Handle burst firing
      if (weapon.burstRemaining && weapon.burstRemaining > 0) {
        if (time - weapon.lastFired >= (weapon.burstDelay || 200)) {
          this.fireWeapon(weapon, time, true);
          weapon.burstRemaining--;
        }
      } else if (time - weapon.lastFired >= weapon.cooldown * this.player.stats.cooldown * (this.isOverdrive ? 0.4 : 1)) {
        // Update burstCount for plasma_gun based on player stats
        if (weapon.id === 'plasma_gun') {
          weapon.burstCount = 2 + (this.player.stats.amount || 0); // Start with 2 shots, scale with amount
          weapon.burstDelay = 120; // Snappier burst
        }

        this.fireWeapon(weapon, time, false);
        if (weapon.burstCount && weapon.burstCount > 1) {
          weapon.burstRemaining = weapon.burstCount - 1;
        }
      }
    }
  }

  fireWeapon(weapon: Weapon, time: number, isBurst: boolean = false) {
    weapon.lastFired = time;
    const count = 1 + (isBurst ? 0 : this.player.stats.amount);
    const levelMult = 1 + (weapon.level - 1) * 0.2;
    
    const initialProjectileCount = this.projectiles.length;

    if (weapon.id === 'plasma_gun') {
      soundManager.playShoot();
      // Find nearest enemy
      let nearest: Enemy | null = null;
      let minDist = Infinity;
      const LOCKON_RANGE = 400 * this.player.stats.area;
      for (const enemy of this.enemies) {
        const dx = enemy.position.x - this.player.position.x;
        const dy = enemy.position.y - this.player.position.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          nearest = enemy;
        }
      }

      let dir;
      if (nearest && minDist < LOCKON_RANGE * LOCKON_RANGE) {
        dir = { x: nearest.position.x - this.player.position.x, y: nearest.position.y - this.player.position.y };
      } else {
        const randomAngle = Math.random() * Math.PI * 2;
        dir = { x: Math.cos(randomAngle), y: Math.sin(randomAngle) };
      }
      
      const mag = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
      const norm = { x: dir.x / mag, y: dir.y / mag };

      // Add a small muzzle flash effect
      this.ctx.save();
      this.ctx.translate(this.player.position.x, this.player.position.y);
      this.ctx.rotate(Math.atan2(norm.y, norm.x));
      this.ctx.fillStyle = 'rgba(0, 255, 255, 0.6)';
      this.ctx.beginPath();
      this.ctx.moveTo(15, 0);
      this.ctx.lineTo(30, -10);
      this.ctx.lineTo(30, 10);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();

      const shotsToFire = 1; 

      for (let i = 0; i < shotsToFire; i++) {
        const spread = (Math.random() - 0.5) * 0.05; // Reduced spread for precision
        const vx = (norm.x * Math.cos(spread) - norm.y * Math.sin(spread)) * 15; // Faster projectile
        const vy = (norm.x * Math.sin(spread) + norm.y * Math.cos(spread)) * 15;

        this.projectiles.push({
          id: Math.random().toString(),
          position: { ...this.player.position },
          velocity: { x: vx, y: vy },
          rotation: Math.atan2(vy, vx),
          radius: 12 * this.player.stats.area * levelMult,
          health: 1,
          maxHealth: 1,
          color: '#00ffff',
          damage: 15 * this.player.stats.might * levelMult,
          duration: 1500,
          ownerId: 'player',
          penetration: 1
        });
      }
    } else if (weapon.id === 'orbit_drones') {
      const orbitCount = 2 + this.player.stats.amount;
      for (let i = 0; i < orbitCount; i++) {
        const angle = (time / 500) + (i * (Math.PI * 2 / orbitCount));
        const orbitRadius = 100 * this.player.stats.area;
        this.projectiles.push({
          id: 'orbit',
          position: {
            x: this.player.position.x + Math.cos(angle) * orbitRadius,
            y: this.player.position.y + Math.sin(angle) * orbitRadius
          },
          velocity: { x: 0, y: 0 },
          radius: 15 * this.player.stats.area * levelMult,
          health: 1,
          maxHealth: 1,
          color: '#ff00ff',
          damage: 8 * this.player.stats.might * levelMult,
          duration: 50,
          ownerId: 'player',
          penetration: 999
        });
      }
    } else if (weapon.id === 'neon_shards') {
      // Find nearest enemy
      let nearest: Enemy | null = null;
      let minDist = Infinity;
      for (const enemy of this.enemies) {
        const dx = enemy.position.x - this.player.position.x;
        const dy = enemy.position.y - this.player.position.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          nearest = enemy;
        }
      }

      if (nearest) {
        soundManager.playShoot();
        const dx = nearest.position.x - this.player.position.x;
        const dy = nearest.position.y - this.player.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const vx = (dx / dist) * 8;
        const vy = (dy / dist) * 8;

        for (let i = 0; i < count; i++) {
          const spread = (Math.random() - 0.5) * 0.2;
          this.projectiles.push({
            id: Math.random().toString(),
            position: { ...this.player.position },
            velocity: { 
              x: vx * Math.cos(spread) - vy * Math.sin(spread), 
              y: vx * Math.sin(spread) + vy * Math.cos(spread) 
            },
            radius: 8 * this.player.stats.area * levelMult,
            health: 1,
            maxHealth: 1,
            color: '#ffff00',
            damage: 20 * this.player.stats.might * levelMult,
            duration: 2000,
            ownerId: 'player',
            penetration: 1
          });
        }
      }
    } else if (weapon.id === 'void_aura') {
      this.projectiles.push({
        id: 'aura',
        position: { ...this.player.position },
        velocity: { x: 0, y: 0 },
        radius: 120 * this.player.stats.area * levelMult,
        health: 1,
        maxHealth: 1,
        color: 'rgba(136, 0, 255, 0.2)',
        damage: 12 * this.player.stats.might * levelMult,
        duration: 100,
        ownerId: 'player',
        penetration: 999,
        hitEnemies: new Set<string>()
      });
    } else if (weapon.id === 'neural_pulse') {
      soundManager.playExplosion();
      this.projectiles.push({
        id: 'pulse',
        position: { ...this.player.position },
        velocity: { x: 0, y: 0 },
        radius: 150 * this.player.stats.area * levelMult,
        health: 1,
        maxHealth: 1,
        color: 'rgba(0, 255, 255, 0.3)',
        damage: 25 * this.player.stats.might * levelMult,
        duration: 300,
        ownerId: 'player',
        penetration: 999,
        hitEnemies: new Set<string>()
      });
    } else if (weapon.id === 'data_scythe') {
      const orbitCount = 1 + this.player.stats.amount;
      for (let i = 0; i < orbitCount; i++) {
        const angle = (time / 300) + (i * (Math.PI * 2 / orbitCount));
        const orbitRadius = 150 * this.player.stats.area;
        this.projectiles.push({
          id: 'scythe',
          position: {
            x: this.player.position.x + Math.cos(angle) * orbitRadius,
            y: this.player.position.y + Math.sin(angle) * orbitRadius
          },
          velocity: { x: 0, y: 0 },
          radius: 20 * this.player.stats.area * levelMult,
          health: 1,
          maxHealth: 1,
          color: '#ff0000',
          damage: 6 * this.player.stats.might * levelMult,
          duration: 50,
          ownerId: 'player',
          penetration: 999
        });
      }
    } else if (weapon.id === 'cyber_blade') {
      soundManager.playSlash();
      
      // Targeting: Use last movement direction, or nearest enemy if standing still
      let angle;
      if (this.player.velocity.x === 0 && this.player.velocity.y === 0) {
        // Find nearest enemy
        let nearest: Enemy | null = null;
        let minDist = Infinity;
        for (const enemy of this.enemies) {
          const dx = enemy.position.x - this.player.position.x;
          const dy = enemy.position.y - this.player.position.y;
          const d = dx * dx + dy * dy;
          if (d < minDist) { minDist = d; nearest = enemy; }
        }
        if (nearest) {
          angle = Math.atan2(nearest.position.y - this.player.position.y, nearest.position.x - this.player.position.x);
        } else {
          angle = this.player.rotation || 0;
        }
      } else {
        angle = Math.atan2(this.player.velocity.y, this.player.velocity.x);
      }

      const radius = 100 * this.player.stats.area * levelMult;
      
      // Create the main blade "swipe" projectile
      this.projectiles.push({
        id: 'blade',
        position: {
          x: this.player.position.x + Math.cos(angle) * (radius * 0.4),
          y: this.player.position.y + Math.sin(angle) * (radius * 0.4)
        },
        velocity: { x: 0, y: 0 },
        rotation: angle,
        radius: radius,
        health: 1,
        maxHealth: 1,
        color: '#00ffff', // Neon Cyan
        damage: 45 * this.player.stats.might * levelMult,
        duration: 200,
        ownerId: 'player',
        penetration: 999,
        hitEnemies: new Set<string>()
      });

      // Add spark particles in the swipe direction
      for (let i = 0; i < 8; i++) {
        const pAngle = angle + (Math.random() - 0.5) * 1.5;
        const speed = 2 + Math.random() * 4;
        this.particles.push({
          x: this.player.position.x + Math.cos(angle) * 20,
          y: this.player.position.y + Math.sin(angle) * 20,
          vx: Math.cos(pAngle) * speed,
          vy: Math.sin(pAngle) * speed,
          life: 400 + Math.random() * 200,
          maxLife: 600,
          color: i % 2 === 0 ? '#00ffff' : '#fff',
          size: 1 + Math.random() * 2
        });
      }
    } else if (weapon.id === 'sonic_boom') {
      soundManager.playShoot();
      let nearest: Enemy | null = null;
      let minDist = Infinity;
      for (const enemy of this.enemies) {
        if (enemy.id === 'dead') continue;
        const dx = enemy.position.x - this.player.position.x;
        const dy = enemy.position.y - this.player.position.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) { minDist = dist; nearest = enemy; }
      }
      const angle = nearest
        ? Math.atan2(nearest.position.y - this.player.position.y, nearest.position.x - this.player.position.x)
        : Math.random() * Math.PI * 2;
      this.projectiles.push({
        id: 'sonic',
        position: { ...this.player.position },
        velocity: { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 },
        radius: 80 * this.player.stats.area * levelMult,
        health: 1,
        maxHealth: 1,
        color: 'rgba(255, 255, 255, 0.2)',
        damage: 15 * this.player.stats.might * levelMult,
        duration: 500,
        ownerId: 'player',
        penetration: 5
      });
    } else if (weapon.id === 'nano_swarm') {
      soundManager.playShoot();
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        this.projectiles.push({
          id: 'nano',
          position: { ...this.player.position },
          velocity: { x: Math.cos(angle) * 5, y: Math.sin(angle) * 5 },
          radius: 10 * this.player.stats.area * levelMult,
          health: 1,
          maxHealth: 1,
          color: '#00ff88',
          damage: 10 * this.player.stats.might * levelMult,
          duration: 3000,
          ownerId: 'player',
          penetration: 1
        });
      }
    } else if (weapon.id === 'phantom_chain') {
      // Chain lightning — bounces between enemies
      soundManager.playShoot();
      const maxBounces = 3 + Math.floor(this.player.stats.amount) + Math.floor(weapon.level / 2);
      const chainRange = 250 * this.player.stats.area;
      const hitEnemies: Set<string> = new Set();
      let currentPos = { ...this.player.position };
      let lastPos = { ...this.player.position };

      for (let bounce = 0; bounce < maxBounces; bounce++) {
        let nearest: Enemy | null = null;
        let nearestDist = Infinity;
        for (const enemy of this.enemies) {
          if (hitEnemies.has(enemy.id) || enemy.id === 'dead') continue;
          const dx = enemy.position.x - currentPos.x;
          const dy = enemy.position.y - currentPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < nearestDist && dist < chainRange) {
            nearestDist = dist;
            nearest = enemy;
          }
        }
        if (!nearest) break;
        hitEnemies.add(nearest.id);

        // Create a lightning bolt projectile between lastPos and nearest
        const midX = (lastPos.x + nearest.position.x) / 2;
        const midY = (lastPos.y + nearest.position.y) / 2;
        this.projectiles.push({
          id: 'chain_bolt',
          position: { x: midX, y: midY },
          velocity: { x: 0, y: 0 },
          radius: nearestDist / 2 + 10,
          health: 1, maxHealth: 1,
          color: `hsl(${200 + bounce * 30}, 100%, 70%)`,
          damage: 22 * this.player.stats.might * levelMult * (1 - bounce * 0.1),
          duration: 200,
          ownerId: 'player',
          penetration: 999,
          rotation: Math.atan2(nearest.position.y - lastPos.y, nearest.position.x - lastPos.x),
          hitEnemies: new Set<string>()
        });

        // Also spawn jagged lightning particles
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const px = lastPos.x + (nearest.position.x - lastPos.x) * t + (Math.random() - 0.5) * 20;
          const py = lastPos.y + (nearest.position.y - lastPos.y) * t + (Math.random() - 0.5) * 20;
          this.particles.push({
            x: px, y: py,
            vx: (Math.random() - 0.5) * 0.1,
            vy: (Math.random() - 0.5) * 0.1,
            life: 300,
            maxLife: 300,
            color: `hsl(${190 + Math.random() * 40}, 100%, ${70 + Math.random() * 30}%)`,
            size: 2 + Math.random() * 3
          });
        }

        lastPos = { ...nearest.position };
        currentPos = { ...nearest.position };
      }
    } else if (weapon.id === 'gravity_well') {
      // Black hole vortex — sucks enemies in
      soundManager.playExplosion();
      const wellRadius = 200 * this.player.stats.area * levelMult;
      const angle = Math.random() * Math.PI * 2;
      const dist = 150 + Math.random() * 100;
      const wellPos = {
        x: this.player.position.x + Math.cos(angle) * dist,
        y: this.player.position.y + Math.sin(angle) * dist
      };

      // Main gravity well projectile
      this.projectiles.push({
        id: 'gravity_well',
        position: { ...wellPos },
        velocity: { x: 0, y: 0 },
        radius: wellRadius,
        health: 1, maxHealth: 1,
        color: 'rgba(80, 0, 180, 0.3)',
        damage: 15 * this.player.stats.might * levelMult,
        duration: 3000,
        ownerId: 'player',
        penetration: 999,
        hitEnemies: new Set<string>(),
        damageTickInterval: 500,
        lastDamageTick: this.gameTime
      });

      // Spiral accretion particles
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = wellRadius * (0.3 + Math.random() * 0.7);
        this.particles.push({
          x: wellPos.x + Math.cos(a) * r,
          y: wellPos.y + Math.sin(a) * r,
          vx: Math.cos(a + Math.PI / 2) * 0.15,
          vy: Math.sin(a + Math.PI / 2) * 0.15,
          life: 2500 + Math.random() * 500,
          maxLife: 3000,
          color: `hsl(${270 + Math.random() * 30}, 80%, ${40 + Math.random() * 30}%)`,
          size: 1 + Math.random() * 2
        });
      }
    } else if (weapon.id === 'mirror_shards') {
      // Prismatic bouncing shards
      soundManager.playShoot();
      const shardCount = 2 + this.player.stats.amount;
      for (let i = 0; i < shardCount; i++) {
        const angle = (i / shardCount) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 6 + Math.random() * 3;
        this.projectiles.push({
          id: 'mirror_shard',
          position: { ...this.player.position },
          velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          rotation: angle,
          radius: 10 * this.player.stats.area * levelMult,
          health: 1, maxHealth: 1,
          color: `hsl(${i * 60}, 100%, 70%)`,
          damage: 14 * this.player.stats.might * levelMult,
          duration: 3000,
          ownerId: 'player',
          penetration: 3 + Math.floor(weapon.level / 2)
        });
      }
    } else if (weapon.id === 'spectral_helix') {
      // Double-helix DNA spiral
      soundManager.playShoot();
      let nearest: Enemy | null = null;
      let minDist = Infinity;
      for (const enemy of this.enemies) {
        const dx = enemy.position.x - this.player.position.x;
        const dy = enemy.position.y - this.player.position.y;
        const d = dx * dx + dy * dy;
        if (d < minDist) { minDist = d; nearest = enemy; }
      }

      const baseAngle = nearest
        ? Math.atan2(nearest.position.y - this.player.position.y, nearest.position.x - this.player.position.x)
        : Math.random() * Math.PI * 2;

      const helixCount = 12 + this.player.stats.amount * 4;
      for (let i = 0; i < helixCount; i++) {
        const t = i / helixCount;
        const helixAngle = t * Math.PI * 4; // 2 full twists
        const spreadDist = t * 350 * this.player.stats.area;
        const helixOffset = Math.sin(helixAngle) * 30 * this.player.stats.area;
        const perpAngle = baseAngle + Math.PI / 2;

        // Strand 1
        this.projectiles.push({
          id: 'helix',
          position: {
            x: this.player.position.x + Math.cos(baseAngle) * spreadDist + Math.cos(perpAngle) * helixOffset,
            y: this.player.position.y + Math.sin(baseAngle) * spreadDist + Math.sin(perpAngle) * helixOffset
          },
          velocity: { x: 0, y: 0 },
          radius: 8 * this.player.stats.area * levelMult,
          health: 1, maxHealth: 1,
          color: `hsl(${180 + t * 60}, 100%, 65%)`,
          damage: 20 * this.player.stats.might * levelMult * 0.3,
          duration: 400 + t * 200,
          ownerId: 'player',
          penetration: 999,
          hitEnemies: new Set<string>()
        });

        // Strand 2
        this.projectiles.push({
          id: 'helix',
          position: {
            x: this.player.position.x + Math.cos(baseAngle) * spreadDist - Math.cos(perpAngle) * helixOffset,
            y: this.player.position.y + Math.sin(baseAngle) * spreadDist - Math.sin(perpAngle) * helixOffset
          },
          velocity: { x: 0, y: 0 },
          radius: 8 * this.player.stats.area * levelMult,
          health: 1, maxHealth: 1,
          color: `hsl(${300 + t * 60}, 100%, 65%)`,
          damage: 20 * this.player.stats.might * levelMult * 0.3,
          duration: 400 + t * 200,
          ownerId: 'player',
          penetration: 999,
          hitEnemies: new Set<string>()
        });
      }
    } else if (weapon.id === 'void_tendrils') {
      // Dark tendrils lashing toward nearest enemies
      soundManager.playExplosion();
      const tendrilTargets = 3 + Math.floor(this.player.stats.amount);
      const sortedEnemies = [...this.enemies]
        .map(e => ({
          enemy: e,
          dist: Math.sqrt((e.position.x - this.player.position.x) ** 2 + (e.position.y - this.player.position.y) ** 2)
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, tendrilTargets);

      for (const { enemy } of sortedEnemies) {
        const segmentCount = 8;
        const dx = enemy.position.x - this.player.position.x;
        const dy = enemy.position.y - this.player.position.y;

        for (let s = 0; s < segmentCount; s++) {
          const t = (s + 1) / segmentCount;
          const wobble = Math.sin(s * 1.5) * 25 * (1 - t);
          const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;

          this.projectiles.push({
            id: 'tendril',
            position: {
              x: this.player.position.x + dx * t + Math.cos(perpAngle) * wobble,
              y: this.player.position.y + dy * t + Math.sin(perpAngle) * wobble
            },
            velocity: { x: 0, y: 0 },
            radius: (12 - s) * this.player.stats.area * levelMult,
            health: 1, maxHealth: 1,
            color: `rgba(${80 + s * 15}, 0, ${180 - s * 10}, ${0.6 - s * 0.05})`,
            damage: 35 * this.player.stats.might * levelMult / segmentCount,
            duration: 300 + s * 40,
            ownerId: 'player',
            penetration: 999,
            hitEnemies: new Set<string>()
          });
        }

        // Tendril tip explosion
        this.createExplosion(enemy.position.x, enemy.position.y, '#8b00ff', 8);
      }
    } else if (weapon.id === 'solar_flare') {
      // Directional cone of fire
      soundManager.playExplosion();
      const facing = this.player.rotation || 0;
      const coneAngle = Math.PI / 3; // 60 degree cone
      const coneLength = 250 * this.player.stats.area * levelMult;
      const rayCount = 12 + Math.floor(this.player.stats.amount) * 3;

      for (let i = 0; i < rayCount; i++) {
        const t = i / rayCount;
        const angle = facing - coneAngle / 2 + coneAngle * t;
        const dist = coneLength * (0.5 + Math.random() * 0.5);

        this.projectiles.push({
          id: 'flare',
          position: {
            x: this.player.position.x + Math.cos(angle) * dist * 0.3,
            y: this.player.position.y + Math.sin(angle) * dist * 0.3
          },
          velocity: {
            x: Math.cos(angle) * 8,
            y: Math.sin(angle) * 8
          },
          radius: (15 + Math.random() * 10) * this.player.stats.area * levelMult,
          health: 1, maxHealth: 1,
          color: `hsl(${20 + Math.random() * 30}, 100%, ${50 + Math.random() * 30}%)`,
          damage: 18 * this.player.stats.might * levelMult * 0.4,
          duration: 400 + Math.random() * 200,
          ownerId: 'player',
          penetration: 3
        });
      }

      // Core flash
      this.particles.push({
        x: this.player.position.x + Math.cos(facing) * 30,
        y: this.player.position.y + Math.sin(facing) * 30,
        vx: 0, vy: 0,
        life: 200, maxLife: 200,
        color: '#fff',
        size: 20
      });
    } else if (weapon.id === 'quantum_echo') {
      // Ghost afterimages
      soundManager.playShoot();
      const echoCount = 3 + Math.floor(this.player.stats.amount);
      for (let i = 0; i < echoCount; i++) {
        const angle = (i / echoCount) * Math.PI * 2;
        const echoDist = 80 + i * 30;
        const echoX = this.player.position.x + Math.cos(angle) * echoDist;
        const echoY = this.player.position.y + Math.sin(angle) * echoDist;

        // Echo projectile at offset
        this.projectiles.push({
          id: 'echo',
          position: { x: echoX, y: echoY },
          velocity: {
            x: Math.cos(angle + Math.PI / 2) * 3,
            y: Math.sin(angle + Math.PI / 2) * 3
          },
          radius: 22 * this.player.stats.area * levelMult,
          health: 1, maxHealth: 1,
          color: `rgba(100, 200, 255, ${0.4 - i * 0.05})`,
          damage: 12 * this.player.stats.might * levelMult,
          duration: 1500 + i * 200,
          ownerId: 'player',
          penetration: 2
        });

        // Trail particles for each echo
        for (let p = 0; p < 5; p++) {
          this.particles.push({
            x: echoX + (Math.random() - 0.5) * 15,
            y: echoY + (Math.random() - 0.5) * 15,
            vx: (Math.random() - 0.5) * 0.05,
            vy: (Math.random() - 0.5) * 0.05,
            life: 800, maxLife: 800,
            color: 'rgba(100, 200, 255, 0.5)',
            size: 1 + Math.random() * 2
          });
        }
      }
    } else if (weapon.id === 'frost_aura') {
      // Gentle pulsing cyan rings that damage and slow enemies
      soundManager.playShoot();
      const auraRadius = 200 * this.player.stats.area * levelMult;
      
      this.projectiles.push({
        id: 'frost_aura',
        position: { ...this.player.position },
        velocity: { x: 0, y: 0 },
        radius: auraRadius,
        health: 1, maxHealth: 1,
        color: 'rgba(100, 200, 255, 0.4)',
        damage: 25 * this.player.stats.might * levelMult,
        duration: 800,
        ownerId: 'player',
        penetration: 999,
        hitEnemies: new Set<string>(),
        damageTickInterval: 400,
        lastDamageTick: this.gameTime
      });

      // Soft snowflake particles
      for (let i = 0; i < 15; i++) {
        const a = Math.random() * Math.PI * 2;
        const dist = Math.random() * auraRadius;
        this.particles.push({
          x: this.player.position.x + Math.cos(a) * dist,
          y: this.player.position.y + Math.sin(a) * dist,
          vx: Math.cos(a) * 0.2,
          vy: Math.sin(a) * 0.2,
          life: 800 + Math.random() * 400,
          maxLife: 1200,
          color: 'rgba(150, 220, 255, 0.6)',
          size: 2 + Math.random() * 2
        });
      }
    } else if (weapon.id === 'stardust') {
      // Gentle falling stars from above
      soundManager.playShoot();
      const starCount = 4 + Math.floor(this.player.stats.amount);

      for (let i = 0; i < starCount; i++) {
        // Drop them randomly around the player
        const offsetX = (Math.random() - 0.5) * 400 * this.player.stats.area;
        const destY = this.player.position.y + (Math.random() - 0.5) * 300 * this.player.stats.area;
        
        // Start high up and fall down
        const startX = this.player.position.x + offsetX - 100; // slight angle
        const startY = destY - 400;

        const lifeTime = 800 + Math.random() * 200;
        const vx = (this.player.position.x + offsetX - startX) / (lifeTime / 16);
        const vy = (destY - startY) / (lifeTime / 16);

        this.projectiles.push({
          id: 'stardust',
          position: { x: startX, y: startY },
          velocity: { x: vx, y: vy },
          rotation: Math.atan2(vy, vx),
          radius: 15 * this.player.stats.area * levelMult,
          health: 1, maxHealth: 1,
          color: `hsl(${40 + Math.random() * 20}, 100%, 85%)`,
          damage: 100 * this.player.stats.might * levelMult,
          duration: lifeTime,
          ownerId: 'player',
          penetration: 2
        });
      }
    } else if (weapon.id === 'arc_weaver') {
      // Electric web between nearby enemies
      soundManager.playShoot();
      const webRadius = 350 * this.player.stats.area;
      const nearbyEnemies = this.enemies.filter(e => {
        const dx = e.position.x - this.player.position.x;
        const dy = e.position.y - this.player.position.y;
        return Math.sqrt(dx * dx + dy * dy) < webRadius;
      }).slice(0, 8 + Math.floor(this.player.stats.amount));

      // Create arc projectiles between each pair of nearby enemies
      for (let i = 0; i < nearbyEnemies.length; i++) {
        for (let j = i + 1; j < nearbyEnemies.length; j++) {
          const a = nearbyEnemies[i];
          const b = nearbyEnemies[j];
          const midX = (a.position.x + b.position.x) / 2;
          const midY = (a.position.y + b.position.y) / 2;
          const dx = b.position.x - a.position.x;
          const dy = b.position.y - a.position.y;
          const segDist = Math.sqrt(dx * dx + dy * dy);

          // Only connect if reasonably close
          if (segDist < 300) {
            this.projectiles.push({
              id: 'arc_web',
              position: { x: midX, y: midY },
              velocity: { x: 0, y: 0 },
              radius: segDist / 2,
              health: 1, maxHealth: 1,
              color: 'rgba(0, 200, 255, 0.5)',
              damage: 10 * this.player.stats.might * levelMult,
              duration: 500,
              ownerId: 'player',
              penetration: 999,
              rotation: Math.atan2(dy, dx),
              hitEnemies: new Set<string>()
            });

            // Spark particles along the arc
            for (let s = 0; s < 4; s++) {
              const t = s / 4;
              this.particles.push({
                x: a.position.x + dx * t + (Math.random() - 0.5) * 10,
                y: a.position.y + dy * t + (Math.random() - 0.5) * 10,
                vx: (Math.random() - 0.5) * 0.1,
                vy: (Math.random() - 0.5) * 0.1,
                life: 400, maxLife: 400,
                color: `hsl(${180 + Math.random() * 40}, 100%, 80%)`,
                size: 1 + Math.random() * 2
              });
            }
          }
        }
      }

      // Also damage all enemies in the web
      for (const enemy of nearbyEnemies) {
        this.projectiles.push({
          id: 'arc_zap',
          position: { ...enemy.position },
          velocity: { x: 0, y: 0 },
          radius: 25 * this.player.stats.area * levelMult,
          health: 1, maxHealth: 1,
          color: 'rgba(0, 255, 255, 0.6)',
          damage: 10 * this.player.stats.might * levelMult,
          duration: 300,
          ownerId: 'player',
          penetration: 999,
          hitEnemies: new Set<string>()
        });
      }
    }

    // Assign source weapon and clamp oversized visuals so projectiles stay readable.
    for (let i = initialProjectileCount; i < this.projectiles.length; i++) {
      this.projectiles[i].damage *= this.DEFAULT_WEAPON_DAMAGE_MULTIPLIER;
        this.projectiles[i].sourceWeaponId = weapon.id;
        this.clampProjectileRadius(this.projectiles[i]);
    }

    if (this.projectiles.length > this.MAX_PROJECTILES) {
      this.projectiles.splice(0, this.projectiles.length - this.MAX_PROJECTILES);
    }
  }

  checkCollisions(dt: number = 16.67) {
    const enemyHash = this.buildEnemySpatialHash();

    for (const projectile of this.projectiles) {
      if (projectile.penetration <= 0) continue;
      // Include enough nearby hash cells for larger AoE projectiles (e.g. gravity well).
      const candidates = this.getNearbyEnemies(projectile.position, enemyHash, projectile.radius + 48);
      for (const enemy of candidates) {
        if (enemy.id === 'dead') continue;
        // Skip enemies already hit by this projectile instance
        if (projectile.hitEnemies?.has(enemy.id)) continue;
        // Orbit weapons: per-enemy damage cooldown (300ms) to prevent per-frame damage
        if (projectile.id === 'orbit' || projectile.id === 'scythe') {
          const key = `${projectile.id}:${enemy.id}`;
          const lastHit = this.orbitDamageCooldowns.get(key);
          if (lastHit !== undefined && this.gameTime - lastHit < 300) continue;
        }
        const dx = projectile.position.x - enemy.position.x;
        const dy = projectile.position.y - enemy.position.y;
        const distSq = dx * dx + dy * dy;
        const radiusSum = projectile.radius + enemy.radius;
        if (distSq < radiusSum * radiusSum) {
          if (this.isScreenBoundAOEProjectile(projectile.id) && !this.isInView(enemy.position, enemy.radius, 0)) {
            continue;
          }
          if (projectile.id === 'frost_aura') {
            enemy.slowMultiplier = 0.5; // 50% slow
          }
          if (projectile.id === 'sonic') {
            // Apply knockback
            const dist = Math.max(0.0001, Math.sqrt(distSq));
            const pushX = dx / dist * 10;
            const pushY = dy / dist * 10;
            enemy.velocity.x -= pushX; // Move away from projectile
            enemy.velocity.y -= pushY;
          }
          let damage = (enemy.type === 'boss' || enemy.type === 'titan') 
            ? projectile.damage * this.player.stats.boss_damage 
            : projectile.damage;
            
          // Instant Kill chance (Executioner) - doesn't work on bosses
          if (this.player.upgrades.some(u => u.id === 'instant_kill') && enemy.type !== 'boss' && enemy.type !== 'titan') {
            const executeChance = 0.01 * this.player.stats.luck; // Unupgraded: 1%, max upgraded: 3%
            if (Math.random() < executeChance) {
              damage = enemy.health; // Deal exact remaining health
              this.damageTexts.push({
                x: enemy.position.x,
                y: enemy.position.y - 30,
                text: "EXECUTE!",
                life: 1000,
                maxLife: 1000,
                color: '#ff0000'
              });
            }
          }
            
          enemy.health -= damage;
          if (projectile.sourceWeaponId) {
            this.weaponDamageStats[projectile.sourceWeaponId] = (this.weaponDamageStats[projectile.sourceWeaponId] || 0) + damage;
          }
          enemy.hitFlash = 100; // Flash white for 100ms
          if (projectile.hitEnemies) projectile.hitEnemies.add(enemy.id);
          if (projectile.id === 'orbit' || projectile.id === 'scythe') {
            this.orbitDamageCooldowns.set(`${projectile.id}:${enemy.id}`, this.gameTime);
          }
          projectile.penetration--;
          if (Math.random() < 0.3) {
            this.createExplosion(enemy.position.x, enemy.position.y, '#00ffff', 1);
          }
          if (this.gameTime - this.lastHitSoundAt > 35) {
            soundManager.playHit();
            this.lastHitSoundAt = this.gameTime;
          }
          
          if (damage < enemy.maxHealth && Math.random() < 0.35) { // Thin out text spam under heavy load.
            this.damageTexts.push({
              x: enemy.position.x,
              y: enemy.position.y - 20,
              text: `-${Math.round(damage)}`,
              life: 800,
              maxLife: 800,
              color: '#fff'
            });
          }

          if (enemy.health <= 0) {
            this.killEnemy(enemy);
          }
          if (projectile.penetration <= 0) break;
        }
      }
    }
    // Remove spent projectiles — keep hit-tracked and orbit projectiles alive while duration > 0
    this.projectiles = this.projectiles.filter(p => p.penetration > 0 || (p.duration > 0 && (p.hitEnemies !== undefined || p.id === 'orbit' || p.id === 'scythe')));

    for (const enemy of this.enemies) {
      const dx = this.player.position.x - enemy.position.x;
      const dy = this.player.position.y - enemy.position.y;
      const distSq = dx * dx + dy * dy;
      const radiusSum = this.player.radius + enemy.radius;
      
      if (distSq < radiusSum * radiusSum) {
        if (this.reviveInvulnTimer > 0) continue; // Skip damage if reviving
        // Aegis Slip or Ghost Frame: invulnerable windows
        if (this.dashState.aegisShieldTimer > 0) continue;
        if (this.dashGhostTimer > 0) continue;

        let damageAmount = 0;
        if (enemy.damagePercent) {
          // Bosses deal % max HP damage with a 1-second cooldown (i-frames)
          if (performance.now() - this.lastBossHitTime > 1000) {
            damageAmount = this.player.maxHealth * enemy.damagePercent * this.balanceTuning.bossDamagePercentMultiplier * this.balanceTuning.playerDamageTakenMultiplier;
            this.lastBossHitTime = performance.now();
            this.screenShake = 20;
            this.chromaticAberration = 15;
            soundManager.playDamage();
          }
        } else {
          // Regular enemies (dt-normalized)
          damageAmount = enemy.damage * this.balanceTuning.playerDamageTakenMultiplier * 0.05 * (dt / 16.67);
          this.screenShake = 5;
          this.chromaticAberration = 5;
          soundManager.playDamage();
        }

        if (damageAmount > 0) {
          const dashGuardLevel = this.getPermanentUpgradeLevel('perm_dash_guard');
          if ((this.isDashing || this.dashGhostTimer > 0) && dashGuardLevel > 0) {
            const reduction = Math.min(0.75, dashGuardLevel * 0.12);
            damageAmount *= (1 - reduction);
          }

          this.player.lastHitTime = this.gameTime;
          if (this.player.armorHp > 0) {
            if (damageAmount <= this.player.armorHp) {
              this.player.armorHp -= damageAmount;
              damageAmount = 0;
            } else {
              damageAmount -= this.player.armorHp;
              this.player.armorHp = 0;
            }
          }
          this.player.health -= damageAmount;
        }

        if (this.player.health <= 0) {
          if (this.player.inventory.hasRevive) {
            this.player.inventory.hasRevive = false;
            this.player.health = this.player.maxHealth * 0.5;
            this.reviveInvulnTimer = 3000; // 3 seconds invulnerability
            this.createExplosion(this.player.position.x, this.player.position.y, '#00ffff', 30);
            soundManager.playLevelUp();
          } else {
            this.processPlayerDeath();
            if (this.gameState === 'GAME_OVER') return;
          }
        }
      }
    }
  }

  getMaxArmorHp(): number {
    switch (this.player.inventory.armorTier) {
      case 1: return 50;
      case 2: return 100;
      case 3: return 200;
      default: return 0;
    }
  }

  activateNuke() {
    if (this.player.inventory.nukeCount > 0) {
      this.player.inventory.nukeCount--;
      this.screenShake = 100;
      this.chromaticAberration = 50;
      
      const viewportWidth = this.getViewportWorldWidth();
      const viewportHeight = this.getViewportWorldHeight();
      const left = this.camera.x;
      const right = this.camera.x + viewportWidth;
      const top = this.camera.y;
      const bottom = this.camera.y + viewportHeight;

      // Kill enemies on screen
      for (const enemy of this.enemies) {
        if (enemy.id !== 'dead' && enemy.type !== 'boss' && enemy.type !== 'titan') {
          if (enemy.position.x >= left && enemy.position.x <= right && enemy.position.y >= top && enemy.position.y <= bottom) {
            enemy.health = 0;
            this.createExplosion(enemy.position.x, enemy.position.y, '#ff4400', 3);
            this.killEnemy(enemy);
          }
        }
      }
      soundManager.playExplosion();
    }
  }

  killEnemy(enemy: Enemy) {
    this.killCount++;
    // Clean up orbit damage cooldowns for this enemy
    this.orbitDamageCooldowns.delete(`orbit:${enemy.id}`);
    this.orbitDamageCooldowns.delete(`scythe:${enemy.id}`);

    // Kinetic Refund: kills during window refund dash cooldown
    if (this.dashState.kineticRefundWindow > 0 && this.dashTimer > 0) {
      const refund = this.getEffectiveDashCooldownMs() * this.getDashKineticRefundFraction();
      this.dashTimer = Math.max(0, this.dashTimer - refund);
    }

    // Vampirism: heal on kill
    if (this.player.stats.vampirism > 0) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + this.player.stats.vampirism);
    }
    
    // Data Core drops for Elites and Bosses
    if (enemy.type === 'elite' || enemy.type === 'boss' || enemy.type === 'titan') {
      this.items.push({
        id: Math.random().toString(),
        position: { ...enemy.position },
        type: 'data_core',
        value: 1,
        color: '#ffffff'
      });
    }
    
    // Update Combo
    if (!this.isOverdrive) {
      this.comboCount++;
      this.comboTimer = this.COMBO_DECAY_TIME;
      if (this.comboCount >= this.COMBO_MAX) {
        this.isOverdrive = true;
        this.overdriveTimer = this.OVERDRIVE_DURATION + (this.player.stats.overdrive_duration || 0);
        this.screenShake = 30;
        soundManager.playLevelUp(); // Power up sound
      }
    }

    this.createExplosion(enemy.position.x, enemy.position.y, enemy.color, 10);
    
    // Trigger hit stop for bosses and titans
    if (enemy.type === 'boss' || enemy.type === 'titan') {
      this.hitStopTimer = 100; // 100ms freeze
      this.screenShake = 20;
    }
    
    // Experience Gem
    this.gems.push({
      id: Math.random().toString(),
      position: { ...enemy.position },
      value: enemy.experienceValue,
      color: '#00ff00'
    });

    // Drop items for holders
    if ((enemy as any).isHolder) {
      const types = Object.keys(ITEM_TYPES);
      const type = types[Math.floor(Math.random() * types.length)];
      this.items.push({
        id: Math.random().toString(),
        position: { ...enemy.position },
        type: type as any,
        value: (ITEM_TYPES as any)[type].value,
        color: (ITEM_TYPES as any)[type].color
      });
    } else {
      // Regular enemy coin drops
      let coinType: string | null = null;
      const luck = this.player.stats.luck;
      const dropChance = this.balanceTuning.coinDropChanceBase * luck;

      if (enemy.type === 'boss') {
        coinType = 'coin_diamond';
      } else if (enemy.type === 'titan') {
        coinType = 'coin_gold';
      } else if (enemy.type === 'elite') {
        coinType = Math.random() < 0.3 ? 'coin_gold' : 'coin_silver';
      } else if (Math.random() < dropChance) {
        if (enemy.type === 'tank') {
          coinType = 'coin_silver';
        } else if (enemy.type === 'fast' || enemy.type === 'ranged' || enemy.type === 'phantom') {
          coinType = Math.random() < 0.2 ? 'coin_silver' : 'coin_bronze';
        } else {
          coinType = 'coin_bronze';
        }
      }

      if (coinType) {
        this.items.push({
          id: Math.random().toString(),
          position: { ...enemy.position },
          type: coinType as any,
          value: (ITEM_TYPES as any)[coinType].value,
          color: (ITEM_TYPES as any)[coinType].color
        });
      }
    }
    
    // Rare treasure spawn
    if (
      this.treasures.length < this.MAX_ACTIVE_TREASURES &&
      Math.random() < this.balanceTuning.treasureDropChanceBase * this.player.stats.luck
    ) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 800 + Math.random() * 400;
      // Higher luck and more game time = better tier chances
      const tierRoll = Math.random();
      const legendaryChance = 0.05 + (this.gameTime / 600000) * 0.15;
      const epicChance = 0.20 + (this.gameTime / 600000) * 0.20;
      const tier = tierRoll < legendaryChance ? 'legendary' :
                   tierRoll < legendaryChance + epicChance ? 'epic' : 'rare';
      const tierColors = { rare: '#ffd700', epic: '#a855f7', legendary: '#ff6600' };
      this.treasures.push({
        id: Math.random().toString(),
        position: {
          x: this.player.position.x + Math.cos(angle) * dist,
          y: this.player.position.y + Math.sin(angle) * dist
        },
        color: tierColors[tier],
        spawnTime: performance.now(),
        tier
      });
    }

    // Notify event manager of the kill
    this.eventManager.onEnemyKilled(enemy.id, enemy.position.x, enemy.position.y, this);

    enemy.id = 'dead';
    this.enemies = this.enemies.filter(e => e.id !== 'dead');
  }

  spawnEnemies(dt: number) {
    this.spawnTimer += dt;
    const spawnRate = Math.max(this.balanceTuning.spawnMinIntervalMs, this.balanceTuning.spawnBaseIntervalMs / this.difficultyMultiplier);
    
    if (this.spawnTimer >= spawnRate) {
      this.spawnTimer = 0;

      // Boss spawning logic
      const minutes = Math.floor(this.gameTime / 60000);
      const seconds = Math.floor((this.gameTime % 60000) / 1000);
      
      // Spawn boss at exactly 2, 5, 10, 20 minutes
      if (seconds === 0 && [2, 5, 10, 20].includes(minutes)) {
        const bossId = `boss_${minutes}min`;
        const alreadySpawned = this.enemies.some(e => e.id.startsWith(bossId));
        if (!alreadySpawned) {
          this.spawnBoss(minutes);
          return;
        }
      }

      if (this.enemies.length >= this.MAX_ENEMIES) return;

      // Scale spawn rate with difficulty, completely ignoring weapon count
      const spawnMultiplier = 1 + (this.difficultyMultiplier - 1) * 0.5;
      const guaranteedSpawns = Math.floor(spawnMultiplier);
      const extraSpawnChance = spawnMultiplier - guaranteedSpawns;
      // Supports infinite scaling with 0.5 steps: 1x, 1.5x, 2x, 2.5x, 3x, ...
      const spawnAttempts = Math.min(
        this.MAX_ENEMIES - this.enemies.length,
        guaranteedSpawns + (Math.random() < extraSpawnChance ? 1 : 0)
      );

      if (spawnAttempts > 0 && Math.random() < 0.2) soundManager.playEnemySpawn();

      for (let i = 0; i < spawnAttempts; i++) {
        // System Breach: override spawn position to portals
        const breachPos = this.eventManager.getBreachSpawnPosition(this);
        let spawnPos;
        let isBreachSpawn = false;
        if (breachPos) {
          spawnPos = breachPos;
          isBreachSpawn = true;
        } else {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.max(this.canvas.width, this.canvas.height) / 2 + 150;
          spawnPos = {
            x: this.player.position.x + Math.cos(angle) * dist,
            y: this.player.position.y + Math.sin(angle) * dist
          };
        }

        const rand = Math.random();
        let type: keyof typeof ENEMY_TYPES = 'basic';
        let isHolder = false;

        if (rand > 0.98) {
          isHolder = true;
        } else {
          // Time-based enemy variety — Threat Level brings enemy types in earlier
          const minutes = this.gameTime / 60000;
          const effectiveMinutes = minutes;
          const availableTypes: (keyof typeof ENEMY_TYPES)[] = ['basic'];

          if (effectiveMinutes >= 2) availableTypes.push('fast');
          if (effectiveMinutes >= 5) availableTypes.push('tank');
          if (effectiveMinutes >= 8) availableTypes.push('ranged');
          if (effectiveMinutes >= 12) availableTypes.push('elite');
          if (effectiveMinutes >= 15) availableTypes.push('phantom');
          if (effectiveMinutes >= 20) availableTypes.push('titan');

          // Weighted selection: newer types are slightly more common as time goes on
          // but older types still appear
          const typeIndex = Math.floor(Math.random() * availableTypes.length);
          type = availableTypes[typeIndex];
        }

        const config = ENEMY_TYPES[type as keyof typeof ENEMY_TYPES] || ENEMY_TYPES.basic;
        if (isHolder) {
          soundManager.playTreasureSpawn();
        }

        this.enemies.push({
          id: Math.random().toString(),
          position: spawnPos,
          velocity: { x: 0, y: 0 },
          rotation: 0,
          radius: isHolder ? 25 : config.radius,
          health: (isHolder ? 50 : config.health) * this.difficultyMultiplier * this.balanceTuning.enemyHealthMultiplier,
          maxHealth: (isHolder ? 50 : config.health) * this.difficultyMultiplier * this.balanceTuning.enemyHealthMultiplier,
          color: isHolder ? '#d4a373' : config.color,
          // Damage scales half as fast as health to prevent 1-shotting at high waves
          damage: (isHolder ? 0 : config.damage) * (1 + (this.difficultyMultiplier - 1) * 0.5) * this.balanceTuning.enemyDamageMultiplier,
          speed: isHolder ? 0.5 : config.speed,
          experienceValue: isHolder ? 0 : config.xp,
          type,
          ...(isBreachSpawn ? { isEventEnemy: true } : {}),
          ...(isHolder ? { isHolder: true } : {})
        } as any);
      }
    }
  }

  spawnBoss(minutes: number) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 800; // spawn slightly further out due to their size
    const x = this.player.position.x + Math.cos(angle) * distance;
    const y = this.player.position.y + Math.sin(angle) * distance;

    let bossStats;
    if (minutes === 2) {
      bossStats = { health: 3000, speed: 0.12, damagePercent: 0.25, radius: 100, xp: 2000, color: '#ff0000', name: 'NEURAL OVERLORD' };
    } else if (minutes === 5) {
      bossStats = { health: 12000, speed: 0.10, damagePercent: 0.35, radius: 140, xp: 5000, color: '#ff00ff', name: 'VOID ARCHITECT' };
    } else if (minutes === 10) {
      bossStats = { health: 50000, speed: 0.08, damagePercent: 0.50, radius: 180, xp: 15000, color: '#00ffff', name: 'CYBER SENTINEL' };
    } else {
      bossStats = { health: 200000, speed: 0.06, damagePercent: 0.50, radius: 250, xp: 50000, color: '#ffffff', name: 'THE SINGULARITY' };
    }

    this.enemies.push({
      id: `boss_${minutes}min_${Date.now()}`,
      position: { x, y },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      radius: bossStats.radius,
      health: bossStats.health * this.balanceTuning.bossHealthMultiplier,
      maxHealth: bossStats.health * this.balanceTuning.bossHealthMultiplier,
      damage: 0, // Ignored since we use damagePercent
      damagePercent: bossStats.damagePercent,
      speed: bossStats.speed,
      experienceValue: bossStats.xp * this.balanceTuning.bossXPRewardMultiplier,
      color: bossStats.color,
      type: 'boss'
    } as any);
    
    soundManager.playEnemySpawn();
  }

  gameOver() {
    this.gameState = 'GAME_OVER';
    this.onGameOver({
      time: this.gameTime,
      kills: this.killCount,
      level: this.player.level
    });
  }

  // ─── Centralised death handler ─────────────────────────────
  // All event damage sources (Nano Plague, Firewall, Data Storm)
  // MUST call this instead of gameOver() directly so that the
  // perm_revive mechanic is honoured consistently.
  processPlayerDeath() {
    if (this.player.health > 0) return; // Safety guard — still alive
    if (this.player.inventory.hasRevive) {
      this.player.inventory.hasRevive = false;
      this.player.health = this.player.maxHealth * 0.5;
      this.reviveInvulnTimer = 3000;
      soundManager.playLevelUp();
      this.screenShake = 20;
      this.chromaticAberration = 15;
      this.createExplosion(this.player.position.x, this.player.position.y, '#00ffff', 30);
      return;
    }
    if ((this.player.permanentUpgrades['perm_revive'] || 0) > 0 && !this.hasRevived) {
      this.hasRevived = true;
      this.player.health = this.player.maxHealth * 0.5;
      this.reviveInvulnTimer = 3000;
      soundManager.playLevelUp();
      this.screenShake = 30;
      this.createExplosion(this.player.position.x, this.player.position.y, '#00ff00', 100);
      this.damageTexts.push({
        x: this.player.position.x,
        y: this.player.position.y - 40,
        text: 'EMERGENCY REBOOT!',
        life: 2000,
        maxLife: 2000,
        color: '#00ff00'
      });
      // Clear nearby enemies to prevent instant re-death
      for (const e of this.enemies) {
        const ex = this.player.position.x - e.position.x;
        const ey = this.player.position.y - e.position.y;
        if (ex * ex + ey * ey < 40000) {
          e.health = 0;
          if (e.type !== 'boss' && e.type !== 'titan') {
            this.killEnemy(e);
          }
        }
      }
    } else {
      this.gameOver();
    }
  }



  draw() {
    // Clear background — grid draws its own base
    this.ctx.fillStyle = '#050505';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGrid();

    this.ctx.save();
    
    // Screen shake
    if (this.screenShake > 0) {
      this.ctx.translate(
        (Math.random() - 0.5) * this.screenShake,
        (Math.random() - 0.5) * this.screenShake
      );
    }
    
    this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.scale(this.cameraZoom, this.cameraZoom);
    this.ctx.translate(-this.player.position.x, -this.player.position.y);

    this.drawShops();

    // Draw Items
    for (const item of this.items) {
      if (!this.isInView(item.position, item.radius || 12, 80)) continue;
      this.drawItem(item);
    }

    // Draw Treasures
    for (const treasure of this.treasures) {
      if (!this.isInView(treasure.position, 32, 100)) continue;
      this.drawTreasureChest(treasure);
    }

    // Draw Particles
    for (const p of this.particles) {
      if (!this.isInView({ x: p.x, y: p.y }, p.size || 2, 20)) continue;
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life / p.maxLife;
      this.ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    this.ctx.globalAlpha = 1.0;



    // Draw Gems
    for (const gem of this.gems) {
      if (!this.isInView(gem.position, 12, 60)) continue;
      this.ctx.save();
      this.ctx.translate(gem.position.x, gem.position.y);
      
      // Glow
      const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
      gradient.addColorStop(0, gem.color);
      gradient.addColorStop(1, 'transparent');
      this.ctx.fillStyle = gradient;
      this.ctx.globalAlpha = 0.4 + Math.sin(Date.now() / 300) * 0.2;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 10, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Core
      this.ctx.globalAlpha = 1.0;
      this.ctx.fillStyle = gem.color;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Highlight
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.beginPath();
      this.ctx.arc(-1, -1, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.restore();
    }

    // Draw Enemies
    for (const enemy of this.enemies) {
      if (!this.isInView(enemy.position, enemy.radius, 120)) continue;
      this.drawEnemy(enemy);
      
      if (enemy.health < enemy.maxHealth) {
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(enemy.position.x - 15, enemy.position.y - enemy.radius - 10, 30, 4);
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(enemy.position.x - 15, enemy.position.y - enemy.radius - 10, 30 * (enemy.health / enemy.maxHealth), 4);
      }
    }

    // Draw Projectiles — custom rendering per weapon type
    for (const p of this.projectiles) {
      if (!this.isInView(p.position, p.radius, 120)) continue;
      this.ctx.save();
      this.ctx.translate(p.position.x, p.position.y);

      if (p.id === 'chain_bolt') {
        // Lightning bolt — jagged line with glow
        const len = p.radius;
        const rot = p.rotation || 0;
        this.ctx.rotate(rot);
        this.ctx.strokeStyle = p.color;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(-len, 0);
        for (let seg = 0; seg < 6; seg++) {
          const x = -len + (2 * len / 6) * (seg + 1);
          const y = (Math.random() - 0.5) * 20;
          this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
      } else if (p.id === 'gravity_well') {
        // Black hole — spiral accretion disk
        const time = Date.now() / 1000;
        const r = p.radius;
        // Dark core
        const coreGrad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
        coreGrad.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
        coreGrad.addColorStop(1, 'rgba(80, 0, 180, 0)');
        this.ctx.fillStyle = coreGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        // Rotating accretion rings
        for (let ring = 0; ring < 5; ring++) {
          const ringR = r * (0.2 + ring * 0.15);
          const startAngle = time * (3 - ring * 0.5) + ring;
          this.ctx.strokeStyle = `hsla(${270 + ring * 15}, 80%, ${50 + ring * 8}%, ${0.5 - ring * 0.08})`;
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, ringR, startAngle, startAngle + Math.PI * 1.2);
          this.ctx.stroke();
        }
        // Event horizon glow
        this.ctx.globalAlpha = 0.3 + Math.sin(time * 4) * 0.1;
        const ehGrad = this.ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r * 0.25);
        ehGrad.addColorStop(0, '#fff');
        ehGrad.addColorStop(0.5, 'rgba(140, 0, 255, 0.5)');
        ehGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = ehGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      } else if (p.id === 'mirror_shard') {
        // Prismatic triangle shard with rainbow trail
        const rot = p.rotation || 0;
        this.ctx.rotate(rot + Date.now() * 0.01);
        const s = p.radius;
        // Rainbow glow trail
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.moveTo(s, 0);
        this.ctx.lineTo(-s * 0.6, -s * 0.5);
        this.ctx.lineTo(-s * 0.6, s * 0.5);
        this.ctx.closePath();
        this.ctx.fill();
        // Inner white highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.beginPath();
        this.ctx.moveTo(s * 0.5, 0);
        this.ctx.lineTo(-s * 0.2, -s * 0.2);
        this.ctx.lineTo(-s * 0.2, s * 0.2);
        this.ctx.closePath();
        this.ctx.fill();
      } else if (p.id === 'helix') {
        // Glowing energy orb
        const t = Date.now() / 200;
        const pulse = 0.7 + Math.sin(t + p.position.x) * 0.3;
        this.ctx.globalAlpha = pulse;
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        this.ctx.fill();
        // White core
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      } else if (p.id === 'tendril') {
        // Dark void tendril segment
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        this.ctx.fill();
        // Eldritch eye at center
        this.ctx.fillStyle = '#bf00ff';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (p.id === 'flare') {
        // Plasma fire ball
        const flickerSize = p.radius * (0.8 + Math.random() * 0.4);
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, flickerSize, 0, Math.PI * 2);
        this.ctx.fill();
        // Hot white core
        this.ctx.fillStyle = 'rgba(255, 255, 200, 0.7)';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, flickerSize * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (p.id === 'echo') {
        // Ghost afterimage — semi-transparent player silhouette
        const ghostAlpha = 0.3 + Math.sin(Date.now() / 200) * 0.1;
        this.ctx.globalAlpha = ghostAlpha;
        this.ctx.fillStyle = p.color;
        // Simple ghost body
        this.ctx.beginPath();
        this.ctx.arc(0, -3, p.radius * 0.6, Math.PI, 0); // head
        this.ctx.lineTo(p.radius * 0.6, p.radius * 0.5); // right side
        // Wavy bottom
        for (let w = 0; w < 4; w++) {
          const wx = p.radius * 0.6 - (w + 1) * (p.radius * 1.2 / 4);
          const wy = p.radius * 0.5 + (w % 2 === 0 ? 5 : -2);
          this.ctx.lineTo(wx, wy);
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      } else if (p.id === 'frost_aura') {
        // Soft expanding cyan ring
        const alpha = p.duration / 800;
        this.ctx.globalAlpha = Math.min(alpha, 0.4);
        
        // Soft gradient fill
        const fillGrad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, p.radius);
        fillGrad.addColorStop(0, 'rgba(150, 220, 255, 0.05)');
        fillGrad.addColorStop(0.8, 'rgba(100, 200, 255, 0.3)');
        fillGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = fillGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Edge ring
        this.ctx.strokeStyle = 'rgba(150, 240, 255, 0.6)';
        this.ctx.lineWidth = 2 + (1 - alpha) * 4;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius * (1 - alpha * 0.1), 0, Math.PI * 2);
        this.ctx.stroke();
        
        this.ctx.globalAlpha = 1;
      } else if (p.id === 'stardust') {
        // Falling glowing star
        const rot = p.rotation || 0;
        this.ctx.rotate(rot);
        const s = p.radius;
        
        // Aura
        const starGrad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2);
        starGrad.addColorStop(0, 'rgba(255, 250, 200, 0.8)');
        starGrad.addColorStop(0.4, p.color);
        starGrad.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = starGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, s * 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Star core
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Trail
        this.ctx.fillStyle = 'rgba(255, 230, 150, 0.4)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, -s * 0.3);
        this.ctx.lineTo(-s * 3, 0); // long tail
        this.ctx.lineTo(0, s * 0.3);
        this.ctx.fill();
      } else if (p.id === 'blade') {
        // High-quality cyber blade slash: a glowing, tapering neon arc
        const rot = p.rotation || 0;
        const radius = p.radius;
        const life = p.duration / 200; // 0 to 1
        const alpha = Math.min(1, life * 2);
        
        this.ctx.rotate(rot);
        this.ctx.globalAlpha = alpha;
        
        // Outer glow arc
        const grad = this.ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, radius);
        grad.addColorStop(0, 'rgba(0, 255, 255, 0)');
        grad.addColorStop(0.7, 'rgba(0, 255, 255, 0.3)');
        grad.addColorStop(1, 'rgba(0, 255, 255, 0)');
        this.ctx.fillStyle = grad;
        
        const arcAngle = Math.PI * 0.8; // 144 degree arc
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, -arcAngle / 2, arcAngle / 2);
        this.ctx.arc(0, 0, radius * 0.4, arcAngle / 2, -arcAngle / 2, true);
        this.ctx.fill();
        
        // Sharp inner blade edge
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 3 * life;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 0.8, -arcAngle / 2, arcAngle / 2);
        this.ctx.stroke();
        
        // Neon trail
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 0.7, -arcAngle / 2.2, arcAngle / 2.2);
        this.ctx.stroke();
        
        this.ctx.globalAlpha = 1.0;
      } else if (p.id === 'arc_web' || p.id === 'arc_zap') {
        // Electric arc visual
        if (p.id === 'arc_web') {
          const rot = p.rotation || 0;
          this.ctx.rotate(rot);
          const len = p.radius;
          this.ctx.strokeStyle = p.color;
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.moveTo(-len, 0);
          for (let seg = 0; seg < 8; seg++) {
            const x = -len + (2 * len / 8) * (seg + 1);
            const y = (Math.random() - 0.5) * 15;
            this.ctx.lineTo(x, y);
          }
          this.ctx.stroke();
        } else {
          // Zap burst at enemy
          this.ctx.fillStyle = p.color;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.fillStyle = '#fff';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.radius * 0.3, 0, Math.PI * 2);
          this.ctx.fill();
        }
      } else {
        // Default projectile rendering
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = 0.4;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1.0;
      }

      this.ctx.restore();
    }

    // Draw Damage Texts
    this.ctx.font = 'bold 16px Inter';
    this.ctx.textAlign = 'center';
    for (const t of this.damageTexts) {
      this.ctx.fillStyle = t.color;
      this.ctx.globalAlpha = t.life / t.maxLife;
      this.ctx.fillText(t.text, t.x, t.y);
    }
    this.ctx.globalAlpha = 1.0;

    // Draw Player
    this.drawDashEffectsWorld();
    this.drawPlayer();

    // Draw event world-space effects (toxic pools, supply crates, data storm, firewall)
    this.eventManager.drawWorldSpace(this.ctx, this.camera, this.canvas);

    this.ctx.restore(); // restore camera transform — CRITICAL: balances ctx.save() at start of draw

    // Draw UI in screen space (after camera restore)
    this.drawUI();

    // Draw compass
    this.drawCompass();


    // Draw event screen-space effects (blackout, announcements, bounty arrows)
    this.eventManager.drawScreenSpace(this.ctx, this.canvas, this);
  }

  drawPlayer() {
    const ctx = this.ctx;
    const op = OPERATOR_DEFINITIONS.find(o => o.id === this.player.operatorId) || OPERATOR_DEFINITIONS[0];

    ctx.save();
    ctx.translate(this.player.position.x, this.player.position.y);

    // Smooth rotation interpolation — no more jerky snapping
    const isMoving = Math.abs(this.player.velocity.x) > 0.05 || Math.abs(this.player.velocity.y) > 0.05;
    if (isMoving) {
      this.targetRotation = Math.atan2(this.player.velocity.y, this.player.velocity.x);
    }
    this.player.rotation = this.lerpAngle(this.player.rotation || 0, this.targetRotation, 0.12);

    const r = this.player.radius;
    const time = Date.now() / 1000;
    // isMoving already computed above for rotation

    // === LOW HP WARNING ===
    const hpRatio = this.player.health / this.player.maxHealth;
    if (hpRatio < 0.35) {
      const warnPulse = 0.15 + Math.sin(time * 6) * 0.15;
      ctx.strokeStyle = `rgba(255, 50, 50, ${warnPulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // === AMBIENT ENERGY FIELD ===
    const playerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
    playerGlow.addColorStop(0, op.colorGlow);
    playerGlow.addColorStop(0.4, 'rgba(0, 0, 0, 0.02)');
    playerGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = playerGlow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
    ctx.fill();

    // === DASH AFTERGLOW ===
    if (this.isDashing) {
      ctx.strokeStyle = op.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.5 + Math.sin(time * 20) * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;

      // Exhaust particles behind player
      ctx.save();
      ctx.rotate(this.player.rotation || 0);
      for (let i = 0; i < 4; i++) {
        const px = -r * (1.5 + Math.random() * 1.5);
        const py = (Math.random() - 0.5) * r * 1.2;
        const pr = 2 + Math.random() * 3;
        ctx.globalAlpha = 0.3 + Math.random() * 0.3;
        ctx.fillStyle = op.color;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
      ctx.restore();
    }

    // Rotate to face direction
    ctx.save(); // save pre-rotation state for dash effects
    ctx.rotate(this.player.rotation || 0);

    // Idle breathing — subtle body scale pulse
    const breathe = isMoving ? 0 : Math.sin(time * 2) * 0.015;

    // === LEGS ===
    const walkCycle = Math.sin(time * 12) * 0.35;
    const legSwing = isMoving ? walkCycle : 0;

    ctx.strokeStyle = op.colorLimbs;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';

    // Left leg
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, r * 0.5);
    ctx.lineTo(
      -r * 0.35 + Math.sin(legSwing) * 5,
      r * 1.15 + Math.cos(legSwing) * 2.5
    );
    ctx.stroke();
    // Right leg
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.5);
    ctx.lineTo(
      -r * 0.35 - Math.sin(legSwing) * 5,
      -r * 1.15 - Math.cos(legSwing) * 2.5
    );
    ctx.stroke();

    // Boots — armored
    ctx.fillStyle = op.colorBoots;
    const bootLY = r * 1.15 + Math.cos(legSwing) * 2.5;
    const bootLX = -r * 0.35 + Math.sin(legSwing) * 5;
    const bootRY = -r * 1.15 - Math.cos(legSwing) * 2.5;
    const bootRX = -r * 0.35 - Math.sin(legSwing) * 5;

    ctx.beginPath();
    ctx.ellipse(bootLX, bootLY, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = op.color;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(bootRX, bootRY, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // === TORSO ===
    const bodyScale = 1 + breathe;
    ctx.save();
    ctx.scale(bodyScale, bodyScale);

    const bodyGrad = ctx.createLinearGradient(-r * 0.6, -r * 0.7, r * 0.6, r * 0.7);
    bodyGrad.addColorStop(0, op.colorDark);
    bodyGrad.addColorStop(0.35, op.colorSecondary);
    bodyGrad.addColorStop(0.65, op.colorSecondary);
    bodyGrad.addColorStop(1, op.colorDark);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, -r * 0.52);
    ctx.quadraticCurveTo(r * 0.6, 0, r * 0.55, r * 0.52);
    ctx.lineTo(-r * 0.45, r * 0.68);
    ctx.lineTo(-r * 0.45, -r * 0.68);
    ctx.closePath();
    ctx.fill();

    // Armor edge lines
    ctx.strokeStyle = op.color;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Chest plate line detail
    ctx.strokeStyle = op.color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.45);
    ctx.lineTo(r * 0.1, r * 0.45);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // === BELT / WAIST ===
    ctx.fillStyle = op.colorDark;
    ctx.fillRect(-r * 0.48, -r * 0.08, r * 0.2, r * 0.16);
    ctx.strokeStyle = op.color;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-r * 0.48, -r * 0.08, r * 0.2, r * 0.16);

    // Belt buckle
    ctx.fillStyle = op.color;
    ctx.fillRect(-r * 0.42, -r * 0.04, r * 0.08, r * 0.08);

    // === ENERGY CORE (center of chest) ===
    const pulse = 0.7 + Math.sin(time * 4) * 0.3;
    const coreGrad = ctx.createRadialGradient(r * 0.1, 0, 0, r * 0.1, 0, r * 0.3);
    coreGrad.addColorStop(0, op.color);
    coreGrad.addColorStop(0.4, op.colorGlow);
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = pulse;
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(r * 0.1, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Core bright dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.1, 0, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    ctx.restore(); // un-scale breathing

    // === ARMS ===
    const armSwing = isMoving ? Math.sin(time * 12 + Math.PI) * 0.3 : Math.sin(time * 1.5) * 0.05;
    ctx.strokeStyle = op.colorLimbs;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // Top arm — weapon arm
    const armTopEndX = r * 0.95 + Math.cos(armSwing) * 2;
    const armTopEndY = -r * 0.58 + Math.sin(armSwing) * 3;
    ctx.beginPath();
    ctx.moveTo(r * 0.3, -r * 0.48);
    ctx.lineTo(armTopEndX, armTopEndY);
    ctx.stroke();

    // Glove detail on top arm
    ctx.fillStyle = op.colorBoots;
    ctx.beginPath();
    ctx.arc(armTopEndX, armTopEndY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Bottom arm
    const armBotEndX = r * 0.75 - Math.cos(armSwing) * 2;
    const armBotEndY = r * 0.65 - Math.sin(armSwing) * 3;
    ctx.beginPath();
    ctx.moveTo(r * 0.3, r * 0.48);
    ctx.lineTo(armBotEndX, armBotEndY);
    ctx.stroke();

    // Glove detail on bottom arm
    ctx.fillStyle = op.colorBoots;
    ctx.beginPath();
    ctx.arc(armBotEndX, armBotEndY, 3, 0, Math.PI * 2);
    ctx.fill();

    // === WEAPON ===
    ctx.fillStyle = '#333';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.8;
    // Gun body
    const gunX = armTopEndX - 2;
    const gunY = armTopEndY - r * 0.12;
    ctx.fillRect(gunX, gunY, r * 0.55, r * 0.24);
    ctx.strokeRect(gunX, gunY, r * 0.55, r * 0.24);

    // Gun barrel tip glow
    ctx.fillStyle = op.color;
    ctx.fillRect(gunX + r * 0.5, gunY + r * 0.04, r * 0.12, r * 0.16);

    // === SHOULDER PADS ===
    ctx.fillStyle = op.colorSecondary;
    ctx.strokeStyle = op.color;
    ctx.lineWidth = 1;

    // Top shoulder
    ctx.beginPath();
    ctx.ellipse(r * 0.12, -r * 0.62, r * 0.28, r * 0.16, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Shoulder highlight
    ctx.fillStyle = op.color;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.ellipse(r * 0.18, -r * 0.66, r * 0.12, r * 0.06, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Bottom shoulder
    ctx.fillStyle = op.colorSecondary;
    ctx.beginPath();
    ctx.ellipse(r * 0.12, r * 0.62, r * 0.28, r * 0.16, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = op.color;
    ctx.stroke();
    // Shoulder highlight
    ctx.fillStyle = op.color;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.ellipse(r * 0.18, r * 0.66, r * 0.12, r * 0.06, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // === HEAD / HELMET ===
    const helmetGrad = ctx.createRadialGradient(r * 0.65, 0, r * 0.1, r * 0.65, 0, r * 0.45);
    helmetGrad.addColorStop(0, op.colorSecondary);
    helmetGrad.addColorStop(1, op.colorDark);
    ctx.fillStyle = helmetGrad;
    ctx.beginPath();
    ctx.arc(r * 0.65, 0, r * 0.44, 0, Math.PI * 2);
    ctx.fill();

    // Helmet outline
    ctx.strokeStyle = op.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Helmet ridge (top)
    ctx.strokeStyle = op.color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(r * 0.65, 0, r * 0.44, -Math.PI * 0.15, Math.PI * 0.15);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Visor — glowing
    ctx.fillStyle = op.colorVisor;
    ctx.beginPath();
    ctx.ellipse(r * 0.85, 0, r * 0.13, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Visor inner highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(r * 0.88, -r * 0.08, r * 0.05, r * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Visor pupil dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.88, 0, r * 0.04, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // restore rotation — back to translated player space

    // === DASH UPGRADE PLAYER EFFECTS (no rotation) ===
    this.drawDashEffectsPlayer(ctx, r, time);

    ctx.restore(); // restore player transform
  }

  drawDashEffectsPlayer(ctx: CanvasRenderingContext2D, r: number, time: number) {
    const ds = this.dashState;

    // Deadlock Burst: pulsing orange ring when charged
    if (ds.deadlockCharged) {
      const pulse = 0.5 + Math.sin(time * 8) * 0.3;
      ctx.strokeStyle = `rgba(255, 102, 0, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2 + Math.sin(time * 6) * 3, 0, Math.PI * 2);
      ctx.stroke();
      // Inner glow
      const glow = ctx.createRadialGradient(0, 0, r, 0, 0, r * 2.5);
      glow.addColorStop(0, `rgba(255, 102, 0, ${pulse * 0.3})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Aegis Slip: shield bubble
    if (ds.aegisShieldTimer > 0) {
      const alpha = Math.min(1, ds.aegisShieldTimer / 200) * 0.6;
      ctx.strokeStyle = `rgba(0, 220, 255, ${alpha})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Inner hex fill
      const bubbleGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
      bubbleGlow.addColorStop(0, `rgba(0, 220, 255, ${alpha * 0.15})`);
      bubbleGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = bubbleGlow;
      ctx.fill();
    }

    // Prism Guard: rotating shards
    if (ds.prismShardTimer > 0) {
      const shardCount = 4;
      const orbitR = 60 * this.player.stats.area;
      const fadeAlpha = Math.min(1, ds.prismShardTimer / 300);
      const colors = ['#ff0066', '#00ff88', '#4488ff', '#ffcc00'];
      for (let i = 0; i < shardCount; i++) {
        const angle = (time * 4) + (i / shardCount) * Math.PI * 2;
        const sx = Math.cos(angle) * orbitR;
        const sy = Math.sin(angle) * orbitR;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle + time * 8);
        ctx.globalAlpha = fadeAlpha;
        ctx.fillStyle = colors[i];
        // Diamond shape
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(5, 0);
        ctx.lineTo(0, 8);
        ctx.lineTo(-5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // Multi-charge dash: charge indicators
    if (ds.maxDashCharges > 1) {
      for (let i = 0; i < ds.maxDashCharges; i++) {
        const cx = -r * 1.5 + i * 12;
        const cy = -r * 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        if (i < ds.dashCharges) {
          ctx.fillStyle = '#00ff88';
          ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // Cataclysm Brake pending: dark purple ring
    if (ds.cataclysmPending) {
      const pulse = 0.3 + Math.sin(time * 10) * 0.2;
      ctx.strokeStyle = `rgba(139, 0, 255, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Echo Recall: window indicator
    if (ds.echoRecallWindow > 0) {
      const alpha = ds.echoRecallWindow / this.getDashEchoRecallWindowMs();
      ctx.strokeStyle = `rgba(255, 0, 255, ${alpha * 0.7})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2 * alpha);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Kinetic Refund window: green rim
    if (ds.kineticRefundWindow > 0) {
      const alpha = (ds.kineticRefundWindow / this.getDashKineticWindowMs()) * 0.5;
      ctx.strokeStyle = `rgba(0, 255, 100, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawDashEffectsWorld() {
    const ctx = this.ctx;
    const ds = this.dashState;
    const time = Date.now() / 1000;

    // Null Wake trail
    for (const p of ds.nullWakeTrail) {
      const alpha = (p.life / this.getDashNullWakeLifeMs()) * 0.6;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30);
      grad.addColorStop(0, `rgba(0, 180, 255, ${alpha})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
      ctx.fill();
      // Hex pattern
      ctx.strokeStyle = `rgba(0, 140, 255, ${alpha * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const hx = p.x + Math.cos(a) * 18;
        const hy = p.y + Math.sin(a) * 18;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Afterimage mines
    for (const a of ds.afterimages) {
      const alpha = 0.3 + Math.sin(time * 12 + a.x) * 0.15;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ff44ff';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 12, 0, Math.PI * 2);
      ctx.fill();
      // Pulsing ring
      const ringR = 12 + Math.sin(time * 8) * 4;
      ctx.strokeStyle = 'rgba(255, 100, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(a.x, a.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Echo Recall origin ghost
    if (ds.echoRecallOrigin && ds.echoRecallWindow > 0) {
      const o = ds.echoRecallOrigin;
      const alpha = (ds.echoRecallWindow / this.getDashEchoRecallWindowMs()) * 0.4;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(o.x, o.y, this.player.radius * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Ghost silhouette
      ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, this.player.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Phase Laceration: red dash trail while dashing
    if (this.isDashing && ds.phaseLaceration) {
      const sp = this.dashStartPos;
      if (sp) {
        ctx.strokeStyle = 'rgba(255, 0, 50, 0.5)';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(this.player.position.x, this.player.position.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  drawEnemy(enemy: Enemy) {
    const ctx = this.ctx;
    const x = enemy.position.x;
    const y = enemy.position.y;
    const r = enemy.radius;
    
    // Common pulsing metric
    const pulse = (Math.sin(performance.now() * 0.005) + 1) / 2;

    ctx.save();
    ctx.translate(x, y);

    // Hit Flash (White Overlay)
    if (enemy.hitFlash && enemy.hitFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // If enemy is slowed, show a cold aura
    if (enemy.slowMultiplier && enemy.slowMultiplier < 1) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 5 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(150, 200, 255, ${0.3 * (1 - enemy.slowMultiplier)})`;
      ctx.fill();
    }

    if ((enemy as any).isHolder) {
      // --- HOLDER (Loot Crate) ---
      // Hover effect
      const hoverY = Math.sin(performance.now() * 0.003) * 5;
      ctx.translate(0, hoverY);
      
      // Repulsor engines
      ctx.fillStyle = `rgba(0, 255, 255, ${0.5 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(-r*0.6, r*0.8, r*0.2, r*0.1, 0, 0, Math.PI*2);
      ctx.ellipse(r*0.6, r*0.8, r*0.2, r*0.1, 0, 0, Math.PI*2);
      ctx.fill();

      // Crate Body
      ctx.fillStyle = '#222';
      ctx.strokeStyle = enemy.color;
      ctx.lineWidth = 2;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);

      // Crate Details (X-brace)
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r + 2, -r + 2);
      ctx.lineTo(r - 2, r - 2);
      ctx.moveTo(r - 2, -r + 2);
      ctx.lineTo(-r + 2, r - 2);
      ctx.stroke();

      // Lock center
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = enemy.color;
      ctx.stroke();
      
      // Holographic symbol
      ctx.fillStyle = enemy.color;
      ctx.globalAlpha = 0.8 + pulse * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

    } else {
      // Rotate by velocity or face player
      let angle = 0;
      if (enemy.velocity.x !== 0 || enemy.velocity.y !== 0) {
        angle = Math.atan2(enemy.velocity.y, enemy.velocity.x);
      } else {
        angle = Math.atan2(this.player.position.y - y, this.player.position.x - x);
      }
      ctx.rotate(angle);

      switch (enemy.type) {
        case 'basic': {
          // --- DRONE (Mechanical Orb) ---
          // Outer spinning ring
          ctx.strokeStyle = '#555';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(0, 0, r, r * 0.8, performance.now() * 0.003, 0, Math.PI * 2);
          ctx.stroke();
          
          // Core body
          const grad = ctx.createRadialGradient(0, 0, r*0.2, 0, 0, r);
          grad.addColorStop(0, '#444');
          grad.addColorStop(1, '#111');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          // Glowing eye
          ctx.fillStyle = `rgba(255, 0, 0, ${0.8 + pulse * 0.2})`;
          ctx.beginPath();
          ctx.ellipse(r * 0.4, 0, r * 0.25, r * 0.15, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'fast': {
          // --- SCOUT (Sleek Dart) ---
          // Engine trail
          ctx.fillStyle = `rgba(255, 150, 0, ${0.3 + pulse * 0.3})`;
          ctx.beginPath();
          ctx.moveTo(-r, -r * 0.3);
          ctx.lineTo(-r * (1.5 + Math.random()), 0);
          ctx.lineTo(-r, r * 0.3);
          ctx.fill();
          
          // Dart body
          ctx.fillStyle = '#222';
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(r, 0); // Nose
          ctx.lineTo(-r, r * 0.6); // Bottom wing
          ctx.lineTo(-r * 0.5, 0); // Back indent
          ctx.lineTo(-r, -r * 0.6); // Top wing
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Cockpit/Sensor glow
          ctx.fillStyle = enemy.color;
          ctx.beginPath();
          ctx.moveTo(r * 0.4, 0);
          ctx.lineTo(-r * 0.2, r * 0.15);
          ctx.lineTo(-r * 0.2, -r * 0.15);
          ctx.fill();
          break;
        }
        case 'tank': {
          // --- GOLIATH (Mech Torso) ---
          ctx.fillStyle = '#1a1a1a';
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 2;
          
          // Treads / Legs
          ctx.fillRect(-r*0.8, -r*0.9, r*1.6, r*0.4);
          ctx.strokeRect(-r*0.8, -r*0.9, r*1.6, r*0.4);
          ctx.fillRect(-r*0.8, r*0.5, r*1.6, r*0.4);
          ctx.strokeRect(-r*0.8, r*0.5, r*1.6, r*0.4);
          
          // Main Body (Hexagon-ish chassis)
          ctx.fillStyle = '#2a2a2a';
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(r * 0.5, r * 0.5);
          ctx.lineTo(-r * 0.5, r * 0.5);
          ctx.lineTo(-r, 0);
          ctx.lineTo(-r * 0.5, -r * 0.5);
          ctx.lineTo(r * 0.5, -r * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Glowing vents
          ctx.fillStyle = `rgba(180, 0, 255, ${0.6 + pulse * 0.4})`;
          ctx.fillRect(-r * 0.2, -r * 0.3, r * 0.1, r * 0.6);
          ctx.fillRect(r * 0.1, -r * 0.3, r * 0.1, r * 0.6);
          
          // Cyclops eye
          ctx.fillStyle = enemy.color;
          ctx.beginPath();
          ctx.arc(r * 0.7, 0, r * 0.15, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'ranged': {
          // --- SNIPER (Segmented Drone) ---
          // Targeting Laser
          ctx.strokeStyle = `rgba(0, 255, 0, ${0.2 + pulse * 0.2})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(r * 15, 0); // Long laser pointer
          ctx.stroke();

          // Diamond Body Base
          ctx.fillStyle = '#222';
          ctx.strokeStyle = '#444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(0, r);
          ctx.lineTo(-r, 0);
          ctx.lineTo(0, -r);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Inner Diamond (Floating segment)
          const spin = performance.now() * 0.002;
          ctx.save();
          ctx.rotate(spin);
          ctx.fillStyle = '#111';
          ctx.strokeStyle = enemy.color;
          ctx.beginPath();
          ctx.moveTo(r*0.6, 0);
          ctx.lineTo(0, r*0.6);
          ctx.lineTo(-r*0.6, 0);
          ctx.lineTo(0, -r*0.6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Gun Barrel
          ctx.fillStyle = '#333';
          ctx.fillRect(r * 0.5, -r * 0.1, r * 0.6, r * 0.2);
          
          // Sensor Node
          ctx.fillStyle = enemy.color;
          ctx.beginPath();
          ctx.arc(r * 1.1, 0, r * 0.1, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'elite': {
          // --- GUARD (Shielded Obelisk) ---
          // Energy Shields
          ctx.globalAlpha = 0.3 + pulse * 0.2;
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 2;
          const shieldSpin = performance.now() * -0.001;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.2, r * 1.2, shieldSpin + (i * Math.PI / 1.5), -Math.PI/4, Math.PI/4);
            ctx.stroke();
          }
          ctx.globalAlpha = 1.0;

          // Obelisk Body (Hexagon)
          ctx.fillStyle = '#111';
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const hexAngle = (i * Math.PI) / 3;
            const hx = Math.cos(hexAngle) * r;
            const hy = Math.sin(hexAngle) * r;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Complex inner runes/lines
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-r*0.5, -r*0.5); ctx.lineTo(r*0.5, r*0.5);
          ctx.moveTo(-r*0.5, r*0.5); ctx.lineTo(r*0.5, -r*0.5);
          ctx.stroke();
          
          // Beating core
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.2 * (1 + pulse * 0.5), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'phantom': {
          // --- PHANTOM (Digital Glitch) ---
          // Scanlines and jitter
          const jitterX = (Math.random() - 0.5) * 4;
          const jitterY = (Math.random() - 0.5) * 4;
          ctx.translate(jitterX, jitterY);
          
          ctx.globalAlpha = 0.6 + Math.random() * 0.4;
          
          // Ghastly Trail
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.beginPath();
          ctx.moveTo(r * 0.5, 0);
          ctx.bezierCurveTo(-r * 2, -r * 1.5, -r * 2, r * 1.5, r * 0.5, 0);
          ctx.fill();

          // Body Silhouette (jagged/glitching)
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(r * 0.5, r * 0.8);
          ctx.lineTo(-r * 0.2, r * 0.9);
          ctx.lineTo(-r, r * 0.4);
          ctx.lineTo(-r * 0.5, 0);
          ctx.lineTo(-r, -r * 0.4);
          ctx.lineTo(-r * 0.2, -r * 0.9);
          ctx.lineTo(r * 0.5, -r * 0.8);
          ctx.closePath();
          ctx.fill();
          
          // Dark digital voids for eyes
          ctx.fillStyle = '#000';
          ctx.fillRect(r * 0.2, -r * 0.4, r * 0.2 + Math.random()*2, r * 0.2);
          ctx.fillRect(r * 0.2, r * 0.2, r * 0.2 + Math.random()*2, r * 0.2);
          
          // Glitch lines across body
          ctx.fillStyle = enemy.color;
          ctx.fillRect(-r*0.8, -r*0.6, r*1.6, Math.random() * 3);
          ctx.fillRect(-r*0.6, 0, r*1.2, Math.random() * 3);
          ctx.fillRect(-r*0.8, r*0.6, r*1.6, Math.random() * 3);
          
          ctx.globalAlpha = 1.0;
          break;
        }
        case 'boss':
        case 'titan': {
          // --- BOSS/TITAN (Multi-stage Fortress) ---
          // Rotate whole assembly slowly
          ctx.rotate(performance.now() * 0.0005);
          
          // 1. Outer Danger Ring (pulsing loudly)
          ctx.strokeStyle = `rgba(255, 0, 0, ${0.2 + pulse * 0.3})`;
          ctx.lineWidth = r * 0.1;
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
          ctx.stroke();

          // 2. Spinning Armor Plates (Outer)
          ctx.fillStyle = '#222';
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 3;
          const shellCount = enemy.type === 'titan' ? 12 : 8;
          for (let i = 0; i < shellCount; i++) {
            ctx.save();
            ctx.rotate((i * Math.PI * 2) / shellCount + performance.now() * 0.001);
            ctx.beginPath();
            ctx.moveTo(r, -r * 0.2);
            ctx.lineTo(r * 1.1, 0);
            ctx.lineTo(r, r * 0.2);
            ctx.lineTo(r * 0.8, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          
          // 3. Inner Mechanism (Counter-rotating gear)
          ctx.fillStyle = '#111';
          ctx.strokeStyle = '#555';
          ctx.lineWidth = 2;
          ctx.save();
          ctx.rotate(performance.now() * -0.002);
          ctx.beginPath();
          const gearTeeth = 16;
          for (let i = 0; i < gearTeeth; i++) {
            const angle = (i * Math.PI * 2) / gearTeeth;
            const d = i % 2 === 0 ? r * 0.7 : r * 0.85;
            const gx = Math.cos(angle) * d;
            const gy = Math.sin(angle) * d;
            if (i === 0) ctx.moveTo(gx, gy);
            else ctx.lineTo(gx, gy);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // 4. Central Power Core
          const bossGrad = ctx.createRadialGradient(0, 0, r*0.1, 0, 0, r*0.6);
          bossGrad.addColorStop(0, '#fff');
          bossGrad.addColorStop(0.3, enemy.color);
          bossGrad.addColorStop(1, '#000');
          ctx.fillStyle = bossGrad;
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.6 + Math.sin(performance.now() * 0.01) * r * 0.05, 0, Math.PI * 2);
          ctx.fill();
          
          // 5. Four Eye-Nodes
          ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + pulse * 0.3})`;
          for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.rotate((i * Math.PI * 2) / 4);
            ctx.beginPath();
            ctx.ellipse(r * 0.35, 0, r * 0.1, r * 0.05, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          break;
        }
        default: {
          // Fallback (old style just in case)
          ctx.fillStyle = enemy.color;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(r * 0.5, 0, r * 0.2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }

    ctx.restore();
  }

  drawTreasureChest(treasure: Treasure) {
    const { x, y } = treasure.position;
    const time = performance.now() / 1000;
    const elapsed = performance.now() - treasure.spawnTime;
    const spawnScale = Math.min(1, elapsed / 400);

    // Bobbing animation
    const bob = Math.sin(time * 2.0) * 4;
    // Gentle rotation
    const tilt = Math.sin(time * 1.3) * 0.04;

    this.ctx.save();
    this.ctx.translate(x, y + bob);
    this.ctx.rotate(tilt);
    this.ctx.scale(spawnScale, spawnScale);

    const isLegendary = treasure.tier === 'legendary';
    const isEpic = treasure.tier === 'epic';

    // ── Outer glow ──
    const glowPulse = 0.5 + Math.sin(time * 3) * 0.3;
    const glowColor = isLegendary ? `rgba(255, 140, 0, ${0.25 * glowPulse})` :
                       isEpic ? `rgba(168, 85, 247, ${0.2 * glowPulse})` :
                       `rgba(255, 215, 0, ${0.15 * glowPulse})`;
    const glowRadius = isLegendary ? 60 : isEpic ? 50 : 40;
    const grd = this.ctx.createRadialGradient(0, -4, 4, 0, -4, glowRadius);
    grd.addColorStop(0, glowColor);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    this.ctx.fillStyle = grd;
    this.ctx.fillRect(-glowRadius, -glowRadius - 4, glowRadius * 2, glowRadius * 2);

    // ── Ground shadow ──
    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(0, 16, 18, 5, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Color scheme by tier
    const bodyMain = isLegendary ? '#cc5500' : isEpic ? '#6b21a8' : '#8B6914';
    const bodyLight = isLegendary ? '#ff8800' : isEpic ? '#a855f7' : '#C89B3C';
    const bodyDark = isLegendary ? '#7a3300' : isEpic ? '#4c1d95' : '#5C4A1C';
    const metalColor = isLegendary ? '#fff' : isEpic ? '#e9d5ff' : '#ffd700';
    const metalDark = isLegendary ? '#ffcc00' : isEpic ? '#c084fc' : '#b8860b';
    const gemColor = isLegendary ? '#ff3333' : isEpic ? '#c084fc' : '#00ccff';
    const gemGlow = isLegendary ? '#ff6666' : isEpic ? '#e9d5ff' : '#66eeff';

    // ── Chest body (bottom box) ──
    const bw = 28;  // half-width
    const bh = 16;  // height of bottom
    const by = 0;   // top of bottom box

    // Main body
    this.ctx.fillStyle = bodyMain;
    this.ctx.beginPath();
    this.ctx.roundRect(-bw, by, bw * 2, bh, [0, 0, 4, 4]);
    this.ctx.fill();

    // Body highlight (top strip)
    this.ctx.fillStyle = bodyLight;
    this.ctx.fillRect(-bw, by, bw * 2, 4);

    // Body shadow (bottom strip)
    this.ctx.fillStyle = bodyDark;
    this.ctx.fillRect(-bw, by + bh - 3, bw * 2, 3);

    // ── Chest lid (dome/arch) ──
    const lidH = 14;
    this.ctx.fillStyle = bodyLight;
    this.ctx.beginPath();
    this.ctx.moveTo(-bw, by);
    this.ctx.lineTo(-bw, by - lidH + 4);
    this.ctx.quadraticCurveTo(-bw, by - lidH, -bw + 4, by - lidH);
    this.ctx.lineTo(bw - 4, by - lidH);
    this.ctx.quadraticCurveTo(bw, by - lidH, bw, by - lidH + 4);
    this.ctx.lineTo(bw, by);
    this.ctx.closePath();
    this.ctx.fill();

    // Lid top highlight
    this.ctx.fillStyle = isLegendary ? '#ffaa44' : isEpic ? '#c084fc' : '#e8c252';
    this.ctx.beginPath();
    this.ctx.moveTo(-bw + 2, by - lidH + 4);
    this.ctx.quadraticCurveTo(-bw + 2, by - lidH + 1, -bw + 5, by - lidH + 1);
    this.ctx.lineTo(bw - 5, by - lidH + 1);
    this.ctx.quadraticCurveTo(bw - 2, by - lidH + 1, bw - 2, by - lidH + 4);
    this.ctx.lineTo(bw - 2, by - lidH + 6);
    this.ctx.lineTo(-bw + 2, by - lidH + 6);
    this.ctx.closePath();
    this.ctx.fill();

    // ── Metal bands (horizontal) ──
    this.ctx.fillStyle = metalColor;
    // Band across lid/body seam
    this.ctx.fillRect(-bw - 1, by - 2, bw * 2 + 2, 4);
    // Band across lid top
    this.ctx.fillRect(-bw - 1, by - lidH + 2, bw * 2 + 2, 3);

    // ── Metal bands (vertical) ──
    this.ctx.fillRect(-3, by - lidH, 6, bh + lidH);

    // Metal edges
    this.ctx.fillStyle = metalDark;
    this.ctx.fillRect(-bw - 1, by - 2, 3, 4);
    this.ctx.fillRect(bw - 2, by - 2, 3, 4);

    // ── Corner rivets ──
    this.ctx.fillStyle = metalColor;
    const rivetPositions = [
      [-bw + 3, by + 3], [bw - 3, by + 3],
      [-bw + 3, by + bh - 4], [bw - 3, by + bh - 4],
      [-bw + 3, by - lidH + 5], [bw - 3, by - lidH + 5]
    ];
    for (const [rx, ry] of rivetPositions) {
      this.ctx.beginPath();
      this.ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // ── Center gem / lock ──
    const gemY = by - 6;
    const gemPulse = 0.8 + Math.sin(time * 4) * 0.2;

    // Gem glow
    this.ctx.shadowBlur = 12 * gemPulse;
    this.ctx.shadowColor = gemGlow;

    // Gem diamond shape
    this.ctx.fillStyle = gemColor;
    this.ctx.beginPath();
    this.ctx.moveTo(0, gemY - 6);
    this.ctx.lineTo(5, gemY);
    this.ctx.lineTo(0, gemY + 6);
    this.ctx.lineTo(-5, gemY);
    this.ctx.closePath();
    this.ctx.fill();

    // Gem inner highlight
    this.ctx.fillStyle = gemGlow;
    this.ctx.globalAlpha = 0.6;
    this.ctx.beginPath();
    this.ctx.moveTo(0, gemY - 3);
    this.ctx.lineTo(2, gemY);
    this.ctx.lineTo(0, gemY + 3);
    this.ctx.lineTo(-2, gemY);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;

    // ── Light rays from chest (legendary/epic only) ──
    if (isLegendary || isEpic) {
      const rayColor = isLegendary ? 'rgba(255, 180, 0, ' : 'rgba(168, 85, 247, ';
      for (let i = 0; i < 5; i++) {
        const rayAngle = -Math.PI / 2 + (i - 2) * 0.3 + Math.sin(time * 2 + i) * 0.1;
        const rayLen = 20 + Math.sin(time * 3 + i * 1.5) * 8;
        const rayAlpha = 0.15 + Math.sin(time * 2.5 + i) * 0.1;
        this.ctx.strokeStyle = rayColor + rayAlpha + ')';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(0, by - lidH - 2);
        this.ctx.lineTo(
          Math.cos(rayAngle) * rayLen,
          by - lidH - 2 + Math.sin(rayAngle) * rayLen
        );
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
  }

  drawItem(item: any) {
    const { x, y } = item.position;
    const time = Date.now() / 500;
    const float = Math.sin(time) * 5;
    const type = ITEM_TYPES[item.type as keyof typeof ITEM_TYPES];

    this.ctx.save();
    this.ctx.translate(x, y + float);
    this.ctx.fillStyle = item.color;

    if (type.shape === 'heart') {
      const size = 12;
      this.ctx.beginPath();
      this.ctx.moveTo(0, size / 4);
      this.ctx.bezierCurveTo(0, 0, -size / 2, 0, -size / 2, size / 4);
      this.ctx.bezierCurveTo(-size / 2, size / 2, 0, size * 0.8, 0, size);
      this.ctx.bezierCurveTo(0, size * 0.8, size / 2, size / 2, size / 2, size / 4);
      this.ctx.bezierCurveTo(size / 2, 0, 0, 0, 0, size / 4);
      this.ctx.fill();
    } else if (type.shape === 'circle') {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    } else if (type.shape === 'magnet') {
      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = item.color;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 8, Math.PI, 0);
      this.ctx.stroke();
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(-10, 0, 4, 4);
      this.ctx.fillRect(6, 0, 4, 4);
    } else if (type.shape === 'bomb') {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(-2, -12, 4, 6);
    } else if (type.shape === 'star') {
      const spikes = 5;
      const outerRadius = 10;
      const innerRadius = 5;
      let rot = Math.PI / 2 * 3;
      let x = 0;
      let y = 0;
      const step = Math.PI / spikes;

      this.ctx.beginPath();
      this.ctx.moveTo(0, -outerRadius);
      for (let i = 0; i < spikes; i++) {
        x = Math.cos(rot) * outerRadius;
        y = Math.sin(rot) * outerRadius;
        this.ctx.lineTo(x, y);
        rot += step;

        x = Math.cos(rot) * innerRadius;
        y = Math.sin(rot) * innerRadius;
        this.ctx.lineTo(x, y);
        rot += step;
      }
      this.ctx.lineTo(0, -outerRadius);
      this.ctx.closePath();
      this.ctx.fillStyle = '#fff';
      this.ctx.fill();
      this.ctx.strokeStyle = '#00ffff';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      
      // Additional glow for data core
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#00ffff';
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }

    this.ctx.restore();
  }

  drawUI() {
    const iconSize = 28;
    const padding = 6;
    const weaponCount = this.player.weapons.length;
    const upgradeCount = this.player.upgrades.length;

    // Draw weapons and upgrades in the same top-center XP-bar width region.
    const xpRegionWidth = Math.min(672, this.canvas.width - 80);
    const regionStartX = Math.round((this.canvas.width - xpRegionWidth) / 2);
    const weaponsY = 72;
    const upgradesY = weaponsY + iconSize + padding;

    if (weaponCount > 0) {
      const step = weaponCount === 1 ? 0 : (xpRegionWidth - iconSize) / (weaponCount - 1);
      this.player.weapons.forEach((weapon, i) => {
        const x = Math.round(regionStartX + i * step);
        this.drawIconBox(x, weaponsY, iconSize, weapon.id, weapon.level, '#00ffff');
      });
    }

    if (upgradeCount > 0) {
      const step = upgradeCount === 1 ? 0 : (xpRegionWidth - iconSize) / (upgradeCount - 1);
      this.player.upgrades.forEach((upgrade, i) => {
        const x = Math.round(regionStartX + i * step);
        this.drawIconBox(x, upgradesY, iconSize, upgrade.id, (upgrade as any).level, '#ffaa00');
      });
    }

    if (this.nearbyShop) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      this.ctx.strokeStyle = 'rgba(103, 232, 249, 0.65)';
      this.ctx.lineWidth = 1;
      const promptWidth = 320;
      const promptHeight = 34;
      const promptX = Math.round((this.canvas.width - promptWidth) / 2);
      const promptY = this.canvas.height - 96;
      this.ctx.beginPath();
      this.ctx.roundRect(promptX, promptY, promptWidth, promptHeight, 8);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = '#67e8f9';
      this.ctx.font = 'bold 14px Inter';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('PRESS ENTER TO ENTER SHOP', this.canvas.width / 2, promptY + 22);
    }
  }

  drawIconBox(x: number, y: number, size: number, id: string, level: number, color: string) {
    // Background
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, size, size, 6);
    this.ctx.fill();
    this.ctx.stroke();

    // Icon
    this.ctx.save();
    this.ctx.translate(x + size / 2, y + size / 2);
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = 2.5;
    this.ctx.scale(0.5, 0.5); // Slightly smaller icons

    this.drawIconPath(id);

    this.ctx.restore();

    // Level indicator
    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 9px Inter';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(level.toString(), x + size - 3, y + size - 3);
  }

  drawIconPath(id: string) {
    const s = 20; // Base size for icon paths
    this.ctx.beginPath();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    switch (id) {
      case 'plasma_gun':
        this.ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
        break;
      case 'orbit_drones':
        this.ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(s * 0.8, 0, s * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(-s * 0.8, 0, s * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
        break;
      case 'neon_shards':
        this.ctx.moveTo(0, -s);
        this.ctx.lineTo(s, s);
        this.ctx.lineTo(-s, s);
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(0, -s * 0.5);
        this.ctx.lineTo(s * 0.5, s * 0.5);
        this.ctx.lineTo(-s * 0.5, s * 0.5);
        this.ctx.closePath();
        this.ctx.fill();
        break;
      case 'void_aura':
        this.ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
        this.ctx.setLineDash([3, 3]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        break;
      case 'neural_pulse':
        for (let i = 1; i <= 3; i++) {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, s * 0.3 * i, 0, Math.PI * 2);
          this.ctx.stroke();
        }
        break;
      case 'data_scythe':
        this.ctx.arc(0, 0, s, Math.PI, Math.PI * 1.6);
        this.ctx.stroke();
        this.ctx.lineTo(0, 0);
        this.ctx.stroke();
        break;
      case 'cyber_blade':
        this.ctx.moveTo(-s, s);
        this.ctx.lineTo(s, -s);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(-s * 0.5, s * 0.5);
        this.ctx.lineTo(s * 0.5, -s * 0.5);
        this.ctx.stroke();
        break;
      case 'sonic_boom':
        for (let i = 1; i <= 3; i++) {
          this.ctx.beginPath();
          this.ctx.arc(-s * 0.5, 0, s * 0.5 * i, -Math.PI / 3, Math.PI / 3);
          this.ctx.stroke();
        }
        break;
      case 'nano_swarm':
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI * 2) / 6;
          this.ctx.beginPath();
          this.ctx.arc(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8, 4, 0, Math.PI * 2);
          this.ctx.fill();
        }
        break;
      // Stats
      case 'might':
        this.ctx.moveTo(0, -s);
        this.ctx.lineTo(-s * 0.6, 0);
        this.ctx.lineTo(0, 0);
        this.ctx.lineTo(-s * 0.3, s);
        this.ctx.lineTo(s * 0.8, -s * 0.2);
        this.ctx.lineTo(0, -s * 0.2);
        this.ctx.closePath();
        this.ctx.fill();
        break;
      case 'area':
        this.ctx.strokeRect(-s, -s, s * 2, s * 2);
        this.ctx.moveTo(0, -s * 1.2); this.ctx.lineTo(0, s * 1.2);
        this.ctx.moveTo(-s * 1.2, 0); this.ctx.lineTo(s * 1.2, 0);
        this.ctx.stroke();
        break;
      case 'speed':
        this.ctx.moveTo(-s, -s * 0.6);
        this.ctx.lineTo(s, 0);
        this.ctx.lineTo(-s, s * 0.6);
        this.ctx.lineTo(-s * 0.5, 0);
        this.ctx.closePath();
        this.ctx.fill();
        break;
      case 'cooldown':
        this.ctx.arc(0, 0, s, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(0, -s * 0.8);
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(s * 0.6, 0);
        this.ctx.stroke();
        break;
      case 'growth':
        this.ctx.moveTo(0, s);
        this.ctx.lineTo(0, -s);
        this.ctx.lineTo(-s * 0.6, -s * 0.4);
        this.ctx.moveTo(0, -s);
        this.ctx.lineTo(s * 0.6, -s * 0.4);
        this.ctx.stroke();
        break;
      case 'amount':
        this.ctx.strokeRect(-s * 0.9, -s * 0.9, s, s);
        this.ctx.strokeRect(-s * 0.1, -s * 0.1, s, s);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(-s * 0.1, -s * 0.1, s, s);
        break;
      case 'health':
        const h = s * 0.9;
        this.ctx.moveTo(0, h / 4);
        this.ctx.bezierCurveTo(0, 0, -h / 2, 0, -h / 2, h / 4);
        this.ctx.bezierCurveTo(-h / 2, h / 2, 0, h * 0.8, 0, h);
        this.ctx.bezierCurveTo(0, h * 0.8, h / 2, h / 2, h / 2, h / 4);
        this.ctx.bezierCurveTo(h / 2, 0, 0, 0, 0, h / 4);
        this.ctx.fill();
        break;
      case 'luck':
        this.ctx.strokeRect(-s, -s, s * 2, s * 2);
        this.ctx.beginPath(); this.ctx.arc(-s * 0.5, -s * 0.5, 3, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.beginPath(); this.ctx.arc(s * 0.5, s * 0.5, 3, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.beginPath(); this.ctx.arc(-s * 0.5, s * 0.5, 3, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.beginPath(); this.ctx.arc(s * 0.5, -s * 0.5, 3, 0, Math.PI * 2); this.ctx.fill();
        break;
      case 'regen':
        this.ctx.moveTo(0, -s); this.ctx.lineTo(0, s);
        this.ctx.moveTo(-s, 0); this.ctx.lineTo(s, 0);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
        this.ctx.stroke();
        break;
      // === NEW WEAPON ICONS ===
      case 'phantom_chain':
        // Lightning bolt zigzag
        this.ctx.moveTo(-s, -s * 0.5);
        this.ctx.lineTo(-s * 0.2, -s * 0.15);
        this.ctx.lineTo(0, -s * 0.6);
        this.ctx.lineTo(s * 0.3, 0);
        this.ctx.lineTo(-s * 0.1, s * 0.15);
        this.ctx.lineTo(s, s * 0.5);
        this.ctx.stroke();
        break;
      case 'gravity_well':
        // Spiral
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 3;
          const r2 = s * (i / 20);
          const px = Math.cos(a) * r2;
          const py = Math.sin(a) * r2;
          if (i === 0) this.ctx.moveTo(px, py);
          else this.ctx.lineTo(px, py);
        }
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
        this.ctx.fill();
        break;
      case 'mirror_shards':
        // Multiple small diamonds
        for (let i = 0; i < 3; i++) {
          this.ctx.beginPath();
          const ox = (i - 1) * s * 0.6;
          this.ctx.moveTo(ox, -s * 0.6); this.ctx.lineTo(ox + s * 0.3, 0);
          this.ctx.lineTo(ox, s * 0.6); this.ctx.lineTo(ox - s * 0.3, 0);
          this.ctx.closePath();
          this.ctx.fill();
        }
        break;
      case 'spectral_helix':
        // DNA double helix
        for (let i = 0; i < 12; i++) {
          const t3 = (i / 12) * Math.PI * 2;
          const y3 = -s + (2 * s * i / 12);
          this.ctx.beginPath();
          this.ctx.arc(Math.sin(t3) * s * 0.5, y3, 2.5, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.beginPath();
          this.ctx.arc(-Math.sin(t3) * s * 0.5, y3, 2.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
        break;
      case 'void_tendrils':
        // Tentacle curves
        for (let i = 0; i < 3; i++) {
          const baseAngle2 = (i / 3) * Math.PI * 2 - Math.PI / 2;
          this.ctx.beginPath();
          this.ctx.moveTo(0, 0);
          this.ctx.quadraticCurveTo(
            Math.cos(baseAngle2 + 0.3) * s * 0.6,
            Math.sin(baseAngle2 + 0.3) * s * 0.6,
            Math.cos(baseAngle2) * s,
            Math.sin(baseAngle2) * s
          );
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(Math.cos(baseAngle2) * s, Math.sin(baseAngle2) * s, 3, 0, Math.PI * 2);
          this.ctx.fill();
        }
        break;
      case 'solar_flare':
        // Cone/fan shape
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(s, -s * 0.7);
        this.ctx.arc(0, 0, s, -Math.PI / 4, Math.PI / 4);
        this.ctx.lineTo(0, 0);
        this.ctx.fill();
        break;
      case 'quantum_echo':
        // Overlapping ghost outlines
        for (let i = 0; i < 3; i++) {
          this.ctx.globalAlpha = 0.3 + i * 0.25;
          this.ctx.beginPath();
          this.ctx.arc(i * s * 0.25 - s * 0.25, 0, s * 0.6, 0, Math.PI * 2);
          this.ctx.stroke();
        }
        this.ctx.globalAlpha = 1;
        break;
      case 'frost_aura':
        // Snowflake
        for (let i = 0; i < 6; i++) {
          this.ctx.rotate(Math.PI / 3);
          this.ctx.beginPath();
          this.ctx.moveTo(0, 0);
          this.ctx.lineTo(0, -s);
          this.ctx.moveTo(0, -s * 0.5);
          this.ctx.lineTo(-s * 0.3, -s * 0.8);
          this.ctx.moveTo(0, -s * 0.5);
          this.ctx.lineTo(s * 0.3, -s * 0.8);
          this.ctx.stroke();
        }
        break;
      case 'stardust':
        // Four-point star
        this.ctx.beginPath();
        this.ctx.moveTo(0, -s * 0.8);
        this.ctx.quadraticCurveTo(0, 0, s * 0.8, 0);
        this.ctx.quadraticCurveTo(0, 0, 0, s * 0.8);
        this.ctx.quadraticCurveTo(0, 0, -s * 0.8, 0);
        this.ctx.quadraticCurveTo(0, 0, 0, -s * 0.8);
        this.ctx.fill();
        break;
      case 'arc_weaver':
        // Web/network pattern
        const nodes2 = [
          { x: 0, y: -s }, { x: s, y: 0 }, { x: 0, y: s }, { x: -s, y: 0 },
          { x: s * 0.5, y: -s * 0.5 }, { x: -s * 0.5, y: s * 0.5 }
        ];
        for (let i = 0; i < nodes2.length; i++) {
          for (let j = i + 1; j < nodes2.length; j++) {
            this.ctx.beginPath();
            this.ctx.moveTo(nodes2[i].x, nodes2[i].y);
            this.ctx.lineTo(nodes2[j].x, nodes2[j].y);
            this.ctx.stroke();
          }
          this.ctx.beginPath();
          this.ctx.arc(nodes2[i].x, nodes2[i].y, 2.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
        break;
      // Dash upgrades
      case 'dash_deadlock_burst':
        this.ctx.moveTo(-s * 0.2, -s);
        this.ctx.lineTo(s * 0.5, -s * 0.1);
        this.ctx.lineTo(0, -s * 0.1);
        this.ctx.lineTo(s * 0.2, s);
        this.ctx.lineTo(-s * 0.5, s * 0.1);
        this.ctx.lineTo(0, s * 0.1);
        this.ctx.closePath();
        this.ctx.fill();
        break;
      case 'dash_twin_vector':
        this.ctx.moveTo(-s, -s * 0.5);
        this.ctx.lineTo(0, -s * 0.5);
        this.ctx.lineTo(-s * 0.2, -s * 0.8);
        this.ctx.moveTo(-s, s * 0.5);
        this.ctx.lineTo(0, s * 0.5);
        this.ctx.lineTo(-s * 0.2, s * 0.8);
        this.ctx.moveTo(s * 0.2, -s * 0.5);
        this.ctx.lineTo(s, -s * 0.5);
        this.ctx.lineTo(s * 0.8, -s * 0.8);
        this.ctx.moveTo(s * 0.2, s * 0.5);
        this.ctx.lineTo(s, s * 0.5);
        this.ctx.lineTo(s * 0.8, s * 0.8);
        this.ctx.stroke();
        break;
      case 'dash_aegis_slip':
        this.ctx.moveTo(0, -s);
        this.ctx.lineTo(s * 0.8, -s * 0.3);
        this.ctx.lineTo(s * 0.6, s * 0.8);
        this.ctx.lineTo(0, s);
        this.ctx.lineTo(-s * 0.6, s * 0.8);
        this.ctx.lineTo(-s * 0.8, -s * 0.3);
        this.ctx.closePath();
        this.ctx.stroke();
        break;
      case 'dash_afterimage_minefield':
        for (let i = -1; i <= 1; i++) {
          this.ctx.beginPath();
          this.ctx.arc(i * s * 0.6, 0, s * 0.28, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.moveTo(i * s * 0.6, -s * 0.5);
          this.ctx.lineTo(i * s * 0.6, s * 0.5);
          this.ctx.moveTo(i * s * 0.3, 0);
          this.ctx.lineTo(i * s * 0.9, 0);
          this.ctx.stroke();
        }
        break;
      case 'dash_phase_laceration':
        this.ctx.moveTo(-s, s * 0.8);
        this.ctx.lineTo(s, -s * 0.8);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(-s * 0.6, s);
        this.ctx.lineTo(s * 0.6, -s);
        this.ctx.stroke();
        break;
      case 'dash_null_wake':
        this.ctx.moveTo(-s, 0);
        this.ctx.quadraticCurveTo(-s * 0.3, -s * 0.8, s * 0.2, 0);
        this.ctx.quadraticCurveTo(s * 0.6, s * 0.8, s, 0);
        this.ctx.stroke();
        break;
      case 'dash_inertia_vault':
        this.ctx.moveTo(-s, s * 0.7);
        this.ctx.lineTo(0, -s * 0.8);
        this.ctx.lineTo(s, s * 0.7);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(-s * 0.5, s * 0.2);
        this.ctx.lineTo(s * 0.5, s * 0.2);
        this.ctx.stroke();
        break;
      case 'dash_kinetic_refund':
        this.ctx.arc(0, 0, s * 0.75, Math.PI * 0.2, Math.PI * 1.8);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(-s * 0.6, -s * 0.3);
        this.ctx.lineTo(-s * 0.9, -s * 0.4);
        this.ctx.lineTo(-s * 0.75, -s * 0.1);
        this.ctx.fill();
        break;
      case 'dash_bulwark_ram':
        this.ctx.moveTo(-s * 0.9, -s * 0.4);
        this.ctx.lineTo(s * 0.2, -s * 0.4);
        this.ctx.lineTo(s * 0.8, 0);
        this.ctx.lineTo(s * 0.2, s * 0.4);
        this.ctx.lineTo(-s * 0.9, s * 0.4);
        this.ctx.closePath();
        this.ctx.stroke();
        break;
      case 'dash_echo_recall':
        this.ctx.arc(0, 0, s * 0.65, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(0, -s * 0.25);
        this.ctx.lineTo(0, s * 0.35);
        this.ctx.lineTo(-s * 0.25, s * 0.12);
        this.ctx.stroke();
        break;
      case 'dash_prism_guard':
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          const ox = Math.cos(a) * s * 0.65;
          const oy = Math.sin(a) * s * 0.65;
          this.ctx.beginPath();
          this.ctx.moveTo(ox, oy - s * 0.25);
          this.ctx.lineTo(ox + s * 0.25, oy);
          this.ctx.lineTo(ox, oy + s * 0.25);
          this.ctx.lineTo(ox - s * 0.25, oy);
          this.ctx.closePath();
          this.ctx.stroke();
        }
        break;
      case 'dash_cataclysm_brake':
        this.ctx.beginPath();
        this.ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(-s * 0.8, 0);
        this.ctx.lineTo(s * 0.8, 0);
        this.ctx.moveTo(0, -s * 0.8);
        this.ctx.lineTo(0, s * 0.8);
        this.ctx.stroke();
        break;
      default:
        this.ctx.strokeRect(-s, -s, s * 2, s * 2);
        break;
    }
  }

  drawCompass() {
    const ctx = this.ctx;
    const time = Date.now() / 1000;
    const radius = 36;
    const cx = this.canvas.width - radius - 16;
    const cy = this.canvas.height - radius - 16;

    // Find closest treasure (if any exist)
    let closestTreasure: { dist: number; angle: number } | null = null;
    for (const t of this.treasures) {
      const dx = t.position.x - this.player.position.x;
      const dy = t.position.y - this.player.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (!closestTreasure || d < closestTreasure.dist) {
        closestTreasure = { dist: d, angle: Math.atan2(dy, dx) };
      }
    }

    // Treasure takes priority when within 1200px
    const treasureMode = closestTreasure !== null && closestTreasure.dist < 1200;

    // Determine what the compass is tracking
    const target = treasureMode ? closestTreasure! : null;
    const needleAngle = target ? target.angle : 0;

    // Theme colors
    let rimColor: string;
    let needleColor: string;
    let glowColor: string;
    let label: string;
    let labelDist: string;

    if (treasureMode) {
      rimColor = 'rgba(255, 215, 0, 0.6)';
      needleColor = '#ffd700';
      glowColor = 'rgba(255, 215, 0, 0.15)';
      label = 'TREASURE';
      labelDist = `${Math.round(closestTreasure!.dist)}m`;
    } else {
      rimColor = 'rgba(100, 100, 100, 0.3)';
      needleColor = '#555';
      glowColor = 'rgba(0,0,0,0)';
      label = 'NO SIGNAL';
      labelDist = '';
    }

    ctx.save();

    // Outer glow
    const outerGlow = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.6);
    outerGlow.addColorStop(0, glowColor);
    outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Background disc
    ctx.fillStyle = 'rgba(5, 8, 18, 0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Rim
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal tick marks
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const inner = i % 2 === 0 ? radius - 7 : radius - 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * (radius - 2), cy + Math.sin(a) * (radius - 2));
      ctx.stroke();
    }

    // Center dot
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    // Needle
    if (target) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(needleAngle);

      // Needle trail glow
      const trailGrad = ctx.createLinearGradient(0, 0, radius - 8, 0);
      trailGrad.addColorStop(0, 'rgba(0,0,0,0)');
      trailGrad.addColorStop(1, needleColor);
      ctx.strokeStyle = trailGrad;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(radius - 8, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Arrow head
      ctx.fillStyle = needleColor;
      ctx.beginPath();
      ctx.moveTo(radius - 6, 0);
      ctx.lineTo(radius - 18, -6);
      ctx.lineTo(radius - 14, 0);
      ctx.lineTo(radius - 18, 6);
      ctx.closePath();
      ctx.fill();

      // Back tail (dimmer)
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(-radius + 12, 0);
      ctx.lineTo(-radius + 20, -3);
      ctx.lineTo(-radius + 20, 3);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // Label below compass
    ctx.fillStyle = needleColor;
    ctx.font = 'bold 9px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + radius + 13);
    if (labelDist) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '8px Inter';
      ctx.fillText(labelDist, cx, cy + radius + 23);
    }

    ctx.restore();
  }

  drawGrid() {
    const gridSize = 100;
    const ctx = this.ctx;
    
    // Smooth camera-based offsets for grid
    const offsetX = -this.camera.x % gridSize;
    const offsetY = -this.camera.y % gridSize;

    // Sub-grid (very subtle)
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.02)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = offsetX; x < this.canvas.width; x += gridSize / 2) {
      ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height);
    }
    for (let y = offsetY; y < this.canvas.height; y += gridSize / 2) {
      ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y);
    }
    ctx.stroke();

    // Main grid lines — sleek cyan tint
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    for (let x = offsetX; x < this.canvas.width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
    }
    for (let y = offsetY; y < this.canvas.height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
    }
    ctx.stroke();

    // Accent intersections (crosses)
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    for (let x = offsetX; x < this.canvas.width; x += gridSize) {
      for (let y = offsetY; y < this.canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
        ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
        ctx.stroke();
      }
    }
  }

  drawShops() {
    const ctx = this.ctx;
    const time = performance.now() / 1000;

    for (const shop of this.shops) {
      if (!this.isInView(shop.position, shop.radius + 40, 120)) continue;

      ctx.save();
      ctx.translate(shop.position.x, shop.position.y);

      const pulse = 0.7 + Math.sin(time * 2.2) * 0.2;

      // Outer soft glow
      const glow = ctx.createRadialGradient(0, 0, shop.radius * 0.3, 0, 0, shop.radius * 1.4);
      glow.addColorStop(0, 'rgba(34, 211, 238, 0.10)');
      glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, shop.radius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Enterable perimeter ring
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.45 + pulse * 0.25})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -time * 30;
      ctx.beginPath();
      ctx.arc(0, 0, shop.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner safe fill so zone reads at a glance
      ctx.fillStyle = 'rgba(8, 35, 44, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, shop.radius - 3, 0, Math.PI * 2);
      ctx.fill();

      // Shop icon plate in center
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-18, -16, 36, 32, 7);
      ctx.fill();
      ctx.stroke();

      // Simple storefront glyph
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11, -4);
      ctx.lineTo(11, -4);
      ctx.moveTo(-9, -4);
      ctx.lineTo(-9, 7);
      ctx.moveTo(9, -4);
      ctx.lineTo(9, 7);
      ctx.moveTo(-2, 7);
      ctx.lineTo(-2, 1);
      ctx.moveTo(2, 7);
      ctx.lineTo(2, 1);
      ctx.stroke();

      // Header marker to make it obvious from distance
      ctx.fillStyle = 'rgba(103, 232, 249, 0.95)';
      ctx.font = 'bold 10px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('SHOP', 0, -shop.radius - 8);

      ctx.restore();
    }
  }
}
