# Deployment performance audit: ada4b40

The strongest reproduced problem is the campfire's lit materials, especially the gravel clearing. The flame animation and the campfire lamp alone did not explain the drop. A browser-only prototype that applies the existing inactive-light culling approach to the campfire's standard materials improved this view from approximately 6 FPS to 19 FPS; restoring the original materials restored approximately 6 FPS.

This is an analysis and an isolated prototype, not an applied game fix or a deployment.

## Scope and method

The screenshot identifies ada4b40. The workspace was already newer and dirty, so the audit extracted that revision into `/tmp/killsync-ada4b40-audit`, linked the installed dependencies, built it for production, and served it on port 3027. Original workspace game files were not edited by this audit. This does not verify which revision the live production alias currently serves; the screenshot alone cannot establish that.

Three sequential fresh-browser runs used local solo Friends mode in headless Chromium with ANGLE/Metal on Apple M1. Viewport: 1100 × 740 CSS pixels; device pixel ratio: 2; default render scale: 1; drawing buffer: 2200 × 1480. The menu scene was stubbed out. The camera was moved to world coordinates (6470, 730, 5552), looking east toward the fire and mountain, with yaw -π/2 and pitch -0.1. Simulation and streaming continued normally. Each feature condition had a three-second transition followed by a five-second RAF sample. Baseline conditions were repeated.

FPS below is 1000 divided by mean RAF interval; this is local browser performance, not a promise about another GPU or remote multiplayer. Streaming and scheduled shadows changed the submitted work over time, so the experiments are not pixel-identical deterministic GPU benchmarks. The large, repeatable campfire effect is nevertheless present with the original shader light layout preserved.

## Results

| Controlled condition near the campfire | Mean FPS | Median frame time |
| --- | ---: | ---: |
| Original, repeated baselines | about 6 | about 167 ms |
| Campfire surfaces hidden, light unchanged | 19.1 | 50 ms |
| Campfire light intensity zero, surfaces unchanged | 6.0 | 167 ms |
| Only gravel hidden | 10.0 | 100 ms |
| Only flames hidden | 6.0 | 167 ms |
| Only seats hidden | 6.6 | 150 ms |
| Same campfire, prototype inactive-light culling | 19.2 | 50 ms |
| Original materials restored after prototype | 6.0 | 167 ms |
| Forest hidden in first run | 6.2 | 167 ms |
| Clouds hidden in first run | 6.0 | 167 ms |
| Original scene at render scale 0.7 | 10.1 | 100 ms |

The first run also removed the whole fire including its light slot. That result was superseded by the follow-up which independently hid surfaces and zeroed intensity without changing light visibility. The first run's `camp no sun shadows` label actually refers to temporarily disabling *all* light shadow flags around the world draw. It changes shader variants and includes compilation outliers; it should not be interpreted as a reliable ordinary sun-setting performance comparison. `camp no birds` had no controlled flock present and therefore does not measure the cost of a flock.

## Confirmed primary problem: inconsistent lighting optimization

`FriendsCampfire.ts` creates standard materials for wood, gravel, stones, charcoal and cut log ends. Its wood/gravel hooks add procedural patterns but leave the standard lighting chunk intact. By contrast, `FriendsClouds.shade` applies `cullInactiveFriendsLights` to terrain and forest materials, and cave/retreat materials use the same shortcut. The fire's materials do not use it.

The measured scene contained 27 point lights, 7 spotlights and 4 directional lights, plus ambient and hemisphere lights. Many point/spot slots stay present at zero intensity to prevent shader recompilation. The standard Three lighting loop still evaluates direct-light shading for these slots; the project's optimized chunk branches around zero-intensity and noncontributing lights. Near the fire, the gravel and seats cover a large portion of the screen, amplifying the cost of the omitted shortcut.

The prototype wrapped the existing campfire material hooks, retained their procedural patterns, changed cache keys, and inserted the project's zero-light/noncontributing-light branch approach. It left geometry and the fire lamp present. World render submission median fell from approximately 155 ms to 46 ms. CPU sampling of the original scene spent most time inside native WebGL uniform calls: about 3.42 seconds in `uniformMatrix4fv` during a five-second recording. This is consistent with graphics-driver backpressure, rather than demonstrating expensive JavaScript matrix multiplication.

The prototype used an extracted stock lighting chunk, not a complete production integration of the live globally patched chunk. A real fix must apply the existing helper to the live `THREE.ShaderChunk.lights_fragment_begin`, preserve retreat lamp bounds and material hooks/cache keys, and verify night lighting, flashlight shadows and the second retreat campfire. The result establishes a strong fix direction; it is not a visual-equivalence certification.

## Other costs and limits

The forest submitted 1,787 trees in 18 instanced buckets, approximately 1.72 million triangles in the tested direction. Bark gets LOD; leaves always select level zero. Nearby trees retained for shadows also enter the normal render buckets with mesh frustum culling disabled. GPU clipping still removes offscreen pixels, but the vertex work is submitted. Separate shadow visibility from main-camera visibility and add foliage detail reduction before treating a low draw count as sufficient optimization. Hiding the forest alone did not solve this particular 6 FPS collapse.

The renderer uses device pixel ratio up to 2 on desktop with render scale 1 by default: four times the pixels of DPR 1. The Friends vision path also renders to a half-float target with two MSAA samples and composites it even when night vision is off. In the follow-up, night-vision blend was zero while this path remained active. This has a persistent cost, but the audit did not isolate its performance or certify that bypassing it would preserve normal HDR/color behavior. Render scale 0.7 improved the unmodified camp view only to about 10 FPS; it is a mitigation, not the primary fix.

The scene also submitted roughly 1,500–1,700 draws across the world/shadow work near the fire. These and the forest help explain why the prototype still falls short of 60 FPS. Draw totals vary with streaming and time-based shadow refresh.

New friendly birds are assembled from approximately 27–28 separately rendered body meshes per bird, plus optional fire/hearts. A twelve-bird flock can add hundreds of submissions even though geometries are shared. This is a code-level secondary concern; no active flock was profiled here. Batch compatible static bird parts and use distance culling before changing simulation behavior.

Startup is a separate issue: the first run recorded a 1.42-second largest frame interval and seven intervals above 100 ms. Shader preparation completed without fallback, but that does not eliminate all compilation/upload stalls. Background preparation still had queued work after the first waiting period. Existing arrival documentation already records cold-start limitations.

The campfire materials, forest behavior and normal HDR path predate ada4b40 and were not changed by that commit. These findings identify problems present in this deployment; they do not prove that the fishing/bird feature commit introduced the user's regression.

## Validation and next action

The exact revision's production build and TypeScript check (`npm run lint`) succeeded. All three browser runs completed with no captured page exceptions; the measured scene returned WebGL error 0. No game fix was applied and no deployment was performed.

Prioritize the shared lighting shortcut for the campfire's materials. Then profile the remaining scene cost with that fix present, including main/shadow forest visibility, foliage geometry and the normal HDR pipeline. Inspect active flocks separately. Lowering render scale is a temporary workaround.

Evidence: `runtime.json`, `fire-followup.json`, `material-followup.json`, screenshots, two CPU profiles, the three `.mjs` harnesses, and source snapshots under `source/`. The harnesses contain machine-specific runtime/output paths; reproduce the archived production build on port 3027 and copy `audit-lighting-chunk.txt` into its served `dist` directory before the material harness.
