<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# KILLSYNC — Reality Breach

**Current game version:** v0.1.0

**Multiplayer protocol:** 45 (all players must run the same version)

A first-person co-op survival game for one to five operators. Neon Bastion now
opens beneath a suspended, fractured cathedral with coherent city districts,
a stone court, and live Reality Breach events on all four worlds.

## Reality Breach

The first breach opens 18 seconds after world insertion. Reach its amber ground
rings: one operator can power one ring, with up to three required for a squad.
Hold the simultaneous link for eight seconds before the 55-second window ends.
Connected rings burn enemies that cross their circuit. A solo ring burns enemies
nearby. Leaving a ring gently decays the link instead of resetting it.

Sealing the breach sends a 1,400-unit combat pulse, pays every living operator
160 credits on the first cycle (40 more per later cycle), restores up to 25 HP,
and slows nearby enemies for 12 seconds. Boss pulse damage is capped. A failed
breach speeds nearby enemies up for 12 seconds. The next event can open 65
seconds after resolution. Extraction and checkpoint windows suppress new events.

The HUD shows each ring's direction, distance and occupant, and both maps show
anchor locations. The host owns charge, damage, rewards and timing; guests
receive these through versioned snapshots. All squad members must reload for
protocol 45 before connecting.

Choose **Enter the Breach** for squads or **Solo Recon** to try the same
simulation locally.

View your app in AI Studio: https://ai.studio/apps/4f35457b-60aa-4227-a2dc-e6c714a217c7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Public co-op squads

For local multiplayer testing without a second browser or another player,
choose **Solo Recon** on the main menu. It opens a local-only deployment
screen where you can choose a callsign, operator class, Imprint allocation, and
unlocked world before starting the one-player co-op simulation. This path does
not browse, create, or join a lobby and does not perform WebRTC signaling. The
**Enter the Breach** screen continues to provide the public and direct squad flows.
**Host public squad** can also start with one player; direct hosting offers
**Start match solo** after creating its connection offer.

See [MULTIPLAYER_AUDIT.md](MULTIPLAYER_AUDIT.md) for the audit, implemented fixes,
verification results, and prioritized follow-up work. Multiplayer protocol 45
requires every squad member to reload after updating.

The **Co-op squads** menu lists live public lobbies and connects players with a
single click. The lobby service only carries room metadata and short-lived
WebRTC offers/answers; combat traffic stays on the peer connection.

For a production deployment, serve the built app and lobby service together:

1. `npm run build`
2. `npm run serve:multiplayer`

Set `TURN_URLS` and `TURN_SHARED_SECRET` on that server (and the same
`static-auth-secret` in coturn) to make expiring TURN relay fallback available
for restrictive home, work, or school networks.
If the lobby service is hosted separately, set `VITE_MULTIPLAYER_SIGNALING_URL`
at build time to its public origin. Never put TURN credentials in a `VITE_`
variable: the service returns them through its server-side ICE configuration endpoint.

The bundled signaling store is intentionally single-process. The server refuses
`WEB_CONCURRENCY > 1` unless deployment explicitly declares a shared room store
and sticky routing with `MULTIPLAYER_SHARED_ROOM_STORE=true`.

## Co-op owner control

Co-op includes a cryptographically authenticated owner console whose authority
is independent from the host role. See [COOP_OWNER_ADMIN.md](COOP_OWNER_ADMIN.md)
for private-browser provisioning, console controls, commands, modified-run
rules, and the peer-host security boundary.


### Grenades and Hellbinder spellcasting

Every operator starts with two grenades. **E** throws outside build mode (E still powers structures in build mode); **D-pad Down** throws on a controller, and touch controls include a grenade button. Grenades bounce against city cover, explode after 1.6 seconds and recharge one charge every 24 seconds. The host owns physics, blast falloff and cover checks. They do not damage squadmates.

**Hellbinder / Royal Inferno** uses five spells instead of guns: **1 Ember Bolt**, **2 Soul Nova**, **3 Rift Meteor**, **4 Cinder Curse**, **5 Astral Lance**. Hold fire to cast; mana regenerates at 14 per second, with independent costs and cooldowns. Aim down at the ground to place a meteor. Cinder Curse builds burning hexes and soul fragments; **RMB / LT** activates Hellseed from any spell slot. There are no magazines, reloads or weapon sights for this class. Foundry upgrades apply to spells.

The casting viewmodel uses the authored, rigged right hand from the MIT-licensed
WebXR Input Profiles assets. Its fingers deform the skin mesh, and a continuous
sleeve extends behind the first-person camera. The model is bundled locally.
Source and license: [casting hand credits](public/models/hellbinder/README.md).


## Friends mode — Sunline Expedition

Friends multiplayer now supports playable late joins, simultaneous admission,
paced world synchronization, acknowledged edits, persistent crew packs and
rejoining after disconnection. See the [implementation and validation report](docs/friends-multiplayer-validation.md)
for measured browser results and the remaining physical-device/network qualification.
[FRIENDS_MULTIPLAYER_PLAN.md](FRIENDS_MULTIPLAYER_PLAN.md) retains the original
audit and release gates. Earlier verification counts elsewhere are historical.

Choose **Friends mode** on the main menu, then **Open my island** to invite
friends or **Play on my own** to explore locally. Friends can use the room code
or invite link to join before or after play starts, up to five players total.
The setup screen also allows
choosing between **Survival / Reality Breach** and **Friends / Sunline Expedition**.
The host's choice is authoritative for guests. Survival retains its four worlds,
waves, breach events, extraction, starting resources and Imprint progression.

Friends hauling includes a physical salvage core on a marked pickup platform about 750m east-northeast of spawn. Its amber light column follows the block and stays visible through terrain and fog. Haul it home to the green Delivery Bay on the spawn deck; M shows the route and F registers a settled delivery.
The core resets there whenever you start a game. Press
**6** for the rope tool, click the core to attach, and pull together. **Hold aim**
reels; stand still to brace the powered reel. **Crouch + aim** feeds rope out.
**R** or another click releases it. Haul the core onto a train or Sunskiff deck
and **F** secures it in its current orientation. **M** shows the live core and Delivery Bay.
See [hauling controls and physics](docs/friends-hauling.md).

Friends mode is a separate daytime valley for one to five players. There are
four destinations, three recording receivers, a shared home beacon, three open
markets and a weapon foundry. Start with 750 credits, browse equipment and
refill health and ammunition near a market. Discoveries, recordings, the
cleared wreck and restored beacon save in the **host browser**, with permanent builds and project milestones under
`killsync.friends.world.v2`, with current/previous browser saves and an IndexedDB
backup. Older expedition progress migrates on first load. Crew identities and
field packs persist with the host's island; keeping the guest's browser data
allows a reconnect or rename to recover the same pack. Aircraft and the salvage
core reset when starting or restoring an island. Saved player railway state
persists; the Grand Traverse starts a fresh journey. This is separate
from Survival career saves.

Friends uses the controlled HTTP lobby service by default. `npm run dev`
provides it locally; production uses `npm run build` followed by
`npm run serve:multiplayer`. Static hosting requires deploying that service and
setting `VITE_MULTIPLAYER_SIGNALING_URL` to its HTTPS origin at build time.
Configure server-side TURN for restrictive networks as described above.
Survival retains its existing broker discovery and three-channel raw snapshot
path. Shared protocol **45** stays unchanged; Friends adds its own session
schema **1**, so every Friends player must reload this build.

Public-island guests initially have exploration access. The host can enable
editing in the field pack. A disconnected guest releases pilot and rope
ownership; a late join or guest recovery does not relocate an occupied aircraft.
Host departure ends the live session and gives guests a rejoin action.

Shooting, grenades and classes remain available. Creative building has its own
permanent library; it does not consume tactical structure charges. There are no ambient
waves, closing gas, timed extraction or breach events. Falling or being defeated
returns you to the arrival point without ending the expedition or removing equipment.

Friends starts on open ground. The old settlement, public shops, stations and
fixed train circuit are removed; your own saved construction remains.
Use **B → Railway** to build straight and curved tracks. Matching ends snap
together; level ground or a bridge must support the whole track. Clear trees
from the route first. Straight track costs 2 timber / 1 stone; curves cost 4 / 2.
Use **G → Rail cargo → Assemble train on my track** while beside your track.
Assembly costs 8 timber, 12 planks and 4 ingots. The train starts held; use
**Depart now** to run it. Longer lines add up to three open carriages and gangways.
Open lines shuttle between their ends; closed loops run continuously. Hold and
dismantle the train before editing track in use. Dismantling returns train
materials to shared storage and keeps cargo for your next train.

The Sunskiff is a futuristic aircraft with an open crew cabin. Walk toward its
front cockpit and press **F** to pilot: **WASD** flies relative to your view,
**Space** ascends, your **crouch key** descends (**C** on QWERTY / **W** on AZERTY),
**Shift** boosts, and **F** releases control. The aircraft steers toward your view;
movement follows its current heading. Standard movement bindings also support AZERTY.
Only the pilot uses a third-person chase camera; passengers stay in first person.
It holds position during play when controls are released or the pilot disconnects.
Whenever you enter, join, recover or restore a world, it returns to its designated
ground spawn with pilot controls cleared. Standing crew are carried back safely. Releasing
controls returns the pilot to first person inside the cabin, where another player
can take over. The aircraft and crew share a 6,000-unit altitude limit; the old
character flight limit does not apply here. Crew remain free operators, rather
than locked seats. **M** opens the expedition map.

The host transforms standing passengers with their deck's translation, turn
and ascent before applying their own movement. Jumpers inherit the platform's
linear and angular velocity and then use independent physics. Both host and guests
render vehicle poses and standing passengers on one buffered timeline. Passenger
offsets interpolate in deck coordinates, so turning cabins do not slide away from
their occupants. Aircraft collide with architecture and can land
on roofs already below them. Open cabins allow deliberate departures.

Vehicle fittings, locomotive, trees, rocks, flowers and workshop props include
45 locally bundled CC0 models from Kenney. The open aircraft frame and carriage
interiors are authored around their physical decks. Source URLs, original
licenses, textures and provenance are in
[Friends model credits](public/models/friends/README.md).

The 4 × 4 km frontier is an alpine island surrounded by ocean, with irregular
bays, submerged shelves, dune beaches, tall snowy massifs and forests. Shorelines
come from warped landforms rather than the rectangular world bounds. Meadows,
peat and mud, sand, exposed stone, snow, blue glacier ice and basalt blend by
climate, elevation and slope. Water uses terrain depth for shoals and surf. Fluid levels sit between terrain
steps to prevent coplanar shore flicker. A camera-following 128 × 128 grid carries
nearby waves; distant ocean shading stays on a single quad. The caldera has
windblown instanced smoke, drifting lava crust and a winding molten breach.
Forests use fewer, larger trees and spatially culled 3D instancing across the
entire island. Leaf geometry, alpha masks and lighting stay identical at every
distance. Offline bark simplification is selected only below 0.6 pixels of
estimated projected error; nearby trees retain full wood detail. Shared geometry
and textures replace the atlas bake and per-grove tree batches. Only nearby trees
cast shadows. Small shrubs and grass sit beneath them, with distant undergrowth
released from memory. **The World Gate** is a
colossal, physically open mountain arch above a glacial lake. **Crown of
Highfall** is a summit citadel with four ruined towers and a broken causeway.
**The Tidal Sanctum** combines a stepped ocean monument with a luminous ruined
gateway. **The Skyfalls** descend into a hanging basin on the western massif.
The volcanic **Ember Caldera** has a broken rim, a molten crater and black ash
fields. All nine survey sites appear in the atlas. The stone monuments share the same
voxel field as mining and collision, and the distant arch retains its opening.

The premade Lantern Descent, Copper Hollow and deep labyrinth keep their
original cave topology. Generation 4 retires prior settlement grades and terrain
edits for this landscape reset; subsequent excavation and grading persist. The
distant terrain uses smooth corner heights and slope normals. Exact, greedy
block surfaces load to 768 m ahead of the camera, remain fully detailed to
512 m and fade to the full-map horizon by 683 m. These shells include the
World Gate floor, walls and underside, without generating buried voxel grids.
Full volume meshes load around mining targets, persisted edits and shared
chunk borders; only local cave mouths preload until the player goes underground.
Surface and volume workers each have two outstanding jobs, and uploads are
limited to two meshes per frame. Surface geometry has a bounded travel cache;
inactive volume geometry is evicted by distance and memory. Packed volume
attributes use 32 bytes per vertex instead of 56. Gather timber, excavate soil and mine copper/iron.
Build your own workshop before crafting; there is no free starting workshop.

Terrain inspiration: the [hollow mountain island seed](https://www.youtube.com/watch?v=Xc7j1o0kpew),
[Lush Cave Island and broken-cove seed references](https://www.pcgamesn.com/minecraft/30-best-minecraft-seeds),
and [Minecraft's ancient cities](https://www.minecraft.net/en-us/article/ancient-city).
The island uses authored deterministic terrain and original ruins, rather than
importing a Minecraft world. Preview the actual renderer at
`/tools/frontier-review.html`, with dedicated views for the arch, citadel,
sanctum, waterfalls, whole island and existing caves.

### Building together

Tap **B** to build; hold **B** or choose **Library** to browse 27 pieces and five
finishes. Blocks, slabs, ramps, stairs, walls, real door/window openings, pillars,
beams, railings and roof pieces support walkable structures. Decorative pieces
include planters, benches, tables, lanterns, signs, survey lenses and gathering
beacons. Left click places, **R** or the wheel rotates, **E** paints, **C** moves,
**I** copies and **X** removes. **Ctrl/Cmd+Z** undoes your own edit; add **Shift**
to redo. A later friend's edit is protected from your undo. The library also
provides these actions, host-controlled guest access, and JSON export/import.
Public lobbies start with guest editing disabled; the host can enable it.

Builds share authoritative placement validation and movement physics with guests.
The world budget is 1,024 pieces and the build height limit is 6,000 units. Placement
protects players and the small arrival/helicopter spawn reserves.
Tracks and assembled train state persist; the helicopter resets on spawn. Undo histories reset with a new session.

**M** shows the actual terrain, survey sites, helicopter spawn, crew and the
railway you built. A supported elevated survey lens establishes your observatory;
a gathering beacon with a nearby bench, planter and lantern completes a crew
meeting place anywhere you choose. These milestones award everyone 300 credits once.


## Sunline Frontier rebuild

The Frontier has a shared **24-minute day–night cycle**, starting at **09:00**.
The HUD shows world time, day and phase. Sunrise and sunset blend continuously;
the moving sun and moon drive terrain lighting and shadows, while stars, cloud
colors, ocean/lake reflections and distant forests follow the same world clock.
Tunnel roofs occlude the sky naturally, so open entrances retain the exterior
view. New sessions begin at 09:00; late joiners use the host's current world time.
The [cycle plan](docs/day-night-cycle.md) describes the rendering and performance
choices. The development [render review](http://localhost:3000/tools/frontier-review.html)
provides time presets, a scrubber, accelerated playback and a cave-shaft sky check.

Press **C** in Friends mode to open **Developer settings**, then enable free
flight from the menu. **C** or **Escape** returns to the island. The menu offers
dawn/noon/sunset/midnight presets, an exact time input, pause/resume, cycle speed
from 0.25× to 120×, and cloud wind from stationary to 4×. These environment
overrides apply locally; **Reset environment** returns to the shared world clock.
Flight still follows your view, with **Space** to rise, **Ctrl** to descend and
**Shift** to boost. Clouds now share their wind, density and heights with an
optical shadow atlas: their billowy shapes move with their shadows. Cached cloud
density replaces repeated procedural noise work; distant clouds use fewer samples.

Friends mode now includes editable voxel terrain, harvesting, ore smelting, material-funded construction, shared storage, train cargo and regional supply deliveries across a 4 × 4 km frontier. Press **G** for your field pack, **B** to build and **M** for the atlas. Tools occupy keys **1–4**, with combat on **5**.

See [FRIENDS_FRONTIER_IMPLEMENTATION.md](FRIENDS_FRONTIER_IMPLEMENTATION.md) for controls, persistence, validation and current limits. Asset provenance lives in `public/models/friends/quaternius/README.md` and `public/textures/frontier/README.md`.

The old Friends settlement’s rectangular terrain flattening has been removed. Rolling terrain now continues through the former starting area, with small circular blends under spawn points. Older saves preserve only localized ground around player builds and excavations; the remaining landscape regenerates naturally.

Friends playtesting currently uses **free construction and train assembly**, with **uncapped field packs and cargo**. The nearby **Lantern Descent** sinkhole is northeast of arrival; its 51 routes now connect 41 chambers across five deep districts, including the original stone crossing over an abyss, blue mineral vault, lower well and remote royal treasuries. Your held **flashlight** follows your look direction with a broad white beam and soft edges. It starts unequipped. Press **V** to equip or stow it; switching it off also hides the flashlight arm while keeping your harvesting tool visible. Press **N** to equip or stow **night vision goggles**, which start switched off. Infrared assist reveals the cave walls and distant routes through green phosphor optics, with soft eyepiece edges, subtle grain, highlight compression and a smooth activation transition. Night vision is local to your view and works independently of the flashlight. Only sparse landmark torches remain underground, leaving long routes and remote hoards dark. Find 77 treasure chests and press **F** (or your bound interact key) nearby to open them for 5,000–115,000 gold each. Chest openings and the shared crew gold treasury persist with the host’s world; gold currently has no spending function. Locate its entrance on **M**, or follow the approach torches. **G → Return to arrival point** gets you back from the depths. The development render review includes Cave entrance, Split Cathedral, Blue Vault and Deep treasury views, plus flashlight, night vision (**N**) and chest-opening preview controls.
