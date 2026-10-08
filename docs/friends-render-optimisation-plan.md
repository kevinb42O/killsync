# Friends rendering optimisation plan

Prepared 8 October 2026 against the working tree at the start of the investigation. This records the original plan. The accepted implementation, measured results and rejected experiments are documented in [the results report](friends-render-optimisation-results.md).

## Objective and evidence standard

Reduce CPU and GPU frame cost while preserving the current rendered appearance, including full 3D foliage, lighting, shadows, render distance, MSAA and desktop drawing-buffer resolution. The comparison baseline is the current working tree, including its existing wood LOD and gameplay changes.

“Pixel-identical”, “visually indistinguishable” and “same assets/settings” are different claims. The strict path targets pixel-identical output on the same device and renderer. It must report actual image differences; a one-channel rounding tolerance is not zero difference. Passing a finite test suite demonstrates equivalence in those cases, not every possible view on every GPU.

Do not promise a performance multiplier before measurement. Keep each optimisation only if its benefit exceeds run-to-run variation and added CPU, upload, memory and pass costs do not cancel the saving.

## Corrections to the pasted proposal

| Proposal | Finding | Decision |
| --- | --- | --- |
| Front-to-back instances guarantee 30–40% lower fragment cost and zero changed pixels | Instances are currently packed in traversal order. Sorting is worth testing, but alpha discard, alpha-to-coverage, GPU architecture and equal-depth overlaps complicate both claims. | First isolated experiment; benchmark and compare images. |
| Reduced leaf meshes and billboards preserve the image exactly | They change geometry, silhouette, parallax, normals, depth and lighting. Existing forest tests explicitly preserve real leaf geometry across the former handoff distances. | Exclude from the strict path. |
| Trees at 2,400 units are under 20 pixels tall | At the actual 108° vertical FOV and 900-pixel drawing-buffer height, fitted scale-1 tree heights project to approximately 47–60 pixels at a view depth of 2,400. Natural scales range from 0.7 to 1.6; DPR 2 doubles these pixel heights. | Any future LOD uses projected size and measured error, not the proposed fixed distances. |
| Desktop DPR 1.35 is visually identical to DPR 2 | It renders about 54.4% fewer pixels, changing sampling, edges and detail. Retaining native HTML text does not preserve the 3D image. | Exclude from the strict path; possible separate quality setting. |
| Three.js shadows execute full PBR and cloud shading | The installed Three.js shadow renderer already selects depth/distance materials and copies alpha/coverage state. It does not automatically execute the forest material's PBR/cloud fragment shader. | Do not add redundant custom depth materials. |
| Forest changes will remove hundreds of draws | The recorded forest uses 15 main-view batches; total recorded draws are roughly 1,000 including shadow work. Forest triangle cost and whole-scene draw-call cost need separate attribution. | Measure per subsystem and per pass before selecting more batching work. |
| A still player means the shadow map is unchanged | The sun/moon, caster animation, streaming, terrain, construction and other players can change shadow inputs. | Cache only when all relevant inputs are unchanged. |

Tree projection estimates use actual GLB POSITION bounds and the same containment fit as `FriendsAssets.ts`. They assume a tree near the view centre at the stated view-space depth; they are not a universal pixel size for every placement or camera pitch.

## Recorded baseline, to be refreshed before implementation

`artifacts/friends-render-second-pass/after.json`, captured 8 October 2026 on Chromium / Apple M1 Metal:

| Scene | GPU world pass, mean | GPU world pass, p95 | CPU world submission, mean | Forest triangles | Forest batches |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stationary island, DPR 1 | 21.35 ms | 23.93 ms | 5.88 ms | 4,097,656 | 15 |
| Stationary island, DPR 2 | 40.06 ms | 43.80 ms | 7.37 ms | 4,140,420 | 15 |
| Continuous camera pan, DPR 1 | 21.31 ms | 23.61 ms | 6.15 ms | 4,152,286 | 15 |

These are historical measurements, not fresh measurements of today's modified tree. Forest totals include wood and nearby offscreen trees retained for shadows; they are not a canopy-only count. World-pass time is not whole-frame time or observed FPS.

Earlier work already reduced inactive light calculations, reused exactly unchanged forest packing, and batched train running gear. The investigation records that drawing foliage after terrain did not improve GPU time in the earlier experiment. Do not count those improvements again or repeat the same experiment without a new mechanism to test.

## Implementation sequence

### 1. Establish reproducible performance and image baselines

Extend `tools/profile-friends-rendering.mjs` and add a dedicated forest/full-scene comparison harness alongside `tools/test-friends-render-equivalence.mjs`. The existing equivalence harness tests lighting fixtures, not the entire forest image.

- Record the exact source state, dependency versions, browser, GPU, viewport, DPR, actual drawing-buffer dimensions, seed/save, camera, clock, animation time and loaded assets. Preserve the current edits in the baseline; historical revisions alone are insufficient.
- Use fixed camera routes and frame-indexed poses rather than wall-clock pans that sample different angles at different frame rates. Wait for the same asset and streaming state before comparisons.
- Alternate baseline/candidate runs, warm shaders and textures, and repeat runs enough to estimate variance. Keep cold-start behaviour as a separate result.
- Collect complete frame intervals, CPU forest collection/sorting/packing time, matrix upload bytes, GPU world time, shadow-update versus non-update frames, draws, triangles and memory. Attribute canopy, bark, terrain, clouds, train and shadow costs using diagnostic pass isolation; isolation is a profiling tool, not a production appearance change.
- Resolve timer queries asynchronously, reject disjoint samples and avoid synchronous GPU readback during timed runs. Read images only in the comparison runs. Ensure queries from warmup and earlier phases are drained without losing or contaminating samples.
- Establish baseline-versus-baseline image repeatability before requiring exact baseline-versus-candidate equality.

Deliverable: a fresh baseline report and reproducible captures at DPR 1 and 2. No fixed speedup target is assigned until this step identifies the remaining costs.

### 2. Test front-to-back instance packing

Implement behind a development comparison switch in `FriendsForestLOD.ts`.

- Compute each eligible tree's view-space depth once. Use a stable tie-breaker that preserves existing order for equal keys; test centre-depth and conservative front-bound ordering as performance variants.
- Sort entries inside existing species/part/LOD/shadow buckets before packing their original matrices. Preserve geometry, materials, alpha coverage, transforms, wood LOD selection and eligibility.
- Preserve the exact-input packing cache. Avoid allocating per-entry comparator data on every frame. Move entries and any parallel per-instance attributes together so identity, falling animations and future attributes remain aligned.
- Measure sorting, changed-slot matrix uploads and GPU time during continuous movement. A stationary result alone cannot justify the change.
- Test coplanar/equal-depth foliage, MSAA edge coverage and shadow output explicitly. Camera-depth order is not light-depth order; measure shadow frames separately.
- Retain existing cross-bucket draw order initially. Sorting within a batch does not globally order the forest or other scene objects. Any later cross-bucket ordering experiment needs a separate comparison and must account for shader/material state switching.

Acceptance: strict image equality in reproducible fixtures plus a repeatable reduction in total frame cost. If sorting changes pixels, report where and why; do not quietly relabel the result as zero difference. If GPU gains are negligible or sorting/upload costs erase them, remove the production change.

### 3. Separate main-view and shadow eligibility conservatively

The current collection is a union of camera-visible trees and nearby potential shadow casters. Instanced meshes disable engine frustum culling, so the whole packed batch is submitted. Improve this only after measuring how much unnecessary work remains.

- Keep existing shadow candidate eligibility as the outer limit, then reject individual candidates whose conservative bounds cannot intersect the actual light shadow frustum. This removes work the shadow rasterizer cannot use, while retaining all possible visible shadow contributions.
- Maintain independent main-view and shadow candidate lists without duplicating an instance inside a pass. Choose between shared batches, dedicated shadow batches or bounded spatial batches based on measured extra draws/uploads and engine integration cost.
- Update bounds for falling trees and world edits. If a bound or invalidation cannot be proven valid, retain the tree.
- Preserve casters behind the camera whenever they can contribute to an existing shadow map. Camera-frustum-only shadow culling is incorrect.
- Do not add approximate receiver-only culling in the first implementation. Excluding casters based on their projected shadow requires a conservative proof that includes terrain, structures, low-angle sun, shadow filtering and other shadowed receivers.

Acceptance: unchanged colour and shadow results at low sun, camera turns, frustum edges and gameplay edits; fewer submitted instances or triangles with a net frame-time improvement. Savings may be modest because clipping already limits fragment work.

### 4. Reuse shadow maps only when render inputs match

Coordinate `FriendsDayNightCycle.ts`, `FriendsSunShadow.ts`, `FriendsFrontierVisuals.ts` and affected visual owners. Keep the current 10 Hz scheduling semantics and immediate-update conditions.

- At an otherwise scheduled update, compare the inputs to the last map that actually rendered: light/shadow-camera transforms and projection, map settings, eligible casters, caster transforms, geometry and alpha/displacement state.
- Use explicit dirty revisions from the systems that own these inputs instead of rescanning and hashing the entire scene each frame. Track streaming completion, terrain mining/grading, construction, harvest/regrowth, planting, animation, trains, vehicles and remote players.
- Skip only the light whose inputs match. A clean sun map must not suppress a dirty flashlight/spot/point shadow map when the renderer's global update request is set.
- Do not add movement tolerances or extend the cadence. A stationary player with a moving sun still needs the existing updates. Use actual texel-snapped shadow transforms, not merely player position.
- Invalidate on environment scrubbing, resizing, map allocation/context restoration, relevant shader/texture changes and disposal/recreation. An unknown revision forces an update.
- Ensure revisions are collected after this frame's visual updates and clear dirty state only after a successful shadow render.

Acceptance: baseline temporal behaviour during motion and edits, unchanged maps when reuse is allowed, and reduced shadow renders when the clock and casters are actually unchanged. Expect the largest benefit in static previews; do not promise the same saving during ordinary moving gameplay.

### 5. Conditional investigation of terrain occlusion or a depth prepass

Proceed only if attribution still shows substantial invisible forest work and the earlier phases leave useful room for improvement.

Terrain can conceal entire trees without any need to replace their visible geometry. A conservative occlusion system could reduce both vertex and fragment work, but it is a larger engineering investment than sorting.

- Establish what fraction of submitted forest geometry is fully hidden by actual rendered opaque terrain/structures. Treat caves, entrances, edits and streaming gaps as openings.
- Prototype using conservative spatial bounds and an appropriate depth/occlusion method. Never block the CPU for query results. Prior-frame visibility is not valid proof after camera, occluder or tree movement; stale/unavailable evidence keeps the object visible.
- Keep main-view occlusion independent of shadow eligibility. A hidden tree can still cast a visible shadow.
- A depth prepass must reproduce vertex transforms, depth, leaf alpha, derivatives and MSAA sample coverage. Count its added geometry, draws and bandwidth; it may lose on the tested GPU. An opaque-terrain-only prepass is a separate, simpler experiment, not proof that a full foliage prepass will win.
- Do not enable either system unless image equality and net frame cost are established across the moving routes.

This stage is conditional research, not a promised part of the first patch.

## Validation and release gates

Compare fixed frames and motion sequences for: dense forest interiors, sparse ridges, horizon silhouettes, overlapping leaves, low sun, twilight/night, cloud shadows, flashlight, tree fall/harvest/regrowth/planting, mining/grading, construction, terrain streaming boundaries, trains/vehicles/other players, teleports, rapid turns, FOV changes and resizing. Include DPR 1 and 2 and at least the available target GPU architectures; publish untested hardware as a limitation.

Record changed pixels/channels, maximum error, RMS error and amplified difference images. Colour captures must cover sample-resolved MSAA output; inspect depth/shadow maps where possible. Any accepted nonzero difference requires an explicitly relaxed visual requirement.

Run focused forest/day-night/shadow tests and the existing rendering harnesses, followed by required TypeScript/build checks. Tests must cover invalidation and pass-specific visibility, not merely restate the new comparator.

Keep changes isolated for attribution and rollback. Merge only experiments that pass visual and performance gates. Report median/p95 frame time, hardware and scene, rather than inferred FPS or percentages based solely on triangle counts. A stable 60 FPS target requires a whole-frame budget near 16.67 ms; the recorded DPR 2 world pass alone would need over 58% reduction to fit that budget, before remaining work.

## Separate quality options

Canopy simplification, multiview impostors and reduced 3D resolution can be evaluated later as explicit quality/performance options. They can offer large savings but change the rendered image. A future impostor investigation needs newly generated view data from the actual fitted GLBs, appropriate normals/depth/material information for changing light, and separate motion/transition validation. Existing leaf textures are not automatically complete tree impostors.

For this request, implement and evaluate the strict path first. Do not promise 78% fewer scene triangles, half the draw calls, 2.5× FPS or zero visual change as a package: the pasted figures combine approximation with unmeasured gains.

## Technical references

- Installed `node_modules/three/src/renderers/webgl/WebGLShadowMap.js`: built-in depth/distance selection and alpha-to-coverage shadow cutoff handling.
- Installed `node_modules/three/src/renderers/webgl/WebGLRenderLists.js`: opaque object sorting, including material grouping; no per-instance sort.
- [Khronos: early fragment testing](https://www.khronos.org/opengl/wiki/Force_Early_Depth): automatic early tests have shader and hardware limitations.
- [Three.js: InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html): instance buffers and bounds maintenance.
- [Three.js: Object3D](https://threejs.org/docs/pages/Object3D.html): custom depth/distance materials and shadow/frustum flags.
