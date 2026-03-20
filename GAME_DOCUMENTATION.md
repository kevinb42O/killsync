# KILLSYNC: Neon Requiem — Game Documentation

> **For AI agents & developers.** Update this document whenever game functionality changes.

## Architecture Overview

| File | Purpose |
|------|---------|
| `src/App.tsx` | React UI: menus, HUD, level-up, game over, treasure, Neural Lab, **Operator Select** |
| `src/game/Engine.ts` | Core game loop: rendering, physics, spawning, combat, weapons, **drawPlayer()** |
| `src/game/SoundManager.ts` | Procedural audio via Web Audio API |
| `src/types.ts` | TypeScript interfaces: Entity, Player, Enemy, Projectile, Weapon, **OperatorDefinition** |
| `src/constants.ts` | Game balance: weapons, enemies, upgrades, items, **OPERATOR_DEFINITIONS** |
| `index.html` | Entry point, page title |
| `src/index.css` | Global styles, fonts, Tailwind |

## Game States

```
MENU → PLAYING → LEVEL_UP → PLAYING
                → TREASURE → PLAYING
                → GAME_OVER → MENU or PLAYING
     → OPERATOR_SELECT → MENU
     → PERMANENT_UPGRADES → MENU
```

- **MENU** — Title screen with "Initialize Run", "Select Operator", & "Neural Lab". Shows active operator, coins, level.
- **OPERATOR_SELECT** — Card grid of 6 operators. Unlock with coins, select one to play.
- **PLAYING** — Active gameplay. Canvas renders world; React HUD overlays stats.
- **LEVEL_UP** — Player chooses 1 of 3 upgrades.
- **TREASURE** — Rare treasure found.
- **GAME_OVER** — Run stats. Two options: "Try Again" or "Back to Menu".
- **PERMANENT_UPGRADES** — "Neural Lab" shop.

## Operator System

Each operator has a unique color palette, starting weapon, stat bonuses, and base stats.

| ID | Name | Cost | Weapon | Base HP | Base Speed | Key Bonuses |
|----|------|------|--------|---------|------------|-------------|
| `phantom` | Phantom | Free | Plasma Gun | 100 | 3.2 | Balanced |
| `wraith` | Wraith | 2,000 | Neon Shards | 80 | 4.0 | +20% speed, -10% cooldown |
| `titan` | Titan | 5,000 | Void Aura | 160 | 2.6 | +20% might |
| `spectre` | Spectre | 8,000 | Orbit Drones | 90 | 3.4 | +30% area, +20% luck, +30% magnet |
| `reaper` | Reaper | 15,000 | Data Scythe | 95 | 3.0 | +30% might, +20% boss dmg, +15% luck |
| `nexus` | Nexus | 30,000 | Neural Pulse | 120 | 3.5 | +15% might/area/speed/luck, +20% growth, -10% cooldown |

**Color properties per operator:** `color`, `colorSecondary`, `colorDark`, `colorGlow`, `colorVisor`, `colorLimbs`, `colorBoots` — used by `drawPlayer()` in Engine.ts.

**Persistence:** `selectedOperator` and `unlockedOperators` stored in localStorage.

## Player Character (Rendering)

- **Method**: `drawPlayer()` in `Engine.ts`
- **Visual**: Cyberpunk armored soldier — helmet with glowing visor, armored torso with energy core, shoulder pads, belt, arms holding blaster, animated legs with boots
- **Animations**: Walk cycle (legs/arms swing), idle breathing (torso pulse), energy core pulse, dash exhaust particles
- **Effects**: Low-HP warning ring (pulsing red at <35% HP), dash afterglow dashed ring
- **Colors**: All drawn from operator's color palette

## Weapons

| ID | Name | Type | Cooldown | Description |
|----|------|------|----------|-------------|
| `plasma_gun` | Plasma Gun | projectile | 1500ms | Auto-fires bursts at nearest enemy |
| `orbit_drones` | Orbit Drones | orbit | 0 | Circles player |
| `neon_shards` | Neon Shards | projectile | 1200ms | Fires shards at nearest |
| `void_aura` | Void Aura | area | 500ms | AoE around player |
| `neural_pulse` | Neural Pulse | area | 3000ms | Expanding shockwave |
| `data_scythe` | Data Scythe | orbit | 0 | Rotating beam |
| `cyber_blade` | Cyber Blade | projectile | 800ms | Close-range swipe |
| `sonic_boom` | Sonic Boom | projectile | 2000ms | Pushes enemies |
| `nano_swarm` | Nano Swarm | projectile | 3000ms | Homing nanites |

- Penetration system: projectiles lose 1 penetration per hit, removed at 0 (orbit/aura exempt).

## Enemy Types

| Type | Unlocks At | Health | Speed | Shape |
|------|-----------|--------|-------|-------|
| basic | 0 min | 25 | 0.8 | circle |
| fast | 2 min | 60 | 1.0 | triangle |
| tank | 5 min | 150 | 0.9 | square |
| ranged | 8 min | 50 | 1.3 | diamond |
| elite | 12 min | 400 | 1.1 | hexagon |
| phantom | 15 min | 60 | 2.0 | ghost |
| titan | 20 min | 1000 | 0.5 | star |

Bosses at 5/10/15/20 min. Item Holders (2% chance) drop world items.

## Difficulty Scaling

```
difficultyMultiplier = 1 + (gameTime / 60000) * 0.35 + (killCount / 1000)
```

## Items & Drops

HP hearts, bronze/silver/gold/diamond coins, magnet, bomb.

## Stat Upgrades (Per-Run)

might, area, speed, cooldown, growth, amount, health, luck, regen, god_mode, instant_kill.

## Permanent Upgrades (Neural Lab)

15 upgrades purchasable with coins. Persist in localStorage.

## Exfill System

Portal at (100, 100). Enter 250-unit zone → 30s timer. **Leaving cancels timer.** Touch portal when ready → exit run.

## Rendering Pipeline

1. Fill background + gradient
2. Draw grid
3. `ctx.save()` → camera + screen shake
4. World entities: items → treasures → particles → portal → gems → enemies → projectiles → damage texts → **drawPlayer()**
5. `ctx.restore()` → screen space
6. drawUI (weapon/upgrade icons)
7. Treasure arrows

## Persistence (localStorage)

| Key | Data |
|-----|------|
| `playerLevel` | Persistent level |
| `playerCoins` | Total coins |
| `permanentUpgrades` | `{id: level}` map |
| `selectedOperator` | Active operator ID |
| `unlockedOperators` | Array of unlocked IDs |

## Input

WASD/Arrows = move, Space = dash. DeltaTime-normalized movement.

## Cheats
Type the following codes while on the **Main Menu**:
- `gimmecash` — Grants 9,999,999 coins instantly.
- `reset` — Resets all progress (coins, level, permanent upgrades, and operators).
- `unlockall` — Unlocks all operators.
- `iamgod` — Maxes out all Neural Lab permanent upgrades.
