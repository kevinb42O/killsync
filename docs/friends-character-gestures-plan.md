# Friends characters, larger tools and independent arm gestures

Research and approved implementation record, 2026-10-09. Implemented: five pastel
crew palettes, larger held props, slot 1 empty hands, independent arm gestures,
protocol v51, host validation, immediate local presentation and multiplayer poses.
The user explicitly excluded colour propagation into held equipment: first-person
hands and roasting retain the shared yellow appearance. Concurrent retreat and
hauling work was preserved. See `friends-characters.md` for current controls and QA.

## Findings before implementation

- Seated first-person roasting already uses the imported character's right
  hand/arm. `FriendsMarshmallowVisuals.update` loads `loadFriendsGrip('right')`,
  attaches `marshmallow-holding-hand`, and updates it with the stick's palm basis
  while resting, roasting and eating. An actual WebGL render confirmed the yellow
  limb. Captures are in `artifacts/big-walk/roasting/`; the ordinary assembly is
  three draws / 688 triangles, and burning adds one draw / 18 triangles.
- Every first-person grip currently requests the default yellow character.
  The approved correction keeps this shared yellow appearance for held hands;
  full-body avatars receive the five coordinated palettes.
- Remote roasting sticks still use a generic positional offset. Polish must
  attach them to the imported avatar's hand socket and pose that arm toward the
  stick, avoiding a floating stick beside the new seated body.
- Tool order is currently `[1, 2, 3, 0, 5]`: Axe, Pickaxe, Shovel, Combat, Rope.
  There is no empty slot. ID `0` is Combat; it permits shooting, aiming, artifact
  actions and grenades. `FriendsSimulation.test.ts` explicitly tests that guns
  and grenades remain operational in Friends.
- ID `4` was removed for the Earthwork/Shovel merge. Protocol v50 deliberately
  coerces it to Combat. Do not reuse it for empty hands.
- The avatar importer batches each whole arm into a rigid mesh. Animated gestures
  need articulated arm segments, not a rotation of the existing stretched tool
  grip. The source contains real shoulder/arm/hand cuboids and additive
  `raised arm` / `raised arms` clips, which should provide the starting poses.

## Complete current E audit

| Context | Current result | Code and conditions |
| --- | --- | --- |
| Beside or seated at Commons campfire, outside build mode | Add timber to the fire | `MultiplayerArena` intercepts `KeyE` and submits `campfire_fuel`; it takes precedence over grenades. Host checks proximity and timber availability. |
| Friends build mode | Paint the aimed piece with the selected finish | The generic `operateAimedStructure('activate')` path translates to `creativeAction('paint')` specifically for Friends. This is painting, not the combat mode's structure activation. |
| Outside build mode, beyond campfire range | Request a grenade throw | The shared handler increments `grenadeActionId`. Host allows it with Combat (`friendsTool === 0`), blocks it with Axe/Pickaxe/Shovel/Rope, and blocks it in quiet seats. |

No other direct E binding was found in the current Friends input handlers.
Menus generally consume gameplay inputs. Sitting/standing, pilot controls,
train/crane controls, cargo interactions, treasure and retreat light switches
use F, not E. E is not an existing left/right-arm gesture binding.

## Big Walk reference and evidence

1. [House House press kit](https://bigwalk.game/presskit/) and its linked official
   gameplay overview establish independently expressive arms, pointing, waving
   and flailing as a communication system. Official screenshots establish the
   simple coloured bodies, thin limbs and readable eyes as visual references.
2. [PlayStation's first-hand report](https://blog.playstation.com/2026/03/09/big-walk-hands-on-report-cooperative-chaos-exploring-a-puzzle-filled-open-world/)
   specifies L2/R2 for independent arm raises and L1/R1 for forward pointing.
3. [Screen Hype's first-hand beginner guide](https://www.screenhype.co.uk/big-walk-beginner-tips/#7-how-to-use-arm-signals-in-big-walk)
   describes a playthrough exceeding 20 hours and documents Q/E raising,
   Q+left mouse and E+right mouse extending sideways, and the combined poses.
4. [JohnPurple's player-authored signal chart](https://steamcommunity.com/sharedfiles/filedetails/?id=3778436134)
   was inspected visually. Its legend distinguishes rest, point, outstretched
   and raised arms. It supports the four-pose vocabulary, but does not document
   the complete keyboard mapping or animation implementation.
5. [Official FAQ](https://bigwalk.game/faq/) confirms keyboard/controller support,
   rebinding, and hold/toggle accessibility options. It does not publish a PC
   binding table or the arm solver/easing constants.

Several derivative guides speculate about defaults, and one reverses the
left/right straighten rows. They are not the basis for the implementation.
The documented keyboard chords are established; exact solver, transient motion
and mouse-only PC behaviour need direct reference-play comparison before any
claim of a frame-for-frame match. The desktop forward-point bindings below are
the proposed completion of the independently documented point/raise vocabulary.
Do not claim to have inspected House House's internal code.

## Intended controls and slot order

Add `EMPTY_HANDS = 6` as an explicit internal ID. Bump the multiplayer protocol
for the new ID and gesture state. Preserve ID 0 and every existing tool identity.

| Display slot | Item | Internal ID |
| --- | --- | --- |
| 1 | Empty hands | 6 |
| 2 | Axe | 1 |
| 3 | Pickaxe | 2 |
| 4 | Shovel | 3 |
| 5 | Combat | 0 |
| 6 | Rope | 5 |

Friends starts with empty hands. Number keys, wheel, toolbelt buttons and field
pack all use the same order. Use physical `Digit1`–`Digit6` / numpad codes for
slot shortcuts so AZERTY number-row punctuation does not require Shift.
Construction keeps its independent eight shape slots.

| Held input in empty-hands mode | QWERTY | AZERTY | Pose |
| --- | --- | --- | --- |
| Left raise | Q | A | Left arm up |
| Right raise | E | E | Right arm up |
| Left forward point, proposed PC binding | Left mouse | Left mouse | Left arm forward, toward camera aim |
| Right forward point, proposed PC binding | Right mouse | Right mouse | Right arm forward, toward camera aim |
| Left raise + left mouse | Q + left mouse | A + left mouse | Left arm out to the side |
| Right raise + right mouse | E + right mouse | E + right mouse | Right arm out to the side |
| Both raise keys | Q + E | A + E | Both arms up |
| Both raise keys + both mouse buttons | Q + E + both buttons | A + E + both buttons | Both arms out to the sides |

Each arm has four independent states, giving 16 combined poses. Mixed states
work too: one arm up and the other pointing, one relaxed and the other sideways.
Hold controls by default; release returns smoothly to rest. Repeated presses
and camera movement supply the waving/flailing. Mouse movement retains normal
look control; it steers forward pointing with camera yaw/pitch. Do not invent
a separate mouse-drag limb editor or an automatic emote wheel.

Use `KeyboardEvent.key` consistently with the selected movement preset for
letter bindings: A/E with AZERTY's ZQSD; Q/E with QWERTY's WASD. Layout changes
clear held gesture state. Arm keys must not also strafe.

Recommended Friends-only remaps reserve E for the right arm: K adds campfire
wood (kindling), Y paints in build mode, and J throws a grenade only in Combat.
These letters have no conflicting current bindings in the audited handler.
Update every hint, button title and keyboard test. Other game modes retain
their existing E binding. F continues to own contextual interactions.

## Hand ownership and input routing

Use an explicit presentation owner: arrival/menu/spectator, seated cooking,
construction/piloting, empty hands, then the selected equipment. This must drive
visibility and input routing together. Do not infer empty hands from a falsey
tool ID. Audit all `friendsTool || 0`, `if(friendsTool)` and numeric tool ranges.

- Empty hands hides firearm, mining tool, rope launcher, flashlight hand and
  associated beam. Stow a previously enabled flashlight without forgetting
  its setting; restore it when leaving empty hands. V can deliberately equip
  it and leave empty hands, with matching toolbelt feedback.
- Empty-hand clicks never increment fire/alt-fire intent or trigger ADS,
  tool use, shovel fill, rope shoot/reel or marshmallow roasting.
- Tool changes clear gestures and require release before a held gesture mouse
  button can start a tool action. Avoid carrying a held click into a grenade,
  swing or rope shot after selecting another slot.
- Campfire cooking owns the right arm and existing roast/eat inputs. This
  first version leaves cooking intact; use gestures after standing. Quiet
  lookout seats and train passenger seats allow gestures with empty hands.
- Build mode, piloting, paused menus, text input, pointer-lock loss, window blur,
  hidden documents, death/downed state and disconnect clear gestures. Clearing
  must happen locally and on the host's stale-input path.
- Gamepad empty-hands context uses L2/R2 raises and L1/R1 points. Suppress their
  existing fire/aim and bumper weapon-cycle actions; D-pad left/right cycles the
  Friends toolbelt. Keep build, cooking and ordinary equipment controls intact.
- Mobile can expose four small held-arm controls only with empty hands; reuse
  the same pose state and pointer-cancel handling. Keyboard/mouse fidelity is
  the primary reference pass.

## Animation and multiplayer implementation

Introduce a small pure `FriendsGestureControls` module for bindings, the
four-bit held-input mask and per-arm pose resolution. Decode each side from
raise/point booleans. Never network a stream of mouse deltas or joint matrices.

`MultiplayerInputFrame` carries a bounded mask; the host validates empty hands,
alive state, absence of occupied cooking/pilot hands and input freshness. Store
accepted mask plus camera yaw/pitch on the player snapshot. Existing snapshot
transport carries the state, including late joins. Explicitly clear it on
stale input and removal; reuse the 2-second stale-input ceiling, with prompt
local neutral frames on focus loss.

Local first-person arms react on the render frame before network confirmation.
Remote arms use accepted snapshot state. Interpolate yaw across the angle wrap
and pitch in both snapshot interpolation paths; blend arm pose transitions in
the renderer. Keep local presentation out of movement reconciliation.

Create a shared pose solver used by world avatars and first-person arms, with
different shoulder/camera frames. Start raised poses from the CPM author's
additive clips, respecting ZYX rotations and additive position semantics.
Build shoulder/elbow/wrist articulation from the actual source cuboids, keeping
the hand rigid and shoulder fixed. Prefer one skinned mesh per arm with shared
geometry and independent bone instances; retain approximately six avatar mesh
draws. Avoid stretchable palms and detached limbs. Forward pose aims at a
camera-direction target; sideways pose uses the character's left/right axes.

Start pose blending around 100–150 ms and tune against reference motion. Limit
overshoot to the forearm/wrist, avoid a fixed periodic wave that removes player
control, and keep transitions symmetric. Gesture priority overrides locomotion
only on the participating arm. Sitting legs, head look, carrying and walking
remain coherent. World equipment and remote roasting attach to hand sockets.

## Character and texture polish

Preserve Ghostbia's authored silhouette and eye placement. Use the official
Big Walk screenshots as the direction for simple friendly surfaces and broad
colour areas. Add restrained bevels to harsh body/hand edges where UVs permit,
clear eye contrast and small eye highlights. Keep detail readable at distance.

Build original texture/material adjustments with subtle broad value gradients,
soft joint shading and a satin response. Keep coloured bodies low-metalness;
eyes can be slightly glossier. Avoid noisy cloth, grime, busy decals or excessive
gloss that overwhelms the simple characters. Preserve atlas provenance and
separate these authored additions from the raw imported source.

Proposed five crew palettes, assigned deterministically from existing crew IDs:

| Palette | Head | Upper body / hands | Lower body |
| --- | --- | --- | --- |
| Seafoam | `#79C9C0` | `#F4C66B` | `#5578B0` |
| Peach | `#F09A86` | `#B7D9BC` | `#766E9B` |
| Lilac | `#B8A0D7` | `#F3D78E` | `#687DAD` |
| Buttercup | `#F3D36C` | `#8DC8BD` | `#5C83B2` |
| Pistachio | `#A7C58E` | `#F2B29B` | `#698B96` |

Expose one appearance resolver to remote avatars only. Local gesture arms, tool
grips and roasting retain the shared yellow finish, as explicitly requested.
Derive avatar palettes from stable replicated crew colour without a new customization screen. Treat head, torso/arms and lower body as semantic
regions; preserve the eye whites/pupils when recolouring. Resolve source layers
before batching. Cache only requested geometry/material variants, share the
atlas, and keep each instance’s animated skeleton independent.

## Larger first-person equipment

Increase displayed mining tool dimensions by an initial 20%, uniformly around
the palm/handle socket; fit the resulting silhouettes to the viewport. Keep
hand proportions intact and enlarge base/upgraded variants consistently.
Use a smaller initial 12–15% increase for flashlight and rope launcher, which
already occupy more screen space. Inspect all six held presentations including
the seated stick; keep its fire-reaching tip and cooking size meaningful.

Avoid simply scaling the whole camera or changing world interaction reach.
Keep tool sockets attached through windup/contact/recovery. Rope's projected
muzzle must follow the enlarged visible barrel, with its aiming regression
checks retained. Clamp narrow-screen framing to preserve the center view.

## Build sequence and completion criteria

1. Establish reference captures and palette/texture samples in the character
   review fixture. Capture sunlight, shade, dusk, flashlight and campfire light.
2. Add avatar finishes, source arm articulation, enlarged socket-anchored
   tools and remote roasting alignment. Verify seated arm, bite/refill and all
   tool base/upgraded views before changing gameplay input.
3. Add the explicit empty tool state, slot order and E remaps. Verify Combat
   remains selectable and authoritative firing is suppressed with empty hands.
4. Add the pure controls and shared pose solver; preview all 16 combinations
   in first person and from front/back/side views while standing and seated.
5. Extend protocol/host state and both interpolators, with immediate local
   presentation. Test real host/guest browser connections in both directions,
   late join, lost/repeated frames, stale input and leave/rejoin.
6. Perform visual and timing tuning, then targeted tests, TypeScript and build.
   Record unrelated concurrent failures separately; never silently skip them.

Acceptance checks include:

- All five avatar palettes readable in day/night lighting; local hands retain
  the shared yellow finish for tools, flashlight, rope, gestures and roasting.
- No tactical arms, duplicate hands, detached sticks, transparent gaps or eye
  recolouring. Shared assets survive player removal and async disposal.
- 20% larger mining tools visibly pass at 70/98/120 degree equipment FOV and
  portrait/landscape/ultrawide, without near-plane clipping or covering aim.
- All 16 gesture combinations, mixed poses, arbitrary press/release order,
  repeated keys, camera look, walking/sprinting/crouching and quiet-seat poses.
- Correct AZERTY A/E + ZQSD and QWERTY Q/E + WASD, unshifted number-row selection,
  layout changes, right-button context suppression and pointer cancellations.
- Empty-hand gesture clicks create zero shots, grenades, artifact casts, tool
  contacts, terrain edits, ADS changes or rope operations—even with raw input
  combinations submitted directly to the simulation.
- Campfire K/Y-build/J-Combat prompts match action dispatch; F interactions,
  cooking, carrying, flashlight restoration and non-Friends controls remain
  functional. Returning from a gesture never carries a held click into a tool.
- Matching remote/local poses at wraparound yaw and different pitch angles,
  unchanged collision/reach, bounded state, late-join correctness and clean
  gesture release after menus, blur, death, stale input and disconnect.
- No new per-frame geometry, texture fetches or render passes. Record renderer
  cost and use controlled before/after timing comparisons on the same fixture.

Exact first-try perfection is not a verifiable promise. Completion means these
specific visual, interaction and real multiplayer checks pass, with any
reference details that remain unverified clearly identified.
