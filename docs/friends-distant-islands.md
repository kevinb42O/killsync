# Outer island scenery

The Sunline horizon includes Crownreach (castle terrace and mountain ridge),
Silverpine and Dawnspire (unequal snowy ridges), Emberwake (broken volcanic
crater and lava flow), and Verdant Keys (low wooded hills). Shapes and placements
live in `src/game/world/FriendsOuterIslands.ts`; the same height field supplies
terrain streaming and collision. Crownreach masonry shares its terrace site
with the visual castle.

`FriendsFrontierVisuals` owns `FriendsDistantIslands` and its disposal. Island
land hands off to streamed terrain through the existing coverage mask while
static tree and castle dressing stays visible. There are six meshes in the
standalone scenery, or eleven when coverage separates terrain and dressing.
Each culls independently and neither casts nor receives shadows.

The scenery uses asymmetrical headlands, coves, foothills and unequal summit
spacing. A submerged apron extends the mesh below the water. Terrain normals
blend height-field gradients with some rock faceting; per-vertex grass, rock
and wind-scoured snow colors replace flat altitude bands. Trees form small
groves. A distance-haze shader follows the world's existing fog color. Geometry
colors are normalized bytes rather than floats to keep memory bounded.

`FriendsOuterIslandWater.ts` supplies a single generated shoreline atlas to
`FriendsIslandOcean`. The original main-island bathymetry retains its resolution.
Each outer island has a 96×96 tile containing depth, coast distance and seabed
gradients. RGBA16F data supports one hardware-filtered lookup inside the outer
coast bounds, using 368,640 bytes total. Shallows and foam run in the existing
ocean pass, adding no meshes or reflection/render-target passes. The near and
far ocean share and dispose the atlas with their owner.

Emberwake has radii 9,400 × 6,900, a 6,100-unit height parameter, and center
(-17,500, 21,500). Its coast-facing crater breach carries an orange/gold flow;
lava samples the rendered terrain triangles to avoid crossing steep facets.
Crownreach's castle occupies a lower terrace, with the ridge behind it.
Silverpine's placement gives the western coast a view of several islands at
different distances. Dawnspire's rotated spine opens its ridges to the eastern
coast. Verdant Keys has broad low hills rather than another central mountain.

Budgets are enforced by `FriendsDistantIslands.test.ts` (under 15,000 triangles
and 1.5 MB of geometry) and `FriendsOuterIslandWater.test.ts` (under 380 KB for
shoreline data, with dry land, shallows and deep water in every tile). Scenery
creation generates all geometry and atlas data once; islands have no animation
update loop. Existing streamed terrain retains its own cache/work budgets.

Validation commands:

- `npx vitest run src/game/rendering/FriendsDistantIslands.test.ts src/game/rendering/FriendsOuterIslandWater.test.ts src/game/rendering/FriendsIslandWater.test.ts src/game/multiplayer/FriendsFrontier.test.ts`
- `npm run lint`
- `npm run build`
- With Vite on port 3014: `node tools/test-friends-distant-islands.mjs`
  (override with `FRIENDS_TEST_ORIGIN`; disable HMR during capture).

The browser review captures all five islands, a closer castle shore, and
volcanic dusk/night views. It then freezes simulation/streaming and alternates
islands and their shoreline atlas on/off with GPU synchronization. Screenshots
and the latest hardware-specific measurements are in `artifacts/distant-islands/`.
Measurements exclude simulation and streaming; small positive or negative timing
deltas amid run-to-run noise are not an FPS guarantee.
