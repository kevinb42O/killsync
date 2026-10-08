# Mining and building interaction upgrade

Implemented 8 October 2026 in the current working tree. This implements the interaction overhaul in [the original plan](mining-building-feel-plan.md).

## Player experience

Mining starts with a wind-up, then accepted tool contacts and recovery. Soil takes one contact after about 330 ms, stone four contacts in about 930 ms, ore five in about 1.3 s, and trees six in about 1.6 s. Reinforced tools shorten the action timings by 28%. Simulation tick timing can add a small amount to these values.

A thin target outline, eight procedural crack stages, existing tool models, material impact/break sounds and a shared chip pool show the work directly in the world. The large harvest panel is removed from normal play. Compact progress is available in the pause settings. Resource gains appear briefly near the tools. Nearby teammates have their own accepted strikes and tool animations. Two players can work on one block; the final accepted hit receives the existing reward exactly once.

Partial work expires after 1.1 seconds. Release, tool/target changes, stale input, disconnect, menus and focus loss cancel future contacts. Replaced materials cannot inherit the previous work. Protected infrastructure, bedrock, wrong tools and saved-build support have concrete reasons. Mining and construction use the same player-owned ray contract as host validation.

Building now provides repeat placement, pick-piece, precise offsets, plane locks, line/rectangle footprints and intentional deconstruction. Rectangles follow the starting face, including vertical faces. Groups are limited to 64 pieces, validated and charged atomically, and recorded as one undo operation. A later edit by another player prevents that operation from overwriting their work. Existing piece/terrain limits and free-building mode remain in force. Group placement counts toward expedition construction milestones.

The construction preview uses exact shape geometry, edges and a contact marker, colors invalid cells, retains an amber pending guest preview, and pulses accepted nearby edits. A held deconstruction action shows its progress on the piece. Tree harvests resolve immediately on the host, followed by a capped cosmetic fall using the existing forest instance batches. Effects-off suppresses chips and tree falls while retaining functional targeting and cracks.

## Controls

| Action | Control |
| --- | --- |
| Mine/cut | Hold primary action with the appropriate tool |
| Enter/leave construction | B |
| Repeat single placement | Hold primary action and move to new snapped poses; maximum four attempts per second |
| Select build piece | Scroll or 1–8 selects the eight saved quick slots; the bar scrolls horizontally on narrow screens |
| Customize build slots | Open the library with Tab, hold B or the library icon; drag pieces onto slots, drag slots to swap them, or use the slot selector and pin button |
| Pick aimed piece, finish and rotation | Middle mouse or I in construction; Copy button under Construction controls |
| Rotate | R / Shift+R, Shift+scroll, or Construction controls buttons |
| Single / line / rectangle | H cycles modes; Construction controls buttons select directly |
| Group placement | Click start, aim at endpoint, click to commit |
| Lock/unlock work face or placement plane | P or the relevant tool/Construction controls button |
| Vertical offset | [ / ]; Adjust position also provides buttons |
| Horizontal offset | Alt+arrow keys; Adjust position buttons |
| Deconstruct aimed build | Hold X for 450 ms; explicit creative Remove remains immediate |
| Undo / redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z, or Construction controls buttons |

The icon-only build bar hides after five seconds of inactivity using the same timer and transition as the tools bar. Selecting, rotating, placing, entering build mode or closing the library reveals it again. Saved slot arrangements persist locally. Hidden slots are inert and excluded from accessibility; the open library stays available throughout customization.

Voxel offsets preserve the horizontal 32-unit grid. Full blocks use 32-unit vertical offsets; thinner voxel pieces use 8-unit vertical steps. Architectural pieces retain their existing 4-unit placement grid. Moving cargo retains its local attachment frame.

## Performance boundaries

- One 96-chip pool, reduced to 24 on subtle effects, with ballistic motion in the vertex shader. Buffers upload at contacts rather than for every animation frame. No debris colliders, physical drops, new lights, shadows or full-screen passes.
- One crack batch for up to eight nearby damaged targets. Unchanged stages reuse matrices and attributes. Selection, cracks and chips use at most three draws together.
- Nearby build queries use a spatial index. Tree targeting rejects out-of-reach trunks before sampling terrain support, including the corners of large trunks. Unchanged construction batches, decorative details and group previews retain their buffers. Footprint validation caches exact collision inputs.
- At most two cosmetic tree falls and three short placement pulses.
- Temporary terrain feedback is capped at 16 removed voxels. A shared shader mask covers stale horizon/shell/volume faces, and bounded instanced planes supply newly exposed walls. Matching chunk installations retire each patch, including both sides of seams. The patch is purely visual; terrain/collision authority updates at the accepted hit.
- Partial work does not change durable world revisions, queue terrain meshes, enter world diffs, or enter saves/exports. Bounded contacts and actions travel in motion feedback. Non-completion contact history is shortened on the wire. Contact serials prevent repeated sounds/particles.

## Verification

The production browser flow uses real input handlers and a small deterministic terrain fixture. It verifies initial contact without a terrain edit, a complete held stone break with exactly one reward, retirement of temporary excavation feedback after mesh installation, a four-block line gesture, grouped keyboard undo/redo, plane lock, precision controls and absence of browser/runtime/shader errors. The final recorded flow used 70% render scale with shadows disabled to keep the browser review responsive; the isolated feedback benchmark uses a 900 × 620 drawing buffer.

The final focused suite passes 90 tests across 12 files, covering material timing, cancellation/expiry, cooperation, obstruction/support, bounded tree support sampling, upgrades, grid stabilization, plane footprints, atomic group economics/undo, command bounds, transient replication, save exclusion, dirty build batches, tree falls, temporary seam patches, and existing multiplayer/UI/renderer contracts.

The broad run passed 950 tests across the current project and hit one 20-second timeout in the existing castle-hauling traversal test. That test passed separately (both tests in its file passed in about eight seconds). This distinction is retained in the logs instead of presenting the broad run as wholly green. TypeScript and the production build pass. The build still reports its existing large-chunk advisory.

The Apple M1 / Chromium ANGLE Metal feedback stress scene alternates baseline and active frames after warmup, with 120 samples per scene. It reaches 96 live fragments and 40 crack faces. The latest run measured approximately 0.3 ms p95 and 0.4 ms p99 feedback CPU work, with three additional draws. GPU medians were approximately 1.67 ms for both baseline and active feedback; GPU tail timings varied with other work on this machine. A negative observed difference is noise, not a GPU speedup claim. These measurements cover the isolated feedback system, not an FPS guarantee for the complete island or every device.

Observed terrain mesh delivery varied from roughly 25 to 150 ms in earlier browser runs and reached about 720 ms in a run alongside a production compile. These are observations under different machine load, not a terrain latency budget. The temporary patch covers that interval and retires after installation. Separate unit and WebGL checks verify its capacity, seam lifetime, replacement cleanup, shader compilation and retirement.

## Evidence

- [Actual game flow](../artifacts/mining-building/game-flow.json)
- [WebGL/performance report](../artifacts/mining-building/render-performance.json)
- [Focused tests](../artifacts/mining-building/focused-tests.log)
- [Full-suite log](../artifacts/mining-building/test-suite.log)
- [Castle isolated recheck](../artifacts/mining-building/castle-recheck.log)
- [TypeScript](../artifacts/mining-building/typescript.log)
- [Production build](../artifacts/mining-building/build.log)
- [Line preview screenshot](../artifacts/mining-building/game-line-preview.png)
- [Construction controls screenshot](../artifacts/mining-building/game-construction-controls.png)

Five simultaneous contact bursts are stress-tested in the renderer; full five-browser WebRTC play, physical controller/touch devices and low-end GPU profiling remain manual playtest coverage. The host/guest durable-versus-motion transport and grouped transaction correctness have automated coverage.
