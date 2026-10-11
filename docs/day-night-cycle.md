# Friends Frontier day–night cycle

## Sky regression — fixed first

The underground check hid the entire exterior and changed `scene.background`
to almost black. A tunnel roof therefore blackened even unobstructed sky at
the entrance. Keep the sky, clouds, ocean and horizon rendered; the terrain's
depth buffer decides what is visible. Cave lights and excavation streaming
still use the underground check. Never cache and restore a daylight background.

## Implementation plan

1. Derive time from the authoritative world's elapsed milliseconds. One full
   day lasts 24 real minutes, starts at 09:00, and repeats without a midnight
   jump. All clients and late joiners see the same time. Host environment anchors
   travel with the live Friends snapshots; no saved-world migration is needed.
2. Use continuous solar elevation to blend daylight, golden hour, twilight
   and moonlit night. Move the visible sun and the actual directional light
   together. A separate moon supplies subtle cool light, with bounded shadows
   for the dominant light and stable texel anchoring at every sun angle.
3. Render a camera-centered procedural sky: vertical atmosphere, warm light
   near the rising/setting sun, solar disc and halo, a shaded moon, stable stars
   with varied brightness, a textured galactic band, three shaded planets and
   occasional shooting stars. Sky geometry must never respond to roof detection.
4. Drive ambient light, hemisphere fill, exposure and exterior fog from the
   same sample. Preserve cave torch/flashlight contrast and smoothly blend cave
   mist using elapsed time rather than frame count.
5. Feed the same lighting into volumetric clouds, cheap cloud shadows, water
   reflections/specular highlights and distant forests. The current forest
   renderer uses standard lit 3D meshes, so every tree responds to the same
   sun, moon and ambient lights. Do not leave daytime white clouds or bright
   water at midnight.
6. Show a compact time/day/phase indicator on the Frontier HUD. Add a scrubber
   and time presets to the existing development render review for checking
   dawn, noon, sunset, midnight and tunnel entrances without waiting a full day.
7. Verify phase boundaries and wraparound, shared-clock determinism, sun/shadow
   alignment, cave background preservation, TypeScript, production build and
   browser shader compilation/visuals.

## Scope and performance

Applies to Friends Frontier only. Preserve combat-world themes and the existing
safe exploration rules. No new weather or nighttime enemy rules. Use one sky
draw and one static star batch at night, existing cloud volumes and existing
surface shaders; only one celestial
  shadow map updates at a time, at the existing throttled cadence. Keep moonlit
  terrain legible while letting flashlights and night vision retain their purpose.

Atmosphere, planets, moon and meteors remain in the single sky draw. A seamless 256² single-channel
nebula texture (64 KiB base, about 85 KiB with mipmaps) is generated once and
disposed with the sky; it replaces per-pixel fractal noise. The previous cube-cell
star shader exposed rows and diagonals. Stars now use 11,000 independent random
directions sampled uniformly on the sphere with a fixed integer seed, with no
grid, face seams or repeated layout. One static point batch uses about 301 KiB
of vertex data and is hidden entirely during daytime. Gaussian sprites integrate
their light over the pixel footprint and retain stable positions during movement.
Terrain depth and later cloud draws occlude the stars; celestial masks prevent
stars shining through the planets/moon and attenuate them through the rings.
Planet surface and ring shading run only near their
discs, with explicit mip selection to suppress distant cloud/terrain shimmer.
All bodies share the world's solar direction and blend behind the local sky
atmosphere. The ring plane controls front/back occlusion and mutual globe/ring
shadows; fine radial bands fade below pixel resolution. The blue planet has
clouds and polar caps, the rocky planet has mineral variation, and the moon has
smooth maria and crater relief instead of blocky hash noise. One reusable meteor
follows a great-circle trail and lasts 1.4 seconds within each 18-second
window, varies its direction deterministically, and follows the animation clock
rather than accelerated time of day. All additions fade with the existing star
visibility, and daytime skips the night detail. No additional lights or shadow
maps are allocated, and the star batch has no per-frame particle simulation or
geometry rebuilds. `tools/night-sky-review.html` provides
an isolated interactive preview; `tools/test-friends-night-sky.mjs` verifies
phase transitions, shader reuse and paused meteor behavior in WebGL.

## Cloud and developer controls follow-up

Clouds use eight cached billowy density/optical-depth volumes in one 64³ RG
texture. The visible volume pass uses 6, 8 or 12 samples by range, with two cheap
volume lookups per occupied step. The previous shader evaluated three noise
octaves and multiple ellipsoids twice per step. A 1024² optical shadow atlas
uses the same density, cloud heights and solar direction as the visible clouds.
It stores the immutable weather field; receivers subtract the continuously
updated wind offset. Wind alone therefore requires no atlas redraw. A change
in projected light of three quarters of a shadow texel invalidates it, with a
5 Hz bound for ordinary movement and immediate refresh for large time jumps.
Periodic footprint copies preserve shadows at every atlas edge. Optical depth
accounts for cloud thickness and the light's elevation. Offscreen rendering
preserves the main viewport, clear state and pending sun/moon shadow updates.

Cloud shadows attenuate only the celestial directional light, preserving torch,
flashlight and other local illumination. The local directional shadow map fades
at its boundary instead of exposing a sharp coverage rectangle. Time scrubbing
and teleporting request an immediate celestial shadow refresh. Cloud volumes
are culled against the camera frustum and sorted far to near before one instanced
draw; the shadow field remains independent of that changing visibility/order.
Visible clouds use the same tone mapping and output color space as the sky.
Wind coordinates stay bounded to retain GPU precision in long-running worlds.
Buried cave materials skip cloud lookups altogether; light alignment is computed
in view space without per-fragment matrix transforms. Cloud-box intersections
remain finite when a flying camera lies exactly on a boundary.
The render-review panel reports visible volumes and cumulative atlas bakes.

C opens the Friends developer menu. Flight remains an existing multiplayer
movement flag; environment settings are host-controlled and shared with all
players, with exact time, presets,
pause/resume, 0.25–120× cycle speed and 0–4× wind. Rate changes re-anchor without
phase jumps. Pausing the celestial clock does not pause cloud wind, and pausing
wind does not stop shadow updates when the sun moves. Reset returns everyone to
the normal world clock and speeds. Local render-review previews remain independent.
The menu blocks gameplay input and returns pointer
control when closed with C, Escape or its return button.
