<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# KILLSYNC — Reality Breach

**Current game version:** v0.1.0

**Multiplayer protocol:** 41 (all players must run the same version)

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
protocol 41 before connecting.

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
verification results, and prioritized follow-up work. Multiplayer protocol 41
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

Choose **Friends mode** on the main menu, then **Host Public Squad** to invite
friends or **Solo Practice** to explore locally. The setup screen also allows
choosing between **Survival / Reality Breach** and **Friends / Sunline Expedition**.
The host's choice is authoritative for guests. Survival retains its four worlds,
waves, breach events, extraction, starting resources and Imprint progression.

Friends mode is a separate daytime valley for one to five players. There are
four destinations, three recording receivers, a shared home beacon, three open
markets and a weapon foundry. Start with 750 credits, browse equipment and
refill health and ammunition near a market. Discoveries, recordings, the
cleared wreck and restored beacon save in the **host browser**, with permanent builds and project milestones under
`killsync.friends.world.v2`, with current/previous browser saves and an IndexedDB
backup. Older expedition progress migrates on first load. Inventory and vehicle positions reset when
starting a new session. This is separate from Survival career saves.

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

The 4 × 4 km map contains open meadows, woodland regions, block terrain,
mountains and a coast. Gather timber, excavate soil and mine copper/iron.
Build your own workshop before crafting; there is no free starting workshop.
Mirror Lake is shallow wading water; raised boardwalks retain normal walking speed.

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

Friends mode now includes editable voxel terrain, harvesting, ore smelting, material-funded construction, shared storage, train cargo and regional supply deliveries across a 4 × 4 km frontier. Press **G** for your field pack, **B** to build and **M** for the atlas. Tools occupy keys **1–4**, with combat on **5**.

See [FRIENDS_FRONTIER_IMPLEMENTATION.md](FRIENDS_FRONTIER_IMPLEMENTATION.md) for controls, persistence, validation and current limits. Asset provenance lives in `public/models/friends/quaternius/README.md` and `public/textures/frontier/README.md`.

The old Friends settlement’s rectangular terrain flattening has been removed. Rolling terrain now continues through the former starting area, with small circular blends under spawn points. Older saves preserve only localized ground around player builds and excavations; the remaining landscape regenerates naturally.

Friends playtesting currently uses **free construction and train assembly**, with **uncapped field packs and cargo**. The nearby **Lantern Descent** sinkhole is northeast of arrival; its 51 routes now connect 41 chambers across five deep districts, including the original stone crossing over an abyss, blue mineral vault, lower well and remote royal treasuries. Your held **flashlight** follows your look direction with a broad white beam and soft edges. Press **L** to switch it on/off; switching it off also hides the flashlight arm while keeping your harvesting tool visible. Only sparse landmark torches remain underground, leaving long routes and remote hoards dark. Find 77 treasure chests and press **F** (or your bound interact key) nearby to open them for 5,000–115,000 gold each. Chest openings and the shared crew gold treasury persist with the host’s world; gold currently has no spending function. Locate its entrance on **M**, or follow the approach torches. **G → Return to arrival point** gets you back from the depths. The development render review includes Cave entrance, Split Cathedral, Blue Vault and Deep treasury views, plus flashlight and chest-opening preview controls.
