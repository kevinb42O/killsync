# KILLSYNC: Neon Requiem — Game Documentation

> **For AI agents & developers.** Update this document whenever game functionality changes.

## Architecture Overview

| File | Purpose |
|------|---------|
| `src/App.tsx` | React UI: menus, HUD, level-up, game over, treasure, Neural Lab, **Operator Select** |
| `src/game/Engine.ts` | Core game loop: rendering, physics, spawning, combat, weapons, **drawPlayer()** |
| `src/game/multiplayer/ManualWebRTCSession.ts` | Backend-free WebRTC adapter: host creates a copyable offer for each friend, guests return matching answers, and peers exchange typed data-channel messages. |
| `src/game/multiplayer/CoopSimulation.ts` | DOM-free, host-authoritative first co-op combat slice: squad movement, every current weapon definition, enemies, kills, and snapshots. |
| `src/components/ManualMultiplayerSetup.tsx` | Manual co-op setup UI reachable from the main menu. It has no signaling service or account dependency. |
| `src/components/MultiplayerArena.tsx` | Direct WebRTC arena client: input collection, host ticking/snapshots, guest rendering, and perspective camera controls. |
| `src/game/multiplayer/MultiplayerRendererBridge.ts` | Adapter that presents the shared co-op snapshot through the existing production `Renderer3D`, retaining its FPS viewmodel, chase camera, city, and weapon VFX. |
| `src/game/SoundManager.ts` | Web Audio API effects plus decoded co-op firearm audio |
| `ENEMY_SYSTEM.md` | Production enemy roster, packs, pacing formulas, tactics, telegraphs, rewards, and performance contract. |
| `public/audio/cc0-gunfire.wav` | Bundled CC0 gunfire recording used for every host-accepted local co-op shot |
| `public/audio/cc0-*-reload.wav` | Bundled CC0 handgun, rifle, and shotgun reload recordings |
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
     → MULTIPLAYER_SETUP → MENU
     → MULTIPLAYER_PLAYING → MENU
```

- **MENU** — Title screen with "Initialize Run", "Select Operator", & "Neural Lab". Shows active operator, coins, level.
- **OPERATOR_SELECT** — Card grid of 6 operators. Unlock with coins, select one to play.
- **PLAYING** — Active gameplay. Canvas renders world; React HUD overlays stats.
- **LEVEL_UP** — Player chooses 1 of 3 upgrades.
- **TREASURE** — Rare treasure found.
- **GAME_OVER** — Run stats. Two options: "Try Again" or "Back to Menu".
- **PERMANENT_UPGRADES** — "Neural Lab" shop.
- **MULTIPLAYER_SETUP** — Manual WebRTC offer/answer exchange for direct friends-only co-op.
- **MULTIPLAYER_PLAYING** — Direct peer-to-peer, host-authoritative co-op arena.

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

| Type | Unlocks At | Health | Damage | Speed | Role |
|------|-----------|--------|--------|-------|------|
| basic | 0 min | 12 | 10 | 1.0 | pressure |
| fast | 2 min | 50 | 12 | 1.4 | flanker/lunge |
| tank | 5 min | 180 | 30 | 0.9 | blocker/shockwave |
| ranged | 8 min | 60 | 18 | 1.3 | support/artillery |
| elite | 12 min | 500 | 45 | 1.2 | commander/artillery |
| phantom | 15 min | 80 | 15 | 2.2 | ambusher |
| titan | 20 min | 1200 | 55 | 0.6 | boss pressure |

Solo bosses arrive at 2/5/10/20 minutes. Item Holders have a 2% spawn chance.
See `ENEMY_SYSTEM.md` for authored packs, co-op rounds, attack timing, reward
conservation, and renderer budgets.

## Difficulty Scaling

```text
difficultyMultiplier = 1 + (wave - 1) * 0.15 + min(killCount / 2000, 0.5)
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

## Manual WebRTC Co-op Foundation

The main menu includes **Manual Co-op**. It is deliberately backend-free:

1. The host creates one WebRTC offer code for each friend.
2. A friend pastes the offer, generates an answer code, and gives it back to the host.
3. The host pastes the answer to complete the direct peer-to-peer connection.

The adapter uses unordered/unreliable `input` and `state` data channels for
time-sensitive payloads, plus an ordered/reliable channel for joins and other
important match events. Manual codes use public STUN discovery by default; the
public-lobby path can receive short-lived TURN REST credentials from the
signaling service. Gameplay remains peer-to-peer and host-authoritative.

**Current playable scope:** a host can launch a direct co-op arena alone or
with friends. A dedicated Web Worker pulse drives the host's fixed 30 Hz
simulation independently from rendering; guests send input at 30 Hz and the
host broadcasts per-peer snapshots at 20 Hz. The arena has
host-authoritative squad movement, manual mouse-aimed fire with five firearms,
enemy spawning/chasing, collision damage, and shared kill count. It also owns a
full **Sector Breach** arc: an opening insertion, Uplink and Elite Hunt
contracts, two mini-bosses, a three-phase final boss, and a timed extraction.
Enemy snapshots use the real `ENEMY_TYPES` definitions, allowing the production
3D renderer to keep their existing class-specific appearances as the match
escalates.
The host simulation also shares the production 12 km city bounds and
`WorldLayout` collision resolver, so squads and enemies collide with the same
buildings the existing `Renderer3D` presents.
Use **1–5** to jump between firearms, or the mouse wheel to cycle them; every
cast is explicit and host-authoritative. Buy Stations award personal run-credit
choices—ammo, healing, armor, a personal self-revive, and up to two support
modules. The initial support roster is Orbit Drones, Data Scythe, Void Aura,
Frost Aura, and Neural Pulse; these are intentionally a safe subset of the
single-player arsenal rather than a claim that every single-player weapon is
already network-ready.

The co-op arena is **first-person only** and reuses the production
pointer-lock viewmodel from `Renderer3D`. There is no multiplayer chase-camera
or **V** camera toggle. Click the arena once to lock the mouse. The camera and
rendering are client presentation only; the host still decides movement,
weapon casts, hits, and enemy outcomes.
Movement is camera-relative: **Z** moves forward where you are
looking, **S** moves back, and **Q/D** strafe left/right (with arrow keys also
available). **W** is reserved for the slide/crouch action on the AZERTY layout.
**Shift** is a held sprint with a replicated speed/FOV change, while **Space**
sends a single host-validated jump pulse. Jump height and grounded state are
part of the shared snapshot, so every peer receives the same grounded state
and the same first-person camera lift.
Hold the **W-labelled key** while standing still to crouch. To slide, hold
**Shift**, supply any movement direction, then press and hold **W**. The host
locks that direction at the instant the slide begins, makes it substantially
faster than sprint, and keeps it going even when movement keys remain held or
the camera turns. Releasing **W** immediately stands the player up and returns
to the normal movement input; jumping also ends the slide.

The authoritative simulation remains at 30 Hz and the network state stream at
20 Hz, while the client interpolates snapshots on every animation frame. High
volume entities are interest-filtered around each peer, pickup populations are
bounded, and transforms are quantized; squad and objective state stays global.
This keeps the host deterministic and avoids visibly stepped movement without
uploading the entire combat district to every guest.

Trigger pulls carry monotonic action IDs and are repeated in subsequent input
frames until acknowledged in player state. The client presents its first shot
immediately, deduplicates the later authoritative event, and the host advances
accepted remote projectiles through at most 150 ms of measured input age. Ammo,
damage, cadence, and hit decisions remain authoritative. Inputs older than two
seconds become neutral so a stalled peer cannot continue walking or firing.

Shots use both the host-accepted camera yaw **and pitch** for their spawn
direction and authoritative 3D velocity. You can fire at the ground, into an
enemy's torso, or up into the sky just as the crosshair indicates. Projectile
height is replicated and host collision checks include each enemy's vertical
hit volume, so high shots fly over enemies and low shots hit the ground instead
of being silently flattened to gun height. The renderer receives the yaw,
pitch, velocity, elevation, and remaining lifetime so its existing authored
projectile meshes visibly follow the actual flight path. Moving rounds also
have a narrow luminous core-and-glow trail attached in local flight space, so
the entire visual points along the same up/down/sideways 3D vector as the
authoritative projectile rather than becoming a flat screen effect. The
renderer applies that vector as one quaternion transform, avoiding rotation
order issues that can make pitched shots appear parallel to the ground.

The host's in-arena **Live squad lobby** remains open while playing. It can
make a fresh offer code for a friend at any time; after their answer is pasted,
the new guest joins the already-running squad, up to the four-player cap.

### Co-op Firearm Audio

Every host-accepted `weapon_fired` event for the local player plays the bundled
`public/audio/cc0-gunfire.wav` asset. The Web Audio context is resumed from the
first arena mouse click, avoiding autoplay-policy muting when the fire event is
presented on a later animation frame. Handgun, rifle, shotgun, sniper rifle,
and SMG reuse the CC0 recording with distinct gain, pitch, and tail-length
profiles; if the asset cannot be decoded, the previous procedural shot remains
as an audible fallback.

Reloads receive the same authoritative treatment. Handgun, assault rifle/SMG,
sniper rifle, and shotgun each select a matching CC0 recording, and the
viewmodel lowers and rolls for the reload. Magazine weapons animate their
magazine or energy cell out and back into the well; the shotgun cycles its pump
for every shell and gets a replicated `reload_shell_loaded` sound event; the
sniper works its bolt near the end of the reload.

Asset: **“Random gunfire SFX” by iamoneabe**, distributed under
[CC0](https://opengameart.org/content/random-gunfire-sfx); no attribution is
required, but this record is retained for provenance.

Reload assets: **“Gun reload sounds” by SpringySpringo**, distributed under
[CC0](https://opengameart.org/content/gun-reload-sounds); credit is optional.

### Co-op Death and Revival

The host owns every player-life transition. In a solo co-op arena, reaching
zero HP ends the run immediately. In a squad, a zero-HP operative becomes
**downed** for 20 seconds: they cannot move, fire, collect loot, or draw enemy
targets. A living teammate can stand within range and hold **F** for three
seconds to revive them at 35% HP with 2.5 seconds of protection. Moving out of
range, releasing F, or the reviver taking damage cancels the progress. If no
operative remains alive, the host declares a squad wipe and sends the same
result to every peer. Damage, down, revive, and defeat events are replicated
for the HUD, incoming-hit vignette/direction text, sound, shake, and squad
status display.

**Current limitation:** co-op now owns its own first complete run loop, but it
does not yet import every single-player evolution, event, operator, or passive
power. Its supported modules are intentionally capped for clear visuals and
predictable host performance. Bots, additional contract types, and the remaining
single-player support weapons are future expansion work.

## Cheats
Type the following codes while on the **Main Menu**:
- `gimmecash` — Grants 9,999,999 coins instantly.
- `reset` — Resets all progress (coins, level, permanent upgrades, and operators).
- `unlockall` — Unlocks all operators.
- `iamgod` — Maxes out all Neural Lab permanent upgrades.
