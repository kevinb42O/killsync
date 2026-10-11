# Belvedere seaside pier

The northwest beach near spawn now has a large pleasure pier inspired by
[Belgium Pier in Blankenberge](https://www.visit-blankenberge.be/en/belgium-pier)
and [B-juxta's restored concrete promenade](https://b-juxta.be/projects/gangway-pier-blankenberge).
These are architectural references; the new game geometry is authored locally,
not a downloaded scan or an exact replica. The pier is scaled to the island.

The promenade begins at (4368, 4160), heads northwest, and extends 3600 world
units to a circular terrace of radius 640. The 384-unit-wide walkway connects
to a glazed rotunda with a copper-coloured dome, wraparound terrace, cafe
furniture, benches, marine piles, layered cornices, lanterns and railings.
The beach landing is -92 (four units above the beach); a flat entrance apron joins a gradual ramp to the
main deck at 96, above the sea datum of -168.5.

`FriendsSeasidePier.ts` defines the shared placement, ramp, walking floor and
railing/facade collision. The pavilion entrance faces land and remains open.
`FriendsSeasidePierVisuals.ts` constructs the architecture and batches it by finish. The materials use the existing procedural
surface grain from `FriendsRailwayFinish.ts`; the downloaded chair includes its own local PBR maps. Its resources are owned and released by `FriendsFrontierVisuals`.

The original Poly Haven timber dock is preserved on the western beach at
(2592, 5800), extending west. Its local CC0 asset and license live in
`public/models/friends/coastal-pier/`.

Validation:

- `npm run lint`
- `npx vitest run src/game/world/FriendsSeasidePier.test.ts src/game/world/FriendsCoastalPier.test.ts src/game/rendering/FriendsAssets.test.ts`
- `npm run build`
- `node tools/test-friends-coastal-pier.mjs` with Vite at port 3014

The simulation checks walk from the beach across the ramp and promenade into
the pavilion, deck support across the circular terrace, and solid facade/rails
with open entrances. Browser captures cover the promenade, pavilion, interior,
beach approach, overall coastline and retained dock in `artifacts/coastal-pier/`.

The café has 22 instanced upholstered [Dining Chair 02](https://polyhaven.com/a/dining_chair_02)
models by James Ray Cock (Poly Haven, CC0), embedded with 1K textures in
`public/models/friends/pier-interior/chair.glb`. The shared layout defines
chair positions, facing directions, seat height and standing exits. F sits or
stands; jump stands; occupied chairs cannot be claimed twice. Seats use the
existing quiet-place pose, camera, host simulation and player replication.
They remain available when older saves disable optional retreat sites.

Interior finishes include a checkerboard tile floor, brass borders, timber
ceiling, ring chandelier, pendant shades, upholstered chairs, ceramic tableware,
flowers, potted greenery and a service console with a framed menu. The entrance,
central aisle and all seat exits remain clear.

All 36 promenade/terrace supports sample nine terrain columns across their
footprints. Their bottoms extend 96 units below the lowest sampled seabed,
with wider buried footings, rather than ending at a uniform water depth.
Tests check every support, every chair, F/jump interactions, occupancy and
replicated seating, as well as the original ramp and facade checks.

Performance and depth fixes: the promenade and terrace share a union outline
and one exposed floor surface. The tiled interior is a shader pattern on that
same surface, with no stacked tile planes or pavilion pedestal cap. Window
panes are single, double-sided planes with depth writes disabled, rather than
transparent boxes. Architectural batches cover landing, promenade and pavilion
zones and use welded indexed vertices. Chair instances are compacted between
two batches: the original scan within 180 units and an offline simplified,
textured 2,378-triangle scan farther away. `tools/build-pier-chair-lod.mjs`
rebuilds that LOD locally from the original GLB. Floor queries stop once they
cannot beat a known platform/deck, while preserving higher terrain edits.
