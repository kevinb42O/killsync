# Friends playtest bug audit — 11 October 2026

The local build contains fixes for two gameplay replication bugs and one related JSON array edge case. This audit did not publish the build or change the user's active game session.

## Confirmed defects and fixes

1. **Host broadcast crash when switching away from a weapon.** The original snapshot serializer reads `.length` from `JSON.stringify(undefined)`. A real Friends transition from an equipped weapon to fishing or empty hands clears weapon fields and reproduces the exception observed in the deployed host's browser. Repeated failures can stop guest state updates. Cleared entity and nested object fields now use the existing property-removal patch format. Undefined array entries use JSON's `null` representation. This serializer line predates the CPU optimizations.
2. **Guests retain a train attachment after a build is moved onto land.** The reliable island serializer emitted `{value: undefined}`, which becomes `{}` on the JSON wire. The guest retained the old attachment instead of removing it. A regression test reproduces the problem using `FriendsBuilding.request('move')`, reliable host/guest world transfer, and undo. Cleared object fields now produce removals. The original reliable serializer was introduced in commit `9314c247` on 7 October, before the CPU optimizations.
3. **Extending an array with an undefined entry left a hole on guests.** A seeded randomized test exposed this at case 61. The reliable patch generator now explicitly emits `null` for such new entries, matching a complete JSON snapshot. This is a serialization edge case; no specific ordinary gameplay trigger was established.

The fixes preserve the existing wire format and use removals/null values already understood by the guest. They do not add reconnect behavior or conceal broadcast exceptions.

## Validation

| Check | Result |
| --- | --- |
| Final complete Vitest suite | 235 files, 1,875 tests passed; 98.44 seconds |
| Earlier complete suite during audit | 233 files, 1,871 tests passed |
| Seeded patch stress | 2,000 nested transitions through both reliable and motion JSON patch formats |
| Simulation replication stress | 1,200 ticks; three moving/casting players; two guest decoders; exact player and fishing state comparisons |
| Live fishing WebRTC | 12 weapon/fishing/empty-hands cycles; two guests; movement; 25% motion packet loss and 80 ms delay on one guest; fishing works after reconnect |
| Live fishing delivery | 240 and 403 snapshots received by the two guests; final transport tick 404; no unexpected session or browser errors |
| Live five-player integration | Late joins, movement, build permissions, edits, crafting, storage, dropped acknowledgements, identity/inventory preservation after rejoin |
| Populated-world fault test | 6,000 terrain edits; dropped bulk fragment; 25% motion loss; all guests converge |
| Live soak | Two minutes with five players and populated terrain under motion faults |
| Storage recovery | IndexedDB recovery after corrupt mirrors; successful database save after simulated localStorage quota failure |
| Survival regression | Actual WebRTC state and input still work |
| Production fishing UI | Real arena/toolbelt/cast controls; upward and downward camera aim; no browser exceptions |
| Cleared-field live regression | Six clear/restore cycles, guest remains connected, no exceptions |
| TypeScript and build | `npm run lint`, `npm run build` passed |
| Patch whitespace | `git diff --check` passed |

Both broad suite runs used `--maxWorkers=2 --testTimeout=60000`. Explicit per-test timeouts remain in effect. The Castle Cargo and swimming tests that timed out under the earlier heavily loaded run passed in these runs.

The fishing reconnect test records expected channel-close notifications caused by deliberately closing the old guest. It asserts no unexpected errors before departure or during resumed gameplay. These expected departure notifications are separate from the test's `errors` and `browserErrors` arrays.

## Scope and limits

Source review covered host broadcast/clock paths, snapshot and reliable-world patch generation/application, fragmentation and backpressure, epoch resets, guest prediction, construction pose caching, spatial movement queries, and tree collision invalidation. No additional reproducible fault was found in the recent movement cache changes.

The live transport tests ran in local Chromium on the developer's MacBook Air M1. They exercise real WebRTC and injected packet faults, but do not establish reliability across every WAN/TURN route or laptop suspension scenario. The soak is two minutes, not a prolonged production session. Passing these checks cannot establish that the entire game has no remaining bugs.

These changes fix correctness and interrupted updates; they are not a new FPS optimization or a measured FPS gain.

## Evidence and reruns

Results are saved in `artifacts/friends-bug-audit/`: `final-suite.log`, `replication-stress.log`, `live-multiplayer.json`, `live-fishing.json`, `live-disconnect.json`, `fishing-ui/aim-validation.json`, `typecheck.log`, and `build.log`.

```sh
npx vitest run --maxWorkers=2 --testTimeout=60000
node tools/test-friends-disconnect.mjs
node tools/test-friends-fishing-network.mjs
FRIENDS_SOAK_MS=120000 node tools/test-friends-multiplayer.mjs
FRIENDS_TEST_ORIGIN=http://localhost:3001 FISHING_ARTIFACT_DIR=artifacts/friends-bug-audit/fishing-ui node tools/test-friends-fishing-aim.mjs
npm run lint
npm run build
```

The live fixtures require the local development and multiplayer signaling services; the network scripts default to port 3001. Fresh browser contexts isolate test saves and connections from the user's session.

Before the playtest uses these fixes, publish the updated build and have the host and guests reload. An already open production session keeps running its old JavaScript bundle.
