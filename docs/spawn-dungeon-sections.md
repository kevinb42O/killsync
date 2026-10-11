# Dungeon vertical-band meshing

Date: 2026-10-12. Status: implemented and verified.

## Approach

Dungeon chunks now mesh separate vertical bands around every potential exposed surface, skipping sealed rock between those bands. The surface band includes the complete height span across the chunk's one-voxel halo, so steep cliff sides remain covered. Additional bands include authored cave voids, natural mining seams, arches, ruin geometry, railway/station cavities and every persisted terrain edit with its neighboring layers.

Overlapping/adjacent bands merge before meshing. Each band queries the real materials immediately outside its bounds, so a section cut does not create an artificial cap. Every cave level and the outdoor surface remain resident when the column is loaded; there is no camera-dependent vertical clipping or new depth-section pop-in.

The worker combines the bands into the existing single terrain-mesh payload, with one draw group per material. Streaming continues to use the same horizontal chunk keys, dirty-neighbor handling and epoch rejection. The optimisation applies to chunks overlapping the authored dungeon footprint. Other terrain keeps the full-range mesher.

`FriendsTerrain.columnMeshRanges()` owns the exposure hints. Future additions to terrain-carving sources must extend those hints if they create voids outside the covered ranges. `meshTerrainChunkFull()` remains the reference/fallback and supplies the same band-meshing implementation with a full vertical interval.

## Paired CPU measurements

Alternating warm full-range and sparse-band runs in the same Node process gave these medians:

| Chamber | Full layers | Scanned layers | Full-range time | Band time | Faster |
| --- | ---: | ---: | ---: | ---: | ---: |
| Last Shift | 42 | 27 | 18.39 ms | 12.96 ms | 29.5% |
| Listening Cavern | 117 | 53 | 44.13 ms | 20.84 ms | 52.8% |
| Heart Forge | 170 | 107 | 78.86 ms | 46.52 ms | 41.0% |
| Bedrock Vault | 132 | 48 | 40.57 ms | 15.52 ms | 61.7% |
| Last Stone | 141 | 36 | 37.78 ms | 10.25 ms | 72.9% |

These are CPU mesh-generation measurements, not browser FPS or cold-worker latency guarantees. The resulting geometry sizes, material groups and GPU draw workload remain equivalent. Band merging introduces a small temporary buffer-copy cost, included in the benchmark. Large surface cliffs still require a broad surface band; the forge retains 107 layers to preserve its entire exterior and interior geometry.

Reproduce with `npx tsx tools/benchmark-friends-dungeon-sections.ts`. Results are in `artifacts/dungeon-sections/benchmark.json`.

## Verification

- Exhaustive comparison across all 375 chunks in the dungeon footprint retained every triangle, material index, normal, UV, shade and glow attribute. Triangle ordering is normalized for comparison; winding and duplicates remain significant. Run `npx tsx tools/verify-friends-dungeon-sections.ts`; results are in `artifacts/dungeon-sections/geometry.json`.
- Regression cases cover separated cave levels, surface cliffs, graded terrain, blocks above the surface, deep excavation in previously sealed layers, edits on both sides of horizontal chunk borders, filling, save restoration and real neighboring materials at section cuts.
- A worker regression restores changed snapshots, remeshes both border neighbors, checks updated epoch tags and verifies the existing typed-buffer transfer payload.
- The focused terrain/dungeon/edit/build/streaming tests passed 73 cases across 11 files; the additional worker test passed. TypeScript, production bundling and whitespace checks passed.
- Browser review rendered the mine, crystal cavern, forge, vault, actual bedrock and recovered camp relic. It also edited a sealed layer at a chunk boundary, verified both mesh replacements, removed the edit and verified both replacements again. No runtime, shader or WebGL errors were recorded. Results and screenshots are in `artifacts/dungeon-sections/browser/`.

Collision, excavation rules and terrain generation are unchanged. No save or multiplayer payload schema migration is needed. The existing large production-bundle warning remains.

The [final bug check](spawn-dungeon-final-check.md) records the broader test run, additional edited/reloaded geometry verification and a corrected discovery reach check through player-built walls.
