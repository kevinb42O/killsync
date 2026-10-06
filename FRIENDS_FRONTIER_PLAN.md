# Friends Frontier — world and gameplay rebuild

Design target. 5 October 2026. A playable terrain, economy, transport cargo and art rebuild is now implemented; see `FRIENDS_FRONTIER_IMPLEMENTATION.md` for exact behavior, verification and remaining scope. Based on the current working tree and a local first-person review of Friends mode. Dimensions, pacing, performance budgets and systems below remain design targets unless explicitly confirmed in the implementation document.

This plan supersedes the direction in `FRIENDS_BUILDING_PLAN.md` where that document favors free construction as the main activity and explicitly postpones procedural continents, terraforming and crafting. The requested game needs harvesting, meaningful construction, underground exploration and a much larger world. Preserve the existing implementation and saves while developing its replacement.

## 1. Product direction

**Build a frontier with your friends: explore a beautiful wilderness, dig into it, turn what you find into useful places and machines, and connect your growing settlement by rail and air.**

The distinctive feature is the relationship between mining, settlement construction and transport. A forest camp supplies timber. An underground mine supplies ore. Your railway moves bulk materials to the workshop. Your aircraft scouts inaccessible ridges and carries small crews and valuable finds. What you build changes what the group can do next.

Adventure is the default ruleset: gather resources, craft tools, construct useful infrastructure, explore and improve the world. Creative remains a separate explicit world setting with free construction. Relaxed adventure keeps peaceful progression viable and combat optional. Do not add hunger, mandatory daily chores or raids that destroy a friend's settlement as the default.

Replayability comes from different geography and deposits, player-built networks, alternative projects, emergent journeys and renewable expedition opportunities. No design can promise a million enjoyable replays; test whether players voluntarily return after they finish the introductory objectives.

## 2. What the inspection found

| Current evidence | Consequence |
| --- | --- |
| `FriendsWorldVisuals.ts` builds a 12,000 × 12,000 plane and paints paths, lake and plazas into a 2,048² canvas. | There is no real landscape relief or water volume here. Replace the ground representation. |
| `FriendsScenery.ts` caps trees at 72 and reserves three broad interior clearings; `FriendsLandscape.ts` concentrates woodland in six perimeter groves. | Emptiness is a layout rule, not just missing asset downloads. Reserve local building plots rather than clearing most of the landscape. |
| `public/models/friends/README.md` documents 45 selected Kenney CC0 models. | Downloaded assets already exist; composition, materials, scale and density need a different art direction. |
| Four fixed places, three recordings, a salvage encounter and three construction milestones. | Content is primarily finite sightseeing and one-time rewards. Add repeatable systems and consequences. |
| `FriendsBuilding.ts` allows free pieces with a global 640-piece budget. | Construction lacks a resource economy, and the global budget cannot support a large settlement world. |
| `FriendsRailway.ts` defines a fixed 2D loop; train decks are placed at a constant elevation in `FriendsExpedition.ts`. | A terrain world needs 3D routes, grades, bridges, tunnels and matching station geometry. |
| `playerMovement.ts` treats z ≤ 0 as ground and clamps landing to zero. Current floor queries describe tops of builds, vehicles and landmark boxes. | Removing the visible ground alone will not permit mining. Movement must support negative elevations, caves and multiple surfaces above the same horizontal position. |
| `FriendsWorldStorage.ts` saves progress, builds and milestones in host-browser storage. Inventory and vehicle positions reset between sessions. | A persistent resource game must save inventories, terrain edits, machines, cargo, vehicles and world identity as well. |
| `FriendsSimulation` is a small subclass of `CoopSimulation`; substantial Friends behavior lives inside the shared combat simulation. | Extract mode-specific services incrementally rather than expanding the central simulation with every new subsystem. |

Local visual review: sparse objects, broad bare ground and large floating labels dominate the arrival view. Test the replacement at eye level, from a carriage and from the aircraft; aerial screenshots alone are insufficient.

## 3. Reuse internet assets deliberately

### Verified sources

| Source | Verified offering | Proposed use / limitation |
| --- | --- | --- |
| [Quaternius Ultimate Stylized Nature](https://quaternius.com/packs/ultimatestylizednature.html) | 63 textured nature models; glTF, FBX, OBJ and Blender formats; CC0. | Primary candidate for cohesive stylized trees, rocks, bushes and grasses. Evaluate actual assets in-engine before selecting. |
| [Poly Haven Pine Forest](https://polyhaven.com/collections/pine_forest) | Nature collection with a complete downloadable scene. | Existing forest composition and assets for the import trial. It is a source scene, not a verified browser-ready playable map. |
| [Poly Haven A Verdant Trail](https://blog.polyhaven.com/verdant-trail/) | Scanned natural environment collection with a downloadable scene file. | Alternative source scene for rocky grassland and grounded terrain references. Same conversion and performance caveat. |
| [Poly Haven ground and terrain textures](https://polyhaven.com/textures/ground-terrain) and [license](https://polyhaven.com/license) | PBR ground materials; assets are CC0 and may be redistributed. | Selected ground, rock and wood materials, adjusted to the chosen visual style. |
| [ambientCG](https://ambientcg.com/) | PBR surfaces, environments and models under CC0. | Fill gaps in dirt, gravel, timber, metal and construction materials. |
| [Kenney Train Kit](https://kenney.nl/assets/train-kit) | 100 files, CC0, with tracks in version 1.1. | Reuse selected transport components where their silhouettes fit. Existing imports do not require starting over. |

Do not combine every pack by default. Use one consistent nature family; match color grading, texel density, scale, geometry detail and material response across buildings and vehicles. High-resolution assets do not automatically make a composed game world.

### Answer to “can we just pick a map?”

Yes, there are complete downloadable environment scenes worth importing. Pine Forest is the strongest verified starting candidate here, with Verdant Trail as a second candidate. Neither has been downloaded, converted, benchmarked or validated as a huge editable map in this project. Do not claim a turnkey playable world.

A complete static scene can accelerate scenery, composition and landmarks. It does not provide this project's train controls, rail graph, character collision, resource economy, multiplayer or underground edits. A Blender scene may also contain procedural scattering or render-only features that must be baked or replaced for browser use.

Run an import comparison before committing the world: convert a representative source section to glTF/GLB, simplify geometry and materials, create simplified collision, and compare with a Quaternius-based scene. Assess eye-level quality, aerial quality, terrain conversion, download size, memory, draw calls and frame time. Choose the source that survives those tests, not the best promotional render.

For digging, treat imported terrain as an input to our editable world representation. Where its topology cannot be converted cleanly, use its assets and composition on a generated terrain base. Never put an indestructible landscape mesh over a mineable region and call it digging.

## 4. A large world with useful geography

Target the first complete world at approximately **4 km × 4 km**, streamed by region. This is a design target, subject to scale calibration and browser/network profiling. Define an explicit units-per-meter contract first; the current simulation uses arbitrary units and unusually fast character traversal. Do not multiply its bounds and call that a large game.

Build an authored starting basin and landmark arrangement surrounded by seeded wilderness. Generation must produce navigable valleys, meaningful resource distributions, connected caves and viable transport corridors. Save the seed and generator version; updates may not silently regenerate a player's base.

| Region | Character | What players do there |
| --- | --- | --- |
| Home basin | River, woodland, station, workshop, rolling slopes | Establish homes, process early resources and connect the first camps. |
| Deep forest | Dense canopy, ravines, ruined sawmill | Timber production, replanting, bridges, woodland discoveries and trail building. |
| Copper hills | Layered cliffs, quarry faces and natural cave entrances | Excavate ore, build a mine, haul cargo and improve tools. |
| High ridge | Alpine rock, strong skyline, isolated observatory | Aircraft scouting, landing outposts and valuable small cargo. |
| Wetlands and coast | Marsh, estuary, islands and abandoned harbor | Boardwalks, salvage, unusual plants and harbor restoration. |
| Outer frontier | Seeded ruins, deposits and expedition sites | Repeatable journeys, optional danger and long-term expansion. |

Every landmark needs a discoverable approach and a playable use. Space between landmarks needs harvestable resources, terrain choices, routes or discoveries. Include sightlines toward the next interesting place; avoid a checklist of isolated points in a flat empty field.

Provisional journey targets after movement calibration: early resource sites within 1–3 minutes, cross-region rail journeys around 3–6 minutes, aircraft regional trips around 1–3 minutes. Loading and LOD must support the fastest possible aircraft, with predictive prefetch along its velocity.

## 5. Real harvesting and digging

Build volumetric terrain, not only a heightmap. A heightmap can describe hills but cannot describe arbitrary tunnels and ceilings. Use chunked material/occupancy data for soil, stone and ore, with a visual mesh and collision generated from the same state. Start with a robust textured voxel implementation; assess smoother surface meshing in the terrain prototype without making the entire game depend on an unproven mesher.

Required behaviors:

- Axe cuts harvestable trees with hit feedback, a readable final fall and timber yield; saplings allow replanting.
- Pickaxe breaks rock and exposes ore veins, with tool tier and hardness affecting speed.
- Shovel removes soil and allows leveling, trenches and earth replacement.
- Players can dig below the original surface, through a hillside and into a cave, then build stairs back out.
- Terrain edits update collision, targeting, nearby scenery and lighting visibility. Unsupported foliage cannot float above removed soil.
- A mined voxel grants material exactly once. Filling and re-mining a block cannot duplicate ore or produce more material than it consumed.
- Protected starter transport and services have small, clearly marked reserves. Most wilderness is editable. Protected areas cannot become an excuse to restrict digging to a token quarry.
- The first terrain release supports dry excavation and fixed water bodies. Dynamic fluid simulation, cave-ins and soil erosion are later features with separate budgets. Define a visible non-editable water boundary initially; do not promise water flooding tunnels yet.

See the official [Three.js voxel geometry guide](https://threejs.org/manual/pages/voxel-geometry.html) for chunk and exposed-face foundations. It is a rendering reference, not a complete terrain, collision or multiplayer engine.

## 6. The economy and why construction matters

Start with a small legible economy: timber, stone, soil, copper ore, iron ore, salvage and a later rare energy material. Each needs at least two practical uses; avoid dozens of cosmetic resources before this works.

The primary loop is:

**Scout → harvest or excavate → carry cargo home → process materials → build or upgrade → unlock a better route or capability → explore farther.**

Tools and basic construction arrive quickly. Starter supplies allow a small workshop without grinding. Inventory slots and cargo capacity provide logistics choices; tune gathering yield so hauling bulk by rail is satisfying rather than a punishment. Shared storage, visible recipes and project contributions let friends work independently toward the same goal. Credits support trade and optional equipment; they do not replace physical materials.

| Build | Actual function |
| --- | --- |
| Workbench and shelter | Craft tools and establish an expedition respawn point. |
| Sawmill | Process timber efficiently for buildings and railway construction. |
| Furnace | Convert ore to ingots for equipment and infrastructure. |
| Storage depot | Consolidate shared stock and organize local production. |
| Bridge / stairway / mine entrance | Create a usable route for players and cargo. |
| Rail station and loading platform | Connect a production site to the settlement and transfer bulk cargo. |
| Aircraft landing pad | Secure a useful remote staging and cargo point. |
| Generator and powered workshop | Enable advanced processing and later machines. |
| Greenhouse | Produce expedition supplies and renewable plants. |
| Survey tower | Reveal resource hints and expedition opportunities in its region. |

Keep arbitrary creative shapes. A house need not match a prefab to function. Validate station, workshop and shelter usability with accessible surfaces and clearances. Provide clear feedback when a machine lacks inputs, power, clearance or a connected route.

Avoid making the whole economy wait on automation. Initially use explicit processing queues and manual cargo transfer. Conveyors, linked power networks and scheduled train loading follow after the manual loop is enjoyable.

## 7. Make the vehicles part of the game

### Train

Keep a working starter service. Add player-controlled departure and stopping, cargo cars and a repairable branch to the first mine. Later add player-built tracks using a preview that constrains curvature, grade, crossings and carriage clearance. Start from supported modular routes, then broaden the editor.

Use a 3D rail graph sampled by distance along the actual route. Stations, track meshes, collision, minimap and carriage motion share that graph. Add bridges, tunnels and cuttings; simple waypoint elevation changes cannot let a long train clip hills or platforms. Preserve walkable crew decks and test passenger motion on grades and network correction.

The train carries much more bulk cargo than a person or aircraft. Upgrades improve hauling and service without making travel a mandatory idle wait. Players can mine, construct or scout while another person drives.

### Aircraft / helicopter

Retain the existing free crew cabin and pilot controls, with a coherent finished exterior. It supplies scouting, access to high sites, crew transport and limited high-value cargo. Add useful map surveying and landing pad interaction before simulation-heavy fuel or weather systems.

Use real terrain and landmark collision for landing. Separate flight utility from rail utility through cargo capacity and access, not arbitrary restrictions. If fuel is introduced later, keep starter-region rescue available so a new player cannot permanently lose access to the world.

## 8. Replayability beyond the tutorial

- Each seed changes deposits, cave routes, wilderness landmarks and outer-region opportunities within authored design constraints.
- Persistent projects alter the network: restore a sawmill, reconnect a mine, reopen a harbor, build a ridge research outpost. Rewards provide capabilities, blueprints and trade options rather than just another credit number.
- Generate contracts from actual world needs and unlocked capabilities: deliver timber to the harbor, survey an accessible cave, bring ore from a known deposit. Avoid impossible orders and missions to already depleted sites.
- Let friends choose settlement goals and queue shared projects without requiring everyone online at once.
- Add discovery collections, unusual structures and optional expedition encounters with rewards that matter to several play styles.
- Separate preserved settlement regions from explicitly renewable frontier expeditions. Never regenerate an edited chunk, occupied region or resource site beneath a saved build. World expansion/new expedition regions replenish mining opportunity without erasing history.
- Replanting renews forests. Mining deposits in the persistent mainland remain depleted; replenishment comes from frontier expansion and explicit new expeditions, not ore silently respawning inside tunnels.
- Later add blueprints, route sharing, player courses and world export. Treat these as amplifiers of a working game, not its initial substitute.

Day/night, fog, light weather, biome sound, birds and restrained water animation create atmosphere. Weather can introduce route choices later; first deliver a world that is enjoyable in daylight without environmental chores.

## 9. Technical implementation boundaries

Proposed services: `FriendsTerrain`, `FriendsResources`, `FriendsInventory`, `FriendsCrafting`, `FriendsLogistics`, `FriendsWorldGenerator` and `FriendsWorldStore`. Introduce them behind a Friends mode adapter. Keep shared character, vehicle presentation and networking utilities where appropriate; preserve Survival behavior with focused regression coverage.

### Terrain and performance

- Generate deterministic base chunks; store sparse edits relative to that base. Keep generator and material schema versions with each save.
- Build terrain meshes in workers; update affected chunks and neighbors at seams. Coalesce rapid edits and prioritize collision correctness over cosmetic mesh completion.
- Evaluate 32³ cells and roughly meter-scale voxels as a starting point. Tune size and resolution with actual dig and tunnel tests; do not preallocate the entire 4 km world at full density.
- Use simplified distant terrain, foliage instancing and multiple levels of detail. Fine simulation follows all players, not just the host camera; distant regions maintain processing and timers without full per-frame visual updates.
- Use indexed local queries for builds and rail distance. Current global piece iteration and full-route distance scans must not grow with the entire world's content.
- Replace the world-wide 640-piece cap with measured per-region budgets, batched geometry and explicit machine simulation limits. Prevent overload with clear local feedback.
- Rebase render coordinates if precision profiling requires it. Preserve one stable authoritative coordinate system for terrain edits, saves and network messages.

### Multiplayer

- Host validates interaction reach, tool, voxel state, permissions and inventory before committing a dig, harvest, craft or build.
- Operations carry IDs and expected chunk/container revisions. Duplicate reliable messages cannot award resources twice; concurrent harvesting resolves once.
- Send seed/version once, region baselines on interest changes, and sequenced terrain/inventory/build deltas afterward. Do not attach the entire terrain or building world to every movement snapshot.
- Catch up a late joiner with a versioned baseline plus subsequent edits. Pace bulk transfer so it cannot starve movement and passenger updates.
- Guests predict aim/tool feedback; authoritative material changes and collision corrections converge to the host. Tag pending operations so UI can explain waiting or rejection.
- Test five players spread across distant regions, editing neighboring chunks and riding/flying while another player joins.

### Persistence

- Move large state to indexed, asynchronous region records. Keep only a small startup manifest in synchronous storage.
- Persist world ID, seed/version, terrain changes, harvested resources, player identity/inventory, shared containers, builds, processing queues, rail network, cargo, vehicle pose and project state.
- Commit inventory transfers and world edits atomically or through a recoverable transaction journal. A crash may not save the reward without the depleted block, or the removed cargo without its destination.
- Retain backups and schema migrations. Keep old Sunline saves as a separate legacy world; offer an explicit later build transfer rather than silently placing old builds into incompatible terrain.
- Host-browser storage supports local sessions, but friends cannot visit when that host is offline. Add a persistent authoritative world server in a later milestone for independent access; the current lobby service is not that server. Do not promise automatic host migration or cloud saves.

## 10. Delivery sequence and acceptance gates

| Milestone | Deliverable | Gate before proceeding |
| --- | --- | --- |
| 0 — World and terrain trial | Import a representative existing scene section; compare a coherent textured nature kit; prototype underground terrain edits, collision and chunk streaming. Freeze scale. | A player can dig a tunnel and walk through it; an aircraft traverses chunk boundaries; chosen art looks convincing at eye level and from vehicles. Record profile results. |
| 1 — First real adventure | A finished 512–768 m region with depot, woodland, mine/caves, short rail route, aircraft, tools, materials, storage, workbench, furnace, useful shelter and saving. | Complete the first-session scenario below in solo and multiplayer; reload preserves edits, materials and cargo. This region is the playable foundation of the larger world. |
| 2 — Useful settlement and transport | Cargo train, mine branch restoration, stations, production queues, cooperative projects, landing outposts and larger builds. | Different players can gather, process, construct and transport simultaneously; no duplication, dead-end progression or disappearing cargo. |
| 3 — Large frontier | Expand to the 4 km target with distinct regions, LOD/prefetch, world generation, cave networks, 3D rail corridors and region-based persistence/replication. | Five players can operate far apart; rapid flight stays responsive; region loading cannot drop players through missing terrain. |
| 4 — Reasons to return | Dynamic contracts, renewable expeditions, blueprint sharing, richer projects, atmosphere and optional encounters. | After completing introductory projects, playtesters choose their own next project and return voluntarily. |
| 5 — Independent shared worlds | Persistent world server, authenticated world access and recovery/backups. | A friend can leave and another can return later with inventories, terrain and settlement intact. |

Milestones are dependency order, not calendar promises. Mining/collision and asset performance are the first uncertainties to resolve. A decorative map reskin does not satisfy milestone 1.

### First-session scenario

1. Arrive at a forest station with a real river, slopes, a visible mine entrance and a useful workshop. Receive an axe, pickaxe and modest starter supplies.
2. Chop nearby trees, gather stone and build a small shelter plus shared storage within about ten minutes.
3. Ride to the mine with friends. Dig through a vein, expose a cave, gather ore and build stairs or supports for access.
4. Load cargo, return, smelt ore and construct a functioning improvement: a better workshop, rail repair or aircraft outpost equipment.
5. Fly to scout a new region and mark the group's next project.
6. Leave and return: the tunnel, cut trees, inventory, storage, buildings, cargo and vehicle positions remain.

Pacing is a playtest target. The scenario needs enjoyable interaction feedback, a clear purpose and scope for improvisation at every step.

### Validation and quality targets

- Correctness: underground floors/ceilings, chunk seams, placing into players, resource conservation, idempotent operations, concurrent edits, transaction recovery and old-save isolation.
- Transport: boarding, jumping and walking across cars on slopes; grade/corner clearance; landing on edited terrain; guest prediction and late join during travel.
- World: reachable spawn and resources across sampled seeds; rail corridors are constructible; cave entrances connect; projects and contracts reference achievable destinations.
- Visual: review arrival, dense woodland, cave, riverside, mine, train-window and aircraft views. No giant placeholder signage, floating foliage, repeated obvious rock rings, or empty painted ground as the final landscape.
- Performance targets pending profiling: around 60 FPS on a representative desktop and a 30 FPS lower setting on supported weaker hardware; 30 Hz host simulation should normally stay below its 33 ms frame budget with headroom. Name actual devices before treating these as release guarantees.
- Profile initial download, peak memory, frame-time distribution, edit latency, worker load, network transfer and high-speed prefetch. Set content budgets from measurements rather than asset counts alone.
- Regression: retain existing building, vehicle, multiplayer and Survival tests; add meaningful terrain/economy/persistence checks and manual end-to-end sessions.

## Immediate implementation ticket

Start milestone 0 with a real imported forest reference and a mineable hillside containing a walkable tunnel. Put the current train and aircraft into that test world. Prove that terrain, movement, material collection and two-player replication can agree on the same edit before expanding content. The first shipped improvement must include the playable adventure loop and a finished environment together.
