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
| High | Unordered snapshots could rewind state; resetting simulation ticks complicated retry ordering. | Monotonic transport ticks independent of run ticks; reject stale/duplicate state. Protocol is now version 12 after the acknowledged-fire follow-up. |
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

## P1 Networking Follow-up (Implemented)

### Host Timing And Connection Recovery

[src/components/MultiplayerArena.tsx](src/components/MultiplayerArena.tsx) now
drives its 30 Hz fixed simulation from a dedicated worker pulse rather than
`requestAnimationFrame`, with bounded catch-up after timer jitter. Inputs become
neutral after two seconds without a fresh packet, preventing a stalled peer from
continuing to walk or fire.

Still outstanding: snapshot-age/RTT/jitter/queue diagnostics, an explicit
reconnect flow, host migration, and ultimately a dedicated authoritative server.

### Bandwidth And Loss Resilience

[src/game/multiplayer/ManualWebRTCSession.ts](src/game/multiplayer/ManualWebRTCSession.ts)
now builds a separate replaceable state packet for each peer. Combat entities
outside a 2.6 km interest radius are culled, visible gems are capped at 96, and
positions/health/angles are quantized. Squad, run, objective, result, encounter,
and station state remains global.

Still outstanding: field-packed binary encoding, delta snapshots with periodic
full baselines, and event sequences separated from repeated world state.

Trigger pulls now carry monotonic IDs repeated in later input frames and exposed
as host acknowledgements. Local muzzle/audio/recoil presentation occurs on the
trigger gesture and is deduplicated against the authoritative event. The host
fast-forwards accepted projectiles by at most 150 ms of measured input age in
small collision-checked steps. Jump/reload action IDs remain future work.

### Production Signaling Hardening

[server/multiplayerSignaling.ts](server/multiplayerSignaling.ts) now applies
per-address request limits, pending-join and spectator caps, explicit CORS
methods, and ten-minute HMAC TURN REST credentials. The standalone server refuses
an accidental multi-process deployment unless shared-store/sticky-routing support
is explicitly declared.

[src/game/multiplayer/LobbySignaling.ts](src/game/multiplayer/LobbySignaling.ts)
now schedules the next poll only after the current request completes, aborts
active fetches during teardown, checks cancellation after awaited WebRTC work,
and releases failed offer requests so publication can retry. Cancellation of the
initial static lobby-creation request remains a setup-screen concern.

### P2: Objectives And Encounter Design

[src/game/multiplayer/CoopRunDirector.ts](src/game/multiplayer/CoopRunDirector.ts)
still has only two contract kinds in a fixed order. Build objective-specific
encounters: assaults on the uplink, moving elite escorts, multi-site sabotage,
and extraction waves. Avoid simply adding more idle capture time.

[src/game/multiplayer/EncounterDirector.ts](src/game/multiplayer/EncounterDirector.ts)
now uses finite rounds, authored frontline/support/flanking packs, real threat
gates, collision-clear formations, tier introductions, and recovery windows.
Enemies have local stuck detection and temporary detour waypoints. Full global
route navigation remains a later option for more complex authored districts.

Measure solo/two/four-player boss time-to-kill and ammo sustainability before
changing health numbers. Define extraction participation and rewards explicitly:
one operator can currently extract the living squad without everyone being present.

### P2: Visual Production And Rendering Cost

The new rigs and telegraphs improve combat readability; the shared city is still
a sparse procedural environment with simple materials. Author a smaller combat
district with recognizable landmarks, intentional cover, lighting contrast, and
less visual competition between environment neon and gameplay warnings.

[src/game/Renderer3D.ts](src/game/Renderer3D.ts) now reuses horde geometry,
retains only per-rig mutable materials, applies distance detail visibility, and
explicitly disposes instance resources. It still needs whole-scene draw-call
budgets, quality presets, and sustained low-end mobile GPU/frame-time capture;
nonblank mobile rendering is not proof of acceptable mobile performance.

The production build emits an approximately 1.53 MB minified shared JS chunk
(413 KB gzip). Split menu/archive/game routes and load Three.js gameplay lazily.
Mobile layout is improved, but multiplayer still has keyboard/mouse controls,
not a complete touch-control interface. Public in-progress rooms still route new
visitors to spectator mode; offer explicit Join/Spectate choices in a later pass.

## Verification

- Full suite: 116 tests across 20 files passed.
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
