# Dungeon collision, recovery and meshing hardening

Date: 2026-10-12.

## Solid fixtures

`FriendsCaveProps.ts` owns the mine supports, ruin/vault columns, forge machines and faceted crystal definitions. Renderer instance dimensions come from this same data. Terrain floor, overhead, player collision and raycasting use shared physical queries, so the host and guest prediction cannot disagree because of renderer-only geometry.

Boxes use cylinder-versus-box collision. Crystals use the visible tapered pentagon for ray hits and tapered expanded faces for operator collision; the latter is slightly conservative around polygon corners. Build placement reserves their bounds rather than permitting pieces inside the fixtures. Tool targeting identifies them as protected dungeon fixtures instead of excavating an unrelated voxel behind the visible prop.

The authored placement pass leaves floor-standing groups away from shortcuts/recovery ledges and checks the normal player-height envelope along the main stairs. Solid collision exposed an upper crossbeam intersecting the stairs; this was corrected. Mine supports have increased overhead clearance. The full descent and ascent without jumping remains a normal-physics regression.

Existing player-built pieces are not discarded by the new fixture-overlap check on save restoration. Older worlds with construction in the new fixture footprints still need visual/playtesting for intersections; this pass does not migrate or move those player pieces automatically.

## Fully obstructed lava recovery

Recovery first checks the local safe ledge and its nearby alternatives using the full operator cylinder and player-built collision. If players obstruct all of them, it uses the same protected campfire apron as the vault's return shortcut and tells the player why. This fallback preserves health and shared discoveries. Normal lava recovery remains local.

Friends session protocol is 3. Existing crew identities and saved world schemas are unchanged. Older cached clients receive the established version-mismatch response instead of joining with different collision geometry.

## CPU meshing profile

`tools/benchmark-friends-dungeon.ts` profiles five representative chunks with repeated warm CPU meshes. The deepest sampled chunks scan 117–170 vertical layers. Output meshes are roughly 64–130 KB per chunk in this sample. These measurements do not establish browser frame rate or cold-worker loading time.

The retained change removes per-voxel temporary coordinate arrays in the greedy mesher's face scan. A paired, alternating old/new run measured:

| Chunk | Previous median | Current median | Change |
| --- | ---: | ---: | ---: |
| Last Shift | 23.92 ms | 22.29 ms | 6.8% faster |
| Listening Cavern | 50.17 ms | 47.24 ms | 5.8% faster |
| Heart Forge | 87.75 ms | 84.14 ms | 4.1% faster |
| Bedrock Vault | 49.08 ms | 44.67 ms | 9.0% faster |
| Last Stone | 54.96 ms | 38.91 ms | 29.2% faster in this run |

The larger Last Stone result should be treated cautiously; allocation/GC and machine load can affect small benchmarks. The four other samples showed modest improvement. Positions, normals, UVs, colors, glow and material groups matched the previous implementation byte for byte for 16 ordinary/edited sample meshes, including dungeon, surface and ocean chunks.

A separate trial skipped ore calculations for hidden rock. Although its geometry matched, paired timings did not show a consistent benefit, so that trial was reverted. There is no new occupancy API or terrain/save format change from that experiment.

Reports are in `artifacts/dungeon-profile/`: `before.json`, `after.json`, `paired-final.json` and `geometry-equivalence.json`. `occupancy.json` records the discarded trial. Vertical mesh sections remain a larger future optimisation requiring boundary, edit-invalidation and streaming tests.

## Verification

The focused dungeon/building/prediction/interaction suite passed 107 tests across 15 files. A final grounding regression and two additional rendering tests bring the unique focused coverage to 110 cases across 16 files; the final five-file rerun passed all 30 of its cases. The rendering tests verify shared instance dimensions and repeated cleanup, including that owned materials/geometries are disposed once and the shared terrain material remains owned by its caller. Network movement and shared progression regressions remain covered by the existing host/guest fixtures.

Two-device WebRTC playtesting, especially reconnecting deep underground and existing built-out worlds, remains outstanding. The automated browser fixture checks views and WebGL/runtime/shader errors but does not reproduce real network latency or every GPU.

TypeScript and the production build passed after the final grounding correction. Browser review passed all six views without runtime, shader or WebGL errors; the final post correction only removes an unsupported fixture. The build retains the existing large-bundle warning.

The follow-up [vertical-band meshing pass](spawn-dungeon-sections.md) is now implemented: it skips sealed strata while retaining all geometry, with 375-chunk equivalence checks and measured CPU improvements.
