# Sunline Frontier — playable rebuild

Implemented in the current working tree; updated 6 October 2026. This document describes
shipped behavior; FRIENDS_FRONTIER_PLAN.md retains the broader design targets.

## Play

Launch Friends mode. Solo Practice uses the same authoritative simulation as a
multiplayer host. Starter supplies let you build immediately; construction now
requires materials rather than tactical charges or unlimited free pieces.

- **1:** axe; hold primary action at a nearby trunk. Four hits yield timber and a sapling.
- **2:** pickaxe; mine stone, copper and iron. Exposed seams are inside Copper Hollow.
- **3:** shovel; remove soil, including beneath your feet. There is no invisible zero-height floor.
- **4:** earthwork; place collected soil against an exposed surface.
- **5:** combat equipment.
- **G:** field pack, recipes, shared storage, cargo and expedition journal.
- **B:** construction, including your own workbench, furnace, storage, landing platforms and straight/curved railway tracks.
- **M:** live full-world atlas; switch to the detailed railway view.
- **F / configured interact:** helicopter cockpit controls.

Cut timber, excavate, smelt ore, reinforce crew tools and build useful remote
infrastructure. Supply orders alternate between your own workshop, Copper Hollow, Cedar Reach,
Highfall Ridge and the Long Shore. Remote deliveries consume carried materials
at the destination. Rewards fund metal construction. Survey caches are collected
once per world; planted trees can be harvested and replanted repeatedly.

## World and presentation

The world extends to 48,000 × 48,000 simulation units, displayed as 4 × 4 km by
the existing game's distance convention. Mountains, forest and a coast surround
an open basin. The old starting settlement, automatic railway, station floors, public services, painted paths and landmark walls are removed. Saved player construction remains. The helicopter can travel throughout these bounds.

Build straight (2 timber + 1 stone) and curved (4 timber + 2 stone) track in **B → Railway**. Matching endpoints snap together with continuous position and tangent. Tracks require level ground or a supporting bridge along their whole span. Cut trees along the corridor first. Crossings, branching and floating tracks are rejected.

Stand within 280 units of your track and choose **G → Rail cargo → Assemble train on my track**. Assembly costs 8 timber, 12 planks and 4 ingots, paid from your pack or shared storage. The locomotive starts held. Longer track adds up to three open cargo carriages with walkable gangways. Open lines shuttle at their ends; closed loops continue around. Hold/Depart controls operate beside the train. Step everyone off and dismantle before removing or moving track in use; train materials return to shared storage and cargo remains available to the next train.

Editable voxel ground is shared by simulation, local prediction and rendering.
A dedicated worker generates exposed chunk faces; only nearby detailed chunks
remain loaded. The persistent horizon is spatially culled and generated off the main thread.
Detailed editable chunks replace individual coverage cells only after loading,
with complementary screen dithering during altitude transitions. Underground
geometry stays detailed.

About 30% of sampled world cells support woodland; broad meadows separate dense
regional forests. Distant forests remain present throughout the full map using
8-angle images baked from the same imported meshes. Detailed models crossfade
between 800 and 1,600 simulation units of camera distance. Forest batches have
independent frustum bounds, share GPU geometry/textures and update harvested,
planted and excavated tree positions. Nearby scenery uses instanced meshes;
player tracks are rendered as instanced steel rails and timber sleepers. Detailed tree
shadows are local, and the sun shadow map refreshes at most ten times per second.

Locally bundled ambientCG PBR ground, rock and wood maps combine with new
Quaternius textured pine, birch, maple and bush GLBs. Their alpha-tested leaves
and bark normal maps replace the large frontier's previous simple tree forms.
Soft sun shadows, procedural clouds, actual water surfaces, textured construction,
physical utility details, actual Kenney Survival Kit tools and impact sounds finish the presentation.
See the asset folders' README.md and License.txt files for exact provenance.

## Persistence and multiplayer

The host validates reach, tool cooldown, pack capacity, permissions, recipes,
construction costs, actor occupancy, protected spawn points and cargo transfer range.
Duplicate reliable requests cannot spend or pay twice. Undo, redo and finish
changes preserve material accounting; dismantling refunds shared storage.

World exports and automatic saves include sparse terrain edits, harvested/planted
trees, packs by normalized callsign, shared stock, cargo, upgrades, discoveries,
orders, builds, player-laid rails and the assembled train's route anchor, position, direction and held state. The helicopter's exported pose is deliberately ignored on entry: it returns to its designated ground spawn with no pilot. Joining, recovery and world import also reset it; standing crew are carried safely back and platform momentum is cleared.
Older saves retain their pieces and excavations, with localized circular grading preserving their original ground elevation. Legacy building-only saves also clear terrain intersecting their pieces without issuing resources. Importing a world invalidates prediction/mesh caches.
A synchronous browser mirror plus previous-save fallback and IndexedDB backup
provide the existing local storage model. Export remains the portable backup.

Protocol 40 includes frontier tool inputs and reliable supply requests. Compact
snapshots and bounded packet assembly support late joining a saturated world.
Both peers must reload to use the same protocol version.

## Verified behavior

Automated checks cover negative excavation floors, cave ceilings and mesh winding,
real input-driven mining without gun-ammo consumption, competing harvesters,
permissions, capacity, soil restoration, renewable trees, resource conservation,
crafting, undo/redo, remote deliveries, cargo, saves, pilot release and saturated
late-join packet assembly. Existing train/aircraft, movement, combat and asset
checks remain in the suite.

Browser checks of the latest build cover removal of the authored settlement and the actual instanced curved tracks with a train running on them. Earlier field-pack and reload checks predate the removal of the free public workshop; crafting now requires a player-built utility.

## Current limits

- One deterministic geography. Per-world seeds and alternative authored regions are future work.
- Tracks currently support level straight segments and quarter turns, one assembled train, open shuttle lines and closed loops. Graded track, switches and multiple trains are future work.
- Water is a visual/shallow-wading surface; it has no fluid simulation.
- Excavation uses 32-unit voxels and up to 6,000 simultaneous sparse edits. Restoring original soil removes its edit. Bedrock prevents digging through the bottom.
- The settlement budget is 1,024 pieces; forestry records up to 12,000 wild trees and 256 active planted trees. Harvested planted trees release their active slot.
- Packs persist by callsign, not authenticated account identity. This is a friends co-op economy.
- Saves are local to the host. There is no always-running dedicated world server.
- Manual browser playtesting used a solo host. Network behavior was verified through simulation, protocol and packet tests, not a second physical device.

## Persistent block terrain and volumetric clouds

The distant horizon now samples the same 32-unit voxel columns as the simulation.
It never substitutes a smooth mountain mesh. Greedy merging joins coplanar faces
without changing terraces or silhouettes; tiles retain independent culling bounds.
A worker builds the full surface, with indexed vertices, packed local coordinates
and normalized byte normals/colors to reduce resident mesh data.

Clouds are world-space, ray-marched cumulus density volumes with irregular lobes,
wind, depth, sunlight and darker interiors. The painted sky-cloud noise is removed.
The aircraft can pass through these volumes. Horizon checks verify exact grid
alignment, winding, greedy face merging and continuity across tile boundaries.

## Render review

With Vite running, `/tools/frontier-review.html` loads the actual frontier renderer
with selectable valley/forest/ridge/coast views and an automated flight path.
It reports FPS, draw calls and triangles without connecting to a multiplayer
session or changing a saved world. Browser observations before the final GPU
resource-sharing fix showed around 27–34 FPS at 1280 × 800 in the embedded
browser. The embedded browser subsequently timed out; the final build has not
received a reliable hardware frame-rate measurement. Do not treat these earlier
readings as a benchmark of the completed changes.

Cloud placement is now a scattered, seeded weather field with irregular spacing,
independent widths/heights/depths, varied altitudes and per-cloud lobe/noise seeds.
Wind moves the full density volumes and their soft projected shadows together.
Ground and nearby trees sample a single static 512-pixel shadow texture with a
moving UV offset; cloud shadows require no additional shadow-camera pass.

Final checks on 6 October 2026: TypeScript and the production build pass. The full suite passed 585/585 tests across 86 files with a 30-second timeout. The production build retains its large entry-bundle warning (approximately 2.44 MB before gzip). A browser render review confirms the removed settlement and player-built curved railway; it is a development fixture, not a multi-device network playtest.

## Natural terrain through the former settlement

The former 8,900 × 8,600-unit flat rectangle no longer participates in generation. The world’s rolling height field now extends through the old settlement, with matching voxel surfaces in simulation, prediction, nearby chunks and the persistent horizon. Arrival and helicopter support use small circular blends at native ground elevation. The dry hollow and mining cave follow the surrounding terrain elevation; the former spawn-area water has been removed. Forests and meadows retain the same regional distribution.

Terrain generation 2 saves record localized circular grading only when importing older player builds, planted trees or excavated columns. These footprints preserve original elevations and blend back into natural terrain; empty portions of the old rectangle regenerate normally. Grading persists across saves and late joins without repeating migration. Horizon workers and vegetation both consume the preserved footprints. Vegetation support uses two voxel samples instead of scanning vertically. Saturated late-join packet checks include the migration data.

The refreshed valley render review confirms continuous terraces, irregular woodland and the dry hollow through the former settlement. Terrain integration tests cover all four former boundaries, elevation variation, safe spawns, legacy edits/builds, repeat loading, horizon agreement and malformed saves.

## Current playtest rules and the Lantern Descent

Friends worlds currently enable free construction, paint/move/undo/redo, earthwork and train assembly. Dismantling free pieces does not manufacture resource refunds. Field packs, shared inventory and train cargo have no gameplay carry cap; finite safe-integer quantities still round-trip through validated saves. The construction palette and field pack show the testing rules. Workshop recipes retain their resource behavior, and permissions, support checks and entity/terrain budgets remain active.

The Lantern Descent lies northeast of arrival at (6384, 5152). Its open sinkhole has a stepped northern rim and a deeper central shaft with a lower escape tunnel. Seven connecting routes form a return loop through six chambers: Lantern Vestibule, Hall of Echoes, Split Cathedral, Blue Vault, Root Gallery and Silent Well. The cathedral has a real suspended stone crossing over a floor at −416, with large vaulted ceilings, solid pillars and routes beneath the overlook. Cave voids, stairs and support surfaces are simulation terrain; they remain mineable and buildable. The atlas marks the entrance and the HUD names underground chambers.

Forty-seven cave torches plus three approach torches use instanced posts/flames, restrained flicker, six nearby light pools, static vertex bounce illumination and one cached torch shadow. Two deep beacons make the cathedral shaft readable. Underground rock suppresses sky fill and directional sunlight. Mineral clusters, drifting dust and dark distance fog add depth cues. The whole cave footprint remains meshed while exploring. Greedy volumetric meshing merges coplanar faces while retaining exact collision cells, excavation faces and face winding. Migrated builds retain two solid foundation layers over new cave voids.

Verification: all 638 tests across 94 files pass with two workers and an extended test timeout; TypeScript and the production build pass. Cave checks cover the sinkhole, tall chambers, a crossing with separate lower floor/ceiling, connectivity through jump-sized steps to every room, supported torches, excavation persistence and greedy mesh winding. Testing checks cover empty-inventory construction, undo/redo, absent refunds, uncapped harvesting and large train shipments. The production bundle remains large (about 2.49 MB before gzip). Browser frame-rate readings during shader compilation and concurrent local work are not a stable performance benchmark.


## Terrain rendering repair · 6 October

Reviewed the supplied recording and reproduced a deep excavation from an upgraded save in the render review. Near voxel terrain and the persistent surface horizon now use distinct shader cache keys for their complementary visibility masks. Both layers sample coverage inside the solid face, so walls on 512-unit chunk boundaries select their owning chunk consistently. Sunlight shadow projection snaps in light space to whole shadow texels, with a modest bias to limit self-shadow artifacts.

Removed the old water mesh from the arrival region, its atlas overlay, shallow-water HUD and movement slowdown. The dry hollow retains its existing ground elevations so saved structures are not buried by this repair. The distant coast remains. Arrival and helicopter vegetation clearances no longer block excavation or earthwork. Saved-build protection uses real shape boxes and only the immediate supporting voxel; adjacent ground and deeper tunnels remain editable.

Verification: all 647 tests across 97 files pass, including shadow projection, terrain coverage and excavation regressions. TypeScript and production builds pass. The render review includes an isolated synthetic legacy excavation and shadow/normal-map diagnostics; it never changes the user's saved world.

Peers must reload together: protocol 41 prevents old spawn-excavation and water rules from mixing with the repaired simulation.
