# Ember Caldera, river and lookout

The summit has a rising ash column and a broad drifting crown, rendered as 32
GPU-animated billboards in one instanced draw (64 triangles). No simulation
particles, dynamic geometry or volumetric ray marching. Bounds include GPU drift
and expansion so offscreen plumes can cull. The ocean vapor, lava ribbon, basalt
banks and boulders use four draws in total.

`FriendsLavaRiver.ts` shares the downhill route between terrain, visuals and lava
audio. The river already uses the locally bundled Nature Lava Loop 3 recording.
The ocean outlet additionally has `ocean_steam_loop.ogg`, a 24-second excerpt of
sethlind's CC0 NYC steam radiator hiss recording. It decodes only within audible
range, uses the existing 800 ms seam crossfade, stereo pan, distance falloff,
terrain occlusion and Ambience controls, and releases its source on departure,
mute or scene exit. Credits and source/output hashes live in
`public/audio/friends/ember-steam-sources.json` and `CREDITS.md`.

Ember Campfire and Saltwind Camp now support the same marshmallow system as the
commons fire. `FriendsCookingFires.ts` defines each flame's physical centre and
scale, shared by host cooking and seated stick rendering. Sitting by a fire
selects the marshmallow tool. Hold LMB/RT over the flame to roast, RMB/LT to eat,
R/X for a fresh marshmallow, and K/d-pad up to add carried timber. Standing
roasting keeps the same finite 124-unit reach; the visible tip must reach the
actual fire. The baseline fire remains warm without extra timber.

Each retreat fire has independent fuel in `CampfireSnapshot.siteFuelSeconds` and
`FriendsTransportSave.campfireSiteFuelSeconds`. Fuel, toast, burn/eat/refill states
remain host-authoritative; snapshots replicate the compact state. Adding wood at
Ember changes Ember's flames, sound and heat rather than the commons. Sites
disabled due to existing construction do not provide heat or accept fuel.

Review: `tools/lava-river-review.html` has summit, river, ocean and lookout views,
plus an audio audition near the outlet. `node tools/test-lava-river.mjs` saves
render previews and checks instancing, draw counts, offscreen culling, stable
geometry/instance buffers and WebGL errors. Unit tests cover every Ember seat,
standing tip alignment, local fuel, replication/save restore, inactive sites,
loop source reuse and spatial sound placement.

The lookout performance regression was repeated uploads of identical shadow
matrix arrays across vehicle materials. `FriendsMatrixUploadCache.ts` caches
full matrix-array writes by native uniform location and exact float bit patterns
in the Friends renderer. Changed values still upload immediately; partial writes,
scalar matrices and unknown locations use the native path. Relinking, context
restoration and disposal invalidate the cache. No geometry, effects, resolution
or lighting quality is reduced.

`node tools/profile-ember-view.mjs` compares the actual loaded arena with the
cache disabled and enabled in an isolated browser. On the recorded Apple M1 run,
the fixed lookout render fell from 61.7 ms to 9.9 ms at 1600×900 and from 114.3 ms
to 12.4 ms at 2870×1622, with the same 1,086 draws and 5,508,991 triangles. The
lookout, camera movement, midday sun, night flashlight and summit comparisons
all had zero changed pixels and zero WebGL errors. These timings cover warmed
rendering with GPU completion, rather than the entire gameplay frame. Results
are saved in `artifacts/ember-performance/matrix-cache.json`; focused unit tests
cover changing values, bitwise equality and invalidation.
