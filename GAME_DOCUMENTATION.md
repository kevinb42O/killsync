# KILLSYNC — Game Documentation

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
MENU → SOLO_SETUP → MULTIPLAYER_PLAYING → MENU
     → PLAYING → LEVEL_UP → PLAYING
                → TREASURE → PLAYING
                → GAME_OVER → MENU or PLAYING
     → OPERATOR_SELECT → MENU
     → PERMANENT_UPGRADES → MENU
     → MULTIPLAYER_SETUP → MENU
```

- **MENU** — Title screen with "Initialize Run", "Multiplayer", "Select Operator", and "Neural Lab". **Initialize Run** opens a local-only configuration screen before launching the current co-op simulation in one-player practice mode. The legacy top-down single-player implementation remains in the codebase for possible future reuse but is no longer the primary menu action.
- **SOLO_SETUP** — Local-only run configuration for callsign, operator class, Imprint allocation, and unlocked world selection. It contains no lobby discovery, hosting, joining, room-code, or signaling UI.
- **OPERATOR_SELECT** — Card grid of 6 operators. Unlock with coins, select one to play.
- **PLAYING** — Active gameplay. Canvas renders world; React HUD overlays stats.
- **LEVEL_UP** — Player chooses 1 of 3 upgrades.
- **TREASURE** — Rare treasure found.
- **GAME_OVER** — Run stats. Two options: "Try Again" or "Back to Menu".
- **PERMANENT_UPGRADES** — "Neural Lab" shop.
- **MULTIPLAYER_SETUP** — Manual WebRTC offer/answer exchange for direct friends-only co-op.
- **MULTIPLAYER_PLAYING** — Direct peer-to-peer, host-authoritative co-op arena.

### Co-op Tactical Insertion

Entering a fresh co-op run now mounts the 3D arena behind a staged tactical
deployment overlay. The sequence presents the operation, seeded district ID,
first objective, localized controls, and live squad roster before releasing the
normal HUD. Gameplay input is neutral while the overlay is active. Players can
use the final **Click to deploy** action to acquire pointer lock; the sequence
also releases automatically after 5.2 seconds so it can never conceal the end
of the 12-second enemy-free insertion window. In-progress spectators receive a
short 1.65-second live-signal synchronization variant instead of the new-run
briefing. `prefers-reduced-motion` removes shutters, scans, and HUD travel while
preserving the same readiness timing and information.

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

## Co-op Operator Imprints

Co-op has a persistent, operator-specific extraction progression layer. The
five Imprint stats are host-authoritative and clamped when received from a peer:

| Stat | Per rank | Cap | Authoritative effect |
|------|----------|-----|----------------------|
| Power | +4% | 10 | Firearm and offensive support-module damage |
| Vitality | +7 HP | 10 | Starting and maximum health |
| Mobility | +2% | 8 | Walk, sprint, crouch, and slide translation speed |
| Handling | -3% duration | 10 | Reload and weapon-switch time, capped at -25% |
| Reach | +12% | 10 | Personal XP/item/ammo attraction radius |

- Elite and boss Data Cores are shared with every non-eliminated squad member.
- XP gems are squad XP, so Reach cannot steal levels from a teammate.
- Successful extraction settles cores exactly once by run id, then exposes
  them as spendable Calibration Points on the debrief and deployment screens.
- Every fresh operator and every post-wipe generation begins with exactly one
  baseline Calibration Point. Reopening the menu and duplicate run settlement
  cannot grant it again, so deliberate wipes never accumulate free power.
- Careers created before the baseline system receive the same point through a
  one-time schema migration, so existing players are not stranded at zero.
- Players can allocate points from the deployment menu before hosting, joining,
  or starting solo practice. Allocation locks after a squad connection begins,
  and the selected ranks are copied into the launch seed sent to the host.
- Rank costs escalate: ranks 1–3 cost 1, 4–6 cost 2, 7–8 cost 3, and 9–10 cost 4.
- Extracted ranks and unspent points persist into the next deployment.
- A confirmed solo defeat or total squad wipe destroys the combat Imprint,
  clears its earned ranks/unspent points, advances its generation, and restores
  only that generation's single baseline choice.
- Missing or abandoning an extraction while at least one operator survives
  ends the run and forfeits unextracted Data Cores, but preserves installed
  Imprint ranks. Only full squad elimination triggers the destructive reset.
- Career totals, highest depth, account progress, operators, achievements, and
  other existing permanent unlocks survive a wipe.
- Weapon levels, credits, armor, ammunition, masks, self-revives, Foundry
  upgrades, and support modules remain run-only.
- Imprints cannot change during combat. A guest can synchronize a settled or
  newly allocated Imprint after results so the host can reuse it on retry.
- The multiplayer deployment menu shows the selected operator's generation,
  rating, unspent points, best depth, all five ranks, exact next-rank effects
  and costs, allocation state, and the wipe warning.

Co-op offers unanimous early extraction after both mini-bosses. The checkpoint
is available for 20 seconds and requires every living operator to remain in the
zone for 5 seconds. If the squad does not commit unanimously, the portal closes
and the campaign automatically breaches deeper. The final extraction retains
its normal one-player activation and 90-second emergency timer.

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
| `killsync.coop.imprints.v1` | Versioned co-op career, generations, ranks, Calibration Points, and settled run ids |

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
with up to seven friends. A dedicated Web Worker pulse drives the host's fixed 30 Hz
simulation independently from rendering; guests send input at 30 Hz and the
host broadcasts per-peer snapshots at 20 Hz. The arena has
host-authoritative squad movement, manual mouse-aimed fire with five firearms,
enemy spawning/chasing, collision damage, and shared kill count. It also owns a
full **Sector Breach** arc: an opening insertion, Uplink and Elite Hunt
contracts, two mini-bosses, a three-phase final boss, and a timed extraction.
Enemy snapshots use the real `ENEMY_TYPES` definitions, allowing the production
3D renderer to keep their existing class-specific appearances as the match
escalates.
The host simulation shares the production 12 km city layout and
`WorldLayout` building resolver, so squads and enemies collide with the same
architecture the existing `Renderer3D` presents. In co-op, that city is a
floating megastructure: the rendered deck and architecture stop at its visible
edge, and an operative who crosses the footprint falls and is eliminated
instead of being stopped by an invisible boundary clamp. Elimination remains
immediate and host-authoritative. The roughly five-second tumbling fall and
third-person camera appear only on the fallen operator's own client. Teammates
hide that operator immediately and receive a message directing them to buy the
operator back. This presentation does not add a `falling` simulation state,
delay death, or affect movement, combat, revival, or networking.
Use **1–5** to jump between firearms, or the mouse wheel to cycle them; every
cast is explicit and host-authoritative. Buy Stations award personal run-credit
choices—ammo, healing, armor, a personal self-revive, and up to two support
modules. Its Reinforcements category can also redeploy a fully eliminated
teammate for 900 credits at 50% health. A downed, still-revivable teammate is
never eligible for that purchase and must be restored through the normal revive
flow. Its Extraction category sells a one-use **Private Exfil** for 1,500
credits after the squad has completed a field contract or advanced the primary
operation. The caller pays the full price; any living squad members inside the
extraction zone when its ten-second hold completes leave safely. The initial
support roster is Orbit Drones, Data Scythe, Void Aura,
Frost Aura, and Neural Pulse; these are intentionally a safe subset of the
single-player arsenal rather than a claim that every single-player weapon is
already network-ready.

The co-op arena uses first person during gameplay and reuses the production
pointer-lock viewmodel from `Renderer3D`; its only third-person exception is the
client-only fall presentation after stepping off the platform. There is no
player-controlled multiplayer chase camera or **V** camera toggle. Opening any modal releases pointer lock and focuses its
first action. Closing a modal focuses the WebGL canvas and attempts to restore
pointer lock from the same user gesture. If a browser rejects that recapture,
a centered **Click to resume control** action remains available in both solo
perspective modes and co-op. The camera and
rendering are client presentation only; the host still decides movement,
weapon casts, hits, and enemy outcomes.

Co-op English and Russian copy is resolved per client through the typed
multiplayer catalog. This includes matchmaking/signaling, objectives, combat
notices, HUD phases and units, Imprint stats and debriefs, Buy Station
reinforcements, Foundry ammo metadata, gas states, results, and accessibility
labels. Host messages carry semantic state; they do not impose the host's
display language on other squad members.
Movement is camera-relative: **Z** moves forward where you are
looking, **S** moves back, and **Q/D** strafe left/right (with arrow keys also
available). **W** is reserved for the slide/crouch action on the AZERTY layout.
**Shift** is a held sprint with a replicated speed/FOV change, while **Space**
sends a single host-validated launch pulse and a held thrust state. Pressing it
while grounded immediately performs a jet-assisted launch; continuing to hold
keeps the engine firing, while releasing early produces a short hop. Jump
height and grounded state are part of the shared snapshot, so every peer receives the same
grounded state and the same first-person camera lift. While airborne, pressing **Space** as
you touch solid city architecture or a Hardlight Barricade performs a
wall-jump, even while facing or moving away from it. Only one wall-jump is
available per airborne cycle; landing on the real floor restores it.
Away from a wall, holding **Space** ignites the universal Burst Pack immediately,
including directly from the floor. Every class has the identical pack: 100 fuel,
50 fuel drained per second for two full seconds of continuous thrust, an 800 ms
grounded recharge delay, and 50 fuel restored per second. Air steering is capped
near 330 units/second. Thrust tapers above 120 elevation and settles against the
hard 150-elevation ceiling without cutting the engine early. Wall contact takes
priority once airborne, so the shared aerial action becomes a directional
wall-jump instead; a wall-jump and Burst Pack ignition cannot be chained in the
same airborne cycle. A local looping turbine/exhaust sound follows the replicated
active-thrust state and fades out as soon as thrust stops.

The pack is repositioning, not immunity. Ground contact enemies cannot hit an
operator above 55 elevation and shockwaves can be cleared above 45, but ranged,
artillery, gravity, gas, and other hazards remain dangerous. Captures, revives,
shopping, Foundry use, pickups, construction, mission interactions, and
extraction do not progress above 20 elevation. Crossing a platform or world
surface edge remains an immediate fall even with fuel. Firing while thrusting
adds 60% spread. Other players see the existing dual pack flames remain fully
lit for the authoritative thrust window.
The first-person camera banks away from side walls and adds a restrained pitch
kick when rebounding from a wall ahead or behind. The lean follows the
authoritative collision normal and eases back without changing the player's aim.
Hold the **W-labelled key** while standing still to crouch. To slide, hold
**Shift**, supply any movement direction, then press and hold **W**. The host
locks that direction at the instant the slide begins, makes it substantially
faster than sprint, and keeps it going even when movement keys remain held or
the camera turns. Releasing **W** immediately stands the player up and returns
to the normal movement input; jumping also ends the slide.

### Co-op Field Contracts and Mobile Gas

Press **Tab** during a run to open the full 12 km tactical map. It shows the
live fixed-radius toxic zone, its announced destination while relocating, Buy
Stations, the Foundry, both extraction types, squad members, and all five field
contract pickups over the authoritative city building plan. Every operator is
drawn as a directional arrow; the local operator also has a bright pulse, a
**YOU** label, and a facing cone. The simulation continues while the map is
open. A contract is accepted physically with **F** at its world transmitter;
single-clicking it on the map displays its briefing. Double-clicking a contract
or its active objective sends a host-validated, 45-second squad waypoint that
follows the live mission target. Only one field contract can be active at once.

Accepting a contract also enables permanent objective guidance until that
contract ends. The active target has a 9,000-unit skyline beacon with a bright
white core, the contract's color, rotating broken signal bands, and an
occlusion-proof render pass so buildings cannot hide it. A reserved outer
indicator around the aiming reticle continuously points toward the objective
and displays the contract name, current stage, and distance. Moving targets
are tracked directly; multi-step contracts automatically advance the beacon to
the next living courier, uncollected drive, bomb site, hostage, or handoff zone.

Every operator who belongs to the squad when a contract is accepted receives
the full listed payout when it completes, including an operator who is awaiting
redeployment. An operator who already extracted, or who joins after acceptance,
is not enrolled. The five contracts are:

- **Toxic Hunt — 500 credits each:** enter the mobile toxic zone and eliminate
  a 1,600-base-HP Chem Commander protected by a scaled squad of red guards.
- **Demolition — 450 credits each:** hold F for four seconds to plant Site A,
  defend it for 20 seconds, then reach and plant Site B within 90 seconds and
  defend that charge for another 20 seconds.
- **Hostage Recovery — 550 credits each:** clear the hostage's guards, press F
  to pick up the hostage, then remain in the recovery beacon for ten seconds.
  The carrier cannot aim, fire, reload, sprint, or slide; their walking speed is
  reduced by 18%, and the jet pack is disabled. If the carrier is downed or
  disconnects, the hostage drops with a squad-wide warning and another living
  squad member may take over.
- **Signal Hijack — 400 credits each:** activate the relay with a three-second
  F hold and control its area for 45 seconds. More operators accelerate the
  upload, enemies contest it, and abandoning it slowly loses progress.
- **Courier Intercept — 425 credits each:** eliminate three guarded couriers,
  recover each dropped drive with F, then deposit all drives at the marked dead
  drop with a three-second F hold. The contract remains in its intercept stage
  until all three couriers are dead, then advances through every outstanding
  drive before exposing the dead drop.

Mission progress is authoritative and stage-specific: the HUD reports Chem
Commander health, hostage guards cleared, bomb arming/defence progress, relay
upload progress, couriers remaining, drives recovered, and handoff progress.
Every stage transition is announced to the whole squad with a tactical audio
cue. A missed Demolition Site B window explicitly resets the squad to Site A.
Mission waypoints disappear immediately on completion, and surviving contract
guards become ordinary threats so later contracts can always reserve their
required enemy capacity.

The toxic zone no longer spreads. It is always a 750-unit-radius cloud placed at
a deterministic random, navigable map position. It remains stationary for
75–110 seconds, announces its next destination for 12 seconds, travels 900–1,500
units over 22–30 seconds, settles for five seconds, then starts another stopped
period. Its radius and damage never increase during the run.

### Co-op Artifact Classes

Every operator has the same practical firearm skeleton: **1** Neon Handgun,
**2** Assault Rifle, **3** Combat Shotgun, a class artifact in **4**, and **5**
SMG. Left click fires the artifact primary. While slot 4 is active, right click
spends its class resource instead of aiming down sights; standard firearms keep
normal right-click ADS. Resources and active procs are host-authoritative and
replicated in the lower-left HUD beside the universal Burst Pack fuel bar.

| Operator | Class | Slot-4 artifact | Resource loop | Right-click spender |
|---|---|---|---|---|
| Neon Vanguard | Stormcaller | Tempest Conductor | Chains generate up to 5 Static; three full chains prime Overload | **Stormcall:** 5 Static marks a 260-radius zone for three capped lightning pulses |
| Crimson Strike | Bloodreaver | Goreline Repeater | Hits generate Fury, with extra gain against wounded enemies; Fury decays out of combat | **Reckoning:** 50 Fury fires a five-round missing-health execute volley; a kill refunds Fury, rounds, and barrier |
| Void Runner | Riftstrider | Riftspike Array | Repeated hits seal one target; moving 120 units triggers Slipstream for a bonus seal | **Echo Collapse:** consumes all seals and attacks the marked target from recent path echoes |
| Solar Guard | Sunwarden | Dawnwall Cannon | Every third hit grants Conviction, with a protection bonus when the enemy is targeting an ally | **Dawnwall:** 5 Conviction creates a six-second taunt/burn field and barriers nearby allies |
| Black Ice | Cryowarden | Winterglass Projector | The cone stacks Chill; reaching five stacks grants Rime and briefly roots non-Titans | **Shatter Lance:** 3 Rime bursts a target and nearby chilled enemies; shattering a frozen pack can refund Rime |
| Royal Inferno | Hellbinder | Cinderhex Engine | Hits stack Cinderhex; burning kills and sustained elite/titan burns yield Soul Fragments | **Hellseed:** 3 fragments plants a delayed blast; 5 empowers it and summons a chasing Emberling |

Class passives are deliberately narrower than complete MMO kits: Stormcaller
Overload strengthens one next bolt, Bloodreaver Redline speeds Goreline by 20%
below 45% health, Sunwarden Stand Together shortens reloads near a living ally,
Riftstrider rewards movement, Cryowarden rewards pack setup, and Hellbinder
rewards damage-over-time target management. There are no separate long-cooldown
Q abilities in this implementation; the artifact primary/resource/spender loop
is the class identity and avoids adding six simultaneous control systems.

### Co-op Field Engineering

Tap **B** to equip the last Field Fabricator blueprint; hold B to expose the
blueprint palette. **1–6** or Shift+mouse-wheel selects a blueprint, the
mouse wheel rotates it, and Alt temporarily disables endpoint snapping. Left
click deploys; right click or Escape returns to the firearm. Placement is
allowed on any valid nearby surface. Objectives, stations, bosses, extraction,
and intermission rallies grant a visible 60-second tactical lifetime bonus.
Placement remains host-authoritative: the host validates range, world clearance,
protected terminals, overlap, personal charges, and squad caps.

- **Hardlight Barricade (1 charge):** a jumpable, destructible obstacle. It
  redirects ordinary enemies; Phantoms phase through it, Goliaths break it
  quickly, and Titans crush it.
- **Hardlight Bastion (2 charges):** a 14-second, four-wall emergency shelter
  with one shared integrity bar. Operators can jump over a panel to enter or
  leave it. It blocks ordinary hostile sightlines and firearm rounds, but not
  Phantoms, gas, shockwaves, or boss hazards; tanks and Titans tear it down
  quickly. A Bastion counts as one structure, never four separate barricades.
- **Arc Fence (1 charge):** a non-blocking control line. Enemies inside move at
  38% speed and receive an archetype-scaled shock at most once per 1.1 seconds.
  Normal enemies are briefly stunned; elites and tanks resist most of the stun,
  Titans resist it completely, and Phantoms phase through the field. Every
  discharge consumes a little coil integrity. Pressing E spends a charge to
  overcharge it for rapid, stronger shocks.
- **Recovery Relay (2 charges):** a fragile medical dome that restores 7.5 HP
  per second to living squad members inside its 120-unit field and makes nearby
  revives 25% faster. Multiple relay fields do not stack. It does not revive by
  itself, refill ammunition, block toxic gas, or protect against hazards.
  Passive healing and the E-powered squad healing surge both display the exact
  HP restored to each affected player; the local HUD also confirms whenever the
  operator is standing inside an active recovery field.
- **Specter Decoy (1 charge):** projects a false operator that attracts normal,
  fast, ranged, tank, and elite enemies. Phantoms and Titans ignore it. Pressing
  E amplifies its attraction range temporarily.

Structures can be operated by teammates. Hold **F** near a damaged structure to
repair it, press **R** while aiming at an intact barricade or fence to rotate it,
or press **C** to relocate a pristine owned structure to the current hologram.
Press **X** to dismantle an owned structure; a pristine structure dismantled
within 15 seconds while no enemy is nearby refunds its cost. Barricades can be
permanently reinforced with E.

Each operator starts with two personal charges and stores at most four. One
charge regenerates every 40 seconds while alive; elite and Titan kills recover
14 seconds of that timer. Cleared rounds still grant a charge and repair every
surviving structure by 25%. Players maintain at most two active
structures and the squad at most eight. Structures last two minutes or until
destroyed. A structure left more than 900 units from every living squad member
expires after a 20-second grace period. Shockwaves and other hazards damage structures, so building
creates temporary time and positioning rather than permanent safety.

Nearby structures combine automatically. Relay fields repair linked barricades,
Arc Fences electrify linked barricades, and two Arc Fences create a damaging
powered corridor. Barricades and fences snap end-to-end for readable defensive
runs. Each blueprint uses a distinct saturated energy identity—cyan barricade,
violet fence, emerald relay, and pink decoy—across its armor tint, light, field,
placement hologram, and network links. Structure links, health bars, integrity, lifetime, ownership, tactical
bonus, and ability states are replicated and presented to the squad.

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
the new guest joins the already-running squad, up to the eight-player cap.

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
