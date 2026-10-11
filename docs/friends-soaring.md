# Friends paragliding

Open **Fun** with **T** or the toolbelt’s Fun item, then select **Glider** in
slot **6**. Selecting another Fun item stows the wing on the ground. **L** remains
an optional shortcut. Every Friends player has access; this is independent of host-only developer flight.
**M** marks Highfall, Skyfalls and Ember launch sites. Each has a windsock whose
direction matches the physical airflow.

## Launch and controls

Inflation takes 1.8 seconds on the ground. Face into the wind and run forward
down an open slope. The launch needs an inflated wing, sufficient airspeed,
a downhill exit and canopy clearance. Jumping and jet thrust are suppressed
while preparing the wing. A wing already inflated on a hill can transition
into flight as the runner leaves the ground.

Air deployment is also supported after leaving an aircraft or high ledge:
there must be at least ten metres of ground clearance and open air overhead.
Inflation takes 0.85 seconds; the player continues descending during inflation,
with growing drag rather than an upward deployment impulse.

| Input | Behavior |
| --- | --- |
| Left/right movement | Apply a banked turn |
| Back movement | Apply light symmetric brake |
| Space / jump control | Apply deep brake; flare near the ground |
| Shift / sprint control | Apply the speed bar |
| Mouse / look control | Look freely without steering the wing |
| Fun → Glider / slot 6 | Equip or stow on the ground |

The same existing movement, jump and sprint controls work on gamepad and touch.
The Fun-bar glider slot supports touch and the existing controller equipment cycle. Flight continues when forward input is
released. Menus and stale input return the wing toward trim rather than cutting
it. An airborne wing, including inflation/recovery, cannot be stowed by switching
equipment. A water landing or Return Home cancels the held equip request,
preventing automatic redeployment. A landed wing must be stowed before relaunch. F interactions are suppressed
while equipped to avoid boarding a seat or attaching cargo during flight.

## Flight and weather

The shared controller uses SI flight velocities and converts them to Frontier's
12 world units per metre. Trim speed is 9.5 m/s, baseline sink is 1.05 m/s,
and the speed bar targets 13.5 m/s with increased sink. Coordinated turn rate
uses gravity, bank angle and airspeed; tighter turns cost height. Deep brake
held too long causes a stall, recovered by releasing the brake. A low flare
trades existing speed for a temporary reduction in sink.

Ridge lift uses smoothed terrain gradients and the incoming wind, with height
falloff, lee sink and upwind shelter. Moving away from useful slopes loses lift.
Thermals have stronger cores, surrounding sink, wind drift, a finite life and a
finite top. Ordinary thermal strength follows the shared day/night environment.
Ember Caldera has an authored heat plume with height falloff and rough air.
Host time and wind presets affect flight and are reproduced in guest prediction.
Zero wind produces no ridge lift. Local clocks do not drive the physics.

This is an analytic soaring approximation, not a certified flight simulator.
Canopy contact causes a physical descending recovery state, with a 1.2-second
clear-air delay before reinflation. Collision checks follow the banked span and
leading/trailing edges, including buildings, trunks and vehicles.
It does not model cloth, suspension-line dynamics, aerodynamic asymmetric collapses,
full atmospheric fluid flow or airspace/weather safety. Airflow follows a
smoothed field of the authored landforms; exact edited voxels and construction
continue to drive collision and canopy clearance.

## Presentation and multiplayer

Flight is first person, with a visible overhead airfoil, cell seams, suspension
lines, brake toggles, harness, hands and legs. Golden brake cords run from each
hand to a branching trailing-edge brake cascade. Braking and steering move the
hands and cords together; the first-person arm pose adapts to narrow screens
so both grips stay visible. Structural suspension lines remain anchored to the
harness during inflation. Crew brake lines use the avatar's actual hand sockets.
The camera has restrained bank motion and independent free look.

The small instrument strip shows only vertical speed (m/s), airspeed (km/h), and
ground clearance (m AGL). A brief release-brake cue appears during a stall or
wing recovery. Ground preparation shows one launch hint and a thin inflation
bar, including clearance, wind-facing and downhill launch blockers.

The original synthesized vario uses faster, higher pulses for stronger climb;
normal trim sink is quiet and sink beyond -2 m/s produces a continuous low tone.
Stall or canopy recovery produces a separate pulsed warning. Licensed CC0 wind
and cloth recordings add airspeed-dependent air rush, turbulence, inflation and
brake movement. Vario/cloth use effects volume, air rush uses ambience volume.
Flight exit, menu blocking, mute, page hiding and Friends release stop all
sources. Sound requires the browser's normal click/key activation. Provenance
and wind file hashes are in `public/audio/friends/soaring-sources.json` and the
existing audio credits. The wind is sound design, not actual paraglider audio.

Other players have colored canopies, harnesses and a seated pilot pose. Wing
heading is separate from camera yaw. Both snapshot interpolation paths smooth
wing heading, bank, inflation and braking. Snapshots clone flight state so old
frames remain immutable. Late joins receive the complete current equipment
state through the existing Friends baseline and motion transport.

**Multiplayer protocol is 69. All players must reload before connecting.**
Flight equipment is transient and is not stored in durable world saves.

## Validation

- Physics, shared simulation, guest prediction, snapshot immutability,
  interpolation, world-state removal and geometry tests.
- Real-terrain foot launches at all three marked launch sites.
- Browser review: forward view, looking up, crew flight, Ember flight and an
  interactive foot launch with the production renderer.
- Production Friends Fun bar: mouse equip, switching to Stone stows the wing,
  slot 6 relaunches, airborne changes are disabled, and visible
  first-person equipment.
- Actual local WebRTC: guest inflation and launch, trimmed flight, a late join,
  independent wing-heading replication and recovery from stale steering input.
- Existing movement, swimming, developer flight, audio, interpolation,
  expedition and fishing-boat regression tests.

Use `/tools/friends-soaring-review.html` for the render/launch review.
`tools/test-friends-soaring.mjs`, `tools/test-friends-soaring-arena.mjs` and
`tools/test-friends-soaring-network.mjs`
write screenshots and reports under `artifacts/soaring/`.

`tools/test-friends-soaring-sound-ui.mjs` checks first-person hand visibility,
cord rendering, desktop/mobile HUD size, real browser audio activation and mute,
and offline-renders the actual audio engine into a 14-second WAV preview.
Its screenshots, audio and report are under `artifacts/soaring-sound-ui/`.
