# Friends multiplayer implementation and validation

Implementation and local verification: **7 October 2026**, in the shared working tree based on `c5d92631c909b5251c9ff28a4a474067cd821c12`. This tree also contains substantial concurrent terrain, rendering and railway work. This report describes the Friends networking changes and their evidence; the commit alone does not reproduce this build.

Friends networking is implemented and locally validated. External browser/device/network qualification remains open. This is not a claim of universal 100% network availability.

## Implemented behavior

- **Joining:** Friends uses the controlled same-origin HTTP service by default. Codes resolve to rooms, a running island accepts active players, and reservations/admission support a host plus four simultaneous guests. Pending offers are reserved before asynchronous negotiation; duplicate offers/answers do not create duplicate players. Capacity, mode and session-version failures have explicit outcomes. Survival retains its default broker discovery and raw snapshot path.
- **Admission and identity:** Hello, welcome, credential, roster and start acknowledgements establish admission before gameplay. Each island has a persistent world ID; each guest receives an opaque identity and resume token. Same-name guests have separate packs. Rename/rejoin restores the same identity and pack. A credential cannot claim an active or different guest. Old name-keyed packs migrate once. Crew history is bounded to 127 guest identities plus the host; five players may be connected at once.
- **World synchronization:** Friends adds an ordered reliable `friends-world` data channel. A checksummed, fragmented baseline installs atomically; acknowledged revision patches carry subsequent durable changes. Array patches avoid retransmitting thousands of unchanged terrain records. Transfer retries start after transmission completes, so a slow baseline does not continuously restart. Framing is bounded to 4 MB; bulk delivery shares an aggregate 128,000-byte/s budget and respects channel backpressure. A new world epoch resets prediction, interpolation, the transport tick watermark and incomplete motion frames, and cancels pending edits. A Friends simulation retry advances that epoch so low restarted ticks are accepted.
- **Live movement:** Compact keyframes/deltas carry replaceable motion, separately from terrain, builds, packs, shared stock and progress. Grand Traverse vehicle poses are reconstructed from the shared route and authoritative service distance; attached construction follows current vehicle frames. Save-only duplicate transport data is omitted from motion. The state queue stays bounded to 64 KB.
- **Reliable edits:** A bounded outbox retries the same request ID and world epoch. The host replays a cached result rather than applying the operation twice, and replies to the requesting guest. Request IDs stay monotonic across reloads and clock rollback. An operation unresolved after 30 seconds blocks further edits/spending and shows a rejoin action. Results and outbox queues have explicit bounds.
- **Recovery:** Friends has bounded negotiation/disconnect deadlines and state-age detection. Guests stop controls while authoritative state is stale. Host departure leaves a terminal rejoin message instead of silently returning to “connected.” Disconnection releases pilot, rope and seat ownership. Ordinary late admission and guest recovery do not reset occupied aircraft.
- **Saving and imports:** Host startup recovers intact IndexedDB data before creating the simulation. Current/previous mirrors and IndexedDB saves operate independently; one failed medium does not suppress the other. Continuous play gets a checkpoint at least every five seconds, with an exit/page-hide flush. Imports validate and back up the world, advance the epoch and preserve crew resume credentials. Restoring another island ends existing guest connections so they can join its identity namespace consistently.
- **Compatibility:** Shared multiplayer protocol remains **45**. Friends uses an additional session schema **1** and rejects old/mixed-mode manual signals before allocating a peer. The Friends fourth channel, durable decoder, motion compaction and relay-only option are explicitly gated by Friends mode. Survival keeps its existing three data channels and raw state frames.

## Automated and browser evidence

The final full suite passed: **861 tests / 138 files**. Earlier full-suite run: **850 tests / 136 files passed**. Intermediate runs during concurrent file edits detected outdated tunnel imports, a train fixture crossing the new protected tunnel cover, and tests loaded against an earlier train constructor. The current targeted regressions were rerun, rather than accepting the stale failures or removing their assertions. The player railway fixture now uses a clear corridor; gameplay collision rules were preserved.

| Check | Result / scope |
| --- | --- |
| Final full suite | **861 tests / 138 files passed**. |
| TypeScript: `npm run lint` | Passed after fixing a private-field access in the separate railway development review. |
| Production: `npm run build` | Passed; Vite retains its existing large-chunk warning. |
| Real WebRTC integration | **23 checks passed**, host plus four independent browser contexts; zero browser runtime exceptions. |
| Actual React menu/arena | **6 checks passed**, host and guest; zero browser runtime exceptions. |

The integration runs real HTTP signaling, ICE negotiation, RTC data channels, host simulation, command handling, world replication and browser storage. It verifies:

1. Four simultaneous playable late joins, distinct identities and authoritative guest movement.
2. A lost plant result retries without planting twice or spending another sapling.
3. Host permissions deny an unauthorized build; re-enabled access allows a build whose lost acknowledgement retries without duplicating the piece.
4. Another guest paints the shared build, a guest creates a workshop, and all four guests converge on both pieces.
5. Crafting with a lost result spends two timber exactly once and produces four planks; deposit/withdraw conserves materials across guest packs and shared stock.
6. All guests converge on **6,000 terrain edits** after one dropped bulk fragment, every fourth motion message dropped, and 100 ms added motion delay.
7. Rejoining with a changed display name preserves the original identity and the entire spent/deposited pack.
8. Browser mirror and IndexedDB saves both succeed; corrupting both mirrors recovers IndexedDB; injected localStorage quota failure still saves IndexedDB.
9. A **60-second five-player populated-world soak** continues under motion faults, with advancing ticks, five players and no runtime exceptions.
10. Closing the host tears down the guest peer.
11. A separate real Survival WebRTC session receives its original raw snapshots, contains two active players and moves the guest's authoritative player through real input.

The React test exercises the actual Friends menu, invitation, accepted roster, setup-to-arena handoff, visible field-pack dialog, and terminal rejoin button after closing the host. Its headless software-GPU run aborts the **menu backdrop** module to reduce background rendering load; the actual arena/renderer and UI remain loaded. This test does not qualify menu scenery performance.

Environment: macOS arm64, headless **Chromium 151.0.7922.34**, independent browser contexts on one computer, local Vite/HTTP service on port 3001. ICE stats record a nominated **host-to-host** candidate pair; STUN candidates were also gathered. This was a direct local connection, not a TURN relay or separate home networks.

Faults are injected at application receive/result delivery, after WebRTC transport. They establish retry and convergence behavior, not measured WAN packet loss or a 100 ms RTT profile. The fixture positions players on a prepared flat region and populates terrain deterministically; guests perform the tested gameplay commands through real channels.

In the recorded 60-second soak, one guest received **1,971,187 bytes of motion state**, approximately **263 kbit/s**. Its unchanged bulk-world channel received **zero additional bytes** during the soak. These are application data-channel counters from a 20 Hz development harness, not aggregate host uplink or production WAN measurements. Multiplying one guest by four would be an estimate; the plan's 1 Mbit/s aggregate target remains a qualification target.

Unit coverage additionally exercises identity collisions and invalid resume tokens, backup identity restoration, replay/outbox deadlines, clock rollback, secure random-ID generation when HTTP LAN origins lack `crypto.randomUUID`, aircraft continuity and ownership release, malformed/corrupted/oversized transfers, bounded patches, a new epoch, and four concurrent 650 KB baselines taking longer than the acknowledgement retry interval. Existing simulation tests cover terrain, trains, aircraft, hauling and Survival directors. Server tests exercise four-slot reservation, code collision, room authorization, shared-IP poll budgets and expiring TURN credential generation without exposing the shared secret.

## Reproduce and inspect

Run the server in one terminal and checks in another:

```sh
npm run dev -- --port=3001
npm test -- --maxWorkers=1 --testTimeout=120000
npm run lint
npm run build
FRIENDS_TEST_ORIGIN=http://localhost:3001 node tools/test-friends-multiplayer.mjs
FRIENDS_TEST_ORIGIN=http://localhost:3001 node tools/test-friends-menu.mjs
```

The runners load an installed `playwright` module, or the bundled Codex runtime. Other environments can provide `PLAYWRIGHT_MODULE` with the module path and install the matching Chromium binary. `FRIENDS_SOAK_MS` changes the integration soak duration. The temporary no-watch Vite config used during this session is removed; it was needed because unrelated changes were repeatedly restarting the shared development server.

- [Real-channel integration results and ICE/data counters](../artifacts/friends-multiplayer/integration.json)
- [Actual React flow and visibility results](../artifacts/friends-multiplayer/menu.json)
- [Visible guest field pack](../artifacts/friends-multiplayer/guest-field-pack.png)
- [Final unit-test log](../artifacts/friends-multiplayer/tests.log)
- [TypeScript log](../artifacts/friends-multiplayer/lint.log)
- [Production-build log](../artifacts/friends-multiplayer/build.log)

## Remaining release qualification

The code implementation is complete within the browser-hosted architecture. These evidence gates remain open:

- Separate physical Windows/macOS devices, Chrome/Edge/Firefox and Safari if supported.
- Separate home networks, hotspot/restrictive NAT, forced TURN/UDP and TURN/TCP/TLS routes with the deployed service. TURN credential generation is tested; no configured real relay was available here.
- Production HTTPS same-origin and separately hosted signaling, CORS/proxy configuration, signaling outages, server restart/expiry and host laptop sleep.
- Maximum combined save limits, actively mining/flying/hauling during large joins, measured command latency and host CPU/uplink budgets.
- The plan's **three 60-minute five-player mixed-gameplay soaks**, visual passenger/deck comparisons, and memory/queue trends. The recorded 60-second automated soak is a smoke test.

Hosts remain authoritative and must keep their browser running. Rooms use a single-process, in-memory signaling store; guests rejoin a reopened host rather than migrating authority to another player. Browser storage and exported backups remain the persistence model. Deployments that provide only static files need the HTTP signaling service configured separately. These are existing architectural boundaries, not claims resolved by a local browser test.
