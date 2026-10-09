# Connected rivers, diving and the Reedwater skiff

Implemented and polished 9 October 2026. Skyfalls Lake and the lake beneath the World Bridge / World Gate feed Deepmere; Reedwater connects Deepmere to the eastern sea. One shared, manually rowed boat carries two operators, each controlling one oar.

![Connected river network](../artifacts/river-design/placement.png)

## Geography and connections

Simulation coordinates use X/Y horizontally and Z up; rendering uses X/Z horizontally and Y up. The map labels use 12 units per metre. The branching river network is approximately **3.56 km** long: Skyfalls Run 854 m, Gatewater Run 981 m and Reedwater 1,729 m. Ordinary width controls range from 320 to 456 units; the World Gate mouth flares to 560 units before tapering into its narrow tributary. The banks contain a broader shallow fringe around the deep navigation lane.

Deepmere is centred at `(12128, 23600)`, with a nominal 433 × 367 m footprint, irregular shores and submerged shelves. Its surface is `154.5`; its deepest bed is `-416`, approximately 47.5 m below the surface. Skyfalls is at `666.5`, the World Gate lake at `602.5`, and the sea at `-168.5`.

The river begins and ends inside each basin. Level source reaches continue beyond the basin before descending. Bank raising is suppressed at flat lake joins: the river's rounded end must never acquire a dry retaining ring that separates it from its source. An outlet cuts through the lake shelf rather than adding a submerged dam. Both original lake interiors connect through Deepmere to the sea on a 32-unit navigation raster, with minimum depth and elevation-change limits, independently of centreline-only checks.

The World Gate retains its mountain roof. Where its flared roof lies above the mountainside, the cave mouth is open sky and the carved floor becomes the actual surface. Water depth follows the real voxel-cell ground, taking the lower of the exposed surface and cavity floor. Existing rail foundations and reserved structures retain their ground.

## Water appearance and floating-water fixes

Rendering, swimming, boats and shoreline ownership use `FriendsWaterSurface`. Every wet point has a single lake, river or sea owner. Lake and river bathymetry masks share a world-aligned **32-unit texel grid**, matching terrain cells. Nearest filtering prevents positive depth from being interpolated across a dry cliff, and matching grids prevent independently sampled masks from leaving gaps at lake mouths.

River ribbons sample elevation across their width, with four lateral strips per segment. Wider geometry covers the shallow fringe while the shared depth mask clips it to solid banks. Common world-space waves keep level lake joins aligned; near the estuary their amplitude blends into the ocean. Downstream ripples and whitewater streaks supply the livelier tributary appearance. Lakes, rivers and ocean respond to the existing daylight cycle.

The two Skyfalls cascades have carved beds and containing banks. Their elevations follow the original mountainside, with four lateral strips and 16-unit longitudinal segments. Each steep collision cell is carved below the lowest water elevation crossing it, preventing stepped terrain from breaking the sheet into floating sections. The shared ownership mask transfers each cascade into Skyfalls Lake at the basin datum. Mist remains a small, bounded set of reused planes.

Deep freshwater beds remain rendered below `-192`. That optimization now applies to hidden ocean floor, so divers can see Deepmere's bottom and submerged river terrain. Underwater presentation uses depth-dependent distance fog, daylight-scaled teal colour and a restrained lens tint. Fog and tint blend in over the first 24 units of camera immersion. Looking upward shows a rippled Snell's window: overhead daylight transmits within the critical angle, with darker underwater reflections outside it. Banks, hulls and bridge supports remain visible as silhouettes through the window. The separate above-water cloud pass is suppressed underwater, so clouds cannot paint over those reflections. This adds one screen triangle without another scene render or reflection target.

## Swimming and diving

The host and local prediction use the same fixed-step controller and replayable movement state.

- **Move** swims horizontally at the surface. Underwater, forward/back movement follows the camera pitch; strafing stays horizontal.
- **Ctrl / crouch** dives; **held Space** rises. Neutral underwater input holds depth after momentum settles.
- At the surface, a fresh Space press makes a small hop to clear a bank. Holding the same press does not repeat the hop or turn into an underwater jet.
- **Shift** swims faster. Rivers apply a gentle downstream current that swimmers and rowers can oppose.
- Actual floors, ceilings, banks, bridge supports and built structures constrain movement. A shallow solid floor takes priority and transitions the operator back to walking.

Swimming clears slide/jet state and recharges jet fuel. The underwater controller does not teleport a diver back to the surface. Swimming presentation avoids walking footsteps, landing impacts and held weapons; remote avatars use swim poses. Surface/depth state travels in normal snapshots, with protocol version 53 ensuring older clients reload before joining.

## One cooperative rowing boat

The skiff starts in the sheltered northeast of Deepmere at `(13680, 22560)`, facing into the lake. Its live position appears as **REEDWATER SKIFF** on the atlas. Its 164 × 82-unit hull fits the existing character proportions, deep channel and overhead bridge clearances.

The hull is Kenney's **Watercraft Kit v2.1** `boat-row-large.glb`, downloaded from [Kenney's official page](https://kenney.nl/assets/watercraft-kit). It is CC0; the original license and palette texture are bundled locally. The source contains a 118-triangle hull and a static paddle pair. The game hides that pair and adds independent wooden oars with rounded blades, brass rowlocks, a shared bench, character rowing poses and two reusable wake ribbons. Failed asset loading retains a watertight authored fallback hull.

- **F** near the skiff takes the nearest free seat. Two seats are reserved independently; each has one oar.
- **Left click / tap forward** makes one forward stroke. **Right click / tap backward** makes one backwater stroke. On touch controls and gamepad, the fire and aim buttons supply the corresponding strokes.
- Each stroke takes 900 ms. Holding a button supplies no further thrust. Durable, independent forward/backwater action ids survive quick taps and network repetition; duplicate and cooldown-denied actions cannot supply extra force.
- Matching strokes move straight. Unequal strokes turn the hull; reversing both oars rows backward. A single rower can use their own oar, with the resulting turn.
- **F / Space** leaves. Exit placement tries both bankside positions and both ends, rejecting blocked water and occupied space. It retains the seat if no clear exit exists.

The authoritative host integrates oar forces, water drag, broadside resistance, differential steering and current in small substeps. Buoyancy and pitch follow the shared water field. Seven hull samples check depth, terrain, bridge/cave ceilings and player-built structures. A blocked move loses momentum rather than teleporting onto a bank. Crew positions use the same pitched vehicle frame as rendering and interpolation. A small moving water-shader cutout keeps the open cockpit dry.

Empty boats remain moored where they were left. Saving retains the validated location and angle, without occupants, strokes or residual velocity. Invalid or obstructed saved locations fall back to the launch cove. No motor, automatic throttle, fuel system or dock is required.

## Structures and crossings

The scenic railway, station elevations, ordinary pier poses, tower footings, mountain bores, castle/ascent, Sanctum, arrival, mines, campfire, hauling pads, retreats and approach paths retain their reservations. Skyfalls Run uses the opening between the existing piers near `(8000, 24348)`. Its `442.5` water datum stays beneath the rail deck and truss, with clearance for the skiff and seated crew. A bounded fill raises the channel's two banks to `448` under this station, retaining the full existing foundations and railway generation datum. This contains the elevated water sheet from bedrock to its surface instead of leaving its sides exposed above low ground.

Reedwater passes beneath the existing eastern cove suspension bridge. A bounded exception dredges the submerged central lane without grading approaches or touching tower bases. Tests check the entire hull and crew through both rail underpasses.

Reedwater Crossing remains centred at `(20000, 26900)`, with deck datum `608`, an 80 m span, a 10 m deck and two 128 m stepped approaches. Its 470 authored boxes control both the visible masonry and collision. Rendering merges the bridge into two materials, 5,640 triangles. The centre remains open for water traffic, with parapets, stairs, ray hits and digging protection preserved.

## Performance and review

River queries use 512-unit spatial buckets. Terrain fields and depth masks are deterministic; masks are generated once and do not update per wave or stroke. Added river and bridge geometry remains below **40,000 triangles**, at most **32 river water batches plus two bridge batches**, with **less than 1 MiB** of river depth-mask storage. The browser inventory measures 35,456 triangles, 29 river/cascade batches plus two bridge batches and 352,300 bytes of water masks. The skiff has one small locally loaded hull, bounded oar geometry and no particle emitter. Whole-world frame timing still depends on terrain/forest streaming, camera position and GPU.

Open `/tools/river-review.html` for the river, lake mouths, underpasses, crossing, estuary, boat and underwater viewpoints. In its boat view, the two operators are driven by the real multiplayer simulation. Click its stroke buttons, or press **1 / 2** for left/right strokes and **Shift+1 / Shift+2** for backwater. This review surface also provides daylight, dusk and night controls.

Run `node tools/test-friends-rivers.mjs` for screenshots, WebGL/browser-error checks and actual two-operator rowing/backwater assertions. Run `node_modules/.bin/tsx tools/river-survey.ts` for the placement map and depth/grade survey. Tests cover raster connectivity, actual beds, matching mask grids, bridge protection, dive/surface/neutral buoyancy, host/prediction agreement, hull clearance, banks/buildings, seat reservation, held/replayed input and persistence. Final validation results are recorded in `artifacts/river-implementation/validation.json`.
