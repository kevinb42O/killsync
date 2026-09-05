# Enemy System

This document is the production contract for enemy spawning, combat roles,
readability, rewards, and performance. Keep it synchronized with
`src/game/combat/enemyDomain.ts`, `EncounterDirector.ts`, and
`CoopSimulation.ts`.

## Shared Roster

| Type | Role | Unlock | HP | Damage | Speed | Radius | XP | Threat |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Drone (`basic`) | steady pressure | 0 min | 12 | 10 | 1.0 | 15 | 5 | 1.0 |
| Scout (`fast`) | flank/lunge | 2 min | 50 | 12 | 1.4 | 14 | 12 | 1.25 |
| Goliath (`tank`) | blocker/shockwave | 5 min | 180 | 30 | 0.9 | 25 | 30 | 3.5 |
| Sniper (`ranged`) | standoff/artillery | 8 min | 60 | 18 | 1.3 | 18 | 20 | 1.6 |
| Elite Guard (`elite`) | commander/artillery | 12 min | 500 | 45 | 1.2 | 35 | 100 | 6.0 |
| Phantom (`phantom`) | flank/ambush | 15 min | 80 | 15 | 2.2 | 20 | 50 | 2.4 |
| Titan (`titan`) | boss pressure | 20 min | 1,200 | 55 | 0.6 | 60 | 500 | 15.0 |

Solo bosses have separate milestone definitions at 2, 5, 10, and 20 minutes.
They use percentage contact damage and do not inherit normal-enemy special
attacks. Co-op contract bosses use the run director and their own telegraphed
ability schedule.

## Special-Attack Readability Contract

| Type | Attack | Valid range | Radius | Warning | Cooldown | Burst multiplier |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Scout | lunge | 90–330 | 58 | 480 ms | 2.7 s | 1.25x |
| Sniper | artillery | 180–760 | 76 | 1.0 s | 3.3 s | 1.0x |
| Goliath | shockwave | 0–170 | 165 | 1.1 s | 3.4 s | 0.87x |
| Phantom | ambush | 150–620 | 82 | 720 ms | 4.2 s | 1.35x |
| Elite Guard | artillery | 0–720 | 105 | 1.25 s | 4.8 s | 0.72x |

Solo and co-op read these values from one table. A target is locked when the
warning begins, so moving out of the displayed zone dodges the hit. Lunges and
ambushes show a travel line and relocate their source only after the warning.
Artillery and relocation attacks require an unobstructed path when committed.
The Goliath shockwave can be jumped in co-op. Every archetype also receives an
opening delay before its first special attack.

## Solo Spawning

The solo engine preserves its survivor-style continuous population curve, but
each spawn pulse now selects an authored pack before filling spare capacity:

- `swarm`: two or three Drones;
- `raiders`: Scouts screened by a Drone;
- `fireteam`: a Sniper behind one or two Drones;
- `siege`: a Goliath with Drone/Sniper support;
- `hunt`: a Phantom with Scouts;
- `command`: Elite Guard, Goliath, Sniper, and Drone.

Pack members share an arrival angle and use lateral/depth offsets, which makes
their intent readable instead of distributing every unit independently around
the player. In perspective modes, ordinary packs use the rear 162-degree arc
and therefore begin at least 99 degrees away from the crosshair; explicit event
portals are exempt. Archetype caps are revalidated after every member so one packet
cannot overflow the elite, phantom, or titan population limits. Difficulty is:

```text
1 + (wave - 1) × 0.15 + min(kills / 2000, 0.5)
```

Health receives the full difficulty multiplier. Damage receives half of the
excess multiplier and movement speed receives only 20%, capped at 2x. Boss and
event movement remains below player speed.

Solo keeps ordinary waves below 490 enemies and reserves ten positions inside
the global 500-enemy limit for milestone bosses, bounty targets, and supply
guards. If that reserve is exhausted, an event safely skips its enemy instead
of overflowing the renderer or simulation.

### Event enemies

- Bounty targets use an Elite Guard chassis, a 15-second kill window, a 3.4x
  health cap, and a 1.9x damage cap. Their first artillery attack observes the
  normal opening delay, and their movement remains kiteable.
- Supply guards use a Goliath chassis with 3.0x health and 1.65x damage caps.
  The associated crate remains orange and locked while that exact guard is
  alive, then changes to green and becomes collectible after the kill.
- Bounties, guards, and crates are moved to collision-clear street positions;
  neighborhood probes fall back to a deterministic arena scan on unusually
  crowded layouts.

## Co-op Encounter Director

Co-op has finite rounds and a 20-second recovery window. Round population is:

```text
min(64, 10 + round × 5 + additionalPlayers × 6)
```

The first packet introduces that round's new tier. Later packets come from
authored `patrol`, `rush`, `fireteam`, `bulwark`, `crossfire`, `hunters`, and
`command` compositions. Pack threat is checked against the current concurrency
budget. Normal waves stop at 84 units, reserving six of the global 90-enemy
limit for a boss and its guards. Contract enemies and bosses consume that
global cap but have separate threat accounting, so they cannot deadlock a
finite round.

Contract boss base health is 4,800 / 9,500 / 34,000 for the Neural Overlord,
Void Architect, and Singularity. Party scaling is `1 + additionalPlayers ×
0.70`; total health increases but health per operator decreases. The Elite Hunt
target uses the same principle at `1 + additionalPlayers × 0.75`, avoiding a
four-player curve that increases per-player workload.

Spawn topology uses collision-clear nodes 720–1,300 units from the assigned
squad cluster, rejects near-field nodes inside a player's view cone, requires a
clear route toward the fight, avoids occupied/recent nodes, and places pack
members as a collision-free formation. Frontline units enter closest to the
squad; ranged support enters at the rear.

Co-op difficulty favors composition and count over health inflation:

```text
health = min(1.85, 1 + (round - 1) × 0.065 + additionalPlayers × 0.10)
damage = min(1.45, 1 + (round - 1) × 0.035)
```

## Movement And Targeting

- Drones apply direct pressure; Goliaths screen the near band.
- Snipers and Elite Guards retreat, orbit, and preserve a firing lane.
- Scouts and Phantoms approach on deterministic opposite flanks.
- Local separation prevents horde overlap.
- Collision probes try several steering angles before movement is accepted.
- An enemy that makes no progress for 700 ms requests a short-lived local
  detour waypoint. This is obstacle recovery, not global navigation.
- Co-op targets use a lease to prevent rapid player-to-player target flicker.

## Rewards And Population Safety

- Standard co-op ammo chance: Drone 10%; Scout/Sniper/Phantom 18%; Goliath 30%.
  Elites and Titans always create an ammo reward.
- Co-op base coin chance is 22%; elite/titan tables remain special.
- The 2% item-holder roll uses authored item weights. Zero-weight data cores
  are excluded; those remain meaningful guaranteed elite, titan, and boss loot.
- World caps are 160 XP gems, 48 items, and 32 ammo caches.
- At a cap, same-kind rewards merge into the nearest existing pickup. XP value
  is always conserved. A guaranteed data core with no merge target is banked
  directly to its killer, so elite progression cannot be lost to saturation.

## Presentation And Performance

Enemy rigs have role-specific silhouettes, emissive weak points, articulated
limbs, damaged-only billboard health bars, spawn materialization, attack charge,
hit flash, and a 480 ms non-interactive energy-collapse death. The collapse is
staged as an impact flare, instanced scan-ring/shard implosion, and final light
filament. Distant ordinary detail is hidden while elite and titan detail remains
visible. Solo top-down Scouts and Phantoms use stable phase animation rather
than per-frame randomness.

The horde reuses a small geometry library. Death fragments and scan rings use
instancing and remain hidden outside the short death window. Armor/glow
materials remain per-rig because hit flash and charge mutate them. Cleanup
disposes only per-instance resources and retains shared geometry. The legacy
perspective renderer also caches standard enemy geometry. Pickup/entity caps
prevent unlimited renderer growth during unattended runs.

## Verification Expectations

Enemy changes should run TypeScript, the full Vitest suite, and the production
build. Focused tests cover deterministic packs, ten-round progression, threat
gating, spawn reaction distance, collision-free formations, archetype combat
bands, obstacle detours, dodge timing, lunge/ambush relocation, jumpable
shockwaves, reward conservation, resource reuse, and disposal.

Current verification: 116 tests across 20 files, TypeScript, and the production
build pass. The production build retains the existing large-chunk warning.
