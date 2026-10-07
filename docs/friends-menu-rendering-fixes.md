# Friends menu rendering fixes

Date: 7 October 2026. Scope: live Friends setup backdrop. Preserve the friendly form, 60× world clock, 50% cloud wind, lava lighting and existing session actions.

## Findings and implementation plan

1. **Stable stars.** Twinkle currently uses accelerated world time, so the 60× preview turns a slow shimmer into visible flicker. Star placement also hashes a floored three-dimensional cube projection, including a dominant coordinate that is susceptible to floating-point boundary changes; tiny unfiltered star kernels alias as the camera moves. Use frame time for twinkle, hash only the two face coordinates with an explicit face ID, and integrate star kernels over the pixel footprint with derivatives. Fade stars at cube-face edges. Verify clock separation and compile the shader in the browser.
2. **Cloud/shadow agreement.** Visible clouds and shadow receivers already share the wind offset, but rapidly moving sunlight changes the ground projection at 60× speed. Give the menu a fixed vertical shadow projection: the cloud footprint follows wind directly, while sunlight, sky colour and shadow strength still follow the accelerated day/night cycle. Gameplay retains its physical sun projection. Verify matching wind uniforms and no atlas repositioning when the menu sun moves.
3. **Current railway.** Mount the existing `FriendsScenicRailwayVisuals` in the menu, using the current authored route. Allow the menu to request island-wide visibility without changing the normal 11,000-unit gameplay cutoff. Shade its materials with the menu clouds and dispose it when leaving. Route engineering remains owned by the train-track work; keep invalid in-progress track data from taking down the entire backdrop, and remove any partially created railway objects on failure.
4. **Camera choreography.** Retain the accepted opening angle, radius and height. Use a 360-second lap with gentle speed modulation, a 65-second quintic descent, a slowly changing coastal distance, and a rolling altitude that sometimes enters the actual cloud layer and sometimes rises for clearer views. Keep the horizon level and the look point within the central island, with small smooth framing changes. Avoid teleports, reset cuts, abrupt velocity changes and terrain collisions. Freeze all motion together when paused; do not catch up after a hidden tab.
5. **Verification and activation.** Run focused star, cloud, camera, rail-visibility and existing menu tests, then typecheck and build. Inspect the active menu at day and night, confirm the railway is present, check console/shader errors, save real browser captures, and leave the scenery running.

## Acceptance

- Normal-speed, filtered stars remain stable during the accelerated night.
- Menu cloud footprints move with 50% wind; accelerated sun position does not sweep them across the map.
- Above-ground sections of the current railway render from aerial camera distances.
- Camera has continuous position and velocity, keeps the central island framed and occasionally passes through actual cloud volumes.
- Existing Friends menu actions and gameplay cloud projection continue to work.
- No review overlay, video or screenshot backdrop is introduced.

Status: implemented and verified.

## Verification results

- 24 focused tests passed across eight files, covering camera continuity and terrain clearance, real cloud-bank crossings, normal-speed star time, matching cloud wind/shadow uniforms, stable menu projection, overview railway visibility, resource disposal, and existing Friends setup states.
- Typecheck and production build passed. The build retains the existing large-bundle advisory.
- The running menu loaded the current authored railway successfully. Daytime inspection showed the spans and curved track sections. Nighttime inspection showed the filtered stars and the normal-speed shimmer; no shader or renderer warnings/errors were reported.
- Actual browser capture: `artifacts/friends-menu/rendering-fixed-live.jpg`.
- Development updates to the scenery dependency rebuild its canvas while preserving the setup form state. No track route data, station positions, gameplay physics or multiplayer clocks were changed by this fix.
