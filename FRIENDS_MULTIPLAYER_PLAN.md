# Friends multiplayer completion plan

Planning audit: **7 October 2026**. Implementation status: **implemented and locally validated; external release qualification remains open**.

The implementation now covers controlled Friends signaling and admission, playable late joins, a paced durable-world channel, compact motion, result replay and bounded retries, persistent crew identities, independent browser save paths, explicit reconnect outcomes and vehicle ownership cleanup. Survival retains its original default transport and shared protocol 45. See [docs/friends-multiplayer-validation.md](docs/friends-multiplayer-validation.md) for reproducible checks, browser artifacts and the precise qualification limits. Findings, baseline measurements and effort estimates below describe the original audit; they are not a list of still-unimplemented defects. The definition-of-done checklist remains a full release gate, including physical networks and long soaks.

Inspected local HEAD: `c5d92631c909b5251c9ff28a4a474067cd821c12`. A read-only `git ls-remote --symref origin HEAD` confirmed that remote `main` points at the same commit. This audit includes the substantial uncommitted and untracked Friends work present on that date; the commit alone does not reproduce the audited state. Preserve that work throughout implementation.

This is the current entry point for completing and validating Friends networking. [MULTIPLAYER_AUDIT.md](MULTIPLAYER_AUDIT.md) contains earlier Survival findings and historical browser results. [FRIENDS_FRONTIER_IMPLEMENTATION.md](FRIENDS_FRONTIER_IMPLEMENTATION.md) contains gameplay implementation history, including older protocol and validation claims. Neither establishes that the current Friends build works across physical devices.

## 1. Outcome and scope

A host can open a Friends island, share its code or link, and have up to four friends join before or during play. Everyone can move, explore, mine, build, use shared storage, ride trains, fly together, haul the salvage core, open treasure and see the same authoritative world. Leaving, reconnecting, restarting and loading a save produce explicit, consistent outcomes.

Retain the existing browser-hosted, host-authoritative WebRTC architecture. Retain one-to-five-player capacity, current playtest construction rules, physical cargo, player railway and Grand Traverse. Preserve Survival behavior through regression checks.

The completion claim will be: **all required scenarios passed on the declared browser/device/network matrix, with no unresolved critical or major defects**. No test plan can establish universal 100% availability on every network or guarantee that a sleeping host computer runs a simulation. Turn the user's “100%” requirement into a strict release gate, with results recorded rather than inferred from compilation.

Initial support target: current stable desktop Chrome, Edge and Firefox, plus desktop Safari if it passes the same matrix. Test keyboard/mouse on Windows and macOS. Record actual browser versions and devices when testing. Mobile gameplay support requires its own complete controls/performance checks; do not infer it from responsive menus.

Recommended session rules for this milestone:

- Friends **Join** always requests an active player slot, including after the host starts. Spectating is an explicit separate choice, if offered.
- Existing guest-editing behavior is preserved until its default is reconciled with the UI/docs. Hosts can change access; denial must explain what is blocked. Do not silently alter saved permissions.
- Guest disconnection preserves their pack and relinquishes pilot/rope/seat ownership. Rejoining restores identity and inventory, then spawns at a safe arrival point. Position restoration is unnecessary for this milestone.
- A late join or guest respawn does not relocate occupied vehicles. Aircraft reset belongs to a new session, world restoration/import, or an explicit recovery action.
- Host departure ends the live session with a clear message and saves the world locally. Guests can return when that host opens it again.
- Automatic host migration, account systems, cloud saves, offline visits and dedicated simulation servers are separate projects. No new terrain, art, economy or transport feature is needed here.

These rules were adopted for implementation. Their validation scope is recorded in the current report; physical-device qualification is still required.

## 2. Verified baseline

Checks run during this planning audit, before gameplay changes:

| Check | Observed result | Meaning |
| --- | --- | --- |
| `npm run lint` | Passed | Current TypeScript compiles. |
| `npm run build` | Passed | Production assets build. Main JS is about 2.81 MB / 808 KB gzip; Vite reports a large-chunk warning. |
| `npm test -- --maxWorkers=2 --testTimeout=30000` | **818 passed, 5 failed; 128 test files passed, 2 failed** | Current baseline is not green. Total: 823 tests / 130 files. |
| Payload probe using `FriendsSimulation.createSnapshot()` and actual packet encoder | Populated fixture: **342,718 bytes / 29 packets**; with 7,280 migration grades: **473,757 bytes / 40 packets** | Both fit the 512,000-byte ceiling, but sending them repeatedly is expensive. These are synthetic payload measurements, not WAN performance results. |
| Real browser/device multiplayer | Not run during this planning audit | Handshake, playable late join, TURN, convergence and reconnect remain unverified on the current build. |

Four failures are in [FriendsTerrainRepair.test.ts](src/game/multiplayer/FriendsTerrainRepair.test.ts): excavation, supporting builds and earthwork expectations conflict with the newer protected spawn platform. Determine intended protection from current platform tests and gameplay before updating fixtures; do not remove assertions just to pass. One failure in [FriendsScenicTrainVisuals.test.ts](src/game/rendering/FriendsScenicTrainVisuals.test.ts) detects competing exposed parallel faces on the train. Fix or explain the actual geometry defect separately from networking.

The payload probe used 6,000 terrain edits, 12,000 harvested records and 1,024 block pieces. The second fixture added the migration grades used by the existing saturated-snapshot test. At ten snapshots per second the smaller raw payload alone costs about **3.43 MB/s per guest**, or **13.71 MB/s / 110 Mbit/s for four guests**, before transport overhead. This arithmetic illustrates a risk; it is not measured live throughput. The saturated test currently exercises key compaction, whereas gameplay currently transmits raw snapshots.

## 3. Findings that determine the work

Priorities: **P0** prevents ordinary joining/play or risks lost/duplicated state; **P1** materially affects reliability or completion; **P2** improves diagnostics or polish. Findings below are source observations unless explicitly marked as measured or requiring reproduction.

| ID | Priority | Evidence and implication | Required resolution |
| --- | --- | --- | --- |
| F1 | P0 | [ManualMultiplayerSetup.tsx](src/components/ManualMultiplayerSetup.tsx), `joinSquad`: `spectatingRef.current = room.state === 'in_game'`. A discovered running Friends room routes Join to spectator even with free player slots. The arena already has an active `ready`/`addPlayer` path. | Make Friends late join playable and spectating explicit. Test known room, raw code and invite link so discovery timing cannot change the role. |
| F2 | P0 | [LobbySignaling.ts](src/game/multiplayer/LobbySignaling.ts), `hasHttpSignalingFallback`/`fetchIceServers`: HTTP and TURN are only attempted when `VITE_MULTIPLAYER_SIGNALING_URL` is nonempty. [README.md](README.md) and [.env.example](.env.example) describe leaving it unset for same-origin hosting. | Resolve signaling configuration explicitly; fetch same-origin ICE configuration when the bundled server is used. A failed configured relay endpoint must not silently look fully operational. |
| F3 | P0 | [LobbySignaling.ts](src/game/multiplayer/LobbySignaling.ts), `HostedLobby.start`: broker offer deduplication caches only after awaiting `createOffer`. [UnifiedSignaling.ts](src/game/multiplayer/UnifiedSignaling.ts) retries joins every 1.2 seconds; ICE gathering can take 7 seconds. Broker and HTTP also use different request IDs. | Reserve one logical join immediately with a shared in-flight promise and bounded lifetime. Cancel losing fallback reservations and failed peers. Reproduce simultaneous retries and broker/HTTP races. |
| F4 | P0 | [MultiplayerArena.tsx](src/components/MultiplayerArena.tsx) sends `createInterestSnapshot` directly and parses raw snapshots. [snapshotReplication.ts](src/game/multiplayer/snapshotReplication.ts) utilities are not wired into that active path. Friends terrain/builds remain global in [snapshotInterest.ts](src/game/multiplayer/snapshotInterest.ts). | Connect versioned full/delta replication and separate paced world synchronization from fast motion. Test actual arena-to-transport integration, not only isolated utilities. |
| F5 | P0 | [ManualMultiplayerSetup.tsx](src/components/ManualMultiplayerSetup.tsx) stops its connection deadline when `ready` is sent. `sendEvent` only reports channel enqueue, not host acceptance. Start events have no acknowledgement or retry. | Add admission/start acknowledgement and a deadline until the guest has a valid world baseline. Host-start versus guest-ready races must converge. |
| F6 | P1 | [ManualWebRTCSession.ts](src/game/multiplayer/ManualWebRTCSession.ts) grants 12 seconds for disconnected peers, but reports a transient interruption via `onError`. Arena's `onError` marks guests disconnected immediately. Arena's peer-change handler does not classify an empty peer list as terminal. | Distinguish recoverable status from fatal errors; detect missing authority, closed channels and stale snapshots. Recover using explicit renegotiation/resume rather than a reassuring message alone. |
| F7 | P1 | [FriendsFrontier.ts](src/game/multiplayer/FriendsFrontier.ts), `packKey`, persists inventory by lowercased display name. Two people using the same name share a pack; name changes select another pack. | Give friends stable opaque identities/resume tokens, migrate legacy packs without duplicating them, and reject or disambiguate collisions until migration is complete. |
| F8 | P1 | [ManualWebRTCSession.ts](src/game/multiplayer/ManualWebRTCSession.ts), `send`: a congested reliable channel returns false with no app retry queue. Friends UI request paths largely do not act on this result. Simulation deduplicates request numbers but does not replay the original success result. | Track bounded pending commands and acknowledgements; retry the same operation ID; return the cached result without repeating its mutation. |
| F9 | P1 | [CoopSimulation.ts](src/game/multiplayer/CoopSimulation.ts), `addPlayer`, resets the aircraft and carries existing crew back. This is also covered as current behavior in rail tests/docs. | Deliberately change the rule for late join: preserve active vehicle/crew poses. Keep new-session/world-load recovery behavior and update the affected tests/docs together. |
| F10 | P1 | [FriendsWorldStorage.ts](src/game/multiplayer/FriendsWorldStorage.ts) writes IndexedDB backups but boot reads only current/previous localStorage. A localStorage write failure prevents the IndexedDB task. Arena saves through a resettable 300 ms debounce. Continuous changes can postpone it. | Load/recover from the durable backup, make each storage destination's failure explicit, and impose a maximum interval between saves. Verify continuous travel and crash/reload behavior. |
| F11 | P1 | [server/multiplayerSignaling.ts](server/multiplayerSignaling.ts) allows 180 requests/minute/IP; host join polling is every 600 ms and menu discovery every 2.5 seconds. Multiple friends behind one NAT can exceed that budget. No HTTP fetch deadline exists. | Budget normal five-player polling, use bounded fetches/backoff and distinguish rate limits from gameplay failure. Test shared-IP/proxy deployment. |
| F12 | P1 | `HostedLobby.create` swallows backend errors including code collision. MQTT discovery deduplicates by host name as well as room code. Public MQTT signaling is unauthenticated, and broker failover does not guarantee two clients choose the same broker. | Make the controlled lobby service canonical for supported production deployment; retain broker compatibility only with explicit status and tests. Preserve distinct same-name hosts and surface code collisions. |
| F13 | P1 | [snapshotTransport.ts](src/game/multiplayer/snapshotTransport.ts) expires incomplete snapshots after 1 second and retains only 3 assemblies. Large baselines on a slow link can be evicted by newer frames. Payloads over 512,000 bytes return no packets silently. | Give bulk synchronization its own paced, resumable transfer, progress and limits. Oversize/timeout failures must be visible. Validate slow-link delivery and full supported save limits. |
| F14 | P2 | README says protocol 44; current [protocol.ts](src/game/multiplayer/protocol.ts) is **45**. README says public guests start editing disabled, while `FriendsBuilding` defaults to enabled. Some UI build material lookups use player ID while packs use `packKey`; free-build testing masks that mismatch. | Correct protocol guidance, reconcile permission expectations, and exercise both testing and resource-funded rules. Treat earlier test counts and networking claims as historical. |

## 4. Implementation sequence and acceptance gates

Use small reviewable changes. Do not rewrite the 4,000-line arena wholesale. Extract session admission, command tracking and world synchronization where they need independently testable lifecycles. Keep presentation and authoritative state separate. All tickets below remain open.

### M0 — Reproducible baseline and harness

**FMP-00 — Establish current behavior.** Resolve the five baseline failures through intended behavior and real geometry checks. Capture current protocol/save limits and read-only copies of representative legacy saves. Add an automated browser harness with separate host/guest browser contexts, the real app and a local signaling service. Use a locally controlled signaling path so tests do not depend on public brokers. Any test hooks belong only to test/dev builds and must not expose production cheats or overwrite the user's world.

Add scenario recording for join ID, player ID, role, channel state, transport tick, baseline revision, pending operations, save result and selected ICE route. Use sanitized summaries, not SDP, tokens, secrets or raw inventories in logs. Record a comparison of the host's authoritative state with the guest's reconstructed state after settling; compare relevant revisions/entities rather than camera interpolation.

**Gate:** green unit baseline; repeatable two-context Friends host/join/move/leave; failures report enough state to diagnose them. A browser harness is still required even if every existing simulation test passes.

### M1 — Reliable room admission and actual late join

**FMP-01 — One explicit signaling policy.** Prefer same-origin controlled HTTP service for bundled deployments, or configured HTTPS origin for separate hosting. Static-only deployments must explicitly select/configure a supported service; preserve optional broker operation as a declared compatibility mode. Do not race duplicate uncorrelated joins by default. Resolve invite codes to canonical room IDs independently of discovery. Add bounded request deadlines, cancellation, retry/backoff and typed errors for full/offline/version mismatch/service unavailable/code collision.

Fetch host and guest ICE configuration before negotiation. Verify that TURN is present when configured. Avoid finishing candidate gathering just because a STUN candidate appeared if required relay candidates are still pending; use complete gathering or trickle ICE with an explicit deadline. Add relay-only diagnostics for validation. Production connection setup must have an operable TURN route over the transports required by the supported network matrix.

Remove same-name lobby deduplication. Validate protocol/mode metadata, capacity and request ownership at admission. Separate per-client polling limits from aggregate abuse limits so five legitimate players behind one IP can connect. The current server is an in-memory single-process store; setting `MULTIPLAYER_SHARED_ROOM_STORE=true` does not itself implement shared storage. Keep one process for this milestone and document restart behavior.

**FMP-02 — Transactional join lifecycle.** Use one logical admission ID across retries. Store an in-flight promise before awaiting offer generation; bind offer/answer to that admission. Reserve a slot until admission completes, cancels or expires. Track the exact peer to close on failure. Bound all pending maps and clean them after timeout/cancellation/leave. Record answer completion only after `acceptAnswer` succeeds. Never confuse “SDP answer published” with “data channels ready.”

**FMP-03 — Playable late join and startup acknowledgement.** Make Friends Join an active-player request regardless of `waiting`/`in_game`. Enforce five total players, including in-flight admissions; reject a sixth with an explicit result. Do not let spectator connections silently consume all gameplay slots. Either implement a separate bounded spectator allowance or hide the option in Friends for this milestone.

Model the lifecycle as `discovering → negotiating → channels ready → admitted → syncing world → playing`; failures end in a retryable or terminal state. Use targeted admission/start messages and acknowledgements. A repeated ready/start replays the authoritative answer. Keep a deadline until admission and first baseline complete. When the host starts during negotiation, gameplay must consume the pending ready message or accept its retry. On setup-to-arena handoff, buffer relevant messages until handlers are attached.

**Gate:** 20 consecutive host/join/start cycles succeed; four simultaneous guests create exactly four guest peers and four roster entries; retries/cancel leave no reservations; known-room/code/link late joins all enter as players; a full room rejects cleanly; Survival retains its intended spectator policy.

### M2 — World synchronization and authoritative actions

**FMP-04 — Use and verify replication in the live path.** Connect the host replicator/key compactor and guest decoder to actual arena transport. Reset per-peer baselines on a new admission, world replacement or protocol/session epoch change. Keep transport ordering monotonic across simulation restarts. Do not advance baseline state merely because a frame was prepared: acknowledge baseline delivery or make dropped/unsent baseline recovery explicit. Test both transport and assembler watermarks when a delta arrives before its base.

Start by measuring the existing delta path on populated Friends snapshots; this is the smallest useful improvement. To meet slow-link/large-save gates, transfer static/durable world data separately from fast players, vehicles, ropes and cargo poses:

1. Send world identity, terrain generation, protocol/session epoch and baseline revision.
2. Transfer a frozen, validated baseline in bounded chunks with acknowledgements, progress, checksums and a retry/resume policy. Respect negotiated message-size limits.
3. Journal mutations newer than that baseline while it is transferring; apply them in revision order after installation. If a bounded journal overflows, explicitly restart synchronization from a newer baseline.
4. Maintain fast motion snapshots separately, preventing bulk data from starving inputs or authoritative command results.
5. Send durable terrain/build/tree/storage deltas on change. Begin with global durable deltas; add regional subscriptions only if profiling requires them. Region-entry collision data must arrive before unrestricted movement there.

A guest must not run collision/prediction against a half-installed world. Make world installation atomic and refresh terrain meshes, physics/prediction caches, railway graph, treasury and permissions from the same revision. Preserve safety during remote chunk streaming and high-speed flight.

**FMP-05 — Reliable commands with observable outcomes.** Validate full request schemas at the host boundary. Derive actor identity from the admitted peer. Use operation IDs scoped to world/session identity, not just counters reset by component mounting. Track queued/sent/accepted/rejected/expired UI states. Keep a bounded outbox and result cache; retransmitting a command replays its result and cannot spend, refund, award or move materials twice. Retry timeouts do not prove that the host rejected an operation: resolve its status or resynchronize before offering a fresh destructive operation.

Return results to the requesting peer. Publish world mutations separately for everyone. Reconcile permissions immediately on revocation. Include undo/redo, place/move/paint/remove, mine/fill, planting, crafting, storage/cargo transfers, train assembly/removal/hold/depart, treasure and hauling delivery. Preserve existing revision checks and authoritative tool cooldown/reach validation. Correct the player-ID versus pack-key lookups before testing resource-funded building.

**Gate:** two guests race for one voxel/tree/chest and receive exactly one shared mutation/reward; duplicate command with a lost reply returns the original result; conflicting build revisions reject visibly; host/guest durable state converges; joining during continuous edits neither misses nor duplicates edits; populated and maximum supported saves sync over the constrained-link profile without dropping motion or hanging silently.

### M3 — Session recovery, identities and persistence

**FMP-06 — Recovery and teardown.** Distinguish transient ICE/channel errors from terminal loss. Detect stale authoritative state even when the peer connection says connected. Freeze world-changing inputs while resynchronizing; cap visual prediction so a frozen world does not look live. On host removal, classify the empty peer list correctly. Clear all timers, subscriptions, assemblers, admissions and command queues when leaving or switching modes.

Attempt bounded ICE restart/renegotiation through the existing lobby when appropriate. If that fails, allow explicit rejoin with a resume token. Validate the token at the host and allow only one active peer for the identity. Replace its old mapping atomically. Release pilot, rope and seat ownership promptly and preserve shared cargo. Existing stale-input timeout is 2 seconds; verify its movement/flight/tether behavior, then tune only if tests and play show that it is unsafe. Host sleep/resume must display interruption and require coherent resync; a browser worker does not guarantee execution during OS sleep.

**FMP-07 — Stable friends and durable saving.** Introduce a world ID and host-issued opaque crew identity/resume token, stored on the guest and validated by the host. Avoid an account system. Migrate name-keyed legacy packs once, with an explicit rule for ambiguous names. Until migration is complete, reject duplicate normalized names. A name change must not grant another starter pack; expired/replayed tokens must not claim another friend's inventory.

Keep save schema changes versioned and preserve current/previous backups. Read IndexedDB recovery before admitting gameplay if synchronous storage has no intact save; prevent default-world boot from overwriting the backup. Handle localStorage and IndexedDB failures independently and report degraded durability. Replace an indefinitely resetting debounce with dirty revisions plus a maximum save interval (initial target: 5 seconds), and flush on supported exit/pagehide. A full save is one consistent revision, including depleted resources and awarded materials. Browser crash recovery is only promised to the last successful checkpoint, not every unsaved action.

Validate import completely before swapping authority, save a recoverable pre-import backup, then invalidate all replication/prediction caches and resync guests under a new world epoch. Distinguish persisted material cargo from the physical salvage core, whose current rule resets at a new session; do not accidentally change it into persistent delivered cargo.

**Gate:** guest leaves/rejoins with one inventory and one roster entry; same-name friends cannot share/duplicate packs; pilot/rope disconnect releases ownership; host close/reopen retains terrain/builds/stock/treasure/rail state under existing rules; corrupt mirror recovers backup; storage quota/error is visible; continuous train travel cannot starve save checkpoints; imported worlds converge for connected guests.

### M4 — Transport gameplay and production qualification

**FMP-08 — Preserve shared vehicle motion.** Remove aircraft reset from ordinary late admission and guest recovery. Keep reset in new-session/import recovery paths. Update existing tests that assert reset on join; this is an intentional gameplay correction. Keep player pose, deck-relative offsets, inclined train pose, seats, rope bends and secured cargo on the existing shared presentation timeline.

Validate host and guest as pilot, free-standing passenger and jumper. Test handing off pilot controls, corners, grades, station stops, gangways, roof collisions, high-altitude exit and stale inputs. Two guests pulling the core must see the same rope attachment, reeling, bracing, collisions, deck securing and delivery outcome. Join during flight, a train turn and active hauling; existing crew must stay where they are. Test fast travel into terrain regions containing remote edits.

**FMP-09 — Deployed validation and release report.** Serve the production build with the actual HTTPS signaling and TURN configuration. Verify CORS/reverse proxy routing, cache/version behavior, server restart and room expiry. Ensure separate-origin builds work as well as same-origin hosting. Force relay selection and record the candidate-pair type from WebRTC stats. Validate supported browsers on separate physical machines and networks. MQTT-only behavior, if retained as supported, requires separate broker-outage/failover tests; it cannot inherit the controlled-service results.

Update README, env examples and Friends multiplayer instructions to the final implementation and protocol. Keep TURN secrets server-side. Add a small operational runbook: build/start, lobby readiness, relay readiness, room expiry, expected host-offline behavior, backup recovery and how to collect sanitized diagnostics. Publish measured results and unresolved limits, not a blanket reliability statement.

**Gate:** every required row of the matrix below passes, no P0/P1 remains, and the final full suite/typecheck/build are green. Record actual physical-device/TURN evidence before declaring Friends multiplayer complete.

## 5. End-to-end validation matrix

Every gameplay scenario must include a real guest exercising its controls. A solo host with manually inserted players is useful unit coverage but does not satisfy this matrix.

| Area | Required scenarios | Pass criteria |
| --- | --- | --- |
| Entry | Fresh/saved host; invite URL; pasted code; discovered room; lowercased code; wrong mode/version; offline/full room | Correct role/world; readable failure; no indefinite spinner; cancellation frees capacity. |
| Timing | Join before start; host starts mid-join; four guests simultaneously; join after start; repeated ready/answer/start | One peer/player per admission; all accepted players reach gameplay. |
| Permissions | New-world default; restored default; host grants/revokes during play; denied build/dig/craft/rail actions | HUD and host policy agree; no unauthorized world mutation; allowed exploration/hauling still works. |
| Shared edits | Different regions; same/chunk-border voxel; same tree; earthwork under players; plant tree; overlapping build; move/paint/undo/redo after friend's edit | Collision/rendering converge; resource conservation; revision conflict protects newer edits. |
| Packs/economy | Two same-name users; rename/rejoin; deposit/withdraw; craft; load/unload; concurrent transfers; duplicate/late results | Separate identities; no lost/duplicated inventory; pending actions resolve exactly once. |
| Treasure/projects | Open same chest concurrently; collect survey caches; deliver contract; complete build milestone | Shared progress/reward applies once and survives restart. |
| Vehicles | Guest pilot/host passenger, reversed roles, two guests; landing, jumping, turning, slopes, seating/gangways, train edits | No deck sliding/falls/teleports caused by networking; boarding/ownership remains authoritative. |
| Hauling | Two ropes; reel/brace/feed/release; secure to train/aircraft; turn/lift; disconnect tethered guest; deliver | Cargo/ropes agree; ownership clears; one shared delivery result; no core reset on late join. |
| Late world sync | Fresh world; populated save; maximum supported limits; join during mining/building/flight/hauling | Complete baseline plus edits; finite progress; guest sees authoritative collision; existing crew unchanged. |
| Faults | Delay/loss/reordering; full buffers; signaling outage; brief ICE interruption; terminal host loss; laptop sleep; guest reload; server restart | Recovery or explicit terminal outcome; no ghost peer/pilot; safe resync; no duplication. |
| Persistence | Five-player continuous play; host exit/reopen; legacy migration; corrupt current save; mirror quota; IndexedDB failure; world import | Last successful checkpoint recovers; failures visible; backups survive; all guests resync after import. |
| Browser/network | Chrome/Edge/Firefox; Safari if supported; LAN; two separate home networks; hotspot; forced TURN/UDP and TURN/TCP/TLS as supported | Actual route recorded; usable session; no reliance on public STUN alone. |
| Regression | Survival public/direct/solo flows; retry; owner controls; normal combat; renderer cleanup | Existing Survival semantics and lifecycle remain intact. |

Use automated fault injection for packet/command loss, duplicate/reordered delivery and backpressure. Browser HTTP throttling alone does not establish WebRTC impairment; use transport fault injection or OS/network shaping and record which one. Test peer negotiation with actual WebRTC separately from mocked channels.

Initial qualification profiles and budgets (targets to validate, not current measurements):

- **Normal WAN:** 100 ms RTT, 20 ms jitter, 1% packet loss, at least 5 Mbit/s host uplink. After channels are ready, a normal world is playable within 15 seconds; normal discrete commands settle within 1 second at the 95th percentile.
- **Constrained WAN:** 200 ms RTT, 50 ms jitter, 3% loss, 1 Mbit/s host uplink. A single large-world join may take up to 60 seconds with accurate progress; it must not starve existing players. Queue growth stays bounded and state recovers after impairment ends. Profile five simultaneous players separately; do not promise five simultaneous large transfers within 60 seconds on this link.
- **Interruption:** five seconds of network loss recovers or prompts a resumable rejoin; a longer terminal failure yields a clear outcome within the configured bounded grace/deadline. No stale movement, aircraft thrust or tether continues beyond the tested authority timeout.
- **Host simulation:** current 20 Hz / 50 ms steps remain intact. Target p95 authoritative simulation plus snapshot work below 25 ms on the named reference host, with no sustained backlog. Capture render CPU/GPU separately.
- **Bandwidth:** target at most 1 Mbit/s total host gameplay uplink for four guests at rest in a populated world, excluding bounded join transfer; measure active editing/vehicle loads separately. No unchanged full-world data at movement cadence. Revisit the target with measured payloads before declaring the hardware/network envelope.
- **Presentation:** compare durable state exactly after settling; compare motion with explicit quantization/timeline tolerances. Target no persistent position error over one 32-unit voxel on foot and no visible relative passenger/deck drift. Evaluate host/guest video plus timeline metrics, not a single frame.
- **Soak:** three independent 60-minute five-player sessions with split exploration, mining/building and transport/hauling; at least one includes late joins and disconnect/rejoin. Zero unresolved hangs, lost/duplicated durable state or leaked roster slots. Record memory/queue trends, error counts, snapshot age, correction distances and save checkpoints.

The exact performance envelope must be set using actual devices. Passing these bounded profiles is evidence for those profiles only.

## 6. Work size and dependencies

This is a completion/hardening effort, not a new multiplayer engine. The first visible fixes are small; synchronized late joining, reliable actions and recovery account for most of the work. Planning ranges below are rough engineering effort for one developer, excluding time waiting for physical-device/network access or deployment configuration. Re-estimate after M0/M1.

| Milestone | Rough effort | Depends on |
| --- | --- | --- |
| M0 baseline/harness | 0.5–1.5 days | Current working tree captured; local service available. |
| M1 signaling/admission | 1–2 days | M0; real service/relay configuration for WAN proof. |
| M2 replication/actions | 2–4 days | M1; measured large-save fixtures and acknowledgement design. |
| M3 recovery/identity/saves | 1.5–3 days | M1/M2; versioned save migration. |
| M4 vehicles/qualification | 1–2 days plus soak | M2/M3; reference devices and two network paths. |

Total preliminary range: **6–12.5 engineering days**, with uncertainty concentrated in world transfer, legacy identity migration and real-network recovery. This is not a delivery promise. If the first integration proves existing utilities satisfy a gate, reuse them and reduce effort; do not skip the gate to make the estimate smaller.

Practical implementation order: **FMP-00 → FMP-01/02/03 → FMP-04/05 → FMP-06/07 → FMP-08/09**. Work may be grouped where dependencies allow; no delegation is required. First implementation slice: a playable late join through controlled same-origin signaling, with retry deduplication, a startup acknowledgement and a two-browser regression. Next slice: live replication and paced baseline transfer before broadening device testing.

## 7. Definition of done and evidence record

- [x] Baseline failures resolved through intended behavior; final full suite, TypeScript and production build pass.
- [ ] Existing user work and legacy worlds preserved; save migration/recovery verified.
- [ ] Host plus four guests can join before/after start and simultaneously; full/offline/wrong-mode/version/cancel cases resolve cleanly.
- [ ] Movement, terrain, inventory, construction, permissions, treasure, trains, aircraft and hauling converge through real guest input.
- [ ] Full supported saves catch up during active play; bulk sync cannot monopolize movement or silently exceed limits.
- [ ] Reliable command retry/acknowledgement proves no duplicate reward, cost, refund or transfer.
- [ ] Disconnect/rejoin restores identity/inventory, releases transient ownership and never leaves ghost players.
- [ ] Host exit/restart and corrupt/quota/storage failures produce tested outcomes and preserve backups.
- [ ] Same-origin and supported separate-origin production configurations verified; real relay-only sessions recorded.
- [ ] Declared physical browser/device/network matrix and soak pass with no unresolved P0/P1.
- [x] Current protocol, permission rules, deployment steps and known limits documented.

Each completed ticket records: implementation commit/diff, test/scenario names, save fixture, browser/device versions, network profile and actual ICE route, observed timings/bandwidth, and any remaining defect. Keep a final `docs/friends-multiplayer-validation.md` report when implementation testing happens. Do not mark this plan complete based solely on unit tests or a successful build.
