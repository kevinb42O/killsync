# Friends networking review

## Existing design

Friends runs authoritative movement at 20 Hz. Guests predict their own ground movement and reconcile against host acknowledgements. Remote players and moving vehicles share a delayed presentation timeline. Snapshot cadence scales with peer count and browser connection hints. Per-peer motion deltas reference keyframes rather than previous deltas, and durable island changes travel separately with checksums, revision acknowledgements and bounded transfer pacing. Reliable interaction commands retry with deduplication.

## Changes

- Snapshot assembly now advances its stale-packet watermark only after gameplay accepts the decoded state. Previously a complete delta arriving ahead of a fragmented keyframe could evict that keyframe even though the delta could not be decoded. The keyframe can now finish, and the next independent delta recovers without waiting for the periodic replacement keyframe. The existing three-frame memory bound and fragment expiration remain.
- Friends input traffic has a 4,000-byte queue budget instead of sharing the 64,000-byte general traffic threshold. New replaceable inputs are skipped during congestion and resume when the queue drains. Reliable commands retain their separate channel and budget.
- Queue checks include the new message's actual UTF-8 byte length. This prevents a single send from overshooting the budget.
- An already-full Friends motion queue is checked before per-recipient interest filtering, delta generation, compact transformation, JSON serialization and packet allocation. That avoids preparing snapshots that cannot be sent.

These changes do not alter the wire schema or authoritative simulation rate. The shared assembler acceptance fix also covers Survival snapshots.

## Performance interpretation

The improvements target congestion latency, snapshot recovery and discarded serialization work. Healthy-connection snapshot sizes and render FPS are not expected to change from these changes alone. Lower queued-input capacity is not a measurement of achieved latency. Actual internet latency still depends on the host, peers, routing, relay use, packet loss and available bandwidth.

## Verification

51 tests across eight networking suites passed, including fragmented/out-of-order keyframes through both ordinary and Friends WebRTC adapters, input congestion and UTF-8 bounds, per-peer snapshot preparation skipping, delta replication, interest filtering, local prediction, presentation jitter, world replication and host clock behavior. TypeScript checking and the production build passed. The build retains the existing large-bundle warning.

All 23 browser checks passed, including four simultaneous late joins, exactly-once command retries, shared construction and storage convergence, 6,000 terrain edits, recovery under 25% motion loss and 100 ms injected delay, a dropped world fragment, identity and inventory restoration on rejoin, a 60-second five-player soak, host departure, and Survival joining/movement. No browser runtime exceptions were recorded.

The original five-player browser results are saved in `artifacts/friends-multiplayer/integration-five-player.json`. The latest results are saved in `artifacts/friends-multiplayer/integration.json`. This uses actual local WebRTC peer connections with injected motion loss, delay and a dropped durable-world fragment; it does not establish WAN or TURN performance.


## Six-player Friends cap

Friends now supports six total players (one host and five guests); Survival remains at five. The mode-specific limit applies to lobby advertisements, HTTP reservations, broker/manual offers, roster/start payload parsing, setup displays and authoritative admission. A fifth guest color is distinct from the existing four.

99 targeted tests passed, including six-player admission, rejection of a seventh player, vacancy reuse, HTTP reservation bounds and Survival compatibility. TypeScript checking and the production build passed. All 23 browser integration checks passed with five simultaneous guests, shared-world convergence, injected motion loss/delay, a dropped world fragment, rejoin recovery and a 15-second six-player populated-world soak. This validates functionality; it is not an FPS benchmark.
