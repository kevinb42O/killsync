# Friends arrival investigation — 9 October 2026

Spawning combines synchronous scene construction, terrain/model streaming and
first-use graphics work. Once that work settles, the same view can run smoothly.
The investigation reproduces substantial stalls in the actual production arena,
without needing a remote connection. It does not rule out network delays in a
particular remote session.

## Confirmed causes

The island visual constructor generated the entire immutable castle boundary
on the main thread, even at a distant spawn. The greedy mesher repeatedly split
and parsed coordinate strings inside its sorting comparator. A controlled
sequential Node check took 3,481.4 ms for the original mesher and 2,018.9 ms after
decoding coordinates once per cell. All positions, normals, UVs, groups and
vertex ordering compared exactly equal (25,140 vertices). This is a mesher
measurement, not a whole-game FPS improvement.

A follow-up warms both implementations and alternates A/B then B/A for four
pairs, checking exact output outside the timed work. Mean meshing time was
544.8 ms before and 224.8 ms after (58.7% less CPU time). One baseline sample
was an 892 ms outlier; the other three were 421–442 ms, versus 182–274 ms for
the candidate. The original single-run cold timings include JIT and first-use
world caches and should not be treated as a controlled percentage improvement.
See `artifacts/friends-arrival/mesher-equivalence.json`.

Cold material programs also block their first draw. Instrumented WebGL calls
show hundreds of milliseconds in shader logs and uniform reflection. Fresh
shader inputs reproduce multi-second frame gaps after the scene is constructed.
Background preparation submits one object at a time, but first-visible drawing
can reach programs before that queue has prepared them. Some shadow programs and
GPU resource uploads also initialize on first use.

The arrival effect draws the shaded world and a wireframe world before composing
the hologram. It adds rendering work while other startup work is running. That
does not make simply omitting one pass a safe optimization: see the rejected
experiment below.

React development StrictMode mounts the arena effect twice. The production build
avoids that development-only duplicate construction. Development measurements
should not be presented as production join times.

## Retained changes

- Generate castle masonry in a dedicated worker and transfer its typed arrays.
  Cache the one immutable CPU result across menu scenes and joins. Each scene
  owns its GPU geometry. Disposed scenes unsubscribe from pending installation;
  the worker finishes once and terminates. Worker failure defers an exact main
  thread fallback, which can still stall on browsers that disallow workers.
- Decode each mesher coordinate once before sorting. Final mesh data and material
  groups match the original exactly.

## Rejected rendering experiment

An experimental arrival renderer omitted the shaded world while reveal was
zero and used wire depth for the initial hologram. Exploratory cached production
captures reduced the worst initial frame from about 3.0 seconds to 1.3 seconds.
Those captures also still rendered the production menu, unlike the corrected
profiler, so they are not an accepted isolated benchmark.

The corrected fresh-shader check exposed a worse concentrated reveal frame:
about 14.5 seconds, versus a baseline worst frame of about 7.4 seconds spread
among other cold stalls. Disabling diagnostic logs still left a roughly 13.8
second frame, with the wait moving to uniform reflection. **The pass-skipping
experiment was removed.** At that stage, the existing arrival renderer remained. The guarded shader preparation added below is a separate follow-up.

Camera-frustum shader prioritization and production-only diagnostic disabling
were also tested and removed. Although Three.js documents disabling diagnostics
as a possible production optimization in its
[WebGLRenderer reference](https://threejs.org/docs/pages/WebGLRenderer.html#debug),
the measurements here did not establish a reliable whole-frame improvement.
The underlying compilation wait moved to uniform reflection. Another capture
of those experimental settings had a 42-second first-frame gap while a second
browser benchmark briefly competed for graphics resources. That capture is not
an isolated before/after comparison, but reinforces that the shader issue is
unresolved. At that stage, only the independently verified mesher and worker/cache changes
were retained.

## Initial validation and evidence

During the initial investigation, twenty-nine focused tests passed across masonry worker lifecycle, shader preparation,
arrival state restoration, castle geometry and terrain coverage. They cover
concurrent consumers, cached reuse, cancellation and worker failure. The final
production build passed; the existing large-bundle advisory remains. TypeScript
passed earlier in the investigation. A final rerun found concurrent UI edits
passing `onMarshmallow` to `FriendsFunBar` and `visible`/`nearFire`/`seated` to
`FriendsCampfireControls` without matching component prop declarations. Those
components are outside this patch, so the whole-workspace type check was
not green at that point.

`tools/test-friends-arrival-guest.mjs` mounts two actual Friends arenas connected
over local WebRTC. Both finished arrival and installed masonry. The guest moved
about 272 world units and authoritative snapshots continued, with no runtime
exceptions. This is a functionality check at render scale 0.5 with sun shadows
disabled, not a guest performance benchmark.

The retained production build also completed an ordinary fresh-context browser
smoke check with no runtime or WebGL errors. All 105 material programs checked
linked successfully, arrival finished, and background preparation completed.
The initial frame still took about 1.98 seconds in that run; later frames were
typically 16.7 ms. This run did not force cold shader inputs and is not an
isolated performance comparison. See `retained-production-smoke.json`.

`tools/profile-friends-arrival.mjs` profiles the production or development arena
at 1100 × 740, render scale 0.7 and sun shadows enabled in Chromium/Metal. Its
corrected route stubs both development and bundled production menu rendering.
It records frame gaps, long tasks, shader compilations and slow WebGL calls.
`FRIENDS_ARRIVAL_COLD=true` adds a unique zero-valued uniform expression to
fragment shader sources to bypass prior driver shader-cache inputs. This is a
cold-compilation stress test, not a prediction of a specific player's join time.
Timing comparisons must run one browser benchmark at a time.

Artifacts are under `artifacts/friends-arrival`. `before.json` and
`cpu-before.cpuprofile` record development startup. `production-cold-before-isolated.json`
is the corrected production baseline. `production-cold-after-isolated.json` and
`production-cold-final.json` record the **rejected pass-skipping experiment**.
`production-cold-diagnostics-and-priority.json` records the later experimental
settings with briefly competing graphics work; these settings were also removed.
The earlier aborted cold capture and concurrent castle-route timeouts are not
accepted measurements. `guest-validation/checks.json` records the successful
connected guest check. Original source snapshots are retained as `.txt` files
to keep them outside TypeScript compilation.

## Remaining improvements with the greatest potential

The follow-up prepares initial-camera main programs against the final lights and
HDR target. Shadow programs still initialize in the first wire pass. Preparing
those simple depth programs ahead of that pass remains a possible improvement.

The follow-up stages material texture uploads with `renderer.initTexture`. Late
textures assigned by render callbacks, model installation, geometry uploads and
GLTF decoding can still cause stalls. Limiting download concurrency alone does
not bound the main-thread work when many promises finish together.

Bake immutable masonry, water depth masks and cloud volumes during the asset
build. The worker removes main-thread castle generation, but precomputed assets
could remove that generation cost entirely. Validate generated data against the
authoritative terrain and preserve exact geometry and shoreline masks.

The retained changes remove confirmed CPU waste. They do not certify stall-free
cold spawning across GPUs, resolutions, saved worlds or remote networks.


## Implemented follow-up: prepare the spawn view before revealing it

`FriendsWorldArrival` now displays the wire hologram while `FriendsShaderWarmup`
prepares visible spawn-camera materials against the actual HDR capture and scene
lights. Discovery respects visibility, camera layers and frustum culling, and
rechecks streamed meshes and camera changes. Dormant off-camera world work does
not compete with this preparation. The full shaded capture starts once local
programs and queued textures are ready; it does not wait for the whole island.

Initial preparation allows eight outstanding object batches, uses nonblocking
KHR readiness checks for both transparent sides, and prepares uniform/attribute
reflection only after readiness. Discovery and submission use separate soft
2 ms CPU budgets. A single driver call cannot be interrupted and may exceed
those budgets. Texture uploads are staged one per update, shared images are
reused, and changed texture versions are revisited. Render-target textures are
excluded. Existing background preparation retains its one-batch behavior.

The first 12-second preparation timeout was rejected: the cold stress test still
had pending shaders and its fallback concentrated an 18.2-second stall into the
first shaded capture. The accepted timeout is 30 **wall-clock** seconds and the
terrain sequence's fallback cannot override shader readiness earlier. Browsers
without KHR support retain the original drawing path. Disposal and context
restoration cancel/invalidate preparation without uncancellable polling timers.
An already prepared view stays ready during incremental rechecks unless new
work is found, so rechecks cannot continually reset the reveal settling timer.

The production profiles below run sequentially, with the menu renderer excluded.
Cold runs add a unique zero-valued uniform expression to fragment sources; they
stress compilation and do not predict a particular player's join time.

| Capture | Largest main-thread long task | Largest frame gap | Preparation fallback |
| --- | ---: | ---: | --- |
| Original production baseline | 6,787 ms | 9,033 ms | Original path |
| Initial 12-second candidate, rejected | 18,215 ms | 18,199 ms | Yes |
| Revised candidate | 1,369 ms | 6,799 ms | No |
| Final production repeat | 1,442 ms | 7,833 ms | No |
| Original-path control repeat | 8,629 ms | 10,599 ms | Original path |
| Ordinary cached candidate smoke | 1,229 ms | 1,332 ms | No |

The strongest measured benefit is reducing the largest main-thread block. Cold
frame gaps remain substantial. The final cold repeat also had 129 frame gaps
above 100 ms, versus 14 in the control repeat, and did not establish a consistent
whole-session FPS gain. System load and driver scheduling varied considerably;
the ordinary cached smoke settled to approximately 16.7 ms frames. These results
do **not** certify a stall-free join or an overall speedup across devices. The
control repeat used the current source with the original warmup/arrival modules
substituted by a Vite load plugin, without overwriting workspace files. All
captures are retained as `spawn-shader-*.json` under the artifact directory.

Thirty-six focused tests passed. They cover initial-view selection, bounded concurrent batches, delayed
readiness, incremental rechecks, texture reuse/version changes, both transparent
sides, fallback timing, scene restoration and cancellation. The production build
and whole-workspace TypeScript check passed. The existing bundle-size advisory
remains.

`guest-shader-validation/checks.json` records a connected host and guest using
the actual arenas over local WebRTC. Both completed initial preparation without
fallback or preparation errors, installed masonry and finished arrival. Both
had WebGL error 0. The guest moved approximately 274 units; authoritative ticks
advanced from 413 to 540, and no runtime exceptions were reported. This uses
render scale 0.5 with sun shadows disabled and checks functionality, not guest
performance. Final rendering was visually inspected in the cached smoke image.
