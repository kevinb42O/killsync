# Soaring refinement verification

The glider is selectable in Fun slot 6. Clicking the selected slot or selecting
another item stows it on the ground. Airborne deployment/recovery locks changes;
a landed packed wing does not lock equipment merely because the player later
walks off a ledge. The separate equip/stow HUD button has been removed.

## Reproduced and fixed

Five regression tests failed against the previous controller and pass now:

- Underground positions were treated as grounded for deployment.
- A blocked deployment could still execute a jet jump.
- Flying above the ceiling could teleport down to its height.
- Airborne terrain contact falsely declared a landing and erased falling motion.
- Landing reported stale ground clearance.

Additional coverage verifies contact recovery with a real descent and delay,
leading-edge contacts, water-entry equipment rearming, Return Home rearming,
safe tool-ID sanitization, unavailable/locked equipment, and mutable host forest
cache invalidation. Canopy contacts include the banked span/chord, trees and
vehicles. Activity inputs are sanitized while a wing is active. Players with
wings cannot be attached to the assisted-carry rope.

The Skyfalls launch now sits beside the actual western Skyfalls rather than a
central massif. The volcanic launch is named Ember Caldera rather than implying
it is the distant coastal lookout. All three marked sites pass takeoff plus
three seconds of sustained flight checks.

## Results

- Full repository run: **268 files / 2,084 tests passed**, with two workers.
- After the final launch-location and packed-wing UI corrections: **20 focused
  tests passed** across launch/prediction, equipment, Fun-bar markup and bugs.
- Desktop production arena: mouse Fun-slot equip, Stone stow, slot-6 selection,
  foot launch, visible first-person wing, hidden default hands, disabled airborne
  changes; no page errors.
- Touch-sized production arena: the same flow with touch taps; Glider fits in
  the viewport with a 44 × 48 pixel target; no page errors.
- Actual local WebRTC: six checks passed, including guest launch, late joins,
  independent wing heading and trimmed flight after stale input, on protocol 69.
- Renderer review: forward, canopy-up, crew and volcanic views passed; finite
  camera, three visible wing rigs, no page/console errors and no capture-time
  WebGL errors after initialization.
- Final typecheck and build logs: `lint.log`, `build.log`.
- `git diff --check`: passed.

Screenshots and structured browser reports are in this folder. The complete
flight/controls guide is `docs/friends-soaring.md`. All players must reload for
multiplayer protocol **69**.
