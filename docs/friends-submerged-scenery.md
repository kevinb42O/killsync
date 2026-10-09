# Submerged scenery and deeper ocean

The game now dresses natural lakes and the sea with deterministic rock clusters,
small stones, aquatic leaf tufts and rare weathered sunken logs. Lakes use shorter
olive vegetation; the photic ocean uses taller kelp-like tufts and cooler rocks.
Deep ocean beds retain rocks and occasional timber without vegetation.

`FriendsSubmergedDressing` is created lazily by `FriendsUnderwaterVisuals` when
an active Friends camera is submerged or the local player is swimming. The
production renderer passes the replicated local swimming flag, allowing scenery
to appear when the swimmer's eyes sit above the waterline. Natural water ownership,
actual collision floors and construction/excavation checks govern placement.
Decoration is cosmetic and has no collision, network or persistence state.

On land the root is hidden: zero scenery draws, animation updates or placement
queries. Cached buffers remain allocated after the first swim to avoid re-entry
allocation spikes. All instances share three geometries and three materials:
363 rock slots, 484 plant slots and 121 timber slots, with unused slots collapsed.
The 11-by-11 rolling tile region retains overlapping tiles, prioritizes nearby
new tiles, and places at most 12 candidate tiles per frame with a soft 1.5 ms
budget (a single tile finishes before yielding). Once settled, only the shader
clock changes; instance buffers are not uploaded again until the region or
terrain changes. Vertex sway runs on the GPU. Geometry gradually settles into the bed at the outer boundary, avoiding
noisy transparency and extra fragment work. Terrain edits and 256-unit vertical travel bands invalidate local tiles.
Standard materials receive the existing underwater absorption/caustics.

Ocean terrain preserves the first 650 world units of coastal shelf. A smooth
continental slope deepens across the next 3600 units into undulating basins,
reaching approximately 3447 world units / 287 metres below sea level. The shared
world bottom is -4096. Collision, edit validation, flood-column bounds, volumetric
and block-horizon meshes use that limit. Sea-stack terrain now blends into the
local seabed instead of imposing a -352 floor across the entire ocean. Lakes,
river water levels and the sea datum remain unchanged. Ordinary horizon tiles
still omit hidden sea floors, keeping offshore detail in local streamed meshes.
Volumetric chunk bounds start from actual column extents so a deep flat bed does
not mesh a tall column of empty air up to the previous world bottom.

Preview: `/tools/submerged-review.html` has lake, sea, abyss, swimming and scenery
comparison views using the actual world height/water fields. The full-world
`/tools/river-review.html?view=underwater_sea` verifies streamed terrain integration.
`tools/test-submerged-dressing.mjs` records real-world views, isolated GPU timings,
three added wet draw calls, land gating and stable geometry/texture allocations.
Lifecycle, bounded placement, determinism, construction exclusion and ocean
collision/mesh tests live beside the implementation.
