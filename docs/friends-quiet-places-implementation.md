# Quiet places in Friends mode

Implemented 9 October 2026. The design proposal is in
[friends-quiet-places-plan.md](friends-quiet-places-plan.md).

## Places and controls

| Destination on the Friends atlas | What is there | Simulation position (X, Y, Z) |
| --- | --- | --- |
| Stillwater House | One room, three couch seats, picture and side windows, a hanging incandescent bulb on a black cord, a visible cream wall switch | 7680, 21696, 1352 |
| Skyfalls Bench | Two adjacent seats overlooking the hanging lake and falls | 8884, 21100, 904 |
| Gatewater Bench | Two adjacent seats on the World Gate's cavity floor, facing the glacial lake | 14116, 11308, 840 |
| Saltwind Camp | A coastal fire, five seats, bay and sea-stack views | 27248, 20704, 208 |

Press **F** beside a seat to sit. Press **F** again, or jump, to stand.
Players can look around while seated. Held equipment is hidden and weapon/tool
use is suppressed. Look at the house's rocker switch from nearby and press **F**
to change the lights. Every player can use these interactions, including guests
without building access. The switch is saved; occupancy is live session state.

Stillwater is 12 × 9⅓ metres, enlarged from the sketch for the game's capsule
clearance. There is no extra furniture besides its three-seat couch. The
interior uses white plaster, oak, timber trim and wool herringbone, with warm
light when on and cool window illumination when off. The bare bulb is the real Poly Haven Lightbulb 01 model by Josh Dean, with a warm filament and visible metal base. Pressing the rocker animates the existing character hand to the physical switch; other players see the reaching arm. Its approach trail climbs
from the hillside west of Skyfalls Shore to the porch. The outdoor decks have
short approaches; Saltwind also has a small stair landing. The paths use a
shared, surveyed floor profile and supported timber surfaces rather than edits
to the island. Gatewater samples the arch's lower floor, not its mountain roof.

## Texture and model sources

These are real, locally bundled Poly Haven maps with CC0 licensing:

- [Lightbulb 01](https://polyhaven.com/a/lightbulb_01) (Josh Dean; glTF and 1K maps)
- [White Plaster 02](https://polyhaven.com/a/white_plaster_02)
- [Wood Floor](https://polyhaven.com/a/wood_floor)
- [Wood Plank Wall](https://polyhaven.com/a/wood_plank_wall)
- [Poly Wool Herringbone](https://polyhaven.com/a/poly_wool_herringbone)

The texture directory's README and manifest record authors, download URLs,
physical scale, resolutions and provider-verified checksums. Source JPGs are
unmodified. Colour maps are sRGB; normal and roughness maps are linear. Wall and
couch colours are adjusted by material tint. No network downloads occur in play.

## Authority, compatibility and lighting

The host claims seats and validates switch range and aim through the existing
interaction action IDs. Repeated packets do not toggle twice. Static seats are
excluded from train occupancy. Standing searches safe exits; death, flight,
home travel and disconnection clear occupancy. Host movement and prediction
consume the same authored floor, wall, window, ceiling and approach geometry.
Cargo collision includes the room shell and furniture.

The entrance has 56 native units of clear width and 64 of headroom, with jambs
outside the opening. This clears the real player diameter of 38 units and its
50-unit standing collision height. The switch sits on the remaining wall beside
the widened opening. Regression coverage walks the real controller in and out.

The house shell renders the exposed union of its collision volumes, assigning
oak, plaster and exterior timber to separate faces. It no longer overlays full
timber boxes on plaster. Window trim corners meet without overlapping, support
posts end below deck surfaces, and couch cushion seams avoid coplanar fronts.
The boardwalk uses one strip with rounded bends and shared render/collision
cross-sections, ending at the landing edge instead of overlapping the floor.

Existing saved construction or terrain edits at a footprint or approach disable
that destination. Player work wins and is not overwritten. Active room/support
areas reject new obstructing builds and terrain work with a clear message.
Vegetation is excluded from the footprints and approaches.

Room fixtures retain a stable shader layout when toggled. The bulb light and its ambient fill
are bounded to the shell, with a separate short-range window spill. Sun
illumination is admitted through window apertures. Sofa occlusion is analytic;
there is no additional room shadow-map sampler. This avoids the full world's
16-sampler limit with terrain and crew flashlights. Artificial fixture and
bounce illumination fades out with the switch.

Room-light bounds include a half-unit tolerance. Reconstructing a fragment's
world position at the island's large coordinates otherwise put ceiling pixels
alternately above and below the exact boundary, producing flickering black lines.
The tolerance remains below the exterior roof top and retains light containment.

The bulb's glass envelope has warm emission in addition to the model's textured
filament. Its glow and glass opacity follow the same switch fade as the room
light, making the actual bulb visibly luminous when on and transparent when off.
The hanging cord and socket keep their ordinary surface materials.

## Scope decisions

Saltwind has a permanent, modest fire and five static seats. Fuel and roasting
remain at the existing Commons campfire; Saltwind does not add a second cooking
or resource-management loop. The existing Commons simulation is preserved.

Last Light's summit terrace is deferred with the proposed gondola access. It is
not shown as an available destination. This change does not build a gondola.

## Verification

The focused tests exercise unique concurrent seats, safe standing, death,
wall/window access, aimed switch presses, action retransmissions, old/off saves,
world export/reload, the real baseline/motion replication codec, protected
support, saved build conflicts, and continuous terrain-clear approaches.

The browser review uses the production simulation and renderer, five crew
members, daylight/night views, couch and outdoor seats, and on/off room photos.
Its second renderer consumes the real world baseline and motion messages and
checks the same switch state and a distinct adjacent seat. This is codec and
renderer coverage, not a live WebRTC connectivity test. The existing multiplayer
transport is unchanged.

Run `node tools/test-friends-retreats.mjs` with the Vite server on port 3000 (or
set `FRIENDS_TEST_ORIGIN`). Captures and the machine-readable error, shader,
seat and frame-time report are in `artifacts/friends-retreats/`. Frame times are
local, warmed, GPU-synchronised render measurements of matched on/off views;
they do not measure a feature-disabled baseline or promise another device's FPS.

Initial implementation checks on 9 October 2026:

- Full suite: **176 test files / 1,450 tests passed**, with four workers.
- TypeScript and production build passed; Vite retains its existing large-bundle warning.
- Production browser review: no WebGL/shader errors or failed retreat textures;
  the downloaded bulb loaded, and the animated palm reached the rocker within
  0.01 native units after a real authoritative interaction.
- The coastal fire held five unique occupants. The second renderer received
  the same lights-off state through baseline/motion replication.
- Repeated toggles retained 154 GPU programs. Warmed, GPU-synchronised median
  render times in the matched local view were 6.5 ms on / 6.9 ms off. These
  figures are specific to this machine and review scene.

The suite also caught two stale expectations for the independently added sixth
Friends tool; its pause-menu label and network-clamp tests now reflect that
current input schema. No tool-selection behavior was changed by this retreat.

Entrance and surface correction checks on 9 October 2026:

- Thirteen focused geometry and retreat tests passed, including walking the real
  player controller through the entrance in both directions, doorway offsets,
  exposed shell faces, and rendered boardwalk triangle/support agreement.
- TypeScript and production build passed, with the existing bundle-size warning.
- Production room-on/off and exterior captures showed the ceiling stripes gone,
  the widened entrance, and a continuous landing. The lit-ceiling pixel check
  contained zero clipped black pixels; no rendering or texture errors. The real
  switch interaction still reached the rocker, and the second renderer received
  the correct on/off state. Repeated toggles kept 174 GPU programs unchanged.
- The broader suite passed 1,454 tests and hit four cargo-test timeouts. The three
  incline cases passed on isolated rerun; the long castle-hauling case still
  exceeded its deadline, including a temporary longer-deadline check. That
  timeout remains an unconfirmed part of the broader verification.
