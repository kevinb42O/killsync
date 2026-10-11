# Friends mode CPU optimisation — M1 Air measurements

Measured on the workspace machine: Apple M1, MacBookAir10,1, 8 GB RAM. Baseline is commit `43f2fda039d2fd55611b1f7f4b2ce40973a72e08`; optimised source is this working tree. These CPU changes substantially reduce specific simulation and guest prediction costs in populated worlds. The rendered island remains limited by graphics work and this comparison does not demonstrate a whole-game FPS increase.

## All runtime changes

1. **Resolved construction poses:** `FriendsBuilding.getPieces()` remembers whether a build revision contains vehicle attachments, modular assemblies or telescopic cranes. Static worlds return their existing pieces immediately. Dynamic worlds reuse resolved pieces while scalar vehicle poses, crane angles and crane extension values are unchanged. In-place provider mutations are detected; a build revision invalidates the cache. A moving vehicle/crane still requires fresh resolution when its pose changes.
2. **Construction movement queries:** host movement, guest movement, ceilings, floors, wall contacts, incline checks and hauling floor/collision queries use local construction candidates from the spatial index. Static cells rebuild on build revisions. Dynamic attachments/assemblies/cranes remain candidates and refresh without a full static-world scan. Candidates retain original piece order. Actual construction contacts replay the original complete collision resolver to preserve chained pushes.
3. **Guest tree collisions:** reuse the harvested set and current nine-cell tree list, reject distant or vertically unreachable trees before terrain support work, and cache support results weakly by tree. Terrain object identity, terrain revision and monotonic terrain epoch invalidate support; new forest arrays/region travel refresh candidates. Snapshot rewind/world reset clears the prediction caches. Collision order and the original `Math.hypot` contact threshold are retained. This change applies to guest prediction; authoritative host tree collision remains unchanged.
4. **Grove ordering:** the 121 distance-sorted cell offsets are computed once, removing array construction and sorting on every frontier visual update. The previous stable order is preserved.

## Complete-path CPU results

Seven warmed rounds, alternating before/after order, medians on M1. Units are milliseconds per complete operation. Node/tsx runs use the real simulation/prediction classes, without graphics. These are CPU costs, not FPS multipliers.

| Operation | World/scenario | Before | After | CPU reduction |
| --- | --- | ---: | ---: | ---: |
| complete stationary host simulation tick | 0 pieces | 0.393036 | 0.396422 | -0.9% |
| complete guest presentation movement | 0 pieces | 0.171983 | 0.168117 | 2.2% |
| complete stationary host simulation tick | 64 pieces | 0.419182 | 0.406253 | 3.1% |
| complete guest presentation movement | 64 pieces | 0.194928 | 0.168179 | 13.7% |
| complete stationary host simulation tick | 256 pieces | 0.447102 | 0.408067 | 8.7% |
| complete guest presentation movement | 256 pieces | 0.255842 | 0.166765 | 34.8% |
| complete stationary host simulation tick | 1024 pieces | 0.579236 | 0.424393 | 26.7% |
| complete guest presentation movement | 1024 pieces | 0.499514 | 0.178187 | 64.3% |
| complete guest reconciliation with 30 pending inputs in woodland | 0 pieces, 30 pending inputs | 4.306067 | 2.260103 | 47.5% |
| complete guest reconciliation with 30 pending inputs in woodland | 1024 pieces, 30 pending inputs | 8.328346 | 2.272396 | 72.7% |

The 1,024-piece stationary host tick falls from 0.579 to 0.424 ms (27%); guest movement presentation falls from 0.500 to 0.178 ms (64%). With 30 unacknowledged inputs replayed in woodland and 1,000 harvested IDs, complete guest reconciliation falls from 8.328 to 2.272 ms (73%). Without construction, the same delayed-input scenario falls from 4.306 to 2.260 ms (48%). The replay scenario is a stress case; it does not represent every rendered frame or a healthy connection.

## Individual operations

| Operation | World/scenario | Before ms | After ms | CPU reduction |
| --- | --- | ---: | ---: | ---: |
| construction floor + ceiling + collision | 0 pieces | 0.000082 | 0.000448 | -448.7% |
| unchanged build pose read | 0 pieces, static | 0.000024 | 0.000010 | 59.2% |
| construction floor + ceiling + collision | 64 pieces | 0.005469 | 0.001465 | 73.2% |
| construction collision with conservative replay | 64 pieces, touching construction | 0.001975 | 0.002705 | -37.0% |
| unchanged build pose read | 64 pieces, static | 0.000090 | 0.000015 | 83.9% |
| unchanged build pose read | 64 pieces, with attachment | 0.000598 | 0.000122 | 79.6% |
| construction floor + ceiling + collision | 256 pieces | 0.024515 | 0.001548 | 93.7% |
| construction collision with conservative replay | 256 pieces, touching construction | 0.008850 | 0.009580 | -8.3% |
| unchanged build pose read | 256 pieces, static | 0.001070 | 0.000014 | 98.7% |
| unchanged build pose read | 256 pieces, with attachment | 0.002019 | 0.000143 | 92.9% |
| construction floor + ceiling + collision | 1024 pieces | 0.098433 | 0.001566 | 98.4% |
| construction collision with conservative replay | 1024 pieces, touching construction | 0.035061 | 0.036101 | -3.0% |
| unchanged build pose read | 1024 pieces, static | 0.003814 | 0.000014 | 99.6% |
| unchanged build pose read | 1024 pieces, with attachment | 0.007956 | 0.000117 | 98.5% |
| guest tree collision warm cache |  | 0.081074 | 0.000383 | 99.5% |
| grove cell ordering |  | 0.036081 | 0.000009 | 100.0% |

The no-contact construction benchmark measures one floor, one ceiling and one collision query at the same point. It excludes index rebuilding. Grove ordering measures only the removed array creation/sort versus access to the precomputed offsets, not the complete visual update. Tiny timings are sensitive to JIT and timer overhead.

Actual construction contacts incur a conservative local trial before full replay: about 0.001 ms extra per tested collision at 1,024 pieces. Empty construction queries can also cost a fraction of a microsecond more because the index has overhead. Empty-world complete host ticks differ by under 1% between versions; this patch has little benefit in that case. The fast path is for predominantly static worlds and movement through clear space; it does not make dense wall contacts or moving all construction free.

## Rendered-game measurements

Real Friends arena in Chromium, 151.0.7922.34 with ANGLE Metal backend (Apple M1 renderer verified separately in `hardware.json`), 1600×900 viewport, cinematic effects off, fixed camera yaw −2.3/pitch −0.3, paused 9 AM clock/wind. Both versions use identical instrumentation. Initial settling is 20 seconds, each phase settles for 10 seconds and records for 12 seconds. No tests/builds or other benchmark processes run during the accepted measurement windows. Measurements include requestAnimationFrame intervals, CPU timings, asynchronous GPU timings, draw calls and triangles. One sequential baseline/optimised pair is a limited sample; it cannot establish a sub-percent FPS improvement or regression.

| Render configuration | Before FPS | After FPS | Before GPU mean | After GPU mean |
| --- | ---: | ---: | ---: | ---: |
| 1600×900 drawing buffer (DPR 1) | 21.56 | 21.45 | 34.53 ms | 34.76 ms |
| 3200×1800 drawing buffer (DPR 2) | 11.06 | 10.92 | 68.77 ms | 69.29 ms |

These are this heavy scene and browser configuration, not a claim about every play session on an M1 Air. Approximately 5.2 million submitted world triangles and roughly 1,800 world draw calls remain. The optimisations do not reduce that graphics work. The small observed FPS differences (−0.5% and −1.2%) do not demonstrate a useful FPS improvement; GPU timing and scene animation vary between runs. An initial shader-compilation-contaminated run was discarded; it is not included in this report.

## FPS estimates for the M1 Air

- **A graphics-bound island like the measured scene:** expect essentially 0 FPS gain from these CPU changes. There is no evidence here for a large increase in average FPS.
- **A populated world with a healthy connection:** measured guest presentation saves about 0.32 ms per call plus about 0.036 ms for grove ordering; host ticks save about 0.15 ms at 1,024 pieces. Those normal-path savings alone suggest roughly 0–1 additional FPS around 30–50 FPS, depending on the limiting stage. At a 60 FPS cap, the benefit is extra CPU headroom unless frames were missing the cap. Pose-cache benefit depends on the number of redundant reads and dynamic attachments.
- **A delayed guest with many pending inputs:** about 6.06 ms less CPU work per tested heavy reconciliation. This should reduce reconciliation stalls. If one such reconciliation is on the critical path of a CPU-bound 33.33 ms frame, subtracting 6.06 ms gives about 36.7 FPS equivalent instead of 30. If the original frame is 22.22 ms (45 FPS), the equivalent is about 61.9 FPS before any cap. These are conditional calculations for affected frames, not promised sustained FPS gains; GPU limitation, snapshot frequency and input backlog determine the actual result.

Do not add the individual-operation savings to complete simulation/prediction timings: the complete timings already include the relevant work. Nor should host tick savings be treated as savings on every rendered frame: the tick benchmark runs at 30 Hz.

The next large FPS opportunity is graphics: pixel density, world draw calls, shadow work and geometry. In this scene DPR 2 approximately doubles GPU time and halves observed FPS. Profiling those areas matters more for average FPS than continuing to remove microseconds from the already smaller movement queries. The remaining 2.27 ms delayed guest replay is another CPU profiling target if multiplayer stutters remain.

## Validation

- Full repository suite: **231 test files, 1,845 tests passed**, with two workers to avoid CPU-contention timeouts.
- 8,000 deterministic randomized construction queries covering every build shape, stacks, rotations, different radii, floors, ceilings, walk floors and exact collision results.
- 6,000 randomized tree checks across planting/harvesting, terrain repair and region changes, plus 1,080 floating-point tangency checks against the previous loop.
- Dynamic vehicle motion/pitch/wagon-kind mutation, modular crane angles, parked-angle fallback, telescopic extension/rotation/removal, cache reuse and invalidation tests.
- Benchmarks assert identical complete host player snapshots and guest presentation/replayed movement state between original and optimised classes.
- Browser profiles complete without page runtime exceptions. Desktop/mobile crane screenshots were visually inspected.

- **23 live WebRTC integration checks passed:** four simultaneous guests plus host, guest authority input, exactly-once retries, permissions, shared construction/crafting/storage, 6,000 terrain edits, dropped bulk fragment, 25% motion packet loss, 100 ms delay, identity/pack restoration on reconnect, persistence/quota recovery, and a 60-second five-player soak. Survival WebRTC and movement checks also pass. No browser runtime exceptions.
- **10 live crane UI checks passed:** socket construction, controls and HUD state, simultaneous lifting/rotation, release/blur braking, load camera and overview, mobile layout, touch cancellation, second-operator hook release, Escape restoration, and ground-level connect/disconnect. No browser runtime exceptions.
- Type checking: `npm run lint` passes.
- Production build: `npm run build` passes (5.58 seconds). Vite reports the existing large-bundle warning; bundle splitting is separate from these runtime CPU changes. Passing tests provides evidence against regressions; it cannot prove that every possible game state is bug-free.

## Reproduce

`tools/benchmark-friends-cpu.ts` takes `FRIENDS_CPU_BASELINE` pointing to a checkout of the baseline commit, with the same node_modules installed or linked. Run it using `npx tsx tools/benchmark-friends-cpu.ts`; it writes `artifacts/friends-cpu-optimisation/cpu-benchmark.json`.

Run `tools/profile-friends-cpu.mjs` against baseline and optimised Vite servers **sequentially**, setting `FRIENDS_TEST_ORIGIN` for each and `FRIENDS_PROFILE_PHASES=island,high-dpi`. Pass the JSON output path as the first argument. Allow the browser to close before starting the next run. Repeated alternating pairs and real interactive sessions are needed for tighter whole-game FPS conclusions.

Raw results: `artifacts/friends-cpu-optimisation/cpu-benchmark.json`, `baseline-render-warm.json`, `optimised-render-warm.json`, `tests.log`, `hardware.json`, `typecheck.log`, `build.log`, `network/integration.json`, and `crane/checks.json` (with crane screenshots).


## Subsequent rendering optimisation

The rendered-game measurements above isolate the CPU changes and predate the compact point-light layout. The later rendering implementation and repeated live FPS comparison are documented in [the render-cost research follow-up](render-cost-research-2026-10-10.md#follow-up-audit-and-live-gameplay-fps). That comparison keeps these CPU changes enabled in both conditions and toggles only the lighting budget; its FPS increase should not be attributed to the CPU caches.

On 11 October the adaptive lighting budget was withdrawn from gameplay after reproducing shader-compilation stalls while approaching the stopped train. Its historical FPS gains no longer describe production. The CPU changes remain enabled; see the [freeze investigation](render-cost-research-2026-10-10.md#freeze-investigation--stopped-train-at-spawn-11-october-2026).
