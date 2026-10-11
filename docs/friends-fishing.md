# Friends casual fishing

Implemented October 9, 2026. The Friends toolbar has compact 54 × 46 px tool
slots, a small pack-capacity label, and an additional fishing rod in slot **7**.
Existing slots and the G pack shortcut remain. Narrow screens scroll the slots
horizontally while retaining at least 44 px touch targets. Fishing adds only two
small contextual control buttons at the bottom of the screen.

## Interaction

| Equipped | Primary action / LMB / RT | Secondary action / RMB / LT |
| --- | --- | --- |
| Rod, ready | Hold to charge; release to cast in the current aim direction | Cancel wind-up |
| Bobber on dry ground / a dock | Hold to retrieve without a catch; release to pause | Retrieve |
| Rod, waiting | Hold to retrieve early; release to pause | Retrieve |
| Bobber submerged | Hold to hook and reel; release to pause | Retrieve without a catch |
| Fish in hands | Throw in the direction of the view | Gently drop |

Touch players hold and release the cast button; the other contextual button remains a tap. Full casting power takes 1.2 seconds, then stays capped until release. A small power meter and rod wind-up show preparation. Short holds cast nearby; longer holds add distance and lift. Direction and pitch are taken at release, with no water targeting or snapping. Pointer capture preserves a hold when a finger moves off the button; cancellation and focus loss safely cancel preparation. F picks up a nearby dry
fish with the rod or empty hands equipped. Input edges prevent a held button
from automatically catching or immediately throwing a fish.

Each new cast draws an independent random **7–28 second** bite delay after
landing. The bobber teases, submerges, splashes and sounds a cue. The generous
four-second bite window requires pressing the primary action, then holding it to reel. A missed bite draws a fresh random
4–14 second delay. Larger catches take longer to reel in and periodically pull line back. Releasing the primary action pauses retrieval, crank animation and reel audio; holding it again resumes the same catch. Small fish take about 2.8 seconds, with another 1.6 seconds per size unit above 0.5. Surges fade near landing, and a hooked fish cannot escape during a pause or struggle. There is no bait, inventory, score, tension meter or economy.

The bobber uses a swept ballistic flight and can land anywhere. Terrain and walls intercept it, and dry landings keep the line attached without starting bites. Bite timing begins only after landing on exposed water; docks and bridges above water stay dry. Water eligibility is checked before hooking a fish and while waiting, so losing water cannot create a catch.

Fishing uses the same water field as swimming and boats, covering lakes,
rivers, pools and coastal sea without designated fishing spots. Casts and throws
check terrain and building obstructions. Fish land on actual ground or floors,
including bridges, and use the model's Out_Of_Water flop animation. Fish thrown
into water swim briefly at the surface, dive away and disappear. Players can
drop and pick up fish on land. Changing tools or entering menus/building,
swimming, flying, piloting or operating seated activities stows the rod and drops a held
fish. Retreat benches and skiff seats allow fishing. A skiff passenger holding a rod
does not row; the other player can control both oars. Operating seats still
stow the rod.

## Models and performance

The Quaternius CC0 rod and animated koi are bundled locally. Source links,
sizes, triangle counts and the license are in
[the model provenance](../public/models/friends/fishing/README.md).

- Rod: one shared palette mesh with a bend morph and a matching tip socket.
- Fish: one shared vertex-colored Lambert mesh, 1,494 triangles and six bones;
  each instance owns only its animation/skeleton state.
- Line: a fixed 25-node Verlet solver, four constraint passes, at most four
  substeps, reused buffers and one 48-triangle ribbon draw per active cast.
- Distant fish animation is throttled; fishing visuals beyond 1,800 world units
  are culled. Splashes and ground shadows use bounded instanced draws.
- Up to 32 active loose fish; oldest loose fish fade when another is dropped.
  Held catches are protected. Unattended distant fish expire after 90 seconds.
- The host owns timing, movement and ownership. Snapshots send casts/fish, not
  rope nodes or skeletons. Fishing state is transient and excluded from saves.
  Multiplayer protocol version 63 includes transient casting preparation, bobber flight and dry landing state, alongside catch attribution, paid-out line length, slot 7 and fishing input blocking.

Local browser samples in `artifacts/fishing/validation.json` measured fishing
visual-update CPU p95 at 0.2 ms for one cast and 0.5 ms for five casts or 32 nearby
loose fish. GPU frame-time medians in the same run increased by about 1.2 ms for
five casts and 1.8 ms for 32 nearby fish; single-cast variation was below the
baseline. These are local samples, not device-independent frame-rate guarantees.
Geometry/texture counts stayed constant after 960 fish-identity replacements.

## Validation

Final checks: 90 tests passed across fishing, line stability, tool controls,
hauling, swimming, rowboats, Friends simulation and snapshot handling. TypeScript
and the production build passed; Vite retains the existing large-chunk warning.
The arena browser run verified the revised timing and waited for the actual
held/drop/swimming presentations before capturing screenshots.

- `FriendsFishing.test.ts`: complete catch/release loop, wide randomized bite
  delays, missed bites, action edges, invalid water/obstructions, tool and seat
  cancellation, dry floors/bridges, pickup ownership, simultaneous release cap,
  cleanup, map-wide water integration, real host loop and snapshot roundtrip.
- `FriendsFishingLine.test.ts`: fixed buffers, finite positions, pinned
  endpoints, slack/retrieval, frame spikes and teleport recovery.
- `tools/test-friends-fishing.mjs`: real GLB merge, toolbar/mobile geometry,
  nine camera framing combinations, CPU/GPU samples, pool reuse, and real WebRTC
  host-to-guest catch/drop/pickup/swim-away replication.
- `tools/test-friends-fishing-arena.mjs`: real game mouse and keyboard inputs,
  rod selection, bite/reel/hold, drop/flop, pickup/throw/release and existing
  combat/rope shortcuts. Screenshots and results are in `artifacts/fishing/`.
- `tools/friends-fishing-review.html`: visual review harness for each phase.

## October 10 polish

The catch card shows rounded nose-to-tail lengths in centimeters, using the
normalized 34-unit silhouette as an 85 cm fish at size 1. The session log only
counts fish originally caught by the player, so borrowed pickups do not create
extra catches. Ordinary fish favor smaller sizes; 1.5% of draws reach the giant
2–4.2 size band. This remains one koi species, including stylized giant catches.

Held fish use a nearly straight animation and two-sided fin rendering. Hands
support the belly without hiding the tail, and very large fish move farther
from the camera to keep the silhouette inside desktop framing. Retrieval adds
a turning reel hand, rod flex and a brief catch arrival movement.

Walking away takes up slack and then pulls the bobber at a bounded speed;
walking toward it leaves the bobber afloat. The line settles onto the water.
Dragging onto a reachable bank keeps the bobber on the paid-out line and stops bites. Walls and steep ledges stop its movement without automatically reeling or deleting the cast. Moving beyond the original casting range also keeps the line attached; only an explicit reel returns the bobber. Pickup
checks line of sight, and initial releases no longer jump through a wall.

Three real CC0 recordings provide the cast, continuous reel and small water
impact. See [recording provenance](../public/audio/friends/fishing-sources.md).
There are no catch chimes or instructional popups. Bite ripples remain silent
after one quiet initial water cue. The line is visual physics, not a fish-fighting
or line-break minigame. Current screenshots and browser reports are in
`artifacts/fishing-polish/`.

Polish validation: 93 focused tests passed across fishing, presentation, line,
rowboats, swimming, controls, snapshots and audio. TypeScript and the production
build passed. Browser checks decoded all three recordings, verified one reel
voice and cancellation, checked fin rendering and framing, exercised the real
arena controls, and replicated the full catch/release loop over WebRTC.

## October 10 charged casting

Casting now follows press → hold → release for mouse, controller and touch.
The host owns charge timestamps, flight collisions, landing classification and
bite eligibility; clients present wind-up, power and replicated line state.
Secondary action, tool changes, blocking menus and invalid player states cancel
preparation. Fish throwing, dropping and bite retrieval retain their existing
single-press behavior.

Regression coverage includes capped holds, release-time aiming, distance and
pitch control, dry ground, bridges over water, walls, water disappearing during a
bite, preparation cancellation, and the real host catch loop. Browser checks
exercise casting controls and the full host-to-guest catch/release loop.

## October 11 casting motion and retrieval

Charging raises and draws the rod back. Release preserves that pose, accelerates
into a forward stroke over 180 ms, then eases into the ready position with a
brief damped tip recovery. The bobber starts its flight 150 ms after release,
as the forward stroke unloads. A separate cast timestamp prevents a nearby wall
or early landing from restarting the animation. Third-person rods use the same
stroke in the player's facing direction, with yaw applied after local pitch.

Empty retrieval scales with the current player-to-bobber distance at a nominal
85 world units per second, bounded to 1.4–6.5 seconds. Retrieval eases into and
out of movement, keeps the bobber above sampled ground, and uses a small lift
instead of the caught-fish arc. The crank turns about 1.6 times per second;
empty line has less rod load than a hooked fish. Reel audio loops for the
authoritative retrieval duration and stops when retrieval ends or is cancelled.

The stroke reuses a single pose object and the existing rod morph, attached
filament and line ribbon. It adds no meshes, draw calls or rope simulation.
Verification includes 68 focused tests, rendered backswing/forward/recovery
captures, four third-person headings, reel audio lifetime, actual mouse/touch
game controls, and the host-to-guest catch loop. See
`tools/test-friends-fishing-casting.mjs` for the casting visual regression check.

The subsequent aim fix starts the bobber just in front of the shared viewpoint,
instead of 24 units below it. The short launch offset is checked for obstruction
and the viewpoint respects crouching and low ceilings. Initial velocity follows
the release-time aim ray exactly; charge controls speed and gravity supplies the
arc, without a forced upward velocity bonus. The bobber and outgoing line appear
when the forward stroke pays out, avoiding a visible drop during the wind-up.
`tools/test-friends-fishing-aim.mjs` checks normal skyward, steep skyward and
downward casts through the actual game input and camera path.

## October 11 species and trophy catches

New catches choose from trout, perch, zander and pike in freshwater (including
rivers and pools), or mackerel, cod, tuna and shark when the bobber is in the
sea. Freshwater species have equal odds; sea odds are 45%, 35%, 17% and 3%
respectively. The host selects species and size at the hook, retaining both
through retrieval, ownership transfers, drop, throw and release. Protocol v64
replicates the species identifier. Missing species in older presentation
fixtures falls back to koi; new catches never select koi.

| Species | Smallest | Ordinary upper range | Trophy maximum |
| --- | --- | --- | --- |
| Trout | 15 cm | 70 cm | 140 cm |
| Perch | 12 cm | 40 cm | 95 cm |
| Zander | 18 cm | 90 cm | 160 cm |
| Pike | 20 cm | 110 cm | 210 cm |
| Mackerel | 15 cm | 45 cm | 95 cm |
| Cod | 25 cm | 110 cm | 220 cm |
| Tuna | 35 cm | 220 cm | 450 cm |
| Shark | 70 cm | 450 cm | 850 cm |

Sizes are continuous game ranges, with smaller catches favoured. Five percent
of each species enter the trophy range; trophy sharks start at six metres.
This makes six-metre-plus sharks approximately 0.15% of successful sea catches.
Fishing controls and bite/reel timings stay the same. Pickup reach includes
the fish's body radius so a dropped giant shark remains reachable.

Catch cards and the session log show species and length, with metres for
catches of at least one metre. The overall personal best includes its species.

Five new internet-sourced GLBs are bundled locally (about 692 KB total).
Trout is Poly by Google's CC BY 3.0 model; tuna and shark are Quaternius CC0
models. Pike adapts the trout; perch/zander adapt Quaternius Red Snapper;
mackerel adapts Tuna; cod adapts Coral Grouper. The five adaptations change
proportions and add species palettes, stripes or spots. They are stylized
approximations. Trout/pike use subtle procedural whole-model motion; other
species retain swimming/held/ground skeleton animation. See
[model sources, licenses and changes](../public/models/friends/fishing/README.md)
and the bundled CREDITS.txt for attribution.

Templates are cached per species and share mesh geometry/materials. Pooled
presentations dispose old skeletons on species changes and guard asynchronous
loads against stale replacements. No models are fetched from external sites
during gameplay.

Validation includes catch-pool/size-distribution tests, a complete giant shark
catch/drop/pickup/release loop, species snapshot roundtrips, and rendered
checks of all eight catches in held/reeling/dry/released states. Browser
captures, six giant-shark viewport/FOV checks and repeated species/pool
replacement results are in `artifacts/fishing-species/validation.json`.

## October 11 giant-shark fights and water landings

Sharks measuring at least **600 cm** use a dedicated water catch path. The
current hold-to-reel input, size-dependent retrieval duration and accumulated
`reelElapsedMs` remain the source of fishing effort. Ordinary fish retain their
existing surges, pause/resume behaviour, held catches, pickup, drop and throw.

Giant shark fatigue derives from active reeling effort divided by the existing
retrieval duration. Host time drives bounded runs and lateral swimming, including
while the player pauses reeling. Pausing adds no fatigue or retrieval effort.
Resistance, swimming speed and rod flex weaken as effort approaches completion.
The host controls movement, turning, fatigue and resistance; guests render the
same replicated result.

The shark's full-size model stays in the world, mostly submerged. Its imported
fin span and submerged belly are included in conservative footprint checks.
Depth, sampled floors, terrain/build obstacles and inflated rowboat hulls reject
unsafe positions. Movement is swept in small increments. Safe landing prefers
water alongside the angler and searches farther offshore when shallow coastal
water cannot accommodate the body. Giant-shark tethers allow up to 1,600 world
units (40 metres); ordinary casting/retrieval ranges are unchanged. A blocked
landing retains the fight at its last safe water position and retries; effort
alone does not award a catch or teleport a shark into place.

A tired shark arriving at safe water enters `landed`, with `tetheredBy` separate
from held-fish `ownerId`. The rod remains equipped and its line attaches near
the shark's mouth. The character keeps the rod pose, and the catch is never
presented in the first-person hands, thrown or picked up. `landedAt` records
completion and persists during release, allowing the catch log to count the
original catch once even if a short landing is followed by release between
snapshots. The UI offers one Release shark action.

Primary or secondary input releases a landed shark. Tool/menu changes,
swimming, death, disconnect and excessive tether distance also release it.
Secondary input can abandon an unfinished fight, without catch attribution.
Released giants gradually increase swimming speed and dive only where the
whole submerged footprint remains clear, fading after eight seconds. Attached
landed sharks are protected from loose-fish eviction; released sharks use the
existing bounded loose-fish pool. Fishing state remains transient.

Protocol **v65** carries the fight fields and the landed/tether/completion
state. Reload all multiplayer clients after this update. No extra model assets
or independent client fish physics are introduced.

Focused simulation tests cover pause/fatigue, safe footprint placement,
obstructed landing recovery, release/cancellation/disconnect and ordinary
fish regression. `tools/test-friends-giant-shark.mjs` exercises the real coastal
host simulation, desktop/mobile rendering, one-time catch credit, gentle
release and host-to-guest WebRTC fight/landing/release/cleanup. Captures and
measurements are in `artifacts/giant-shark/validation.json`. The boat catch
regression now holds the reel input after the bite, matching hold-to-reel.

Final giant-shark validation: 122 focused tests, TypeScript and production
build passed. The ordinary browser regression passed audio pause/resume,
model pool/memory checks and the ordinary WebRTC catch loop.
`tools/test-friends-giant-shark-arena.mjs` also passed real mouse hold/pause,
continued shark movement during pause, no premature catch credit, world
landing with the rod, one release button and real touch release. Its
desktop/mobile captures are in `artifacts/giant-shark-arena/`.

Review fixes: giant-shark body checks use conservative cached empty terrain
volumes, invalidated by terrain revisions and water epochs. Builds, boats and
trees remain live checks; tree candidates and vehicle poses are shared within
a host tick. Unavailable landing searches retry at most every 500 ms. A local
warmed five-player/five-shark CPU benchmark dropped from 41.9 ms median and
54.2 ms p95 per host tick to 5.5 ms median and 16.8 ms p95, with zero measured
ticks exceeding 50 ms. These measurements cover host CPU, not GPU frame time.
The fishing boat checks continuous hull overlap with build boxes, including
narrow walls between water probes. The seaside pier's shared raycasts include
glazing, rails and walking slabs, while preserving the entrance opening.
