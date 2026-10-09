# Connected excavation flooding — implementation plan

Status: implemented on 10 October 2026. See [implementation and verification](friends-connected-flooding-implementation.md).

## Outcome and scope

Removed terrain blocks connected to an existing lake or the sea fill up to that body's fixed water level. Further connected excavation extends the water. Isolated holes and openings above the source level remain dry. Soil replacement blocks the connection.

This first version treats the existing lakes and sea as persistent sources. Their levels never change. Flood state is derived from current terrain connectivity, rather than stored as a quantity of fluid.

Chosen initial behaviour: sealing the only connection makes the disconnected excavated region dry. There is no trapped-water retention or gradual drainage in this version. A connected region settles directly to its source level; a short visual fade may soften its appearance, but does not change gameplay timing.

The flood domain contains player-excavated empty terrain cells. Existing wet areas are source boundaries, not regions to scan. Unedited natural cave systems do not enter the flood domain automatically. Rivers, cascades, pumps, flowing currents, lake depletion, changing sea levels, dry-land wave run-up, and water trapped behind dams are outside this version.

Terrain soil/block replacement is a water barrier. Construction pieces such as timber walls are not watertight barriers in this version.

## Findings in the current code

- `FriendsTerrain.material(vx, vy, vz)` resolves edits before natural voxel material. `set()` increments the terrain revision. Excavation, soil replacement and dynamite already use this path.
- Terrain snapshots already persist and replicate edits, with a current 6,000-entry edit limit. The flooding implementation should use that bound rather than introduce a world-wide voxel scan.
- `FriendsWaterSurface.ts` samples natural ground and predefined hydrology. Its current queries do not receive the editable terrain instance.
- Island water bathymetry is built when visual meshes are created. Terrain mesh invalidation does not currently update that water data.
- Swimming and underwater rendering use two-dimensional water-level queries. Dynamic excavations require a height-aware occupancy query so that a dry space below or above a wet cell is not incorrectly treated as submerged.
- `FriendsFrontierVisuals` already compares terrain revisions, restores terrain snapshots and invalidates affected terrain chunks. This is the renderer integration point.

Keep the recent water appearance and coastal shorebreak. Add excavation flooding alongside the existing natural-water system.

## 1. Shared flood field and solver

Add a proposed `FriendsFloodWater.ts` module with no Three.js dependency. Each world owns an instance; do not introduce mutable global water state.

Build a sparse set of candidates from terrain edits whose recorded material is air and whose live material remains empty. Use the existing 32-unit voxel coordinates. Source tests examine the six face neighbours of each candidate.

A natural source is valid only where the neighbouring space:

1. Belongs to the sea or a fixed-level lake.
2. Is actually empty according to live terrain collision data.
3. Intersects that source's original wet interval, between its natural bed and water surface.
4. Shares an open face with the candidate below the source surface.

A nearby lake alone is insufficient. In particular, a cavity underneath a lakebed must not become a source through solid ground.

Propagate through candidate cells using six-face connectivity. Corner and edge contact do not connect water. Only the portion below the source's exact surface elevation is wet; the top cell may be partially filled. Above-water connections do not carry water across an otherwise dry gap.

Use deterministic source and neighbour ordering. If excavated cells can reach multiple sources, the highest physically reachable fixed source level wins, with a stable body-ID tie-break. Do not overwrite or change the levels of existing natural water bodies. Existing water areas remain terminal boundaries; they are not graph traversal shortcuts.

Cache candidates, source adjacency and component membership. A terrain edit invalidates its local graph neighbourhood; blocking a bridge between components requires checking the formerly connected component for remaining sources. A full sparse rebuild is an acceptable bounded fallback for restoration or a large edit batch.

Expose both:

- A height-aware sample/occupancy query for submerged characters and cameras.
- An exposed-surface query for visible top water, depth, and consumers that need a water surface.

Each result retains source body ID and fixed level. Query depth must account for the edited bed rather than reuse the original terrain height.

## 2. Terrain-edit lifecycle

Integrate at the shared terrain revision/change path, not only the shovel input handler. Cover mining, filling, dynamite batches, restoration and any grade change that alters terrain occupancy.

Batch explosion changes and recompute once per batch. No flood graph traversal belongs in the normal render-frame loop. Normal steady-state water queries should use cached results.

Start with synchronous affected-component updates within the bounded excavation domain. Measure the worst case before choosing a worker or a time-sliced queue. If asynchronous rebuilding is necessary, tag results with their terrain revision, discard stale results, and define a committed terrain/water state so that partial searches cannot expose speculative wet cells.

Reconstruct the derived field on world load and after authoritative terrain restoration. Match the existing terrain generation and edit validation; do not change the saved terrain format merely to store redundant flood state.

## 3. Rendering

Add a proposed `FriendsFloodWaterVisuals.ts` owned by `FriendsFrontierVisuals`.

Build exposed water faces only for flooded excavation cells, grouping geometry by affected terrain chunk and source body. Hide internal faces and faces against solid terrain. Fully submerged cells need occupancy for gameplay but do not need an internal horizontal water plane through their middle.

Use the existing water palette, lighting and transparency approach. Flooded water beside a lake should visually match that lake. Keep wave displacement near the narrow bank opening small enough to stay inside the cavity; ocean shorebreak should remain on the natural coast rather than propagate into excavated trenches.

Coordinate natural-water coverage and dynamic faces so that the same visible surface is drawn once. Update local depth/coverage data when excavation changes a shoreline. Verify the seam at the original bank, where the current static masks are most likely to leave holes or overlapping translucent surfaces.

Reuse chunk buffers/materials where practical. Rebuild only dirty flood geometry. Dispose replaced geometry and restore masks when cells are refilled.

## 4. Gameplay, multiplayer and saves

Connect swimming and underwater camera effects to the height-aware water field. Check movement across the original bank into the new flooded space, partial top cells, deeper stacked excavation and emergence into dry air.

Review surface consumers such as boats, fishing and loose objects. Route them through the shared surface query where appropriate; collision still prevents a boat from fitting through a one-block opening. Leave natural river movement unchanged.

The host remains authoritative for terrain edits and gameplay. Host and clients use the same deterministic flood solver against the same accepted terrain revision. Reconstruct from existing replicated terrain edits rather than send one water update for every flooded cell.

Late join, full terrain repair, save reload and host restoration must reconstruct the same field. If measurement requires asynchronous client reconstruction, add an explicit revision/commit contract before enabling the feature; do not assume that a worker eventually catching up is sufficient for consistent underwater feedback.

## 5. Verification and rollout

First implement the solver and its tests without enabling it in gameplay. Then enable a controlled excavation review scene. Integrate gameplay and multiplayer after connectivity and rendering checks pass.

Required scenarios:

- A single removed bank block fills only when connected below water level.
- A connected trench extends the flood; an isolated trench remains dry.
- A diagonal opening and an above-surface connecting passage remain dry.
- A solid wall, floor and ceiling prevent unintended connectivity.
- Stacked removed cells fill only below the exact source height.
- Closing the only inlet dries the component; a second inlet keeps it wet.
- Reopening the inlet restores the same result.
- Connection to an unedited cave does not trigger world-wide flooding.
- A trench between different fixed-level sources has deterministic ownership without changing either natural body's level.
- Soil placement and dynamite batches invalidate the correct components.
- Save reload, late join and terrain repair agree on flooded cells and source levels.
- Swimming, underwater effects and rendered water agree at the opening.
- Natural lakes, rivers, boats and coastal shorebreak retain their existing behaviour.

Render checks should include shallow and deep openings, daylight/nighttime, viewing from inside the hole, crossing chunk boundaries, and repeated dig/refill cycles. Check for duplicate translucent surfaces, cracks, water inside solid blocks and leaked GPU resources.

Benchmark a single removal, a long trench, removal of a connectivity bridge, a dynamite batch and a near-limit edit snapshot. Record solver time, allocation count, added draw calls, geometry memory and GPU render time. Set update budgets from measurements; do not silently truncate a connected region and present it as fully solved.

Acceptance: ordinary bank excavation consistently fills the connected empty cells; above-level and isolated excavations stay dry; sealing/reopening works; gameplay and multiplayer agree; steady-state graph work is zero; and edit processing remains bounded by the sparse excavation domain.

## Effort and risk

This is a medium-sized cross-system feature, not a complete world or water-renderer refactor. The main integration work is the shared live water query, three-dimensional connectivity, and the natural/dynamic shoreline seam. Multiplayer can reuse existing terrain replication, but still requires explicit parity and restoration tests.

Implement in five reviewable stages: solver, edit lifecycle, rendering, gameplay/multiplayer, and regression/performance validation. Avoid expanding into fluid volumes, drainage, natural cave flooding or watertight player-built structures during this implementation.
