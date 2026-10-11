# Final dungeon bug check

Date: 2026-10-12.

## Additional bug fixed

A discovery could be recovered through a player-built wall. The previous reach check sampled terrain but omitted built pieces and solid decorative fixtures.

The host and HUD now use the same discovery-reach helper. It checks the actual ray against player-built geometry and the shared dungeon fixtures, then samples terrain along the reach line. A wall at another elevation does not block the discovery. Clearing the wall restores both the prompt and recovery. Regression cases cover authoritative progression and the rendered HUD.

## Final verification

- The clean full repository run passed 2,090 tests and recorded two deadline failures out of 2,092 collected cases: castle cargo hauling and the 1,200-tick multiplayer stress test. There were no assertion mismatches in that run.
- Multiplayer stress passed on its isolated rerun. Castle cargo exceeded its original 20-second budget on an initial isolated rerun, then passed the original unmodified test under its existing budget after the browser/load work settled; the final castle file passed both cases in 11.37 seconds of test time. Deadline failures remain part of the audit record, indicating sensitivity to concurrent machine load.
- A separate deterministic castle replay passed the original route, cargo support, rope and delivery assertions over 3,602 ticks in approximately 10.08 seconds. It did not change test deadlines or production code. Its report is `artifacts/dungeon-final-audit/castle-replay.json`.
- The cache fix and related component checks passed 24 targeted cases. The additional explicit dungeon HUD regression also passed.
- The earlier exhaustive 375-chunk geometry check remains recorded in `artifacts/dungeon-sections/geometry.json`. An additional 84 comparisons across edited, graded and reloaded chunks, including border neighbors and 445 accepted terrain-edit requests, matched all triangle attributes against full-range meshing. Report: `artifacts/dungeon-final-audit/edited-geometry.json`.
- Final browser views passed for the mine, crystal cavern, forge, vault, real bedrock and home relic. A live boundary edit replaced both neighboring meshes; removing the edit restored both. No runtime, shader or WebGL errors were recorded. Report/screenshots: `artifacts/dungeon-final-audit/browser/`.
- TypeScript, production bundling and whitespace checks passed. The existing production-bundle size warning remains.

No additional reproducible dungeon/meshing correctness failure was found after the reach fix. The full-suite timing sensitivity remains relevant for CI/test scheduling. A real two-device WebRTC playtest and visual review of older worlds with builds intersecting new fixtures remain outstanding.
