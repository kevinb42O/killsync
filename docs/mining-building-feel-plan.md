# Mining and building feel upgrade

Implementation status: completed in the working tree. See [the implementation and verification report](mining-building-implementation.md) for the shipped controls, limits, measurements and remaining device playtest coverage.

Planning date: 8 October 2026. Status: proposed, based on the current working tree. This document does not represent implemented or benchmarked behavior.

## Outcome

Make mining feel like working a material and building feel like shaping a place. Players should understand their target, feel each impact, see damage develop on the world, and place repeated pieces confidently. Keep the existing voxel world, assets, worker meshing, collision, saves, and authoritative host architecture.

The first release must deliver better interaction and practical construction controls together. More particles or a prettier progress bar alone do not satisfy this plan.

## What the code does today

- `FriendsFrontier.tool()` repeats while primary action is held, with a 330 ms cooldown, reduced to 190 ms after the shared upgrade. Holding to mine already exists.
- Soil takes one hit. Stone and ore take two, reduced to one after upgrading. Trees take four, reduced to two. The first hit can delete a block immediately, so faster tools often remove the entire damage sequence.
- `FriendsFrontierVisuals.updateTool()` already loads tool models. Its swing is a continuous sine wave based on elapsed time, independent of the authoritative hit cadence. Reuse the models and replace that animation timing.
- Material impact audio already exists through `FriendsAudio` and `MultiplayerRendererBridge`. Improve synchronization and hit/break distinction instead of introducing a second audio system.
- A damage map tracks targets, but the snapshot exposes one global `damage` record. `FriendsToolbelt` renders that record without checking the local actor or aim target. Simultaneous players can overwrite one another's displayed progress. Abandoned partial damage currently has no eviction path.
- Mining selects terrain and trees; terrain selection does not compare against build-piece obstruction. Build targeting uses the camera, while authoritative mining casts from the player's position plus 26 units. These paths need a shared targeting contract.
- Construction already includes face placement, 32-unit voxel pieces, smaller architectural snapping, material previews, rotation, copy, move, paint, remove, undo/redo, permissions, and resource validation. Improve these systems rather than rebuilding the catalog.
- `FriendsBuildVisuals` already uses instancing, but any building revision regroups all pieces, updates their matrices, and disposes/recreates decorative detail batches.
- Terrain is edited sparsely and remeshed through a worker. Mining progress must never become a terrain edit or trigger a remesh.
- `FriendsWorldHost` separates durable world state from motion feedback. However, hit feedback currently increments the frontier revision used to schedule durable updates. Separate transient interaction revisions from durable ones.
- `FRIENDS_TEST_MODE` currently enables free construction and uncapped inventory. Preserve that behavior. This upgrade must be enjoyable in the current sandbox; a survival economy change is a separate decision.
- Current supported limits include 1,024 build pieces and 6,000 terrain overrides. This work does not silently raise them.

## 1. Targeting that players can trust

Create a shared, simulation-safe query returning target identity, material, hit point, face normal, distance, validity, and failure reason. Compare terrain, trees, build shapes, and relevant solid obstructions; select the nearest eligible visible surface. Use bounded nearby candidates for builds and trees.

Define mining reach and construction reach explicitly. They may differ, but their indicators and host validation must agree. Use a player-owned aim ray for gameplay, with a camera presentation ray mapped back to that valid target. Third-person cameras cannot grant extra reach or interact around a wall. Account for authored geometry whose visible surface differs from its voxel backing.

Show a thin outline on the actual target and a restrained face marker for placement. Invalid targets show a brief, concrete reason such as protected ground, wrong tool, occupied space, or out of reach. Rate-limit repeated errors; holding over bedrock must not produce a new toast every swing.

Share one local aim result among outline, crack overlay, tool animation, and preview where their query is identical. Cache only until aim, actor pose, selected tool/shape, nearby world revision, or attachment transform changes. The host independently validates current state.

## 2. Mining as a readable interaction

Use a material hardness table and tool effectiveness table with one action timeline: acquire target → wind-up → contact → recovery → repeat. A press starts winding up immediately; authoritative damage occurs at contact, rather than instantly on the first held-input tick. Releasing stops future contacts. A miss has a swing and recovery, but no material impact, damage, or resource award.

Starting balance targets, measured from initial press to successful break with the appropriate basic tool:

| Material | Initial break-time target | Feedback |
| --- | --- | --- |
| Soil | 0.30–0.45 s | Soft contact, small dust/chips, brief visible damage |
| Stone | 0.80–1.10 s | Firm repeated impacts, distinct developing cracks |
| Copper / iron ore | 1.10–1.50 s | Stone weight with a restrained metal accent |
| Tree trunk | 1.30–1.80 s | Wood impacts, visible cut progression, final fall cue |

These are playtest starting points, not Minecraft timing claims. Favor quick excavation over repetitive grinding. Tune cadence around 220–300 ms where appropriate; reconcile durations with whole strike cycles. Upgraded tools should initially reduce work by roughly 25–35%, while keeping readable contact and completion. Wrong tools should be visibly ineffective or slower according to a small explicit matrix; the shovel remains unsuitable for stone.

Display 6–8 damage stages on the target's exposed faces using one small shared atlas and reusable overlay geometry. Advance the stage at accepted contacts; use limited interpolation between them if it improves legibility. No individual block materials or terrain mesh changes for partial damage. Correct depth testing must prevent cracks appearing through neighboring blocks.

Each contact combines the existing tool model, material sound, a few chips, and optional tiny viewmodel recoil. Avoid obligatory camera shake or FOV pumping. The final contact adds a distinct break sound and brief larger fragment burst. Remove the large central harvest panel in normal play; retain optional compact progress for accessibility and debugging. Aggregate resource gains into a small fading count near the hotbar.

On target change, stop advancing the old target immediately and start the new target cleanly. Retain abandoned partial work briefly (initial target: about one second), then expire it. Store temporary work only for active/recent targets, with a TTL and hard cap; do not save it. Damage expires visually and authoritatively together. Check the target material/revision again at every contact so replacing a block does not inherit damage intended for its previous state.

Cooperative mining may combine accepted contacts on the same block. Different targets remain independent. Decide resource ownership explicitly: retain the current final-hit recipient initially, and show that behavior consistently. A block produces its reward exactly once. Do not introduce physical loot entities just to make collection visible; brief cosmetic fragments can suggest collection while inventory remains authoritative.

At completion, authoritative terrain and collision update together. Mesh delivery remains asynchronous. Measure the delay before the visible hole appears and prioritize/coalesce the affected worker job. If visible mesh lag is noticeable, implement a revision-aware local surface mask/temporary exposed-face patch that covers shell and volume representations, retire it on matching mesh installation, and profile it separately. Do not hide delay with a particle cloud or rebuild terrain synchronously at every strike.

## 3. Building that supports flow

Improve the existing ghost with a readable material silhouette, crisp edges, an exact contact-face marker, and distinct valid/invalid/pending states. Avoid excessive transparency that makes a small piece hard to read. When hovering a boundary, stabilize face selection within a small tolerance without concealing the final snapped pose. Validation always uses the displayed pose.

Keep basic voxel pieces aligned to the existing world grid. Architectural pieces retain their current finer snapping. Make the choice legible through a small contextual hint. Quarter-turn rotation must produce predictable results on slopes, stairs, and roofs; moving cargo attachments remain in their own local frame.

Add these practical controls in order:

1. **Repeat placement:** holding the place action repeats at a bounded rate (initially 4 pieces/s). One pose creates at most one piece until the aim moves to another valid pose. Preserve discrete click placement and prevent a rejected cell from being spammed.
2. **Pick aimed piece:** one context-specific action copies the aimed shape, finish, and rotation into the toolbar. Existing copy logic provides the foundation. Audit keyboard/AZERTY, controller, touch, and rope/combat conflicts before selecting bindings.
3. **Precise adjustment:** allow a small grid-step offset and quick rotation while previewing. Display the resulting position directly. The active preview owns these controls; walking and tool use remain predictable.
4. **Line and rectangle construction:** preview a bounded footprint before committing it. Initial cap: 64 pieces per gesture, also constrained by current world capacity, inventory, protected spaces, support, and players. Commit atomically or reject with a highlighted offending cell. Host validation, grouped revision-aware undo, and material conservation are prerequisites.
5. **Intentional deconstruction:** hold briefly to remove an aimed structure, showing damage/removal feedback on that structure. Existing explicit remove can remain a quick creative action. Give a reliable undo and keep later edits by another player protected.

For accepted placement, use a short outline pulse and material contact sound. A pending guest edit has a distinct ghost until acknowledged. It never becomes authoritative collision before acceptance. Rejections clear that ghost and explain the reason. Animate visual confirmation without changing the real collision bounds.

Preserve existing terrain-support and infrastructure rules during this upgrade. The current code forbids mining a voxel that supports a saved build; make the reason visible on that block. Removing that rule, allowing unsupported structures, or adding structural collapse would require separate gameplay and save decisions.

## 4. Mining and building working together

Make three short tasks enjoyable: carve a player-clear tunnel, build stairs back out of a pit, and extend a floor/bridge along a chosen plane. Derive clearances from the actual player collider rather than assuming a one-block tunnel is wide enough.

Support an explicit placement-plane lock for floor rows and walls, released by the player. For excavation, a bounded work-face/plane assist can keep targets on the selected wall while requiring valid reach and line of sight for every struck cell. It must not mine through corners or automatically delete an entire volume.

Review tool transitions between shovel, pickaxe, earthwork, and construction. Keep distinct terrain placement and saved construction representations internally, while using consistent targeting and face feedback. Never route a decorative ore-finished build through terrain mining rewards; deconstruction uses its own refund rules and cannot mint ore.

Trees receive a small trunk/cut response and final fall presentation only after terrain/building interactions are solid. Use a capped nearby cosmetic proxy animated by transforms, with no new rigid-body simulation. Authoritative harvest and collision resolve once; the short proxy animation must not look like a still-solid obstacle or obstruct targeting. Foliage support continues to follow terrain edits.

## 5. Performance contract

Treat these as provisional acceptance budgets to verify against a recorded baseline on named devices:

- Added local interaction work: aim for at most 0.5 ms CPU and 0.5 ms GPU at p95 in comparable mining/building scenes. Report full frame-time distribution and edit stalls as well; these targets are not measured promises.
- Feedback: aim for no more than 3–5 additional draw calls in typical active play. Use one instanced fragment pool, one crack batch, and reusable selection/preview geometry where possible.
- Fragments: start with 96 live cosmetic fragments across the client; 24 on the lower effects setting. Drop oldest/distant effects when full. Lifetimes around 0.2–0.5 s; analytic motion, no collider, no shadows, no per-fragment mesh allocation.
- Crack overlays: cap visible active targets (initially eight nearby targets), prioritize the local player's target, and cull distant feedback.
- No new dynamic lights, shadow-casting debris, full-screen render passes, physical item drops, fluid simulation, cave-ins, or fine-resolution terrain for this work.
- Keep material/audio assets shared and decoded once. Reuse the existing audio voice cap; allow a local contact to take priority over distant cosmetic audio.
- No per-frame React state updates for crack/swing progress. React handles tool selection and changed hints; the renderer owns animation and pooled effects.
- Introduce a nearby build spatial index for targeting and preview validation. Invalidate affected cells on edits and update moving attachments correctly.
- Update affected build batches/details rather than rebuilding all decorations for each placement. Keep instance-ID mapping stable enough for targeted visual feedback and removal.
- Keep transient action state out of durable world revision changes, save stamps, world diffs, and terrain worker messages. Send bounded action IDs/contact or completion events plus occasional progress correction; clients animate between them.
- Dedupe predicted/accepted effects by actor and action ID. Give action-start/stop, tool switches, disconnects, stale inputs, focus loss, and menu opening explicit cancellation behavior. Audit the current mining branch, which lacks the `!stale` guard used by adjacent actions.

Instancing reduces repeated-object draw calls; chunked exposed-face terrain avoids one mesh per voxel. These are supported foundations, not a performance guarantee for this game: [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), [Three.js voxel geometry guide](https://threejs.org/manual/pages/voxel-geometry.html).

## 6. Implementation sequence and gates

| Stage | Work | Required gate |
| --- | --- | --- |
| A — Targeting and baseline | Capture current frame/edit timings; shared aim query, obstruction handling, target outline, transient state boundaries | Highlighted target agrees with host reach/occlusion in first/third person, on stairs, in caves, and beside vehicles |
| B — Complete mining interaction | Contact timeline, hardness/tools, staged cracks, impact/break audio, capped fragments, target expiry, small pickup feedback | Soil/stone/ore feel distinct; contact and break are synchronized; switching aim/releasing never damages the wrong target |
| C — Construction flow | Readable ghost, face stability, bounded repeat, pick-piece, adjustments, placement acknowledgement, local batch updates | Build a floor, corner, stairs, roof, and tunnel exit without ghost jumps, duplicate placements, or edit stalls |
| D — Practical shaping | Plane lock, bounded line/rectangle transactions, grouped undo, deliberate deconstruction | Carve and navigate a tunnel, make a staircase, build a bridge, undo the gesture without erasing a friend's later work |
| E — Shared polish and verification | Nearby friend strikes/cracks, optional tree fall, reduced-effects tuning, latency and reload checks | Two players mine separate blocks and one shared block correctly; five-player stress scene stays within measured budgets |

Stages B and C form the first substantial playable upgrade. Stage D supplies broader mechanical depth. Finish and playtest each stage before adding more systems; tree polish must not delay trustworthy mining and placement.

## 7. Code boundaries

- New `FriendsInteractionTargeting.ts`: shared query, nearby candidates, canonical reach/occlusion contract.
- New `FriendsToolActions.ts`: pure tool/hardness definitions, action phases, temporary target work, expiry/cancellation. Integrate it into `FriendsFrontier` and the existing simulation tick rather than creating a second simulation.
- New `FriendsInteractionVisuals.ts`: selection, crack atlas, instanced fragment pool, confirmation feedback. Keep temporary feedback independent of terrain mesh ownership.
- Extend `FriendsFrontierVisuals` or extract its small tool viewmodel class: preserve current assets, replace sine-wave swings with action-driven motion.
- Extend `FriendsBuilding` / `FriendsBuildControls` / `FriendsBuildVisuals`: spatial candidate index, stable pose controls, bounded repeat, dirty batch updates, then transactional group edits.
- Integrate through `MultiplayerRendererBridge`, `CoopSimulation`, and the Friends branch of `MultiplayerArena`. Keep combat/rope/build input contexts distinct.
- Adapt `FriendsWorldReplication` and existing protocol validation: bounded per-actor interaction feedback and event deduplication; version wire changes when required. Preserve the durable-world/motion split.
- Simplify `FriendsFieldPack` feedback: optional local progress, aggregated resources, actionable errors.

Names describe intended responsibility; reuse an existing module when it produces a clearer boundary. Avoid unrelated world, vehicle, or renderer rewrites.

## 8. Verification

Meaningful automated coverage: cadence/contact timing; release and stale-input cancellation; target/material changes; expiry; nearest obstruction; host/preview agreement; cooperative once-only rewards; no reward from cosmetic/decorative ore; no per-hit remesh/durable revision; duplicate/reordered action events; pending/rejected placement; repeat deduplication; atomic group placement/material costs; revision-safe grouped undo; dirty build batches; bounded effect pools.

Manual checks: solo, two players, and five active players; first/third person; reduced motion/effects; controller/touch/AZERTY; 100–200 ms guest latency; cave/chunk-seam excavation; an almost-full build world; rapid placement beside moving cargo; reload/export/import; protected railway/platforms; existing train walking, rope, flashlight, and Survival behavior.

During implementation run the relevant existing and new tests, `npm run lint`, and `npm run build`. Record browser/device, renderer settings, p50/p95/p99 frame times, CPU/GPU cost where available, draw calls, effect counts, interaction latency, mesh completion latency, network bytes, and save activity. Compare identical scenes before and after.

Acceptance: with the main harvest bar hidden and effects reduced, a new player can still identify the target, feel a contact, distinguish a final break, and build a useful route. At normal effects, the same actions have clear material weight without obscuring the work surface. Performance and multiplayer correctness are release gates.
