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
