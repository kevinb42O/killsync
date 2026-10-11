# Dungeon safety and multiplayer audit

Date: 2026-10-11. Scope: the implemented Lantern Descent, its shared progression, terrain, presentation and return routes.

## Verified problems fixed

| Problem | Effect | Correction |
| --- | --- | --- |
| Up/down shortcut pads overlapped | The nearest-interaction selection always preferred the older up shortcut, making the down interaction inaccessible. | Opposite pads are separated by 320 units. A regression selects and uses every unlocked shortcut. |
| Shortcut and lava recovery lacked a teleport signal | Guest prediction could replay movement from before a relocation; remote interpolation could draw someone travelling through rock. | Both use the existing `player_redeployed` discontinuity event. Wire decoding, prediction and both interpolation paths are tested. This event does not remove health or discoveries. |
| Lift checked only one terrain cell | A wall, low ceiling or solid block touching the operator's body could be missed. | Check the full normal player cylinder against terrain and player-built pieces before moving. |
| Lava recovery assumed one clear destination | A built wall on the safe ledge could trap the recovered player. | Test the ledge and nearby alternatives, excluding lava and occupied landing cylinders. If all candidates are obstructed, recovery does not teleport into them. |
| Relocation retained some flight/jump/slide state | Old glider or buffered movement could carry an operator away from the new ledge. | Reset flight, jet, swimming, buffered jump, slide, fall and platform motion on relocation. |
| Guest work-plane validator retained the -512 limit | Excavation controls below the old dungeon depth lost the selected work plane over the network. | Work planes survive input validation down to -4032; below-world values remain rejected. |
| Saved excavations could remove a new lava bed | An existing saved hole could leave an authored molten surface without containment underneath. | The two-layer local basin foundation takes precedence over old empty edits. Tests restore empty basin-bed edits for all four pools. |
| Existing Friends handshake did not distinguish the new geometry/finishes | An older cached client could join with different terrain and reject new building finishes. | Friends session protocol is now 2. The existing mismatch response asks players to update. Saved world/crew schemas are unchanged. |

## Small rendering/simulation improvements

Stair-floor and support queries scan their spatial tile directly rather than allocating intermediate filtered/mapped arrays. Shortcut selection finds the nearest candidate without allocating and sorting a list. Room lookup reuses the static chamber list. These reduce repeated allocation; no FPS improvement is claimed without a profiler measurement.

The browser fixture disables dev-server hot updates for a stable capture while other repository work is active, and drains route handlers before closing the browser. Only the expected Vite WebSocket warning from that deliberate test configuration is excluded. Runtime, shader and WebGL errors still fail the check.

## Verification

The first full repository run passed 2,041 of 2,044 tests. It found two ocean assertions already failing before this audit: an organic horizon mesh produced six indices where the test expects zero, and an outer-island sample was below sea level where its test expects land. The swimming deep-dive test timed out under full-suite contention and subsequently passed in isolation. These are separate from the dungeon changes and were not rewritten here.

Dungeon regressions additionally cover all shortcut directions, edge/body and built-wall obstructions, safe lava alternatives, stale-flight reset, deep input planes, historical rewards, concurrent awards, host finish enforcement, reloads, durable progression deltas and a late-join baseline. Network coverage uses the actual snapshot/world encoding and reconciliation code in automated fixtures; it does not substitute for two-device WebRTC playtesting.

Final targeted runs passed the 11 dungeon progression cases, complete down/up movement and basin-save cases, prediction/interpolation, manual session, world optional-field and snapshot replication tests. The replication stress tests passed in isolation (two guests over 1,200 ticks, plus 2,000 randomized patch round trips); during concurrent browser/build work their deadlines were exceeded. TypeScript, production bundling and whitespace checks passed. Production bundling retains the existing large-bundle warning.

The final browser report in `artifacts/dungeon-expedition/browser.json` records successful mine, crystal cavern, forge, vault, actual bedrock and recovered-home-relic views, with no runtime, shader or WebGL errors.

## Remaining issues and priorities

1. **Decorative collision:** mine supports, colonnades, crystals and forge dressing are render props. Some can be walked through. Add a shared physical prop definition for terrain collision, building placement and raycasting; avoid renderer-only colliders that disagree between host and guest.
2. **Two-device playtest:** verify loaded and fresh worlds, guest arrival at every depth, simultaneous discoveries, shortcuts under latency, reconnects and the new cached-client mismatch message. Automated transport/replication tests cannot establish real network UX or hardware frame rate.
3. **Vertical mesh cost:** depth filtering substantially reduces active chunk count, but each selected terrain chunk still meshes full vertical columns. Profile worker time, upload latency and GPU memory before splitting meshes into vertical sections. Keep edited cells and adjoining surfaces available across section boundaries.
4. **Instance culling:** dressing and stairs use broad instanced batches. Per-chamber batches could improve frustum/shadow culling if GPU profiling shows those draws matter. Do not trade a small triangle reduction for excessive draw calls without measurement.
5. **Deliberately obstructed recovery:** if players wall off every nearby lava-recovery candidate, the code refuses an unsafe teleport. A longer-term checkpoint selection or protected clear return apron could make recovery unconditional.
6. **Existing ocean assertions:** inspect alongside the active ocean work rather than changing their expectations simply to obtain a green suite.

No dungeon runtime/shader crash has been reproduced. That observation is limited to the automated scenarios and browser fixture, not a guarantee across all saved worlds, GPUs or network conditions.

## Follow-up: 2026-10-12

The shared solid-fixture and fully obstructed recovery priorities above are now addressed. See [the hardening implementation](spawn-dungeon-hardening.md). Friends connection protocol is now 3 so cached clients with the prior decorative-only props cannot join with different collision geometry.
