# Grand Traverse — calm island railway

Implemented alignment: `sunline-grand-traverse-v3`. This replaces the original high railway proposal. The station stair towers, arrival footbridge, summit climbs and mountain spirals have been removed.

## Alignment and motion

The surveyed circuit is 12.107 km long. Elevations use the game's world datum, with 12 world units per metre. The highest rail is 61.33 m in that datum; this is an absolute elevation, not height above the ground. The tallest exposed span is 34.48 m above land; the highest track over water is 34.64 m above the sea. Platforms meet the natural ground at all five station centres. The greatest grade is 2.5% within numerical tolerance, and the smallest curve radius is 69.67 m. Horizontal curves use circular fillets, with no banking, spirals or track crossings. The closing seam has continuous position, heading and grade.

A public locomotive pulls ten 17.5 m wagons: three covered sightseeing cars (four seats each), three open flatbeds, two stake wagons and two open gondolas. The complete consist is 203.75 m long, 3.20 times the former 63.75 m train. All seven freight decks start empty and have no roof or invisible ceiling. Every station reserves a straight, level approach and a 213.3 m platform for the complete train.

The default target remains 39.6 km/h. A physical controller at the forward end of the first passenger carriage opens with F; its slider and presets choose 6–360 km/h, with live actual speed, hold/resume controls and an automatic-station-stop switch. Continuous running updates the next station without dwelling. Default motion retains gentle acceleration and jerk; express settings scale acceleration and braking. Integration uses at most 50 ms substeps, and route speed limits and obstruction braking cover the full train and braking horizon. Only a living player beside the controller with host-approved operating access can change speed. Position, current speed, selected speed, holds and stopping mode are session-only. Each new game starts the complete train at Sunline Commons with the 45-second boarding pause, the default 39.6 km/h target, and automatic station stops.

B construction can place objects on freight decks. Objects store wagon-local coordinates and follow the exact wagon yaw and pitch; host collision, raycasting, previews, guest motion decoding, passenger interpolation, save/restore and undo use that same frame. Loads must stay inside a 182 × 88 native-unit area and below 96 native units (8 m) above the floor so they fit all tunnels. Their textures remain attached to the objects. A passenger standing on a loaded chest travels with its wagon. The movable salvage core can also be secured to a freight wagon through the existing hauling interaction.

Cars follow the grade in a rigid frame; seated passengers remain attached while looking around freely. Standing passengers and nine inter-wagon gangways use the same inclined frame.

## Route sequence

| Section | Landscape and route treatment |
| --- | --- |
| 1–4 | Sunline Commons → cedar country → Amber Valley → northern foothills; broad curves and low cuttings |
| 5–8 | World Gate lakeside → Highfall lower bore → Highfall Meadow → Glacier Valley; outside the castle grounds and through the mountains |
| 9–11 | Tidal Shore → eastern cove bridge → quiet east coast; low shoreline approach and cable-supported sea crossing |
| 12–15 | Ember mountain passage → Ember Meadow → south shore → dune country; mountain bore followed by coastal views |
| 16–18 | Wild Reach → southern mountain bore → western fjord; direct bore and modest raised spans |
| 19–20 | Skyfalls Shore → Rustwater return → Sunline Commons; low western return and continuous closing curve |

The route source contains the exact control points and elevations in `src/game/world/FriendsScenicRailway.ts`; `FriendsRailAlignment.ts` compiles the sampled centreline and grade constraints.

## Stations

Each station reserves a straight, level approach for the complete train. Platforms are 213.3 m long and 25.3 m deep in world scale, with canopies, supported benches and signs readable from both sides. No stair access structures are generated.

| Station | Centre (world X, Y) | Platform elevation | Dwell |
| --- | --- | --- | --- |
| Sunline Commons | 6800, 7500 | 61.33 m | 45 seconds |
| Highfall Meadow | 27100, 9900 | 24 m | 35 seconds |
| Tidal Shore | 28000, 21800 | 8 m | 35 seconds |
| Ember Meadow | 30000, 37500 | 40 m | 35 seconds |
| Skyfalls Shore | 8000, 23200 | 50.67 m | 35 seconds |

Walk south from arrival to Sunline Commons. F sits in an available seat; F or jump stands up. The atlas displays the whole route and station locations. Walk to the small physical control panel at the forward end of the first passenger carriage and press F for speed controls. Hold/resume controls also remain in the Grand Traverse field-pack tab; operating access and proximity are checked by the host.

## Structures and castle exclusion

Bridge decks, three-part rails, sleepers and their fastening plates follow the same centreline. Raised decks have guardrails and compact Warren trusses. Tapered piers sit on footings, with separate caps and rubber bearing pads under the deck. Bridge ends have founded abutments. Open-water suspension spans use two founded towers, rounded cables, anchored backstays, and hangers attached to actual transverse deck girders. Their suspension spans are clear of ordinary piers.

Mountain bores are actual terrain cavities, with solid mountains above them. Arched masonry lining is inset from the excavation to avoid voxel intrusion. Finished portals have individually cut arch stones, capped buttresses and retaining-wall returns. Shallow cuttings have continuous masonry walls, and the track shoulders have finished floors with matching walking support. Vaults have continuous masonry courses, arch ribs, drainage channels and recessed warm lamps. Portal placement and cutting walls reserve 1536 native units around each station centre to keep the complete boarding platform clear. Nearby terrain volumes are prefetched from the track before entering a tunnel, including when approaching from beside the track.

The terrain cap and tunnel lining share one bore survey. Shallow enclosed sections retain at least two solid voxel layers over the excavation, including short gaps between terraces. Near collision and distant cutouts use matching voxel-centre boundaries; outward rounding no longer removes a surviving roof. The smooth mountain vault also samples inside thin cover slabs so they cannot disappear between its normal height samples. Natural open arch mouths remain open passages rather than receiving enclosed tunnel lining. These changes affect the landscape above the railway without raising the track.

Exposed tunnel roofs use weathered grey stone with coursed joints and fine mineral grain matching the portals. Outward faces receive normal daylight; inward faces keep the cave lighting. The two finishes share geometry and use complementary front/back face culling, preventing overlapping rendered surfaces. The review page's roof material preview temporarily hides the terrain for inspection only.

The complete castle and its southern approach have an exclusion rectangle at X 16000–21408, Y 10016–19776, already including a 512-unit setback from the authored castle bounds. The track and portal envelope stay outside this rectangle regardless of elevation. There is no railway beneath, through or over the castle. The ruin preservation test checks every authored ruin for excavation overlap.

Existing saved terrain edits and builds are retained. New construction and excavation cannot obstruct the reserved railway clearance. Imported obstructions make the service brake and hold. All game starts, restarts and world reloads reset the sightseeing service to Sunline Commons. Old saved journeys are ignored. Saves, backup copies and exports retain only whether the service is enabled; wagon-local building attachments remain saved and follow their wagon back to the station.

## Materials, stations and train finish

The restrained palette uses mineral concrete, coursed masonry, subdued green paint, timber and weathered zinc. Deterministic surface grain is projected at consistent sizes on static structures. On the train, the projection follows the car's rigid frame so the material does not slide across its body as it moves. Day and night use the actual world lighting. Six nearby infrastructure lights illuminate tunnel and station fixtures; the locomotive has a warm forward spotlight with a small shadow map.

Station canopies have a slight gable, gutters, braced columns and baseplates. Slatted benches have supported frames and clear separation from canopy columns. Boarding edges have tactile strips, and double-sided nameboards have a small lamp.

The public train has matching green-and-ivory bodywork, low sightseeing canopies and timber seating, plus empty open freight decks with tie-down fittings, stake posts or gondola side panels. Repeated body fittings use instanced batches. Bogies steer on the actual alignment and wheels roll with travelled distance, including across the route seam. Wheel pockets and splash guards separate the deck from the wheel crowns. Canopy posts, seat armrests and exhaust fittings have actual supports. Cab, nose, trim, nameplates, wheel layers and bench frames avoid competing exterior surfaces; duplicate bench crossbars have been removed. Existing personal train models remain separate from the public touring train.

## Verification

The engineering tests check the whole circuit for train-hull terrain collisions, castle exclusion, ruin preservation, maximum grade, curve radius, seam continuity, station levels, absence of crossings and streaming queries from beside the corridor. Service tests simulate a full tour, all five stops, passenger attachment, seat reservations, inclined walking, fresh-session train initialization and network interpolation.

Rendering checks cover section-boundary refinement, bogie alignment, clearance above the walking deck, stable train material coordinates, infrastructure disposal and masonry clearance at all five actual boarding platforms. A raycast scan checks the engine and carriage exterior from six directions in three wheel positions for competing parallel surfaces. Bridge, portal, station, dusk and moving seated tunnel views were inspected using the actual rendering modules in `tools/railway-review.html`. Screenshots are saved under `artifacts/railway/`.

Verification for the longer train includes a full hull-clearance circuit with all eleven vehicles, full-consist level boarding at all five stations, continuous express running reaching 360 km/h, all five express station stops, invalid/duplicate/unauthorized operating requests, attached cargo collision and raycasting, save/restore and undo, guest reconstruction of cargo from durable state plus train motion, and a passenger on a loaded chest through high-speed curves. The expanded surface scan covers the locomotive and all four wagon types from six directions at three wheel positions, including surfaces within the same instanced batch.

Screenshots of the ten-wagon consist, empty flatbed, test cargo and speed panel are retained under `artifacts/railway/`. Final test/build results are recorded in the verification logs there. Earlier full-regression checks identified four independent terrain-repair tests that expect excavation inside the protected spawn platform; those expectations remain outside this railway change.

Tunnel-roof verification covers every enclosed section for solid cover and walking support, compares excavation ranges against collision around the full circuit, and compares roof faces at four actual tunnel locations. The terrain, railway and station checks passed (38 checks across the final run and station rerun), as did TypeScript and the production build. Details and timing are recorded in `artifacts/railway/verification.md`.

Session lifecycle verification: 36 tests passed, including reloads from old journeys, stripping train motion from saves/backup copies/exports, retaining cargo on its wagon at the spawn station, and preserving live multiplayer motion snapshots.
