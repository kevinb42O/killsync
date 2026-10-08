# Current train performance assessment — 8 October 2026

The current scenic train contains one locomotive, three touring carriages, and seven freight wagons. Reducing it to four carriages cuts the train's own work substantially, but the tested island is GPU limited and shortening alone did not produce a consistent GPU improvement. The locomotive's spotlight is a stronger measured target.

## Measurements

Chromium headless, ANGLE Metal on Apple M1, 1600×900 DPR 1, current working tree. Real Friends host arena, spawn camera (yaw −2.3, pitch −0.3), clock fixed at 09:00, wind paused, train held. Two runs with forward/reverse phase order; asynchronous WebGL GPU queries were available and not disjoint. No browser runtime errors. CPU and GPU timings describe separate work and must not be added together as frame time.

| Real island render variant | Pilot GPU mean | Confirmation GPU mean |
| --- | ---: | ---: |
| All ten wagons + locomotive | 21.404 ms | 22.539 ms |
| Four wagons + locomotive | 21.286 ms | 23.456 ms |
| All wagons, only scenic headlight hidden | — | 20.626 ms |
| Entire scenic train and its gangways hidden | 19.282 ms | 20.142 ms |

The pilot four-wagon phase also hid its three remaining gangways; the confirmation correctly retained them. Four wagons here means keeping the first four: three touring and one flatbed. These are render visibility comparisons: authoritative simulation remains unchanged, so they do not measure shorter-consist collision, networking, obstruction-scan, or cargo costs. Train removal also removes its spotlight from renderer lighting, which affects shading across the world.

Removing the train saved approximately 2.1–2.4 ms GPU time in this view, about 10% of world GPU time. Removing only its spotlight saved 1.91 ms in the confirmation, about 8.5% of world GPU time. A roughly 9% rendering-throughput gain from the latter is conditional on being GPU limited; actual displayed FPS was not measured. Shortening alone produced no repeatable GPU saving. CPU render submission improved in the pilot (6.102 → 5.396 ms) but not in the confirmation (7.518 → 8.018 ms); therefore a consistent whole-scene CPU gain is not established.

## Train work by composition

Potential main-pass mesh draws if every part is visible, before any additional shadow passes. Counts include locomotive and gangways. Mixed compositions would need the retained wagons placed together as a new consist.

| Composition | Potential draws | Geometry triangles | Moving visual update CPU per frame |
| --- | ---: | ---: | ---: |
| Current: 3 touring + 7 freight | 229 | 40,064 | 0.099 ms |
| Four: 3 touring + 1 flatbed | 97 | 19,832 | 0.044 ms |
| Four: 1 touring + flatbed + stake + gondola | 103 | 17,624 | 0.043 ms |
| Two: 1 touring + 1 flatbed | 59 | 10,728 | 0.024 ms |

Visual update microbenchmark uses the actual FriendsVehicleVisuals.update with route distance changing every iteration, including bogie articulation, wheel instance matrices, vehicle poses and gangways. It excludes rendering and authoritative simulation. Thirty batches of 100 updates, after warmup, produced these mean times. Held-train visual updates were 0.047 ms for the current train, 0.018 ms for mixed four, and 0.008 ms for two.

Mixed four reduces potential train draws by 55%, geometry by 56%, and moving visual update CPU by 57%. Two reduces draws by 74%, geometry by 73%, and moving visual update CPU by 76%. These are reductions in train-specific work, not total FPS gains.

The tested scene submitted roughly 5.5 million triangles per world render; the forest stats reported 3,967 trees and about 4.10 million triangles. Geometry volume alone does not determine GPU cost, but train geometry is a small contributor. Train lights shade other scene objects, so their cost is not restricted to the train's triangle count.

## Suggested next changes

1. Profile and implement daylight/distance culling for the locomotive headlight. The measured daylight benefit is larger than shortening the consist. Preserve illumination when a player needs it, including tunnels/night.
2. Add distance-based train visual detail and avoid bogie/wheel updates for distant cars. All scenic cars currently receive visual updates, even when renderer frustum culling omits their meshes. Moving visual animation is already cheap in this test, so do not promise a major gain from this alone.
3. Use one touring car and three different freight cars if a compact consist fits the game. This preserves passenger seating, the speed controller, and each freight style, but reduces passenger/cargo capacity. Changing IDs requires handling existing attached cargo/saves.
4. For a larger global GPU improvement, investigate distant forest foliage/coverage and its shadows. Current wood LOD simplifies bark while foliage stays unchanged with range. Benchmark candidates before selecting a visual compromise.

No gameplay source or wagon count was changed by this assessment. Raw data: current.json (pilot and visual CPU microbenchmark), arena-confirmation.json (corrected render A/B and headlight experiment), and structure.json (exact mesh inventory). Invalid synthetic isolated-render measurements were excluded from current.json and documented there.
