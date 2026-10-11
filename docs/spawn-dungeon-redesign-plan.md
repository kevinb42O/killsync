# Spawn dungeon: analysis and redesign plan

Date: 2026-10-11. Status: approved direction; the first playable implementation is complete. See [implementation and verification](spawn-dungeon-implementation.md). The audit below describes the starting state; later design targets remain targets unless listed as implemented.

## Agreed direction

Exploration first, optional danger. The user wants the spawn dungeon to become a compelling place to explore, with proportionate props, underground lava, meaningful rewards, and a long descent that ends at physical bedrock. They remember an instant return to spawn when going deep but have not recently revisited it; treat that as a historical report pending reproduction.

Retain the Lantern Descent entrance near arrival. Give the dungeon a strong identity: an abandoned mine that breaks into older ruins, natural crystal caverns, and a buried geothermal forge. Its central mystery is who built the forge and why its lift and lights stopped working. Restoring the route reveals the final vault and gives the crew something visible and useful at home.

## Current implementation and evidence

| Area | Current behavior | Consequence |
| --- | --- | --- |
| Layout | `FriendsCave.ts` defines 41 rooms and 51 routes: six initial rooms, a deterministic five-by-six room grid, and five reliquaries. Deep-room floors use `-64-((row+col)%5)*64`. | The expansion is largely horizontal. District names change, but geometry does not express five different environments or a sustained descent. |
| Depth | Named room floors range from 352 to -320; the cathedral pit reaches -416. Terrain bottom is -4096. | Most of the available underground depth is unused. |
| Treasure | 77 chests are assigned from room-relative positions, usually two per room. Combined gold is 3,036,250. | Repetition replaces anticipation. A room often exists primarily to hold the same reward again. |
| Prop scale | Ordinary chests have a 68-unit-wide lid and reach roughly 46 units high. Player collision height is 50. | A chest is wider than a player is tall and nearly as tall as their collision body. First-person review imagery supports the oversized impression. |
| Reward use | Opening a chest records its ID and adds to shared `caveGold`. No spending path was found. Tests explicitly preserve player coins. | Gold is a tally rather than an exploration progression loop. |
| Lava | Cave topology and visuals contain no underground lava definitions. The surface volcano has an existing lava shader and terrain system. | There are no geothermal landmarks or lava crossings in the dungeon. |
| Visual identity | Torches, repeated crystals and dust are generated across rooms. There are 18 authored cave torches, with only three nearest dynamic lights. | Useful lighting infrastructure exists, but room silhouettes and dressing lack strong distinctions. Darkness alone does not make repeated rooms interesting. |
| Mining limit | `FriendsInteractionTargeting.ts` rejects excavation at voxel elevation `vz <= -16` with “Bedrock. Explore sideways.” Soil filling in `FriendsFrontier.ts` still has a -16 lower bound. | The player-facing mining limit remains around -512 while actual terrain extends to -4096. |
| Bedrock enforcement | The lower terrain is ordinary stone/ore; `blastTerrain` calls the general terrain edit method without the mining-target bedrock check. | A targeting restriction is not a durable, shared, indestructible bedrock layer. |
| Persistence | Opened chest IDs are filtered against the live chest list, and gold is recomputed from that list on load. Terrain generation mismatches currently discard terrain edits. | Removing chests, repricing them, or casually changing the terrain generation would damage existing progression or player work. |

Source entry points: `src/game/world/FriendsCave.ts`, `FriendsTerrain.ts`, `FriendsTerrainLimits.ts`; `src/game/rendering/FriendsTreasureVisuals.ts`, `FriendsCaveVisuals.ts`, `FriendsLavaSurface.ts`, `FriendsTerrainStreaming.ts`, `FriendsTerrainMesh.ts`; `src/game/multiplayer/FriendsExpedition.ts`, `FriendsFrontier.ts`, `FriendsInteractionTargeting.ts`, `playerMovement.ts`, `CoopSimulation.ts`.

## What “dying when going deep” means in the current code

Keep these separate until a recent production-session reproduction establishes the exact symptom:

1. **Shallow excavation restriction:** confirmed. Mining stops at the old -16 voxel limit despite much deeper terrain.
2. **No descending content:** confirmed. The current deep maze oscillates between a few shallow floors.
3. **Normal fall damage:** current Friends hard landings emit a damage event with amount zero. They can flash the screen, but do not remove health.
4. **Escaping the world:** current recovery activates below `TERRAIN_BOTTOM - 128` (-4224) outside water. It restores health and places the player on the surface at the same x/y. Other recovery paths can still return a player to the hub.
5. **Historical instant spawn reset:** user remembers this from an older visit. Not reproduced in this audit, and not established as a current dungeon bug.

An isolated current-simulation check dropped the player into the entrance shaft from elevation 672 and onto the cathedral pit from elevation 32. The final elevations were 96 and -416 respectively, with 100/100 health and alive status. This validates those two landings only; it does not substitute for traversing all routes with production input or checking an older saved world.

The room connectivity test permits 32-unit transitions, while ordinary walking only steps over an 8-unit lip. “Connected through jump-sized steps” is weaker than a comfortable walkable route. Main exploration routes need actual movement validation, not just an air-cell graph.

## The experience to build

The player sees the entrance near spawn, hears an echo and distant machinery, and notices a warm glow below. Within the first few minutes they find a small useful cache and a view into a larger chamber. Each descent reveals an environment with a different silhouette, material, sound and interaction. Side passages promise optional secrets. Restored lifts and doors turn the return journey into a short trip rather than repeating the entire walk.

Design targets, to be measured during playtests: an initial discovery in 2–3 minutes, a worthwhile first expedition in 10–15 minutes, and a full descent with some side exploration in roughly 30–45 minutes. These are target session lengths, not implementation estimates or claims about current traversal.

### Proposed layers

Elevations below are design targets in simulation coordinates. The entrance remains around its existing upper elevations. Depth display should use distance below the entrance, not expose negative internal coordinates to the player.

| Layer | Approximate main-route elevation | Identity and landmark | Discovery and reason to continue |
| --- | --- | --- | --- |
| Upper mine | +352 to -512 | Timber supports, abandoned carts, warm lanterns, a winding overlook into the cathedral. | Supplies, a forge record, and a broken lift showing that the mine continues below. First shortcut. |
| Buried ruins | -512 to -1280 | Broken arches, stone galleries, balconies around the Split Cathedral, distinct inscriptions. | Restore a relay to power the next lift; earn an ancient masonry building pattern. An optional sealed archive holds a secret. |
| Crystal caverns | -1280 to -2048 | A broad cavern, pools, crystal reflections, roots and a distant chamber silhouette. | A lens used in the forge mechanism; unlock a crystal lamp finish for home. A clearly marked hidden seam rewards mining. |
| Ember forge | -2048 to -3072 | Basalt, machinery, contained lava channels, a large molten basin and elevated walkways. | Restore the forge and retrieve its workshop blueprint. Optional risky crossing leads to a special relic, with a safe longer route on the main expedition. |
| Bedrock vault | -3072 to about -3584 | A quiet monumental chamber contrasting with the forge; exposed dark bedrock, an intact stone door. | Solve the final mechanism, uncover the crew relic and unlock a visible home display plus a fast return. Mining can continue to the physical bedrock cap near -4096. |

Do not preserve the current room count as a requirement. Start with roughly 12–16 substantial chambers and 6–8 purposeful optional pockets across the completed dungeon, with connectors, overlooks and service passages around them. Author the critical path, views and secrets; use deterministic variation for secondary rock shapes and dressing. Each main chamber must have a recognizable silhouette, a navigation purpose and a discovery or interaction. Atmospheric transitions can be shorter spaces.

### Navigation and exploration

- Use loops and reconnecting branches. Offer one obvious main descent and optional routes that return to it.
- Separate “walk farther down” from “jump into a hole.” Maintain comfortable ramps/stairs, enough body clearance, and landings before large drops.
- Place landmarks visible from the previous layer. A distant lava glow, broken lift or crystal formation creates a question the player can answer by exploring.
- Let players restore lifts and open doors from the far side. Save these unlocks for the world and show them to late-joining guests.
- Supply a route journal that records found chambers and activated shortcuts; avoid immediately revealing undiscovered secrets.
- Main-route puzzles are readable environmental mechanisms, such as following the power cable to a missing relay. Every necessary item stays accessible; recovery or reconnecting cannot lose the item and block progression.
- Keep mining and building useful: expose marked secret seams, build a small bridge on an optional branch, or establish a crew staging area. Essential progression does not require extensive digging.
- Provide a retreat action from safe exploration checkpoints. Safe main paths and return routes work solo; teamwork adds convenience without making a second player mandatory.

### Props and rewards

Replace the uniform two-chests-per-room generator with authored placement metadata: container type, scale, purpose, reward, zone, and stable ID. Ordinary chests should be approximately 30–38 units wide and 20–26 high as a first visual target; validate beside an actual player and in first person. Large ceremonial coffers are rare and belong in rooms built around them. Decorative supply crates use their own smaller models and never imply a treasure reward unless interactive.

Target roughly 10–14 rewarding containers across the full first version, plus discoveries embedded in the environment. Exact density is decided by traversal time. Use caches in niches, on shelves or behind a visible route challenge. A vault reward should be visible and staged, not another box at the same offset as every other room. Keep the walkable route clear and verify placement after terrain edits.

Prioritize rewards the crew can use:

- Immediate resources feed the existing stock/workshop system, with clear handling when storage is full.
- District discoveries unlock building patterns and lighting finishes for the whole crew. Every blueprint must expose a usable recipe/menu action and a preview of the reward.
- The forge offers a specific new workshop capability, such as a crystal survey lantern, with a complete recipe and usable item. Balance this against the existing reinforced-tools upgrade; do not overwrite or duplicate it accidentally.
- The final relic produces a placeable home display and a saved expedition achievement.
- If gold remains prominent, implement a small shared restoration/catalog purchase loop with explicit prices, host-authoritative purchases and duplicate prevention. Resource/blueprint rewards can ship first; inflated gold payouts should not be the reason to explore.

One-time discoveries remain one-time. Revisit value comes from useful mining, shortcuts, staging areas and the space itself. Later contracts can target accessible seams or genuinely unfinished restoration work. Do not reset claimed hoards or require daily chores.

### Lava, atmosphere and optional danger

Lava starts as a hint in lower cracks and becomes the signature of the Ember Forge. Do not put a pool into every room. Keep the mine, ruins and crystal cave visually distinct.

Reuse the existing world-space lava surface shader, but author cave-local lava bodies with explicit floor, surface level, containment and zone membership. Simulation contacts, visible surfaces, sound and lighting must sample the same volume at the player's actual elevation. An x/y-only check could burn someone walking on a bridge or standing in a room above the pool.

V1 lava is contained and does not require a general fluid simulation. Protect authored basin boundaries with readable reinforced basalt/masonry, or define and test what terrain edits may do before allowing those edits. Avoid invisible lava walls and floating surfaces after excavation. Keep large bridges above the heat-contact range and provide safe stopping points near crossings.

Default danger fits the exploration mode: visible contact pushes/returns the player to the last safe ledge with a brief recovery effect, rather than forcing a long spawn run. Harder optional rooms may offer explicit health hazards or contained guardians, if later desired. The main expedition stays possible without combat. Do not apply passive damage to a whole district or place untelegraphed lethal drops on the main path.

Add chamber-specific ambience: shaft wind, mine creaks, ruin echoes, crystal chimes/drips and forge rumble. Use dark silhouettes and pools of light, readable first-person ground and atmospheric distance. Lava emissive shading needs actual bounded light/bounce so neighboring rock reads as hot; cap nearby dynamic lights and shadow casters. Optional secrets can be dark, but main-route navigation should remain legible with the held light.

## Technical sequence and save compatibility

### 1. Repair and establish the baseline

Revisit the dungeon with production player input on a new world and an existing saved world. Record reset locations, floor contacts, player state and recovery reason. Check solo and guest traversal. Distinguish an intentional recovery, a floor/query problem, an outdated server bundle and visual damage feedback.

Replace magic -16 excavation/fill bounds with named shared depth policies. Define a physical, indestructible basal band near the current -4096 bottom, preserving the deepest existing ocean floor. Enforce it through terrain edits, mining, dynamite, building placement and authoritative request validation. Render and target it as bedrock, and keep true below-world recovery below that band. Ocean depth continues to work.

Verify that the water shader issue caught during this audit is resolved and establish a browser rendering baseline before judging new artwork. See verification notes below.

### 2. Finish one playable sample

Build entrance → upper mine → redesigned cathedral → first contained lava landmark → meaningful reward → working shortcut back. Reduce and rescale chests in this route. Validate first-person visuals and walking before expanding to every layer. This sample demonstrates the final atmosphere, discovery loop and reward use.

### 3. Support depth, then extend the authored descent

Profile the sample and representative deep chunks before expanding. Current terrain volume chunks span a whole x/y column from the surface to the lowest cavity. Deepening rooms increases the meshing work even if much of the column is solid. Add interval-aware meshing or vertical chunk slices if measurements show this dominates; ensure stacked chambers can be culled independently and their entrances preload in time.

Introduce explicit cave-zone, landmark, shortcut, reward and lava-body metadata shared by simulation and renderer. Extend each layer with the proposed art and interactions. Do not reset the terrain generation as a convenience.

### 4. Connect progression and preserve worlds

Version cave progression separately from terrain generation. Preserve legacy chest claim IDs and their historical earned values in a migration ledger before retiring old placements. Current normalization must change before repricing/removing those chests, because it recomputes gold from the live list.

If gold becomes spendable, store validated earned totals and purchase records; derive balance from earnings minus purchases. A balance-only edit is inadequate because current normalization would restore the old total. Maintain host authority and idempotent awards/purchases when two players interact simultaneously.

Preserve existing terrain edits and builds. Inspect edited cave columns during migration and define how relocated content interacts with them. Do not silently erase a built underground base or entomb a player on load. New safe checkpoint IDs require a validated fallback when a chamber changes. World save/restore, snapshots, late join and reconnect must carry discoveries, claimed rewards, shortcuts and restoration state.

### 5. Complete art, sound and validation

Review every main-route landmark at player eye height with flashlight on/off and appropriate lights. Test navigation, rewards and multiplayer across the completed descent. Measure entry, deep forge, stacked rooms, dynamite edits and two players in distant layers. Compare frame times and memory with the established baseline; set budgets from the intended machine profile before accepting expensive lighting or geometry.

## Completion criteria

- A player can descend from spawn to the final vault and return without an unexplained reset or a required suicidal drop.
- Each layer is distinguishable by silhouette, material, lighting and sound before its title appears.
- Main stairs/ramps work with normal movement; optional jumps are clearly optional.
- Chests fit the player scale, do not obstruct routes and are deliberately placed.
- The first expedition yields a usable resource or unlock. Every promised blueprint/item has its complete integration.
- Lava is visible, contained and lit; its contacts match its actual height and body geometry. Bridges and floors above it are safe.
- Bedrock is visible, targetable and unbreakable through every terrain mutation path. No ordinary digging opens the void.
- Shortcuts and checkpoints survive saving and late join. Claimed rewards cannot duplicate across players, reloads or migration.
- Old gold, terrain edits and builds survive the migration; no blanket world regeneration.
- Browser runtime/shader checks pass, and the dungeon stays within measured rendering and memory budgets.

Replace the existing tests requiring at least 40 rooms, 70 chests and two million gold with checks for progression, meaningful placement, reachable rewards, distinct layers and save preservation. Keep useful connectivity and collision/mesh consistency coverage, then add actual player traversal rather than relying solely on the voxel graph.

## Audit verification and limits

Focused Vitest run: 28 of 29 tests passed across cave topology, treasures, hard landings, deep ocean collision and ocean exploration. All cave, treasure, hard-landing and ocean-exploration tests passed. The existing `FriendsOceanDepth.test.ts` organic-horizon assertion expected no indices and received 384; investigate it in the rendering baseline phase, not as proof of dungeon death.

The current browser cave harness failed at its first view with WebGL error 1282. Its console identifies a water vertex-shader compile error: `friendsWaterWaveHeight` references `w.y` where `w` is undefined. This blocked that browser visual verification and is an independent renderer issue. A later source inspection found the wave function already accepting an explicit base height, suggesting concurrent work may have addressed it; a second browser attempt timed out during page loading, so a successful visual baseline is still outstanding. The initial failure is saved in `artifacts/dungeon-analysis/browser-water-shader-failure.json`. An existing treasury review image was inspected; it is historical reference, not a newly verified production capture.

No gameplay or renderer source files were changed by this analysis. The user's old instant-spawn-reset experience remains unconfirmed on the current build; two successful simulation drops do not prove every saved world or network session is free of resets.
