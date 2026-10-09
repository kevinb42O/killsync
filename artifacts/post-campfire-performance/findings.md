# Next performance targets after the campfire fix

These are diagnostic experiments against the saved production build containing the campfire fix. They do not modify the game source or graphics defaults. Other workspace development has continued since this build was made.

One browser was benchmarked at a time on Apple M1 through Chromium/Metal, with local solo Friends play, 1100 × 740 CSS viewport, DPR 2, noon held fixed and the Commons campfire camera. Each sample ran eight seconds after a transition period. Normal simulation, worker streaming and shadow scheduling continued. These short stationary tests are not sustained gameplay or thermal validation, and do not cover remote multiplayer, other browsers, every island view or the current in-progress camera changes.

## Scene ablation

| Condition | Mean FPS | 95th-percentile frame time |
| --- | ---: | ---: |
| fixed campfire baseline | 19.4 | 66.7 ms |
| forest hidden | 23.6 | 50.9 ms |
| distant terrain shells hidden | 20.4 | 51.0 ms |
| near voxel terrain hidden | 17.4 | 67.5 ms |
| clouds hidden | 18.0 | 66.9 ms |
| render scale .7 | 25.6 | 50.9 ms |
| render scale .5 | 29.8 | 50.0 ms |
| full resolution baseline repeat | 18.5 | 66.7 ms |

Hiding objects alters occlusion and can increase work on surfaces behind them, so the FPS deltas are diagnostic observations, not additive optimization savings. Near-volume hiding illustrates this: world-draw submission fell substantially but frame time did not, so it does not justify deleting near terrain or treating render-submit time as GPU frame time. The draw-count figures include time-dependent shadow work. Forest statistics still report the prepared buckets while the group is hidden for rendering.

## Pipeline checks at 70% render scale

| Condition | Mean FPS | 95th-percentile frame time |
| --- | ---: | ---: |
| 70% baseline | 27.3 | 50.1 ms |
| 70% HDR MSAA disabled | 32.1 | 34.3 ms |
| 70% sun shadows disabled | 28.2 | 50.1 ms |
| 70% baseline repeat | 25.9 | 50.8 ms |

The MSAA diagnostic changes only the HDR target's sample count from two to zero and recreates that target. It does not bypass HDR or disable night vision. This is not a visually approved graphics mode. Foliage uses alpha-to-coverage, whose shader behavior depends on multisampling; a real cheaper-AA mode must configure foliage appropriately and be visually verified. The sun-off diagnostic uses the normal sun-shadow setting and warms the changed program layout before measuring; it does not disable flashlight shadows. The sun-off run included a shader/driver outlier and offers no convincing route to stable 30 by itself.

Both scripts completed without captured page exceptions or WebGL errors.

## Recommended order

1. Reduce pixel and HDR multisampling cost. At 70% resolution, the no-MSAA probe reached 32.1 FPS, with its 95th-percentile interval around 34.3 ms instead of about 50–51 ms. Implement a visually acceptable cheaper-AA path and consider adaptive render scale. This is the strongest measured next target.
2. Reduce distant foliage geometry and split main-view visibility from shadow visibility. The tested direction prepares 1,787 trees and about 1.72 million forest triangles. Hiding the entire forest improved the fixed scene only from roughly 19 to 24 FPS, so expect a partial optimization to save less than removal.
3. Profile submission overhead and full voxel terrain activation near the camp/cave/rail corridor. The scene prepares 175 voxel chunks and over 1,300 draws. Preserve the visible cave/rail geometry and terrain coverage before reducing this work.
4. Tune a 30 FPS presentation cap after creating headroom; validate movement, campfires, castle, water, night vision and multiplayer through a sustained warm session. A cap alone cannot turn a 20 FPS workload into 30.

Distance-based block detail is a valid technique, but this renderer already keeps block shells to approximately 512 metres and transitions toward a coarser organic horizon by roughly 683 metres. Hiding both distant terrain layers improved the tested scene by only around one FPS. That makes further distant-block reduction a lower priority for this particular view, not proof it cannot help elsewhere. Texture quality, mesh detail, visibility and submission count are different costs and should be measured separately.

Thirty FPS requires a 33.3 ms frame budget, and a robust target needs several milliseconds of margin. Fifty-percent render scale averaged 29.8 FPS but still had about 50 ms slow frames. The 70%-no-MSAA probe demonstrates a plausible route toward 30 with a sharper world image; it does not certify stable 30 through sustained gameplay. Stable 60 requires 16.7 ms frames and much larger improvements than the tested full-resolution build currently provides.

Eight GB RAM is not sufficient evidence that 30 FPS is impossible. These results establish rendering costs, not a diagnosis of RAM exhaustion. Memory pressure, asset/cache bounds and sustained heat should be checked in the actual play session.

Evidence: `ablation.json`, `pipeline.json`, their CPU profiles, diagnostic screenshots and the corresponding `.mjs` scripts. Script paths/runtime lookup are machine-specific. Both expect the saved candidate build served on port 3032.
