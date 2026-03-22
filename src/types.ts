export interface Vector2D {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  rotation?: number;
  radius: number;
  health: number;
  maxHealth: number;
  color: string;
}

export interface Player extends Entity {
  level: number;
  experience: number;
  experienceToNextLevel: number;
  speed: number;
  weapons: Weapon[];
  upgrades: Upgrade[];
  stats: PlayerStats;
  coins: number;
  rerolls: number;
  rerollsThisWave: number;
  banishes: number;
  skips: number;
  bannedUpgrades: Set<string>;
  permanentUpgrades: Record<string, number>;
  operatorId: string;
  pendingDataCores: number;
  currentWave: number;
  inventory: Inventory;
  armorHp: number;
  lastHitTime: number;
}

export interface PlayerStats {
  might: number; // Damage multiplier
  area: number; // Projectile size multiplier
  speed: number; // Projectile speed multiplier
  cooldown: number; // Attack speed multiplier (lower is better)
  amount: number; // Additional projectiles
  luck: number; // Critical hit / drop chance
  growth: number; // XP multiplier
  greed: number; // Gold multiplier
  regen: number; // Health per 5 seconds
  magnet_range: number; // Magnet range multiplier
  dash_cooldown: number; // Dash cooldown multiplier
  boss_damage: number; // Boss damage multiplier
  extra_weapon: number; // Extra starting weapon
  overdrive_duration: number; // Extra overdrive duration in ms
  vampirism: number; // HP restored per kill
  armor: number; // Damage reduction multiplier (0-1)
  timeWarp: number; // Enemy speed reduction
}

export interface Enemy extends Entity {
  damage: number;
  damagePercent?: number;
  speed: number;
  experienceValue: number;
  type: 'basic' | 'fast' | 'tank' | 'ranged' | 'elite' | 'phantom' | 'titan' | 'boss';
  slowMultiplier?: number;
  hitFlash?: number;
}

export interface Projectile extends Entity {
  damage: number;
  duration: number;
  ownerId: string;
  penetration: number;
  sourceWeaponId?: string;
  hitEnemies?: Set<string>;
  damageTickInterval?: number;
  lastDamageTick?: number;
}

export interface Weapon {
  id: string;
  name: string;
  level: number;
  maxLevel: number;
  description: string;
  cooldown: number;
  lastFired: number;
  type: 'projectile' | 'area' | 'orbit';
  burstCount?: number;
  burstDelay?: number;
  burstRemaining?: number;
  burstTimer?: number;
  burstRemainingCount?: number;
}

export interface ExperienceGem {
  id: string;
  position: Vector2D;
  value: number;
  color: string;
}

export interface WorldItem {
  id: string;
  position: Vector2D;
  type: 'hp' | 'coin_bronze' | 'coin_silver' | 'coin_gold' | 'coin_diamond' | 'magnet' | 'bomb' | 'data_core';
  value: number;
  color: string;
  radius?: number;
}

export interface ItemHolder extends Enemy {
  isHolder: true;
  itemType: 'hp' | 'coin' | 'magnet' | 'bomb';
}

export interface Treasure {
  id: string;
  position: Vector2D;
  color: string;
  spawnTime: number;
  tier: 'rare' | 'epic' | 'legendary';
}

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  type: 'stat' | 'weapon' | 'weapon_upgrade' | 'dash';
  icon?: string;
  rarity?: 'common' | 'rare' | 'legendary';
  cost?: number;
  coreCost?: number;
}

export interface DashState {
  // Upgrade flags
  deadlockBurst: number;
  twinVector: number;
  aegisSlip: number;
  afterimageMinefield: number;
  phaseLaceration: number;
  nullWake: number;
  inertiaVault: number;
  kineticRefund: number;
  bulwarkRam: number;
  echoRecall: number;
  prismGuard: number;
  cataclysmBrake: number;

  // Runtime state
  dashCharges: number;
  maxDashCharges: number;
  dashRechargeTimer: number;
  standStillTimer: number;
  deadlockCharged: boolean;
  echoRecallOrigin: Vector2D | null;
  echoRecallWindow: number;
  kineticRefundWindow: number;
  aegisShieldTimer: number;
  prismShardTimer: number;
  nullWakeTrail: { x: number; y: number; life: number }[];
  afterimages: { x: number; y: number; timer: number }[];
  cataclysmPending: boolean;
  cataclysmMoveTimer: number;
  bulwarkRamHit: boolean;
}

export interface OperatorDefinition {
  id: string;
  name: string;
  description: string;
  cost: number;
  startingWeaponId: string;
  statBonuses: Partial<Record<string, number>>;
  baseHealth: number;
  baseSpeed: number;
  color: string;
  colorSecondary: string;
  colorDark: string;
  colorGlow: string;
  colorVisor: string;
  colorLimbs: string;
  colorBoots: string;
}

export type GameState = 'MENU' | 'PLAYING' | 'LEVEL_UP' | 'GAME_OVER' | 'TREASURE' | 'PERMANENT_UPGRADES' | 'OPERATOR_SELECT' | 'PAUSED' | 'INTEL_ARCHIVE' | 'EXFILL_SUMMARY' | 'ADMIN_DASHBOARD' | 'WAVE_UPGRADE' | 'SHOP' | 'ACHIEVEMENTS';

export interface Inventory {
  armorTier: number; // 0=none, 1=tier1, 2=tier2, 3=tier3
  hasRevive: boolean;
  nukeCount: number;
}

export interface Shop {
  id: string;
  position: Vector2D;
  radius: number;
}
