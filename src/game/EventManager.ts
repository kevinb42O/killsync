import { ENEMY_TYPES, ITEM_TYPES, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { soundManager } from './SoundManager';
import type { GameEngine } from './Engine';

// ─── Event Types ───────────────────────────────────────────────
export type EventType =
  | 'blackout'
  | 'system_breach'
  | 'bounty_target'
  | 'supply_drop'
  | 'data_storm'
  | 'nano_plague'
  | 'firewall_collapse';

export interface ActiveEvent {
  type: EventType;
  duration: number;   // total ms
  elapsed: number;    // ms elapsed
  data: Record<string, any>;
}

export interface ToxicPool {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
}

export interface BountyTarget {
  enemyId: string;
  name: string;
  timeLimit: number;    // ms remaining
  reward: string;       // description
  claimed: boolean;
}

export interface SupplyCrate {
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  collected: boolean;
  guardSpawned: boolean;
}

// ─── Announcement Queue ────────────────────────────────────────
export interface EventAnnouncement {
  title: string;
  subtitle: string;
  color: string;
  life: number;
  maxLife: number;
  icon?: string;
}

// ─── Event Manager ─────────────────────────────────────────────
export class EventManager {
  private readonly BALANCE = {
    blackoutDuration: 35000,
    blackoutXpMultiplier: 1.8,
    breachChance: 0.55,
    breachDuration: 30000,
    bountyKillWindow: 15000,
    bountyRewardGemCount: 6,
    bountyRewardGemValue: 30,
    bountyDataCoreChance: 0.5,
    supplyHealAmount: 25,
    supplyDataCoreChance: 0.35,
    dataStormDuration: 18000,
    dataStormSpawnInterval: 380,
    dataStormGemMin: 10,
    dataStormGemMax: 18,
    dataStormCoinChance: 0.12,
    dataStormDps: 16,
    nanoPoolDps: 16,
    nanoPoolChance: 0.6,
    nanoPoolLife: 7000,
    firewallDuration: 35000,
    firewallMaxShrink: 520,
    firewallOutsideDps: 26,
  };

  // ─── Difficulty Modifiers ──────────────────────────────
  nightmareMode: boolean = false;
  adaptiveMultiplier: number = 1.0;
  private killTimestamps: number[] = [];

  activeEvents: ActiveEvent[] = [];
  announcements: EventAnnouncement[] = [];
  toxicPools: ToxicPool[] = [];
  bountyTarget: BountyTarget | null = null;
  supplyCrates: SupplyCrate[] = [];

  // Cooldowns & scheduling
  // Firewall state
  firewallBoundary: number = 0; // 0 = no shrink, positive = pixels inward
  firewallMaxShrink: number = this.BALANCE.firewallMaxShrink;
  firewallActive: boolean = false;

  // System breach state
  breachActive: boolean = false;

  constructor() {}

  reset() {
    this.activeEvents = [];
    this.announcements = [];
    this.toxicPools = [];
    this.bountyTarget = null;
    this.supplyCrates = [];
    this.firewallBoundary = 0;
    this.firewallActive = false;
    this.breachActive = false;
    this.killTimestamps = [];
    this.adaptiveMultiplier = 1.0;

    if (this.nightmareMode) {
      this.announce('☠ NIGHTMARE MODE', 'The grid will not forgive you', '#ff0033');
    }
  }

  // ─── Adaptive Difficulty ──────────────────────────────────
  private updateAdaptiveDifficulty(engine: GameEngine) {
    const now = engine.gameTime;
    // Rolling 30-second kill rate window
    this.killTimestamps = this.killTimestamps.filter(t => now - t < 30000);
    const killRate = this.killTimestamps.length / 30; // kills per second

    const timeScore = Math.min(engine.gameTime / 900000, 1); // 0→1 over 15 min
    const killScore = Math.min(killRate / 5, 1);              // 0→1 at 5 kills/sec
    this.adaptiveMultiplier = 1.0 + timeScore * 0.5 + killScore * 0.5;
    if (this.nightmareMode) this.adaptiveMultiplier += 0.7;
  }

  // ─── Main Update ───────────────────────────────────────────
  update(dt: number, engine: GameEngine) {
    const gt = engine.gameTime;
    const kills = engine.killCount;
    this.updateAdaptiveDifficulty(engine);

    // Update active events
    for (let i = this.activeEvents.length - 1; i >= 0; i--) {
      const ev = this.activeEvents[i];
      ev.elapsed += dt;
      if (ev.elapsed >= ev.duration) {
        this.onEventEnd(ev, engine);
        this.activeEvents.splice(i, 1);
      }
    }

    // Update announcements
    this.announcements = this.announcements.filter(a => {
      a.life -= dt;
      return a.life > 0;
    });

    // Update toxic pools
    this.toxicPools = this.toxicPools.filter(p => {
      p.life -= dt;
      return p.life > 0;
    });

    // Check toxic pool damage to player
    for (const pool of this.toxicPools) {
      const dx = engine.player.position.x - pool.x;
      const dy = engine.player.position.y - pool.y;
      if (dx * dx + dy * dy < pool.radius * pool.radius) {
        if (engine.reviveInvulnTimer > 0) continue;
        engine.player.health -= this.BALANCE.nanoPoolDps * this.adaptiveMultiplier * (dt / 1000);
        if (engine.player.health <= 0) {
          engine.processPlayerDeath();
          if (engine.gameState === 'GAME_OVER') return;
        }
      }
    }

    // Check supply crate pickup
    for (const crate of this.supplyCrates) {
      if (crate.collected) continue;
      const dx = engine.player.position.x - crate.x;
      const dy = engine.player.position.y - crate.y;
      if (dx * dx + dy * dy < (engine.player.radius + crate.radius) * (engine.player.radius + crate.radius)) {
        crate.collected = true;
        soundManager.playCollect();
        engine.player.health = Math.min(engine.player.maxHealth, engine.player.health + this.BALANCE.supplyHealAmount);
        if (Math.random() < this.BALANCE.supplyDataCoreChance) {
          engine.items.push({
            id: Math.random().toString(),
            position: { x: crate.x + 20, y: crate.y },
            type: 'data_core',
            value: 1,
            color: '#ffffff'
          });
        }
        engine.damageTexts.push({
          x: crate.x, y: crate.y - 30,
          text: `+${this.BALANCE.supplyHealAmount} HP`, life: 1500, maxLife: 1500, color: '#00ff88'
        });
        engine.damageTexts.push({
          x: crate.x, y: crate.y - 50,
          text: 'SUPPLY COLLECTED', life: 2000, maxLife: 2000, color: '#ffd700'
        });
        engine.createExplosion(crate.x, crate.y, '#ffd700', 20);
      }
    }
    this.supplyCrates = this.supplyCrates.filter(c => !c.collected);

    // Update bounty target timer
    if (this.bountyTarget && !this.bountyTarget.claimed) {
      this.bountyTarget.timeLimit -= dt;
      if (this.bountyTarget.timeLimit <= 0) {
        // Bounty expired — remove the enemy
        const idx = engine.enemies.findIndex(e => e.id === this.bountyTarget!.enemyId);
        if (idx >= 0) {
          engine.createExplosion(engine.enemies[idx].position.x, engine.enemies[idx].position.y, '#ff4444', 15);
          engine.enemies.splice(idx, 1);
        }
        this.announce('BOUNTY ESCAPED', 'Target vanished into the grid', '#ff4444');
        this.bountyTarget = null;
      }
    }
    // Update firewall boundary damage
    if (this.firewallActive) {
      this.applyFirewallDamage(dt, engine);
    }
  }

  // ─── Wave Based Triggers ─────────────────────────────────
  triggerWaveEvents(wave: number, engine: GameEngine, startOfWave: boolean) {
    if (!startOfWave) return;

    if (wave === 5 || wave === 25) {
      if (!this.isActive('system_breach')) {
        this.breachActive = true;
        this.startEvent('system_breach', this.BALANCE.breachDuration, {}, engine);
        this.announce('⚠ SYSTEM BREACH', 'Enemies spawning from portals!', '#ff3333');
        soundManager.playExplosion();
        // Cancel any in-progress extraction before disabling portals
        engine.abortExfill();
        for (const p of engine.portals) p.active = false;
      }
    }

    if (wave === 10 || wave === 30) {
      if (!this.isActive('data_storm')) {
        const horizontal = Math.random() > 0.5;
        this.startEvent('data_storm', this.BALANCE.dataStormDuration, {
          horizontal,
          spawnTimer: 0,
        }, engine);
        this.announce('DATA STORM INCOMING', 'Risk the storm for XP & coins!', '#00ffaa');
        soundManager.playExplosion();
      }
    }

    if (wave === 15) {
      if (!this.isActive('blackout')) {
        this.startEvent('blackout', this.BALANCE.blackoutDuration, { xpMultiplier: this.BALANCE.blackoutXpMultiplier }, engine);
        this.announce('BLACKOUT PROTOCOL', `${this.BALANCE.blackoutXpMultiplier.toFixed(1)}× XP — Survive the dark`, '#00ccff');
        soundManager.playExplosion();
      }
    }

    if (wave === 20) {
      if (!this.isActive('nano_plague')) {
        this.startEvent('nano_plague', 50000, {}, engine);
        this.announce('NANO PLAGUE ACTIVE', 'Enemy corpses leave toxic zones!', '#88ff00');
        soundManager.playExplosion();
      }
    }

    if (wave === 35 || (this.nightmareMode && wave === 18)) {
      if (!this.isActive('firewall_collapse')) {
        this.firewallActive = true;
        this.firewallBoundary = 0;
        this.startEvent('firewall_collapse', this.BALANCE.firewallDuration, {}, engine);
        this.announce('⚠ FIREWALL COLLAPSE', 'The grid is closing in!', '#ff0066');
        soundManager.playExplosion();
      }
    }

    if (wave % 3 === 0 && !this.bountyTarget) {
      this.spawnBountyTarget(engine);
    }

    if (wave % 4 === 0) {
      this.spawnSupplyDrop(engine);
    }
  }

  // ─── Bounty Target ─────────────────────────────────────
  private spawnBountyTarget(engine: GameEngine) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(engine.canvas.width, engine.canvas.height) / 2 + 100;
    const x = engine.player.position.x + Math.cos(angle) * dist;
    const y = engine.player.position.y + Math.sin(angle) * dist;

    const names = ['ROGUE SENTINEL', 'DATA PHANTOM', 'GRID WRAITH', 'NEON HUNTER', 'CHROME SPECTER', 'VOID STALKER'];
    const name = names[Math.floor(Math.random() * names.length)];
    const isVoidStalker = name === 'VOID STALKER';

    const config = ENEMY_TYPES.elite;
    const enemyId = `bounty_${Date.now()}`;
    const healthMult = (4 + engine.difficultyMultiplier * 1.2) * Math.min(this.adaptiveMultiplier, 1.8);
    const bountySpeedMultiplier = isVoidStalker ? 1.15 : 1.65;
    const adaptiveSpeedCap = isVoidStalker ? 1.15 : 1.35;
    const rawBountySpeed = config.speed * bountySpeedMultiplier * Math.min(this.adaptiveMultiplier, adaptiveSpeedCap);
    // Keep Void Stalker threatening but always kiteable.
    const finalBountySpeed = isVoidStalker
      ? Math.min(rawBountySpeed, engine.player.speed * 0.9)
      : rawBountySpeed;

    engine.enemies.push({
      id: enemyId,
      position: { x, y },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      radius: config.radius * 1.3,
      health: config.health * healthMult,
      maxHealth: config.health * healthMult,
      color: '#ffd700',
      damage: config.damage * 2.4 * Math.min(this.adaptiveMultiplier, 1.5),
      speed: finalBountySpeed,
      experienceValue: config.xp * 3,
      type: 'elite',
      hitFlash: 0,
      isEventEnemy: true,
    } as any);

    this.bountyTarget = {
      enemyId,
      name,
      timeLimit: this.BALANCE.bountyKillWindow,
      reward: 'Weapon Upgrade',
      claimed: false,
    };

    this.announce(`BOUNTY: ${name}`, `Kill in ${Math.floor(this.BALANCE.bountyKillWindow / 1000)}s for bonus!`, '#ffd700');
    soundManager.playTreasureSpawn();
  }

  private spawnSupplyDrop(engine: GameEngine) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 300 + Math.random() * 200;
    const x = engine.player.position.x + Math.cos(angle) * dist;
    const y = engine.player.position.y + Math.sin(angle) * dist;

    this.supplyCrates.push({
      x, y, radius: 20,
      health: 1, maxHealth: 1,
      collected: false,
      guardSpawned: true,
    });

    // Spawn a guard enemy on top of the crate
    const guardConfig = ENEMY_TYPES.tank;
    engine.enemies.push({
      id: `supply_guard_${Date.now()}`,
      position: { x: x + 30, y: y + 30 },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      radius: guardConfig.radius * 1.2,
      health: guardConfig.health * engine.difficultyMultiplier * 3.2 * Math.min(this.adaptiveMultiplier, 1.5),
      maxHealth: guardConfig.health * engine.difficultyMultiplier * 3.2 * Math.min(this.adaptiveMultiplier, 1.5),
      color: '#ff8800',
      damage: guardConfig.damage * engine.difficultyMultiplier * 1.8 * Math.min(this.adaptiveMultiplier, 1.4),
      speed: guardConfig.speed * 1.05,
      experienceValue: guardConfig.xp * 2,
      type: 'tank',
      isEventEnemy: true,
    } as any);

    this.announce('SUPPLY DROP INBOUND', 'Crate dropped — guarded!', '#00ff88');
    soundManager.playTreasureSpawn();
  }

  private applyFirewallDamage(dt: number, engine: GameEngine) {
    const ev = this.getActive('firewall_collapse');
    if (!ev) return;

    // Grow boundary over duration
    const progress = ev.elapsed / ev.duration;
    this.firewallBoundary = this.firewallMaxShrink * Math.min(progress, 0.85);

    const margin = this.firewallBoundary;
    const px = engine.player.position.x;
    const py = engine.player.position.y;

    // Damage player if outside boundary (world is GAME_WIDTH × GAME_HEIGHT)
    const outsideLeft   = px < margin;
    const outsideRight  = px > GAME_WIDTH - margin;
    const outsideTop    = py < margin;
    const outsideBottom = py > GAME_HEIGHT - margin;

    if ((outsideLeft || outsideRight || outsideTop || outsideBottom) && engine.reviveInvulnTimer <= 0) {
      engine.player.health -= this.BALANCE.firewallOutsideDps * this.adaptiveMultiplier * (dt / 1000);
      engine.screenShake = 3;
      if (engine.player.health <= 0) {
        engine.processPlayerDeath();
      }
    }

    // Push enemies inward
    for (const enemy of engine.enemies) {
      if (enemy.position.x < margin)               enemy.position.x = margin + 10;
      if (enemy.position.x > GAME_WIDTH - margin)  enemy.position.x = GAME_WIDTH - margin - 10;
      if (enemy.position.y < margin)               enemy.position.y = margin + 10;
      if (enemy.position.y > GAME_HEIGHT - margin) enemy.position.y = GAME_HEIGHT - margin - 10;
    }
  }

  // ─── Event Lifecycle ───────────────────────────────────
  private startEvent(type: EventType, duration: number, data: Record<string, any>, _engine: GameEngine) {
    this.activeEvents.push({ type, duration, elapsed: 0, data });
  }

  private onEventEnd(ev: ActiveEvent, engine: GameEngine) {
    switch (ev.type) {
      case 'blackout':
        this.announce('BLACKOUT ENDED', 'Vision restored', '#00ccff');
        break;
      case 'system_breach':
        this.breachActive = false;
        for (const p of engine.portals) p.active = true;
        this.announce('BREACH CONTAINED', 'Portals restored', '#00ff44');
        // No guaranteed reward; this is primarily a survival pressure event.
        break;
      case 'data_storm':
        this.announce('STORM PASSED', 'Grid stabilized', '#00ffaa');
        break;
      case 'nano_plague':
        this.toxicPools = []; // Clear remaining pools
        this.announce('PLAGUE PURGED', 'Toxins neutralized', '#88ff00');
        break;
      case 'firewall_collapse':
        this.firewallActive = false;
        this.firewallBoundary = 0;
        this.announce('FIREWALL RESTORED', 'Grid boundaries stable', '#ff0066');
        // Survived = one standard treasure reward
        engine.treasures.push({
          id: Math.random().toString(),
          position: {
            x: engine.player.position.x + (Math.random() - 0.5) * 200,
            y: engine.player.position.y + (Math.random() - 0.5) * 200,
          },
          color: '#ffd700',
          spawnTime: performance.now(),
          tier: 'rare'
        });
        break;
    }
  }

  // ─── Enemy Death Hook ──────────────────────────────────
  onEnemyKilled(enemyId: string, x: number, y: number, engine: GameEngine) {
    // Track kill for adaptive difficulty
    this.killTimestamps.push(engine.gameTime);

    // Bounty target killed?
    if (this.bountyTarget && this.bountyTarget.enemyId === enemyId && !this.bountyTarget.claimed) {
      this.bountyTarget.claimed = true;
      this.announce('BOUNTY CLAIMED!', `${this.bountyTarget.name} eliminated`, '#ffd700');
      soundManager.playLevelUp();
      // Bounty rewards: big XP burst + data core + coins
      for (let i = 0; i < this.BALANCE.bountyRewardGemCount; i++) {
        engine.gems.push({
          id: Math.random().toString(),
          position: { x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 60 },
          value: this.BALANCE.bountyRewardGemValue,
          color: '#ffd700'
        });
      }
      if (Math.random() < this.BALANCE.bountyDataCoreChance) {
        engine.items.push({
          id: Math.random().toString(),
          position: { x, y },
          type: 'data_core',
          value: 1,
          color: '#ffffff'
        });
      }
      engine.items.push({
        id: Math.random().toString(),
        position: { x: x + 15, y: y + 15 },
        type: 'coin_silver',
        value: (ITEM_TYPES as any).coin_silver.value,
        color: (ITEM_TYPES as any).coin_silver.color
      });
      engine.createExplosion(x, y, '#ffd700', 30);
      engine.screenShake = 15;
      this.bountyTarget = null;
    }

    // Nano plague: leave toxic pool on enemy death
    if (this.isActive('nano_plague')) {
      if (Math.random() < this.BALANCE.nanoPoolChance) {
        this.toxicPools.push({
          x, y,
          radius: 35 + Math.random() * 30,
          life: this.BALANCE.nanoPoolLife,
          maxLife: this.BALANCE.nanoPoolLife,
        });
      }
    }
  }

  // ─── Spawn Override for System Breach ──────────────────
  getBreachSpawnPosition(engine: GameEngine): { x: number; y: number } | null {
    if (!this.breachActive) return null;
    // Only spawn from portals that are currently active (not disabled by other effects)
    const activePortals = engine.portals.filter(p => p.active);
    if (activePortals.length === 0) return null;
    const portal = activePortals[Math.floor(Math.random() * activePortals.length)];
    const jitter = 40;
    return {
      x: portal.position.x + (Math.random() - 0.5) * jitter,
      y: portal.position.y + (Math.random() - 0.5) * jitter,
    };
  }

  // ─── Data Storm: XP/Coin Rain ──────────────────────────
  updateDataStormSpawns(dt: number, engine: GameEngine) {
    const ev = this.getActive('data_storm');
    if (!ev) return;

    ev.data.spawnTimer = (ev.data.spawnTimer || 0) + dt;
    if (ev.data.spawnTimer >= this.BALANCE.dataStormSpawnInterval) {
      ev.data.spawnTimer = 0;

      const progress = ev.elapsed / ev.duration;
      const camX = engine.camera.x;
      const camY = engine.camera.y;
      const w = engine.canvas.width;
      const h = engine.canvas.height;

      // Storm wall position
      let sx: number, sy: number;
      if (ev.data.horizontal) {
        sx = camX + w * progress;
        sy = camY + Math.random() * h;
      } else {
        sx = camX + Math.random() * w;
        sy = camY + h * progress;
      }

      // Drop XP gem
      engine.gems.push({
        id: Math.random().toString(),
        position: { x: sx + (Math.random() - 0.5) * 80, y: sy + (Math.random() - 0.5) * 80 },
        value: this.BALANCE.dataStormGemMin + Math.random() * (this.BALANCE.dataStormGemMax - this.BALANCE.dataStormGemMin),
        color: '#00ffaa'
      });

      // Occasional coin
      if (Math.random() < this.BALANCE.dataStormCoinChance) {
        const coinType = Math.random() < 0.08 ? 'coin_gold' : Math.random() < 0.35 ? 'coin_silver' : 'coin_bronze';
        engine.items.push({
          id: Math.random().toString(),
          position: { x: sx + (Math.random() - 0.5) * 60, y: sy + (Math.random() - 0.5) * 60 },
          type: coinType as any,
          value: (ITEM_TYPES as any)[coinType].value,
          color: (ITEM_TYPES as any)[coinType].color
        });
      }

      // Storm also damages player if they're in the wall
      const playerDx = engine.player.position.x - sx;
      const playerDy = engine.player.position.y - sy;
      const inStorm = ev.data.horizontal
        ? Math.abs(playerDx) < 80
        : Math.abs(playerDy) < 80;
      if (inStorm) {
        if (engine.reviveInvulnTimer <= 0) {
          engine.player.health -= this.BALANCE.dataStormDps * this.adaptiveMultiplier * (this.BALANCE.dataStormSpawnInterval / 1000);
          if (engine.player.health <= 0) {
            engine.processPlayerDeath();
            if (engine.gameState === 'GAME_OVER') return;
          }
        }
      }
    }
  }

  // ─── XP Multiplier for Blackout ────────────────────────
  getXPMultiplier(): number {
    const blackout = this.getActive('blackout');
    return blackout ? blackout.data.xpMultiplier : 1;
  }

  // ─── Helpers ───────────────────────────────────────────
  isActive(type: EventType): boolean {
    return this.activeEvents.some(e => e.type === type);
  }

  getActive(type: EventType): ActiveEvent | undefined {
    return this.activeEvents.find(e => e.type === type);
  }

  announce(title: string, subtitle: string, color: string) {
    this.announcements.push({
      title, subtitle, color,
      life: 3500,
      maxLife: 3500,
    });
  }

  // ─── World-Space Rendering ─────────────────────────────
  drawWorldSpace(ctx: CanvasRenderingContext2D, camera: { x: number; y: number }, canvas: HTMLCanvasElement) {
    this.drawToxicPools(ctx);
    this.drawSupplyCrates(ctx);
    this.drawBountyIndicator(ctx, camera, canvas);
    this.drawDataStorm(ctx, camera, canvas);
    this.drawFirewallBoundary(ctx, camera, canvas);
  }

  private drawToxicPools(ctx: CanvasRenderingContext2D) {
    for (const pool of this.toxicPools) {
      const alpha = (pool.life / pool.maxLife) * 0.6;
      const time = Date.now() / 1000;
      const pulse = 1 + Math.sin(time * 3 + pool.x) * 0.1;

      // Outer glow
      const grad = ctx.createRadialGradient(pool.x, pool.y, 0, pool.x, pool.y, pool.radius * pulse);
      grad.addColorStop(0, `rgba(100, 255, 0, ${alpha * 0.8})`);
      grad.addColorStop(0.5, `rgba(60, 180, 0, ${alpha * 0.4})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pool.x, pool.y, pool.radius * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Bubbling effect
      ctx.fillStyle = `rgba(150, 255, 50, ${alpha * 0.6})`;
      for (let i = 0; i < 3; i++) {
        const bx = pool.x + Math.sin(time * 4 + i * 2) * pool.radius * 0.4;
        const by = pool.y + Math.cos(time * 3 + i * 3) * pool.radius * 0.3;
        ctx.beginPath();
        ctx.arc(bx, by, 2 + Math.sin(time * 5 + i) * 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawSupplyCrates(ctx: CanvasRenderingContext2D) {
    const time = Date.now() / 1000;
    for (const crate of this.supplyCrates) {
      // Beacon light from above
      ctx.save();
      const beamAlpha = 0.15 + Math.sin(time * 2) * 0.05;
      ctx.fillStyle = `rgba(0, 255, 136, ${beamAlpha})`;
      ctx.beginPath();
      ctx.moveTo(crate.x - 8, crate.y - 200);
      ctx.lineTo(crate.x + 8, crate.y - 200);
      ctx.lineTo(crate.x + 25, crate.y);
      ctx.lineTo(crate.x - 25, crate.y);
      ctx.closePath();
      ctx.fill();

      // Crate body
      const hover = Math.sin(time * 3) * 3;
      ctx.translate(crate.x, crate.y + hover);

      // Glow ring
      ctx.strokeStyle = `rgba(0, 255, 136, ${0.4 + Math.sin(time * 4) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, crate.radius + 8, 0, Math.PI * 2);
      ctx.stroke();

      // Crate box
      ctx.fillStyle = '#1a1a2e';
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.fillRect(-crate.radius, -crate.radius, crate.radius * 2, crate.radius * 2);
      ctx.strokeRect(-crate.radius, -crate.radius, crate.radius * 2, crate.radius * 2);

      // Cross symbol
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -crate.radius * 0.5);
      ctx.lineTo(0, crate.radius * 0.5);
      ctx.moveTo(-crate.radius * 0.5, 0);
      ctx.lineTo(crate.radius * 0.5, 0);
      ctx.stroke();

      ctx.restore();
    }
  }

  private drawBountyIndicator(ctx: CanvasRenderingContext2D, camera: { x: number; y: number }, canvas: HTMLCanvasElement) {
    if (!this.bountyTarget || this.bountyTarget.claimed) return;

    // Find the bounty enemy
    // We just draw a directional indicator in screen space — the actual enemy is drawn by Engine
    // But we add a golden aura around the bounty enemy in world space
    // We don't have the enemy ref here, so we'll draw an off-screen arrow in screen-space draw
  }

  private drawDataStorm(ctx: CanvasRenderingContext2D, camera: { x: number; y: number }, canvas: HTMLCanvasElement) {
    const ev = this.getActive('data_storm');
    if (!ev) return;

    const progress = ev.elapsed / ev.duration;
    const time = Date.now() / 1000;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    // We're in world space, need to convert to screen by accounting for camera
    // Actually, the storm is visual only in screen-space-ish... let's draw it relative to camera
    const camX = camera.x;
    const camY = camera.y;

    if (ev.data.horizontal) {
      // Vertical wall sweeping left→right
      const wallX = camX + w * progress;
      const grad = ctx.createLinearGradient(wallX - 60, 0, wallX + 60, 0);
      grad.addColorStop(0, 'rgba(0, 255, 170, 0)');
      grad.addColorStop(0.3, `rgba(0, 255, 170, ${0.15 + Math.sin(time * 8) * 0.05})`);
      grad.addColorStop(0.5, `rgba(0, 255, 255, ${0.25 + Math.sin(time * 10) * 0.08})`);
      grad.addColorStop(0.7, `rgba(0, 255, 170, ${0.15 + Math.sin(time * 8) * 0.05})`);
      grad.addColorStop(1, 'rgba(0, 255, 170, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(wallX - 60, camY, 120, h);

      // Data particles
      for (let i = 0; i < 20; i++) {
        const px = wallX + (Math.random() - 0.5) * 100;
        const py = camY + Math.random() * h;
        ctx.fillStyle = `rgba(0, 255, 200, ${0.3 + Math.random() * 0.4})`;
        ctx.fillRect(px, py, 2, 2 + Math.random() * 8);
      }
    } else {
      // Horizontal wall sweeping top→bottom
      const wallY = camY + h * progress;
      const grad = ctx.createLinearGradient(0, wallY - 60, 0, wallY + 60);
      grad.addColorStop(0, 'rgba(0, 255, 170, 0)');
      grad.addColorStop(0.3, `rgba(0, 255, 170, ${0.15 + Math.sin(time * 8) * 0.05})`);
      grad.addColorStop(0.5, `rgba(0, 255, 255, ${0.25 + Math.sin(time * 10) * 0.08})`);
      grad.addColorStop(0.7, `rgba(0, 255, 170, ${0.15 + Math.sin(time * 8) * 0.05})`);
      grad.addColorStop(1, 'rgba(0, 255, 170, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(camX, wallY - 60, w, 120);

      // Data particles
      for (let i = 0; i < 20; i++) {
        const px = camX + Math.random() * w;
        const py = wallY + (Math.random() - 0.5) * 100;
        ctx.fillStyle = `rgba(0, 255, 200, ${0.3 + Math.random() * 0.4})`;
        ctx.fillRect(px, py, 2 + Math.random() * 8, 2);
      }
    }

    ctx.restore();
  }

  private drawFirewallBoundary(ctx: CanvasRenderingContext2D, _camera: { x: number; y: number }, _canvas: HTMLCanvasElement) {
    if (!this.firewallActive || this.firewallBoundary <= 0) return;

    const m = this.firewallBoundary;
    const time = Date.now() / 1000;
    const pulse = 0.5 + Math.sin(time * 3) * 0.3;

    // Draw the closing boundary walls
    ctx.save();

    // Red danger zone outside boundary
    ctx.fillStyle = `rgba(255, 0, 50, ${0.15 * pulse})`;
    // Top
    ctx.fillRect(0, 0, 2000, m);
    // Bottom
    ctx.fillRect(0, 2000 - m, 2000, m);
    // Left
    ctx.fillRect(0, m, m, 2000 - m * 2);
    // Right
    ctx.fillRect(2000 - m, m, m, 2000 - m * 2);

    // Boundary edge lines
    ctx.strokeStyle = `rgba(255, 0, 80, ${0.6 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([15, 15]);
    ctx.strokeRect(m, m, 2000 - m * 2, 2000 - m * 2);
    ctx.setLineDash([]);

    // Warning triangles along edges
    ctx.fillStyle = `rgba(255, 50, 50, ${pulse})`;
    ctx.font = 'bold 16px Inter';
    ctx.textAlign = 'center';
    const warningPositions = [
      { x: 1000, y: m + 20 },
      { x: 1000, y: 2000 - m - 10 },
      { x: m + 30, y: 1000 },
      { x: 2000 - m - 30, y: 1000 },
    ];
    for (const wp of warningPositions) {
      ctx.fillText('⚠', wp.x, wp.y);
    }

    ctx.restore();
  }

  // ─── Screen-Space Rendering ────────────────────────────
  drawScreenSpace(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, engine: GameEngine) {
    this.drawBlackoutOverlay(ctx, canvas, engine);
    this.drawAnnouncements(ctx, canvas);
    this.drawBountyArrow(ctx, canvas, engine);
  }

  private drawBlackoutOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, engine: GameEngine) {
    if (!this.isActive('blackout')) return;

    const ev = this.getActive('blackout')!;
    // Fade in over 1s, fade out over last 2s
    let intensity = 1;
    if (ev.elapsed < 1000) intensity = ev.elapsed / 1000;
    if (ev.duration - ev.elapsed < 2000) intensity = (ev.duration - ev.elapsed) / 2000;

    // Full darkness overlay
    ctx.fillStyle = `rgba(0, 0, 0, ${0.92 * intensity})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Flashlight around player (cut a hole)
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const flashRadius = 130;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const flashGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashRadius);
    flashGrad.addColorStop(0, `rgba(0, 0, 0, ${0.95 * intensity})`);
    flashGrad.addColorStop(0.6, `rgba(0, 0, 0, ${0.5 * intensity})`);
    flashGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, flashRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Enemy eye glow — draw small glowing dots for nearby enemies
    ctx.save();
    for (const enemy of engine.enemies) {
      const ex = enemy.position.x - engine.camera.x;
      const ey = enemy.position.y - engine.camera.y;
      // Only draw if outside flashlight but on screen
      const distFromCenter = Math.sqrt((ex - cx) * (ex - cx) + (ey - cy) * (ey - cy));
      if (distFromCenter > flashRadius * 0.7 && ex > -50 && ey > -50 && ex < canvas.width + 50 && ey < canvas.height + 50) {
        const glowAlpha = Math.min(1, (distFromCenter - flashRadius * 0.5) / 200) * intensity;
        ctx.fillStyle = `rgba(255, 50, 50, ${glowAlpha * (0.5 + Math.sin(Date.now() / 200 + enemy.position.x) * 0.3)})`;
        ctx.beginPath();
        ctx.arc(ex, ey, 3, 0, Math.PI * 2);
        ctx.fill();
        // Second eye
        ctx.beginPath();
        ctx.arc(ex + 6, ey, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // XP bonus text
    const time = Date.now() / 1000;
    ctx.save();
    ctx.globalAlpha = 0.4 + Math.sin(time * 3) * 0.2;
    ctx.fillStyle = '#00ccff';
    ctx.font = 'bold 14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.BALANCE.blackoutXpMultiplier.toFixed(1)}× XP ACTIVE`, canvas.width / 2, 100);
    ctx.restore();
  }

  private drawAnnouncements(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    if (this.announcements.length === 0) return;

    const centerX = canvas.width / 2;
    let yOffset = canvas.height * 0.22;

    for (const ann of this.announcements) {
      const progress = ann.life / ann.maxLife;
      let alpha = 1;
      if (progress > 0.85) alpha = (1 - progress) / 0.15; // Fade in
      if (progress < 0.2) alpha = progress / 0.2; // Fade out
      const scale = progress > 0.85 ? 0.9 + (1 - (1 - progress) / 0.15) * 0.1 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(centerX, yOffset);

      if (scale !== 1) ctx.scale(scale, scale);

      // Background bar
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const barW = 380;
      const barH = 52;
      ctx.beginPath();
      ctx.roundRect(-barW / 2, -barH / 2, barW, barH, 8);
      ctx.fill();

      // Side accent line
      ctx.fillStyle = ann.color;
      ctx.fillRect(-barW / 2, -barH / 2, 4, barH);

      // Title
      ctx.fillStyle = ann.color;
      ctx.font = 'bold 16px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(ann.title, 0, -4);

      // Subtitle
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '11px Inter';
      ctx.fillText(ann.subtitle, 0, 14);

      ctx.restore();
      yOffset += 65;
    }
  }

  private drawActiveEventBar(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    if (this.activeEvents.length === 0) return;

    const barY = 50;
    let barX = canvas.width / 2 + 120;

    for (const ev of this.activeEvents) {
      const remaining = ev.duration - ev.elapsed;
      const progress = 1 - ev.elapsed / ev.duration;
      const { label, color } = this.getEventDisplay(ev.type);

      ctx.save();

      // Timer bar background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      const w = 140;
      const h = 20;
      ctx.beginPath();
      ctx.roundRect(barX, barY, w, h, 4);
      ctx.fill();

      // Progress fill
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.roundRect(barX, barY, w * progress, h, 4);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Label + time
      ctx.fillStyle = color;
      ctx.font = 'bold 9px Inter';
      ctx.textAlign = 'left';
      ctx.fillText(label, barX + 6, barY + 8);

      ctx.fillStyle = '#ffffff';
      ctx.font = '9px Inter';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.ceil(remaining / 1000)}s`, barX + w - 6, barY + 8);

      // Pulsing border for urgency
      if (remaining < 5000) {
        const pulse = Math.sin(Date.now() / 150) > 0 ? 0.8 : 0.3;
        ctx.strokeStyle = color;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(barX, barY, w, h, 4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.restore();
      barX += w + 8;
    }
  }

  private drawBountyArrow(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, engine: GameEngine) {
    if (!this.bountyTarget || this.bountyTarget.claimed) return;

    // Find bounty enemy position
    const enemy = engine.enemies.find(e => e.id === this.bountyTarget!.enemyId);
    if (!enemy) return;

    // Convert world position → screen position (accounts for zoom)
    const zoom = engine.cameraZoom;
    // Camera is centred on the player, so:
    const screenX = canvas.width / 2 + (enemy.position.x - engine.player.position.x) * zoom;
    const screenY = canvas.height / 2 + (enemy.position.y - engine.player.position.y) * zoom;
    const time = Date.now() / 1000;

    // Golden rotating rings around bounty
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6 + Math.sin(time * 4) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, (enemy.radius + 15 + Math.sin(time * 3) * 5) * zoom, 0, Math.PI * 2);
    ctx.stroke();
    // Rotating dashes
    ctx.setLineDash([8, 8]);
    ctx.globalAlpha = 0.4;
    ctx.save();
    ctx.rotate(time * 2);
    ctx.beginPath();
    ctx.arc(0, 0, (enemy.radius + 25) * zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    // Name tag
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 11px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(this.bountyTarget.name, 0, -(enemy.radius + 30) * zoom);
    // Timer
    ctx.fillStyle = this.bountyTarget.timeLimit < 5000 ? '#ff4444' : '#ffffff';
    ctx.font = 'bold 10px Inter';
    ctx.fillText(`${Math.ceil(this.bountyTarget.timeLimit / 1000)}s`, 0, -(enemy.radius + 18) * zoom);
    ctx.restore();

    // Off-screen arrow if bounty is not visible
    if (screenX < -20 || screenY < -20 || screenX > canvas.width + 20 || screenY > canvas.height + 20) {
      const dx = enemy.position.x - engine.player.position.x;
      const dy = enemy.position.y - engine.player.position.y;
      const angle = Math.atan2(dy, dx);
      const arrowDist = 120;
      const arrowX = canvas.width / 2 + Math.cos(angle) * arrowDist;
      const arrowY = canvas.height / 2 + Math.sin(angle) * arrowDist;

      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffd700';
      ctx.globalAlpha = 0.7 + Math.sin(time * 6) * 0.3;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();

      // BOUNTY label
      ctx.rotate(-angle); // Un-rotate for text
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('BOUNTY', 0, -15);
      ctx.restore();
    }
  }


  // ─── Display Helpers ───────────────────────────────────
  private getEventDisplay(type: EventType): { label: string; color: string } {
    switch (type) {
      case 'blackout': return { label: 'BLACKOUT', color: '#00ccff' };
      case 'system_breach': return { label: 'BREACH', color: '#ff3333' };
      case 'bounty_target': return { label: 'BOUNTY', color: '#ffd700' };
      case 'supply_drop': return { label: 'SUPPLY', color: '#00ff88' };
      case 'data_storm': return { label: 'DATA STORM', color: '#00ffaa' };
      case 'nano_plague': return { label: 'PLAGUE', color: '#88ff00' };
      case 'firewall_collapse': return { label: 'FIREWALL', color: '#ff0066' };
    }
  }

  // Get active events info for HUD
  getActiveEventsInfo(): { type: EventType; remaining: number; color: string; label: string }[] {
    return this.activeEvents.map(ev => ({
      type: ev.type,
      remaining: ev.duration - ev.elapsed,
      ...this.getEventDisplay(ev.type),
    }));
  }

  // Pressure level for HUD display
  getPressureLevel(): { label: string; color: string; multiplier: number } {
    const m = this.adaptiveMultiplier;
    if (m >= 2.0) return { label: 'CRITICAL', color: '#ff2222', multiplier: m };
    if (m >= 1.6) return { label: 'HIGH',     color: '#ff8800', multiplier: m };
    if (m >= 1.3) return { label: 'ELEVATED', color: '#ffcc00', multiplier: m };
    return { label: 'NOMINAL', color: '#00ff88', multiplier: m };
  }
}
