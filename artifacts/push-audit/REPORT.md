# Review of the three October 9 pushes

Reviewed `8e2cf39`, `05f105d`, and `6929c7a` against their parent `ada4b40`. The local checkout matched `origin/main` before edits. All three GitHub Vercel statuses report successful production deployments. The individual deployment URLs redirect to Vercel authentication, so runtime validation used local development and production builds.

## Verified findings and fixes

- **Dock rendering cost:** The new lake docks/platform contained 198 separate static meshes. Batched geometry by material reduces these to 18 meshes while retaining their geometry, materials, and world placement. A regression assertion checks all three groups' mesh budgets and finite geometry.
- **Terrain sampling cost:** The dock landscape cuts previously called `Math.hypot` three times for every surface sample, including distant terrain. Cheap bounds and squared-distance checks now reject samples outside the cuts.
- **Underwater audio retry loop:** `load()` absorbs fetch/decode errors, but its completion callback unconditionally restarted loading. Continue only when the buffer exists. A test verifies one failed request, no loop, and a successful retry on a later dive. Visibility resume also synchronizes a pending dive sound.
- **Large fish throw collision:** The new size range extends to 4.2×, but release height stayed at 22 units while collision radius scales with size. Large fish immediately landed. The release now includes clearance for their scaled radius. Small, median, and maximum-size tests cover dropping, picking up, throwing into water, and swimming away.
- **Held fish pose:** `05f105d` changed the fish from side-on to head-on. Browser images show its tail concealed behind the body. Restore the side view and raise the fish above the palms; visually verified in `fish-fixed.png`.
- **Second boat integration:** Shared seat detection now includes both boat IDs throughout quiet-seat presentation, remote firearm visibility, and stone throwing. The wide map includes both boats. Confetti presses while rowing are consumed without spawning bursts on the boat or on dismount.
- **Confetti GPU cleanup:** Dispose the instanced mesh itself as well as its geometry/material, including the held confetti pile, to release instance attributes on teardown.
- **Production telemetry:** Campfire draw accounting was still gated to development after the FPS monitor was enabled in production. The production smoke check now reports actual campfire draws.
- **Test drift:** Updated expectations for two boats, the new maximum tool slot, and dismounting onto the boat's deck. Preserve marshmallow presentation's existing state-driven behavior when the optional local input argument is absent, while explicit local input still drives immediate reaching.

## Performance evidence

Local headless Chromium using Metal, 1200×800 viewport, render scale 0.7, shadows disabled, subtle effects. Each scene warmed for 10 seconds and sampled for 7 seconds. The baseline was a separate checkout of `ada4b40`; current code and baseline used separate Vite servers. This measures a specific local scene, not the user's actual browser/session.

| Lake scene | Before the three pushes | Latest deployed source | Fixed source |
| --- | ---: | ---: | ---: |
| Draw calls at sample end | 672 | 891 | 718 |
| Average render CPU time | 9.18 ms | 10.68 ms | 9.30 ms |
| GPU geometries at sample end | 527 | 729 | 556 |

The fixed source reduced sampled lake draw calls by 173 (19%) and average render CPU time by about 13% relative to the latest deployed source. Spawn stayed near 60 FPS in every local sample. Frame rates varied with browser scheduling and GPU load, so no general FPS guarantee follows from this comparison. The remaining lake scene still renders roughly two million triangles; a broader GPU bottleneck could remain on some devices.

Raw data: `profile.json` and `profile-fixed.json`. Scene contents are not completely frozen; time-dependent animation/culling can change counts slightly between samples.

## Validation

- TypeScript check: passed.
- Production build: passed; existing large-bundle warning remains.
- Full suite: 194 files / 1,582 tests passed with two workers. The first run at default parallelism exposed stale assertions plus three heavy-test timeouts; the same heavy tests passed in isolation and in the complete two-worker run.
- Final targeted boat/stone/retreat/confetti suite: 33 tests passed, including three new confetti tests.
- Browser fishing flow: actual mouse/keyboard input exercised cast, bite, reel, held fish, drop, pickup, release, cleanup, and existing tool shortcuts. No page errors.
- Local production smoke: FPS overlay toggling and finite stats; actual Fun-bar confetti interaction; second-boat camera and equipment stowing; rowing without accidental confetti. No page errors. See `production-smoke.json`.
- Held fish pose: visually inspected the before/side/raised variants and the final source render.
- Whitespace/diff check: passed.

Changes are local and uncommitted; no push or deployment was performed.
