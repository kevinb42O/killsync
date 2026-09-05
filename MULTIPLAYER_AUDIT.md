# Multiplayer Audit

Date: 2026-09-05

## Assessment

The most important problems were not just visual polish: enemy IDs could collide,
mini-bosses could spawn at the world origin, and guest movement waited for an
authoritative round trip plus interpolation. This pass fixes those defects and
adds a usable solo test path, tactical enemy behaviors, and readable world cues.
It is not a replacement for a production networking architecture or an authored
environment-art pass.

## Fixed In This Pass

| Severity | Finding | Change |
| --- | --- | --- |
| High | Spawn-node IDs overwrote enemy entity IDs. Reused nodes produced duplicate enemies in React/Three.js and ambiguous combat targets. | Copy only spawn coordinates; preserve simulation-owned IDs. Regression test covers topology spawns. |
| High | Mini-boss placeholders at `(0, 0)` became actual spawn positions. | Place bosses near the contract on collision-clear ground. Validate objectives and extraction locations too. |
| High | Guests waited for input delivery, a 20 Hz host tick, a 10 Hz snapshot, and interpolation before moving. | Shared collision-aware movement, local prediction, input acknowledgments, reconciliation, 30 Hz input/simulation, and 20 Hz snapshots. Combat remains authoritative. |
| High | Unordered snapshots could rewind state; resetting simulation ticks complicated retry ordering. | Monotonic transport ticks independent of run ticks; reject stale/duplicate state. Protocol is now version 11. |
| High | Snapshots over the old 64 KB receive limit disappeared. | Binary fragmentation into at most 12,020-byte packets; bounded 512 KB reassembly, timeout, and stale/loss handling. |
| High | A rejected late join could still install an input mapping to another player's ID. | Install peer mappings only after successful player admission; reject duplicate lobby identities. |
| Medium | React evaluated `new CoopSimulation(...)` on every host render, rebuilding spawn topology even though the ref kept the original instance. | Initialize once; remove redundant host HUD synchronization. |
| Medium | Direct hosting hid Start until another player connected. Public hosting had no visible entry button. | Instant Solo test, Start match solo in direct hosting, and Host public squad. |
| Medium | Uplink progress ignored contesting enemies; elite markers stayed at the spawn point. | Contested capture state, operator count, solo-capable 30-second capture, target tracking, distance/bearing, and world beacon. |
| Medium | Enemy roles all used a direct melee chase; boss abilities applied without warning. | Ranged standoff/aimed strikes, tank windups, scout/phantom flanks, separation, obstacle probes, and telegraphed boss effects. |
| Medium | Co-op enemies were simple generic solids and always faced the viewing camera. | Role-specific mechanical rigs, authoritative facing, animated limbs/charge, death scaling, capture rings, and danger zones. |
| Medium | Input could remain held after focus loss; context-menu listeners leaked. | Clear controls on blur/visibility loss and station focus; remove installed listeners on teardown; consume jump/reload pulses once. |
| Medium | Successful extraction left combat running. | Freeze completed gameplay while retaining the connected session for retry. |
| Medium | HUD panels overlapped and mobile objectives could translate off-screen. | Responsive positioning and compact active-weapon presentation. |

Opening insertion is now 12 seconds instead of 60. Public matches can start with
one operator. Solo test does not publish a room or need ICE/signaling requests;
use public hosting when the room should remain discoverable.

## Highest-Value Next Work

### P1: Host Timing And Connection Recovery

[src/components/MultiplayerArena.tsx](src/components/MultiplayerArena.tsx) still
drives authoritative simulation from `requestAnimationFrame`. Background tabs,
render stalls, or a slow host can slow the whole match. This was observable during
browser testing. Moving simulation to a worker helps render contention, but a
dedicated authoritative server is the stronger solution for background-tab and
host-disconnect reliability.

Add snapshot-age/RTT/jitter/queue diagnostics and a stale-input timeout. Currently
a peer can remain connected while its data flow stops. Define real reconnect and
host-loss behavior rather than relying on connection-state labels. Keep the host
tab foregrounded when testing the current peer-hosted implementation.

### P1: Bandwidth And Loss Resilience

[src/game/multiplayer/ManualWebRTCSession.ts](src/game/multiplayer/ManualWebRTCSession.ts)
still sends full JSON snapshots, now fragmented safely. A fixture with four
players, 90 enemies, and 200 gems was about 44 KB before extra combat events.
At 20 Hz that is roughly 0.88 MB/s per guest before transport overhead. Three
guests can therefore demand substantial host upload bandwidth.

Next: measured per-peer interest filtering, quantized transforms, delta snapshots
with periodic full baselines, bounded pickup populations, and event sequences
separate from repeated world state. Preserve shared objective information even
when distant combat entities are culled. Fragmentation fixes delivery limits,
not bandwidth cost; a missing fragment still drops that snapshot.

One-shot jump/reload/fire edges can still be lost on the unreliable input channel.
Introduce acknowledged action IDs or redundant command bundles. The host currently
samples the latest input rather than consuming an exact command history, so bursty
loss can still require movement corrections. Local prediction does not eliminate
remote-player interpolation delay or weapon/hit-confirmation round-trip delay.
Add predicted firing presentation and bounded host-side shot rewind next.

### P1: Production Signaling Hardening

[server/multiplayerSignaling.ts](server/multiplayerSignaling.ts) uses process-local
rooms, no per-client rate limit, no spectator reservation cap, and static TURN
credentials returned by a public endpoint when configured. Before public launch,
add quotas, bounded spectators/pending joins, expiring TURN credentials, and
explicit cross-origin allowed methods for the PATCH/DELETE routes. A shared room
store or sticky routing is needed before running multiple server instances.

[src/game/multiplayer/LobbySignaling.ts](src/game/multiplayer/LobbySignaling.ts)
uses interval polling that can overlap slow requests. Serialize polls, abort
outstanding requests on teardown, and retry failed offer publication without
leaving requests permanently busy. Awaited session creation also needs cancellation
guards when the user exits setup mid-request.

### P2: Objectives And Encounter Design

[src/game/multiplayer/CoopRunDirector.ts](src/game/multiplayer/CoopRunDirector.ts)
still has only two contract kinds in a fixed order. Build objective-specific
encounters: assaults on the uplink, moving elite escorts, multi-site sabotage,
and extraction waves. Avoid simply adding more idle capture time.

[src/game/multiplayer/EncounterDirector.ts](src/game/multiplayer/EncounterDirector.ts)
still mixes unlocked enemy tiers largely uniformly. Prefer authored compositions
and threat budgets: blockers plus ranged support, small flanking packs, and
recovery windows after elites. Local obstacle steering is not global pathfinding;
use navigation routes for enemies stranded behind larger buildings.

Measure solo/two/four-player boss time-to-kill and ammo sustainability before
changing health numbers. Define extraction participation and rewards explicitly:
one operator can currently extract the living squad without everyone being present.

### P2: Visual Production And Rendering Cost

The new rigs and telegraphs improve combat readability; the shared city is still
a sparse procedural environment with simple materials. Author a smaller combat
district with recognizable landmarks, intentional cover, lighting contrast, and
less visual competition between environment neon and gameplay warnings.

[src/game/Renderer3D.ts](src/game/Renderer3D.ts) still needs a complete scene-resource
teardown audit, draw-call budgets, and quality presets. Pool/instance repeated
enemy parts and cache bridge adaptations rather than allocating every entity's
presentation object every frame. Capture sustained mobile GPU/frame-time data;
nonblank mobile rendering is not proof of acceptable mobile performance.

The production build emits an approximately 1.53 MB minified shared JS chunk
(413 KB gzip). Split menu/archive/game routes and load Three.js gameplay lazily.
Mobile layout is improved, but multiplayer still has keyboard/mouse controls,
not a complete touch-control interface. Public in-progress rooms still route new
visitors to spectator mode; offer explicit Join/Spectate choices in a later pass.

## Verification

- Full suite: 92 tests across 17 files passed.
- TypeScript: `npm run lint` passed.
- Production: `npm run build` passed, with the bundle-size warning noted above.
- Actual two-browser public-lobby handshake and live WebRTC state delivery passed.
- Injected 100 ms outgoing-input delay plus 100 ms outgoing-state delay: guest
  presentation moved about 21 units within 65 ms while its authoritative position
  was unchanged; sampled settled reconciliation error was zero.
- Connected retry passed: the same guest peer remained connected, simulation
  restarted at tick 0, and transport ordering continued at tick 299.
- Desktop/mobile screenshots and WebGL pixel reads verified nonblank scenes,
  distinct enemy rigs, objective/danger geometry, and responsive HUD placement.
- Visual staging used browser-only fixtures; no debug cheats were added to the app.

Not verified: real WAN/TURN paths, sustained packet-loss soak, four physical
devices, low-end mobile performance, or full human playthrough balance. Foreground
emulation was used for embedded browser tabs so automation did not throttle their
animation loops. Automated latency results are not a real-world ping guarantee.

## Solo Testing

1. Start the app with `npm run dev`.
2. Open Multiplayer and enter a name with at least two characters.
3. Choose Solo test to enter the actual co-op simulation immediately.
4. Alternatively, choose Host public squad and Start match with one player, or
   Host direct match and Start match solo after offer generation.
5. Retry preserves an existing peer session. Both peers must reload after the
   protocol-version change before connecting to this build.