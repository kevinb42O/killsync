# Friends mode isolation

Friends characters now use a dedicated rig containing the authored Big Walk model and caption. They do not construct the survival chassis, cybernetic eyes, thrusters, revive marker, or an idle firearm. When a player explicitly selects the firearm tool, its weapon is created on demand and mounted at the animated hand socket. Switching to a peaceful tool hides it. Tool swings use character/equipment eligibility directly rather than relying on firearm visibility.

Friends sessions do not create an OperatorTrailSystem, its 72 ring meshes, survival structure visuals, or reality-breach visuals. The generic renderer also omits its obsolete third-person body in Friends and skips survival viewmodel animation/material updates while Friends equipment is active. Camera preparation, gestures, flashlight lighting, tools, and vehicle/spectator cameras remain active.

The Friends simulation does not initialize the encounter director, spawn topology, gas zone, station director, weapon foundry, field mission director, run director, or reality breach. Survival-only command entry points reject Friends requests. The shared snapshot contract retains a small, static run placeholder so existing consumers remain compatible.

Peaceful Friends ticks skip weapon actions, ordnance, artifacts, passive abilities, survival structures/fabricator recharge, and survival revives. Empty pickup processing is skipped as well, and combat eligibility is checked in one allocation-free scan. Combat work is activated only when the relevant gameplay is in use, including an explicitly selected firearm, outstanding grenades/spell zones, effects, enemies, or passive modules. Existing firearm/grenade gameplay and salvage enemies are preserved. Friends damage recovery remains handled by the Friends recovery path.

Peaceful snapshots omit weapon inventories and optional tactical resource fields. Equipping a firearm restores the authoritative loadout to that player's snapshot. The new optional `friendsWeaponEquipped` flag controls this state and uses a compact wire key. Keyframe-based delta tests cover repeated equip/unequip transitions. The host retains combat loadouts so ammunition and upgrades survive tool changes.

The salvage occupancy check reads the expedition's status directly instead of constructing a complete expedition snapshot every tick.

## Measurements

Artifacts are in `artifacts/friends-mode-isolation/`.

- Browser comparison: the legacy combined character rig had 127 scene objects and 100 mesh objects; the dedicated peaceful rig has 25 objects and 6 meshes. These counts include hidden legacy meshes and are not draw-call or FPS measurements.
- The production browser check verifies no old body, no idle firearm, no trail allocation, and no WebGL errors. It exercises all five held tools, several fields of view and screen aspect ratios, and a spectator camera.
- The idle simulation probe verifies zero calls to all seven identified survival update paths and the already-gated survival directors.
- The four-player compact keyframe sample falls from roughly 14 KB to 12 KB. Keyframes are distinct from routine delta updates; this is not a continuous bandwidth measurement.
- CPU benchmark timings are recorded, but concurrent machine load and other working-tree updates during this task prevent treating the samples as a controlled A/B test. No FPS or CPU speedup percentage is established by these measurements.

Run the CPU probe with `npx tsx tools/profile-friends-mode-isolation.ts`. Run the browser checks with `FRIENDS_TEST_ORIGIN=http://localhost:3031 FRIENDS_TEST_ARTIFACTS=artifacts/friends-mode-isolation/browser node tools/test-friends-characters.mjs` against a Vite development server.

Regression checks cover mode initialization, idle update isolation, survival combat preservation, compact delta replication, dedicated rig lifecycle, hand-mounted weapons, tool visibility and disconnect cleanup. The existing Friends, survival, rendering, and multiplayer suites are also exercised.

## Validation result

The broad run covered 209 test files and 1,671 tests: 208 files passed, and a fishing test failed while that independent feature was being updated. The current fishing suite then passed all 19 tests. After the final idle-loop cleanup, the Friends simulation, survival simulation, mode-isolation, and snapshot-replication suites passed all 117 tests. Dedicated rig/tool checks, the production browser test (including spectator view), TypeScript checking, and production builds also passed. The existing production bundle-size warning remains.
