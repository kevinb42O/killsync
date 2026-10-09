# Customizable Friends graphics

Implemented in Settings → Graphics and Esc → Graphics using one shared component. Resolution (100/85/70/50%), anti-aliasing (Auto/Off/2×/4×), frame limit (Unlimited/30/60/120), sun shadows and FOV are saved locally. Existing screen-effects choices remain available. Defaults retain the original desktop quality (native scale, 2× HDR AA, shadows, unlimited) and the existing mobile automatic profile. Explicit AA overrides apply on either profile, bounded by GPU sample capability.

The AA preference changes the HDR world/hand render target at a frame boundary, disposes the replaced buffer, preserves night-vision exposure history, and keeps foliage alpha-to-coverage synchronized with multisampling, including asynchronously loaded assets. Frame pacing gates presentation only; input, prediction, host clock and networking remain outside the render gate. Animation delta includes the elapsed time between rendered frames. No terrain distances or tree geometry were reduced by this change.

Fixed the old resolution selector's decimal-string mismatch: options such as `.7` did not match React's controlled numeric value `0.7`, so the selector could display Full despite a saved lower resolution. Removed unsupported 60+ FPS/zero-overhead guarantees from the main graphics page.

## Validation

- Eight targeted Vitest files: 52 tests passed (preferences, menu, shared controls, pacing, HDR target lifecycle, forest materials, renderer bridge and campfire).
- Final shared controls/menu check after formatting: 10 tests passed.
- `npm run lint` (TypeScript): passed.
- `npm run build`: passed; existing large-bundle warning remains.
- Production browser checks in Chromium/Metal, 1100×740 viewport at DPR 2: live AA changes, low-resolution render target, restoration to full resolution/4×, night-vision on/off, movement under cap, persistence on reload, and leaf alpha tests passed with no page or WebGL errors.
- Separate main Options → island → in-game Graphics flow passed, including reload and 390×844 menu layout. JSON details in `options-verification.json`; runtime checks in `verification.json`.

## Performance limits

These checks validate the settings, not stable 30 FPS across the game. In this later live workspace/browser run, the campfire view measured about 15.6 FPS at 70%/AA Off/30 cap and 19.3 FPS at 50%/AA Off/30 cap. The host clock still advanced 182 ticks per six-second sample. These figures are not a controlled before/after benchmark: the workspace includes concurrent changes and the machine was running other work. Prior isolated rendering measurements are recorded separately in `../post-campfire-performance/findings.md`. A frame cap cannot increase throughput; sustained gameplay profiling remains necessary to certify stable 30 FPS.

No deployment or Git commit was performed by this task.
