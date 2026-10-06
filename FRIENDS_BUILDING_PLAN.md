# Sunline Together — Friends mode building design

Planning only. Written 5 October 2026 against the current working tree, including the existing uncommitted Friends mode work. Nothing in this document is implemented unless explicitly listed as existing. Proposed names, dimensions, budgets, and pacing are design targets to validate in play.

## The game we are making

**Explore a beautiful valley, build places worth coming back to with your friends, and make your creations useful to the whole group. Choose a fight when you want one, then return safely to the world you made.**

Keep Sunline's identity: a warm science-fiction valley, a sightseeing train, an open crew aircraft, old recordings, and a home beacon. The creative hook is watching this valley become visibly yours. A station-side café, a garden above the greenhouse, a bridge between friends' houses, and an observatory on your own tower should all be possible with the same small set of pieces.

Building becomes Friends mode's central activity. Exploration supplies inspiration, materials finishes, props, and projects. Combat supplies an optional change of pace. Beautiful construction must be available immediately, and peaceful players must have a complete progression path.

The ambition for 2026/2027 is a product direction, not a forecast we can guarantee. First prove that a small group wants to build, use, and revisit one place together. Popularity depends on playtesting, reliability, discovery, and execution beyond this design.

## What exists, and what needs to change

| Verified existing system | Design consequence |
| --- | --- |
| Separate Friends world and mode, one to five players, host-authoritative WebRTC simulation | Extend this mode; keep Survival's combat construction and progression intact. |
| Depot, Glass Gardens, Echo Archive, Rustwater; markets, foundry, three recordings, home restoration | Reuse these as starting locations, project anchors, and peaceful progression. |
| Four-stop train with walkable carriages; pilotable Sunskiff with free crew; jet movement | Use transport for social journeys and construction scouting. A high destination alone cannot justify building. |
| Barricade, Bastion, fence, healing relay, decoy, predefined Worldlink bridge | These are tactical tools. They are not the creative catalog. The predefined bridge is not a general bridge editor. |
| Two tactical structures per player; ten per squad; fabricator charges; ordinary 120-second lifetime, 14-second Bastion lifetime; abandonment cleanup | Do not inherit these limits, costs, timers, or cleanup into creative builds. |
| Tactical structure poses have x/y/angle, without a placement elevation; existing walkable wall top is fixed | Stackable blocks, ramps, ceilings, and elevated editing need new spatial data and collision behavior. |
| Friends progress saves discoveries, recordings, cleared salvage, and restored beacon in host localStorage | Buildings, ownership, project state, and edits currently have no durable save. Persistence is essential to the new loop. |
| Rustwater interaction spawns eight guards; mission anchors discourage pursuit beyond 700 units | This is a pursuit rule, not a guaranteed safe boundary. Current damagePlayer has no Friends region eligibility check. |
| Interest-filtered snapshots, entity deltas, snapshot fragmentation, prediction, instanced world decoration | Reuse these foundations, but do not assume thousands of build pieces fit existing replication or rendering budgets. |

Source anchors: `FriendsExpedition.ts`, `FriendsRegion.ts`, `FriendsSimulation.test.ts`, `CoopFieldEngineering.ts`, `CoopSimulation.ts`, `MultiplayerArena.tsx`, `MultiplayerRendererBridge.ts`, `LocalPlayerPrediction.ts`, `FriendsWorldVisuals.ts`, `snapshotReplication.ts`, `snapshotInterest.ts`, `snapshotTransport.ts`, and `ManualWebRTCSession.ts`.

## The session loop

1. Meet at the depot; see what the group changed since last time.
2. Choose a shared project or simply decide what you want to make.
3. Ride or fly out to discover a place, finish, prop, or project opportunity.
4. Build together: one player shapes the route, another makes a roof, another decorates. Roles are voluntary and interchangeable.
5. Use the result: walk the new route, watch the train from the terrace, activate the observatory, gather at the garden.
6. Optionally visit Rustwater for a short fight. Friends elsewhere continue building safely.
7. Leave knowing the world is saved; return to extend it.

The first two minutes should allow a player to place, rotate, stack, paint, remove, and undo. A first-session target is a small shelter or lookout within ten minutes, then a shared useful project within roughly thirty. These are playtest targets, not timers imposed on players.

## A small construction language with a large expressive range

Use modular blocks inspired by Minecraft's immediacy, with Sunline's own materials and silhouettes. Geometry, finish, and color are separate choices. A timber ramp and a stone ramp have the same physical shape; they are not duplicate catalog entries.

Provisional base unit: 64 simulation units; half-unit: 32; thin panels: 8. The current player radius is 19 and movement has several different clearance assumptions. Validate scale in first person, with crew, and with camera overhead behavior before freezing dimensions. Start with a 128-unit clear doorway height and generous corridors. Display friendly piece names rather than simulation units in the UI.

### Construction catalog

| Piece | Purpose | Delivery |
| --- | --- | --- |
| Full cube | Foundations, terraces, towers, large forms; 64³ target | First playable slice |
| Half block | Low steps, ledges, wall caps; 32 high | First playable slice |
| Floor slab | Floors, bridges, ceilings, balconies; 8 thick | First playable slice |
| Gentle ramp | Walkable slope; 64 run / 32 rise target | First playable slice |
| Long ramp | Same incline; 128 run / 64 rise | First playable slice |
| Stair block | Compact access; initially the same rise as the gentle ramp | First playable slice |
| Wall panel | Thin full-height wall; stack vertically | First playable slice |
| Window frame | An actual opening with matching collision | First playable slice |
| Doorway frame | An actual walk-through opening; no door animation required | First playable slice |
| Pillar | Visually light supports, porches, pavilions | First playable slice |
| Beam | Horizontal structure, pergolas, bridge frames | First playable slice |
| Railing | Balcony edges and routes; physically matches its silhouette | First playable slice |
| Roof slope | Pitched roofs, distinct from a walkable access ramp | After the slice |
| Roof corner | Makes joined roofs finish cleanly | After the slice |
| Roof ridge / cap | Finishes roof intersections and exposed edges | After the slice |
| Arch | Arcades and garden entrances | After the slice |
| Corner / triangular block | Diagonal corners and sculpted forms | After the slice |
| Cylinder | Towers, round features, planters | After the slice |
| Glass panel | Conservatories and glazed rooms | After the slice |
| Shallow foundation pad | Clean contact with terrain and authored terraces | After the slice |

Quarter turns, face attachment, and vertical stacking must work across the starter kit. Floors and walls may use a small number of explicit orientations; avoid arbitrary three-axis rotation until physics and controls support it cleanly. Thin pieces use named face sockets rather than ambiguous overlapping grid cells.

### Social, decorative, and useful items

| Item | Why it belongs | Delivery |
| --- | --- | --- |
| Warm lamp / lantern | Makes a small build feel inhabited; emissive first, limited real lights | First playable slice |
| Planter | Immediate color and greenery using existing Friends assets | First playable slice |
| Sign | Name a place and give friends directions | First playable slice |
| Bench / table | Gathering spaces; physical seating interaction can follow later | First playable slice, static |
| Potted tree / flower bed | Gardens, courtyards, personal expression | After the slice |
| Rug / path tile | Detail without making every room bulky | After the slice |
| Banner / pennant | Group colors and landmarks | After the slice |
| Shelf / display plinth | Personal souvenirs and discovery trophies | After the slice |
| Door / gate | Openable shared spaces; persistent permissions, no player trapping | After the slice |
| Survey lens | Mounted observatory project; turns a build into a discovery tool | Project milestone |
| Signal relay | Makes a restored landmark visibly join the valley network | Project milestone |
| Gathering beacon | A named map landmark and meeting cue; no teleport in the first release | Project milestone |
| Lift | Accessible vertical travel; use vehicle lessons after static geometry is stable | Later |
| Launch pad | Playful traversal and routes; controlled impulses and guest prediction required | Later |

Suggested initial finishes: cream stone, warm timber, brushed teal metal, mint glass, and pale plaster. Use a curated set of complementary colors rather than an unrestricted RGB picker. Starter construction shapes and at least stone, timber, and metal are available immediately. Discoveries unlock additional finishes and props, not the ability to make a basic staircase or shelter.

Base geometry is reusable without a resource grind or fabricator cooldown. Unlocks are permanent for the world; changing or removing a piece is free. Credit economy remains available for weapons and optional decorative purchases, but no basic building material depends on killing enemies.

## How building should feel

- Enter the existing build mode and get the Friends construction palette. Use four readable groups: Shapes, Architecture, Garden & Social, Utilities. Keep a favorites bar and an eyedropper to copy an existing piece and finish.
- Aim at the ground or a piece face; preview the exact elevation, shape, orientation, and collision. Host and preview share validation rules. Rejections explain the concrete issue: player in the way, protected railway, overlap, permission, range, or world budget.
- Place on top of, beside, or underneath pieces. Build while standing on your creation; do not inherit the tactical ground-only editing restriction. Ray targeting chooses the actual face rather than a ground-plane point in front of you.
- Rotate, paint, move, duplicate, remove, undo, and redo. Finish the basic single-piece controls before adding rectangle fill, copy groups, symmetry, or reusable blueprints.
- Support mouse/keyboard, AZERTY, controller, and touch through the existing control layer. Exact bindings follow a conflict audit; do not assign a new function to an already occupied key without context handling.
- Initial attachment must meet terrain, allowed architecture, or an existing piece. Hardlight construction stays suspended when supports are edited away. No gravity collapse simulation or chain destruction; friends can experiment without losing a house.
- Never place a solid through a player, block required interactions, or fill vehicle boarding areas. Provide a reliable return-to-depot action if a player becomes stuck in an edited space.
- Show a friend's temporary placement preview with their color, an unobtrusive name, and rate-limited updates. Accepted pieces use their chosen finish, not a permanent owner tint.

Default private trusted-friends worlds allow shared editing. Public squads default new arrivals to visitor status until the host grants builder access. Permissions are enforced by the host. Stable world builder identity is separate from an ephemeral connection/player ID; reconnecting must preserve authorship and permissions. A browser identity is not a cross-device account. Offer an explicit local identity transfer/reclaim path rather than promising automatic ownership across devices.

Undo is revision-aware: reversing your edit may not erase a later edit from another friend. The host can restore a saved world revision. Group-edit tools must preview their footprint and apply as a bounded atomic transaction.

## Building for a reason

Use a **shared project board** at the depot, with a few visible invitations and persistent world changes. Accept projects as a group activity; they never forbid free construction. Requirements describe function, not a prescribed house shape or a count of arbitrary cubes.

### First project: The Garden Walk

Add a modest authored separation between the Glass Gardens approach and an elevated garden terrace. This separation is proposed terrain/content work; the current flat valley does not already contain a usable bridge puzzle.

Build a continuous, player-clear route between two marked endpoints. A straight ramp, terraced staircase, or elaborate covered bridge should all qualify. Flying remains a valid way to inspect and reach the terrace, but it does not create a permanent public route. The completed walkway unlocks a garden finish/prop set and activates a planting display on the terrace. The group can name the route and add a gathering marker.

The host verifies connected traversable surfaces, slope/step limits, width, headroom, and endpoint connection using the same shape definitions as movement. A visual chain of touching cubes is insufficient. The first project must be small enough to validate reliably before generalizing to arbitrary large constructions.

### Second project: The Echo Observatory

Reuse the Archive's spire and recording theme. Build a terrace or tower with a survey lens attached to an eligible player-built mount in an authored sky-view volume. Clear sightlines and a usable standing area matter; a specific block arrangement does not.

The lens reveals a new peaceful discovery and changes the restored beacon's constellation display. Aircraft scouting helps choose the site and brings friends to the build; parking an aircraft in the sky does not substitute for a saved mount. Art and sound should make activation a shared moment.

### Third project: Sunline Commons

Create a named gathering place near the depot using an accessible floor area, a gathering beacon, and a small choice of social props. A café, garden pavilion, sculpture court, or station terrace can all qualify. Reward an arrival sign, a small celebration, and new decorative choices. Do not make mandatory simultaneous player attendance exclude solo players or groups whose schedules differ.

### Extend only after these are fun

Add a ridge lookout, a greenhouse restoration, and player-authored walking/jumping routes with start and finish markers. Player courses may score traversal, but optional course rules must be explicit before starting. Blueprints and photo tools follow when building and saving are reliable. Avoid procedural continents, complex automation factories, terraforming, and new crafting survival meters in this iteration.

### Long-term purpose

The valley develops from a few disconnected old landmarks into a network of places your group designed. Its silhouette, station views, signs, project souvenirs, and beacon display tell that history. Finished projects grant a permanent milestone and unlock; removing their functional build changes the project's live status to “route unavailable” or “mount missing,” without taking away earned rewards. Rebuilding restores the live function and cannot farm the initial reward.

## Optional combat with a hard safety contract

Rustwater becomes a clearly enclosed **combat reserve**. Keep the existing wreck and initial eight-enemy encounter. Survey an authored boundary around those assets while keeping the train, public routes, receivers, and outside retreat space safe. Final coordinates follow layout inspection and playtesting rather than an invented radius.

Rules:

1. Nothing starts from wandering near the wreck. Activate the encounter at a terminal, with its cost/reward and boundary plainly visible. If inactive, the reserve is safe too.
2. Only alive players inside the active combat volume are eligible enemy targets or recipients of combat damage. Safe players outside continue their own activities.
3. Crossing outside ends attack eligibility immediately in authoritative simulation. No retreat timer, lingering damage tick, knockback, or attack windup may hurt that player outside.
4. Enemies remain inside. Projectiles, beams, blasts, hostile zones, and damage-over-time cannot extend combat into the safe valley. Clip offensive effects at the boundary; also apply the eligibility check at final damage resolution.
5. Player offensive effects cannot deal encounter damage across the boundary in either direction. This prevents safe-side sniping and splash/spell exploits. Boundary-side classification is host-owned and evaluated during effect travel and hit resolution, not based solely on where a shot started.
6. The combat volume includes height so a player flying over it is safe above its visible engagement ceiling. A pilot cannot silently enroll passengers: entering an active reserve with crew requires their encounter opt-in, or the aircraft is held outside the volume. Scope and UI must make this understandable before flight entry.
7. Keep a retreat opening and safe staging space clear. Permanent creative construction is initially excluded from the combat reserve; tactical tools may later be exposed there as a separate contextual category. Enemies never damage permanent creative pieces in the safe valley.
8. When the last participant leaves, cancel windups and hostile effects immediately. Reset the unfinished encounter after a short empty grace period; no credits, loot, or completion reward for abandonment. An individual may retreat while others keep fighting.
9. Defeat retains current depot recovery and equipment preservation. Completion pays a reward once for that encounter. Preserve the migrated “salvage cleared” milestone; repeating the reserve is an explicit later choice with separate reward bookkeeping.
10. All building and peaceful project rewards remain attainable without combat. Rustwater rewards credits and optional souvenirs, never mandatory construction shapes or exclusive essential tools.

Show “SAFE VALLEY” / “COMBAT RESERVE — ACTIVE” as understandable state, with a low boundary effect, posts, signs, map outline, entrance cue, and retreat cue. Do not rely on red/green alone. Ties at the boundary resolve safe; use a small inward activation margin to prevent repeated toggles without adding a retreat delay. Damage eligibility uses the player's current host position, including movement on a vehicle, before attacks resolve.

The existing gas-enclave target rejection and hazard cancellation are useful patterns. They are not proof of a complete Friends safety system, and adapting them must leave Survival behavior intact. Audit every direct armor/health mutation, damage-over-time path, hazard effect, and offensive interaction before claiming the contract is implemented.

## Visual identity

Make basic builds look good without advanced skill: warm materials, compatible proportions, clean roof joins, restrained trim, soft highlights, and greenery. Keep transparent materials selective; broad glass-heavy builds need a measured rendering budget.

Reuse the existing cream/teal/mint/amber valley palette, ringed planet, bundled Kenney vegetation and props, and train/aircraft silhouettes. Add shared geometry variants and material finishes rather than a separate imported model for every color and shape. Procedural trim or bevel geometry must agree with physics at gameplay edges.

Light should frame builds and friends. Use emissive lanterns and a small nearby real-light budget, rather than hundreds of shadow-casting point lights. Preserve daytime as the starting presentation. A gradual golden-hour cycle is a later art experiment, contingent on readability and low-end performance.

Completed projects need visible consequences at distance: a planted terrace, lit observatory, new station sign, or beacon pattern. A toast and a coin increase alone do not deliver the promised world-building experience.

## Implementation architecture, when authorized

Create a separate Friends construction domain rather than adding twenty creative entries to the tactical structure union.

- `FriendsBuilding.ts`: catalog and shape IDs, finish IDs, integer grid/socket poses, stable piece IDs, world and piece revisions, placement/edit/permission validation, undo transactions, and spatial chunk index.
- `FriendsBuildGeometry.ts`: shared shape contract for bounds, faces/sockets, walkable surfaces, side collisions, ceilings, ray intersections, and attachment. Shared mathematical data can be consumed by renderer and simulation without importing Three.js into simulation.
- `FriendsBuildVisuals.ts`: chunked instances grouped by shape and finish, explicit transparent sorting strategy, edit highlight, placement ghost, and limited nearby decorative animation.
- `FriendsBuildPalette.tsx`: Friends-specific catalog, finishes, favorites, contextual controls, feedback, and permission state. Integrate through existing arena and control layers.
- `FriendsProjects.ts`: project definitions, host validation, milestone rewards, live functional status, and map markers.
- `FriendsCombatRegion.ts`: authoritative volume, participant state, effect-boundary checks, reset/completion lifecycle, and presentation data.
- `FriendsWorldStorage.ts`: versioned durable world data, migration, autosave, revision backups, and export/import.

These are proposed responsibilities and filenames, not a requirement to create all modules at once. Keep `FriendsSimulation`/the Friends branch of `CoopSimulation` as the integration point for players, vehicles, damage, and tick ordering. Avoid moving all Survival code during this feature.

### Movement and physics

Host movement and guest prediction must consume the same build collision queries. Evaluate slopes as surfaces with changing height, floors only when crossed from above or stepped onto legitimately, and ceilings independently of floors. Current fixed wall tops and x/y collision callbacks cannot simply be reused for stacked cubes.

Handle walking up/down ramps, stair transitions, wall jumps, landing on thin slabs, walking under slabs, looking upward to place, and deleting a floor beneath someone. Editing under a player should lead to a normal fall/recovery, not teleporting through a roof. Extend aircraft side/roof/landing collision to creative builds so it cannot fly through a friend's tower. Preserve train passenger transforms and momentum.

Protect the train's entire swept envelope, including curves, locomotive, roof clearance, and boarding points. Elevated bridges may cross above the route only with adequate clearance. Required terminals, receivers, markets, foundry, home beacon, and depot respawn each need a protected interaction volume and approach path, not just a point exclusion.

### Networking

Keep dynamic combat/player/vehicle snapshots separate from the large mostly static build world. Bootstrap guests with bounded chunk data and revisions, then send host-accepted edit transactions. Retain data-channel size/backpressure limits; queue and acknowledge transfers rather than silently dropping creative edits when buffers fill.

Requests contain intent, a monotonically unique operation identity, and relevant revision; the host authenticates sender mapping, permission, bounds, finite/integer pose values, catalog IDs, overlap, reach, budgets, and expected revision. Handle duplicate, concurrent, stale, and reordered operations. Rejected or unacknowledged requests must not become permanent local geometry. Recover a revision gap by requesting the affected chunk, and rebuild indices before enabling nearby movement.

Use explicit chunk subscribe/unsubscribe messages. Losing visibility is not deleting a saved piece. Send globally useful project/map metadata even when detailed geometry is outside interest range. Prioritize chunks needed for landing or fast aircraft approaches; an unknown chunk cannot be treated as known empty space. Increase protocol version once and reject stale clients clearly.

### Persistence and ownership

Migrate the existing `killsync.friends.expedition.v1` progress into a versioned world record without overwriting the source. Use IndexedDB for pieces, project state, permissions, and bounded revision history. Save after accepted edit batches with a short debounce and show dirty/saving/saved/error states; an accepted edit and a durable edit are distinct. Page close cannot be the sole persistence mechanism.

Keep an intact previous revision, validate imports, and offer downloadable export/import. Initial hosting remains browser-owned: the world stops when its host leaves; cloud saves, seamless host migration, and an always-online world are separate infrastructure work. Make this limitation clear in world setup. Catch storage failures and keep unsaved edits recoverable through export rather than claiming success silently.

### Budgets

Start measuring at 2,000 pieces per world and 800 nearby rendered/collidable pieces. These are engineering trial loads, not promised final caps. Profile a five-player host, a weaker/mobile guest, a tall stack, a glass-heavy room, simultaneous edits, and a fast aircraft approach. Index collisions locally, instantiate shared geometry, and update only dirty chunks. Choose final piece/height/decoration limits from measurements and display them honestly.

## Delivery order and completion gates

### 1. Permanent building playground

Ship the twelve starter construction shapes, four static decor choices, three initial finishes, face placement, stacking, elevated editing, shared host validation, mouse/controller/touch basics, permissions, basic undo, collision, save migration, and bounded build replication. Protect public infrastructure and handle aircraft collisions. Place it in an existing depot clearing.

Gate: two players can build and walk through a two-floor pavilion with ramps and windows; a guest's movement agrees with the host; duplicate requests cannot create extra pieces; the host can restart and recover it; the aircraft and railway remain usable; an unauthorized guest cannot edit it. Prototype one ramp/floor/cube locally before broadening the catalog.

### 2. Guaranteed optional combat

Define and present the Rustwater volume; implement target/effect/damage gating, individual safety, crew entry handling, reset lifecycle, and reward deduplication. Keep the existing initial guard roster so the first milestone proves rules rather than adding enemy content.

Gate: a player outside takes zero combat damage while another fights inside, including delayed attacks, projectiles, spells, hazards, height crossings, and moving platforms. Safe-side attacks cannot farm encounter rewards. Retreat works mid-windup and at low health.

### 3. The first reason to build

Author The Garden Walk's small terrace and endpoint volumes; add the project board, route verification, shared unlocks, gathering marker, and visible garden restoration. Implement permanent milestone versus current route availability.

Gate: several structurally different accessible builds complete the project; a disconnected or blocked route does not; flying to the endpoint alone does not; all rewards are obtainable peacefully; deleting/rebuilding cannot repeat the reward. Playtest with people who did not author the system.

### 4. Beauty and return visits

Add roofs and finishing pieces, curated decorations, group blueprints/copy tools after revision-safe edits, the Observatory and Commons projects, arrival presentation, signs and souvenirs. Extend route/project variety only after players voluntarily use the first one.

Gate: a group chooses to return to its saved place, can find what changed, and enjoys using its constructions. Inspect first-person screenshots and moving footage on the target devices; menus and a wide shot alone are insufficient visual QA.

### Later, based on evidence

Lifts, launch pads, photo tools, course sharing, more valley regions, public discovery, cloud saves, and hosted worlds. Each has a distinct physics, social, or infrastructure cost. Do not make their completion a prerequisite for the first compelling session.

## Verification plan

- Meaningful simulation tests: shape collision and ray targeting; slope/headroom cases; host/prediction agreement; protected-route placement; permission persistence; concurrent edit rejection; safe revision-aware undo; migration and storage failure recovery; delayed hostile effects at every boundary crossing; no duplicate rewards.
- Transport tests: late join, dropped acknowledgments, duplicate edits, chunk revision gaps, bounded transfer/backpressure, stale protocol, reconnect, and interest unloading without data loss.
- Regression suite: Survival tactical charges/lifetimes/limits, gas and breach behavior, weapon/spell/grenade behavior, train walking/jump momentum, aircraft boarding/flight/landing, existing recordings and depot recovery.
- Browser/device playtesting: solo, two-player, five-player, controller, touch, AZERTY, guest latency, host reload, world export/reimport, and a representative large build. Run normal type/build checks and relevant existing tests during implementation.
- Product observations: time to first successful build, placement/undo mistakes, whether players use their route, whether safe players trust the boundary, return visits, and qualitative reasons to keep or delete the creation. These are proposed observations; no analytics system or user results currently exist.

The next implementation should deliver a small, beautiful, reliable place two friends can actually build and revisit. Once that works, the project loop has something real to grow from.
