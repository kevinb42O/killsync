# Lantern Descent implementation

Date: 2026-10-11. Direction: exploration first, optional danger.

The spawn dungeon now has an authored route through the upper mine and eight new chambers down to a final bedrock chamber. Main stairs use eight-unit risers. The full joined route is tested in both directions through normal player movement, without jumps, teleporting between segments, or developer flight.

## Playable expedition

| Chamber | Floor elevation | Identity / discovery |
| --- | ---: | --- |
| The Last Shift | -512 | Mine supports, supply cache, first restored shortcut |
| The Buried Archive | -896 | Ruin colonnades; ancient masonry building finish |
| The Fallen Colonnade | -1280 | Stone gallery; shared workshop supplies |
| The Listening Cavern | -1728 | Crystal formations; crystal lighting building finish |
| Ember Overlook | -2112 | First deep molten basin; supplies |
| The Heart Forge | -2560 | Machinery, large lava basin; existing reinforced-tools upgrade and materials |
| The Cooling Gallery | -3072 | Molten channel; supplies |
| The Bedrock Vault | -3584 | Sunline relic, supplies, return to camp |
| The Last Stone | -4032 | Physical indestructible bedrock; optional final stretch after the vault |

These elevations are internal simulation units. The HUD reports depth below the entrance in metres, the current chamber, its guidance, and shared progress out of eight discoveries.

Four cave-local lava surfaces share world-space shader behavior with the existing surface lava. Contact tests use actual elevation, so standing over a pool on another floor does not trigger recovery. Contact returns the player to a nearby stone ledge with their health and discoveries intact. Reinforced basin floors/rims and the main stair supports resist excavation. Two nearest lava lights and the existing lava/steam sound contribute to the forge atmosphere.

Recovering each chamber's discovery enables a two-way shortcut between its landing and the preceding chamber. These are interaction-based return markers, not animated elevator vehicles. The vault also offers a one-way return to the campfire. Discovery IDs persist in the existing shared progress payload, including for guests and reloads.

## Prop density and useful rewards

There are now 14 rewarding containers: six retained upper/side caches and eight descent discoveries. Ordinary containers are approximately 34 units wide and 23 high; the relic container is slightly larger. The former 77-container distribution is retired.

Resources enter shared workshop stock. The archive and crystal discoveries unlock usable finishes in the building palette; the host also rejects attempts to build with these finishes before discovery. Crystal lamps use cyan emissive detail. The forge grants the existing reinforced-tools upgrade rather than inventing a second overlapping upgrade. The recovered Sunline relic appears beside the home campfire.

Original claimed chest IDs and their original gold amounts remain recognized even when their placements retire. A save with all 77 historical claims retains exactly 3,036,250 gold. New descent discoveries grant materials, unlocks and the relic instead of additional inflated gold. Simultaneous host/guest interactions award each shared discovery once.

## Depth, saves and rendering

Mining and soil placement can reach the real bedrock cap rather than stopping around elevation -512. Two bottom voxel layers, from -4096 to -4032, resist mining, terrain edits, dynamite and saved empty edits. The old below-world emergency recovery remains a fallback; it is no longer the end of the authored descent.

The remembered historical instant return to spawn was not reproduced in the starting audit. Current hard landings in Friends mode emit a zero-damage feedback event. This implementation addresses the confirmed shallow mining restriction, missing descending route and missing physical bedrock rather than attributing the historical reset to an unverified cause.

The dungeon change does not increment terrain generation. Existing room topology is retained for player builds and excavations, alongside the new descent. Small authored lift landing slabs and the indestructible bottom cap take precedence over excavations in their footprints; arbitrary player terrain edits are otherwise retained by the existing save system.

Underground streaming selects cave chunks relevant to the camera's elevation, with neighboring chunks and independently promoted player edits. Browser review recorded 131 active volume chunks at the mine, 60 at the crystal cavern, 58 at the forge, 44 at the vault and 19 at bedrock. Before elevation filtering the mine/forge review loaded 384 chunks. These are workload measurements, not an FPS benchmark; volume meshes still cover full columns.

## Verification and review

- Focused tests cover normal movement down/up the entire joined route, bedrock protection, lava elevation/containment, grounded rewards and lights, shared awards, guest snapshot decoding, reloads, building finish unlocks and obstructed shortcut landings.
- `npm run lint` checks TypeScript; `npm run build` verifies production bundling.
- `node tools/test-friends-dungeon.mjs` streams and renders player-eye views in the mine, crystal cavern, forge, vault and physical bedrock, then verifies the recovered home relic. The fixture does not modify a player's saved world.
- Browser screenshots and the report are in `artifacts/dungeon-expedition/`. The report checks runtime, shader and WebGL errors as well as content counts.

## Remaining design work

The expedition has a complete walking route, useful rewards, recovery and return loop. Further art and encounter work remains: richer bespoke machinery/arches, environmental mechanisms beyond recovering a discovery, animated elevators, deliberately authored secret seams/side challenges, and dedicated mine/crystal ambience. Exploration duration and reward balance still need a human playtest. Combat, guardians and lethal optional rooms have not been added.

The older horizontal cave network is preserved, with most repetitive treasure removed. It remains available as side space; it has not been fully rebuilt into the smaller bespoke room set proposed in the design document.

The 2026-10-12 [hardening pass](spawn-dungeon-hardening.md) adds shared solid fixtures, fully obstructed recovery fallback, resource-cleanup checks and measured meshing improvements.
