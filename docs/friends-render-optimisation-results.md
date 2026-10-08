# Friends rendering optimisation results

Implemented 8 October 2026. The accepted changes preserve the existing forest geometry, materials, instance order, wood LOD thresholds, visibility rules, drawing-buffer resolution, MSAA and shadow-update cadence. The large performance multiplier in the original proposal was not supported by measurement.

## Accepted implementation

### Exact sun-shadow reuse

`src/game/rendering/FriendsSunShadowCache.ts` is owned and disposed by `FriendsDayNightCycle`. It runs after Three.js updates world matrices, at otherwise scheduled shadow updates. It compares the actual light projection and eligible caster inputs with the last successfully captured shadow render. Matching inputs allow only the sun map to be reused; other shadow lights remain eligible.

The signature includes caster order, world transforms, instance matrices/counts, geometry/index/attribute versions and semantics, draw ranges/groups, morph inputs, material visibility/sides, alpha/displacement inputs, texture transforms/versions and clipping. Changes have no movement tolerance or time quantisation. A changing sun or shadow projection rejects reuse before walking the scene. Map disposal and context restoration invalidate the cache. Temporary per-light flags and existing scene callbacks are restored.

Unsupported paths, including custom depth/shadow hooks, skinned/batched meshes, instanced morph textures, GPU-owned attributes and video/render-target alpha textures, fall back to Three.js. VSM shadows also fall back. This deliberately uses a scheduled render-time snapshot instead of introducing dirty counters into every world owner: an incomplete owner counter would make exact reuse unsafe.

The strongest benefit is a paused clock and unchanged casters. During a moving day/night cycle or changes to shadow inputs, the existing rendering cadence continues.

### Falling-tree matrix updates

`FriendsForestLOD` records animated instance slots while packing. For an exactly cached camera/world state, a falling tree updates its own slots instead of searching all standing instances. It adds small matrix-upload ranges while keeping the original packing order and falling transform.

A pending full upload takes precedence over small animation ranges. Upload callbacks track when it has actually completed, including after buffer growth. Several updates before a draw cannot discard earlier matrix edits. Ordinary repacking keeps the existing full-upload path; it bypasses fall lookups when no tree is falling.

## Visual evidence

The principal comparisons observed **zero changed pixels, zero changed channels and zero maximum/RMS error**:

| Comparison | Cases | Coverage |
| --- | ---: | --- |
| Forest and ground fixtures | 62 | Natural forests from four views at day, dusk and night; DPR 1/2; overlapping/equal-position foliage; camera movement; planting, harvest, support edits and falling animation; cloud shading and spot shadows |
| Actual Friends arena at spawn | 8 | Four fixed directions at DPR 1/2, full world pass |
| Actual Friends arena in dense forest | 8 | Four fixed directions at DPR 1/2, full world pass |
| Additional cache-only dense-world control | 8 | Same physical forest with sun reuse enabled/disabled |

A/A repeat renders are also required to match. The fixtures use real tree GLBs, native sample-resolved output, ACES tone mapping, PCF sun shadows and four-sample MSAA on Chromium / Apple M1 Metal.

The initial world harness mixed a long-lived gameplay forest with a freshly initialized baseline. It found 1/6 differing pixels in one dense view and misleading CPU differences. The corrected harness initializes both controllers fresh with matching packing/LOD history and JIT exposure; baseline controls, cache-only controls and the corrected candidate comparisons pass. Those early reports remain in the artifact directory for traceability and are not accepted performance evidence.

Finite comparisons establish equality in the tested frames. They do not certify every future world state, renderer version or GPU. Other GPU architectures and mobile hardware have not been measured.

## Measured work reduction

In a 600-pair stationary-camera benchmark, one natural tree falls over 900 ms with cosmetic falls enabled:

| Metric | Baseline | Accepted implementation |
| --- | ---: | ---: |
| Mean CPU forest update | 0.1895 ms | 0.00517 ms |
| Required matrix-upload bytes per update | 323,072 | 128 |
| CPU update p95 | 0.300 ms | 0.100 ms |

This is about 97% less CPU time for that specific cached update and 99.96% fewer required upload bytes. The byte count comes from dirty-buffer ranges; GPU upload callbacks were simulated after the initial real render to isolate CPU work. It is not a measured reduction in whole-frame GPU time or gameplay FPS. The timer has approximately 0.1 ms resolution, so individual fast samples quantise to zero; the mean aggregates 600 samples.

In the actual arena, a reusable scheduled sun update eliminates **228 draw calls**. With a scheduled update every six benchmark frames, that is **38 fewer draws per frame on average**. Main-view forest counts, geometry and triangle counts remain unchanged. The cache also leaves scheduled flashlight/other-light shadow work intact.

## Whole-scene performance

The paired harness alternates A/B and B/A in one actual Friends arena, freezes world/animation state and uses identical frame-indexed camera poses. Both forest controllers start fresh. It times forest updates and `renderer.render` separately, measures the GPU world pass with asynchronous timer queries, rejects disjoint queries and keeps pixel readback outside timed phases. Each phase warms 24 pairs and measures 120 pairs at stationary/panning poses and DPR 1/2. The menu is omitted; the original runtime forest is hidden while the two comparison forests take turns.

**No substantial or repeatable whole-scene FPS improvement is established.** World-pass GPU time remains close to the baseline, and CPU results vary with background load. Four million visible forest triangles and the native-resolution shading cost remain. Reusing occasional shadow maps and reducing a small animation update cannot be presented as a 2.5× FPS gain.


| Scene | GPU mean / p95, baseline | GPU mean / p95, accepted | Forest + render CPU mean, baseline → accepted |
| --- | ---: | ---: | ---: |
| Stationary, DPR 1 | 26.68 / 33.49 ms | 26.43 / 33.33 ms | 14.47 → 14.62 ms |
| Panning, DPR 1 | 22.92 / 26.25 ms | 22.93 / 26.95 ms | 9.42 → 9.15 ms |
| Stationary, DPR 2 | 42.51 / 45.77 ms | 42.33 / 45.39 ms | 9.41 → 9.26 ms |
| Panning, DPR 2 | 42.87 / 47.02 ms | 42.82 / 46.56 ms | 10.42 → 10.33 ms |

The accepted paired report contains mean, median, p95 and paired differences for CPU/GPU time, draws, triangles and upload bytes. Absolute timings from different runs should not be compared as if the machine were otherwise idle. The benchmark is the world render pass, not end-to-end gameplay frame time.

## Rejected experiments

- Front-to-back instance sorting changed pixels in 21 of 62 cases, up to 49 pixels and a 52/255 channel difference. It also added CPU work without a useful measured GPU saving. Removed.
- Tighter tree/tile AABB culling passed the fixture comparisons but removed under 1% of submitted triangles. No convincing net frame-time gain was established. Removed.
- A tile-containment shortcut and broad partial matrix uploads were not retained without a demonstrated net benefit. Earlier byte reductions and timings from unmatched initialization histories are not proof of a speedup.
- Impostors, reduced leaf geometry and lower desktop DPR were excluded from this strict appearance-preserving implementation because they change the image.
- No redundant custom PBR-free depth materials were added: the installed Three.js shadow renderer already uses depth/distance materials.

## Validation

- Focused forest/day-night/shadow tests: 18 passed. They include tiny transform changes, geometry and instance invalidation, alpha/texture/clipping changes, attribute names and draw groups, map disposal, unsupported-path fallback, scene callback ownership and pending full-versus-partial uploads.
- Full unit suite: **975 tests passed across 155 files** with two workers. An earlier parallel run hit three unrelated terrain/castle-cargo/train timeouts under machine load; those files also passed in a one-worker rerun.
- TypeScript check passed. A missing `ChevronDown` import in the existing build palette was corrected when it blocked this check.
- Production build passed, with the existing large-chunk warning.
- Existing lighting equivalence harness passed its established one-channel quantisation tolerance in 18 cases. This separate historical harness does not constitute the zero-difference evidence above.
- `git diff --check` passed. Temporary baseline modules are cleaned up by the harnesses.

## Artifacts and reproduction

The comparison baseline preserves the pre-optimisation working files, including the gameplay changes present then, under `artifacts/friends-render-third-pass/source`. It is not reconstructed solely from HEAD. The directory also records the baseline commit for context.

Principal reports:

- `artifacts/friends-render-third-pass/accepted-forest/forest-equivalence.json`
- `artifacts/friends-render-third-pass/release-dense/world-pair.json`
- `artifacts/friends-render-third-pass/dense-shadow-isolation/world-pair.json`
- `artifacts/friends-render-third-pass/release-fall/world-pair.json`
- `artifacts/friends-render-third-pass/accepted-paired/world-pair.json`
- `artifacts/friends-render-third-pass/accepted-manifest.json` (source, baseline, tree asset and Three.js hashes)
- `artifacts/friends-render-third-pass/validation.json` and saved validation logs

From the project root, with Playwright installed (or `PLAYWRIGHT_MODULE` pointing to it):

```sh
DISABLE_HMR=true npm run dev -- --port=3001
```

In another terminal:

```sh
FRIENDS_FOREST_OUTPUT=artifacts/friends-render-third-pass/recheck-forest node tools/test-friends-forest-equivalence.mjs
FRIENDS_PAIR_OUTPUT=artifacts/friends-render-third-pass/recheck-paired node tools/profile-friends-world-pair.mjs
FRIENDS_PAIR_LOCATION=dense FRIENDS_PAIR_COMPARE_ONLY=true FRIENDS_PAIR_OUTPUT=artifacts/friends-render-third-pass/recheck-dense node tools/profile-friends-world-pair.mjs
FRIENDS_PAIR_FALL_ONLY=true FRIENDS_PAIR_OUTPUT=artifacts/friends-render-third-pass/recheck-fall node tools/profile-friends-world-pair.mjs
npm test -- src/game/rendering/FriendsForestLOD.test.ts src/game/rendering/FriendsSunShadowCache.test.ts src/game/rendering/FriendsDayNightCycle.test.ts --maxWorkers=1
npm run lint
npm run build
```

`FRIENDS_TEST_ORIGIN` can override the server URL. `FRIENDS_TEST_ANGLE` selects the Chromium ANGLE backend. The paired tool also supports `FRIENDS_PAIR_SAME_FOREST=true` and `FRIENDS_PAIR_BASELINE_CONTROL=true` with `FRIENDS_PAIR_COMPARE_ONLY=true` for diagnostic controls. Baseline and candidate render side effects remain frozen between pairs; this is a controlled rendering comparison, not a simulation/load benchmark.
