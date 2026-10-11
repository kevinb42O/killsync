# Moored fishing boat

Source: [Fishing boat by Innerscene](https://www.innerscene.com/tools/library/3d-parts/fishing-boat-3c5a6bfd), CC0-1.0. Downloaded 2026-10-11. License and source URL are in `License.txt`.

`boat.glb` is the self-contained local game asset: 36,292 triangles, 11 material batches, approximately 1.11 MiB, embedded WebP maps capped at 512 px. The original had 132,504 triangles, 224 meshes and 7.8 MiB of data. Offline welding/simplification and material joins reduce geometry and submissions. Standard PBR replaces transmission/refraction; window glazing geometry is removed, leaving open opaque frames and a clear helm view. The hull uses the source's navy gelcoat finish, with the original cream cabin.

The boat is parallel to the western T dock’s outer head, centered at (1680, 5800), at sea level -168.5. Its deck is close enough to jump onto from the T head. An organic dredged berth in the shared natural terrain provides hull clearance while preserving the dock approach. Its irregular curved boundary feathers into the natural shelf, and its sloping bowl floor has subtle height variation rather than a rectangular cut or flat bottom. Every new game starts with the boat moored at this berth, regardless of its saved position or heading.

Shared gentle heave and pitch keep the walking floor, passengers and model together. Two curved mooring lines run from source deck cleats to measured wooden posts at (1816, 5724) and (1816, 5988), with rope wraps around each post. The fixed ends remain attached through boat motion. Three rubber fenders have suspension cords. Ropes and wraps disappear when the helm releases the mooring.

Jump aboard, walk through the open rear cabin entrance, and press F near the helm. Taking control uses first person, faces the front windows, and preserves the player’s position. Mouse look remains free and follows changes in boat heading. The sailing HUD button or O key switches between first person and the exterior chase camera. Each takeover starts in first person; F immediately resets the view and releases the helm so normal walking resumes. Forward/backward controls throttle and reverse; left/right smoothly drives the rudder and visible brass steering wheel. Turning depends on travel speed and reverses correctly when backing up. Hull yaw eases toward the rudder’s requested turn rate, so steering changes and reversals have a smooth buildup. Near a blocked turning arc, at most two smaller safe turn probes retain partial steering before falling back to straight travel; accepted yaw becomes the next step’s starting rate. The helm, deck and passengers continue to share one pose. Full hull samples prevent crossing shallows, terrain, docks, breakwaters or built walls; departure falls back to straight travel when a tight berth blocks the turning arc. Navigation caches conservatively clear terrain cells, with exact checks near obstacles and invalidation on terrain edits or restores. Stationary boats skip navigation scans; moving boats use at most 40 ms substeps, keeping forward travel below nine units per step.

F again stops propulsion and releases the helm **without relocating the player or changing their view**. Walk back through the cabin doorway to fish from the open aft deck. One driver controls the boat; standing friends are carried through translation, turns and wave motion. Within the current game it stays where you stop it; disconnecting also stops propulsion. Starting another game resets it to the dock with the ropes attached. Cabin walls, console and fish locker use local collision boxes, with a real doorway. The shared tapered deck footprint avoids invisible platforms around the bow.

The perimeter rails, stanchions, mounting flanges and cabin grabrails have been removed for an open fishing deck. The overhead gantry arch and its roller have also been removed. The gunwales and rod sockets remain.

The final visual uses 19 meshes and about 37,496 triangles including fittings and ropes. It owns its geometry/materials/maps and follows vehicle disposal, including late-load disposal checks. Shadows are enabled within 1800 units; the boat is hidden beyond 12000 units. Animation reuses geometry and scratch vectors. No window panes or transmission/refraction pass are rendered. The helm review scene dropped from 25 to 23 draw calls and from 99,568 to 98,272 rendered triangles with the double-sided panes removed; this is a draw-budget comparison, not a full-game FPS measurement.

To regenerate the game asset, use Node.js with `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `meshoptimizer`, and `sharp`. The optimizer can run in an isolated temporary directory:

```sh
mkdir -p /tmp/fishing-boat-build
npm install --prefix /tmp/fishing-boat-build @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
cp tools/optimize-fishing-boat.mjs /tmp/fishing-boat-build/
curl -L --fail https://www.innerscene.com/api/library/fishing-boat-3c5a6bfd/download -o /tmp/fishing-boat-build/source.glb
node /tmp/fishing-boat-build/optimize-fishing-boat.mjs /tmp/fishing-boat-build/source.glb public/models/friends/fishing-boat/boat.glb
```

Validation: `FriendsFishingBoat.test.ts` covers real F action edges, helm occupancy, sailing, stops, moving passengers, collisions, saving, disconnects and jump boarding, walking through the cabin, resetting sailed saves to the dock on game startup and a complete real-host catch. `FriendsFishingBoatVisuals.test.ts` checks geometry/file/draw budgets, no transmission, motion bounds, hull clearance, fixed rope endpoints and distance visibility. `node tools/test-friends-fishing-boat.mjs` (Vite on port 3014) loads the actual local model, and captures are in `artifacts/fishing-boat/`.
