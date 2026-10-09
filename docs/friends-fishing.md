# Friends casual fishing

Implemented October 9, 2026. The Friends toolbar has compact 54 × 46 px tool
slots, a small pack-capacity label, and an additional fishing rod in slot **7**.
Existing slots and the G pack shortcut remain. Narrow screens scroll the slots
horizontally while retaining at least 44 px touch targets. Fishing adds only two
small contextual control buttons at the bottom of the screen.

## Interaction

| Equipped | Primary action / LMB / RT | Secondary action / RMB / LT |
| --- | --- | --- |
| Rod, ready | Cast toward reachable water | — |
| Rod, waiting | Retrieve early | Retrieve |
| Bobber submerged | Reel automatically for 2.8 seconds | Retrieve without a catch |
| Fish in hands | Throw in the direction of the view | Gently drop |

Touch players can tap the two small contextual buttons. F picks up a nearby dry
fish with the rod or empty hands equipped. Input edges prevent a held button
from automatically catching or immediately throwing a fish.

Each new cast draws an independent random **7–28 second** bite delay after
landing. The bobber teases, submerges, splashes and sounds a cue. The generous
four-second bite window requires one click. A missed bite draws a fresh random
4–14 second delay. One koi model varies continuously in size; size does not
change difficulty. There is no bait, inventory, score, tension meter or economy.

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
  Multiplayer protocol version 61 includes catch attribution and paid-out line
  length, alongside slot 7 and fishing input blocking.

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
Dragging into a bank or obstruction safely retrieves without a catch. Pickup
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
