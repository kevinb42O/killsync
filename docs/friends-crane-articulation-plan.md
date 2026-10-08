# Rotating, player-built cranes — design and implementation plan

Status: restricted modular kit implemented, 8 October 2026. Usage, controls,
teamwork and current limits are documented in [friends-hauling.md](friends-hauling.md).
The scope/effort comparison below records the original design assessment.
Implemented: socket graph, continuous yaw, bounded collision sweeps, combined
motors, shared leases, local hook work without taking over controls, instanced
models, live load/overview camera, durable parked poses and motion replication.

## Recommendation and scope

Build a **crane construction kit** with one horizontal slewing joint, explicitly
connected boom pieces, one end winch, and one nearby control console. Let the
player build the supporting tower/platform with the ordinary building system.
Use a controlled moving assembly whose position is computed by the host, with
collision-checked motion. Keep the load beneath the rope outlet as it rotates.
This provides meaningful custom construction and solo operation with bounded
physics and rendering cost.

A rotating prefab is a useful intermediate verification milestone, but it does
not fulfill “fully construct our own crane.” Arbitrary physics-driven building
assemblies are a separate, substantially larger project. They would add moving
bridges, elevators and machinery, but require structural attachment rules,
compound rigid bodies, multi-joint constraints, player transport and much wider
save/network changes.

| Scope | Benefits | Costs / limits | Effort estimate | Regression exposure |
| --- | --- | --- | --- | --- |
| Existing fixed vertical crane | Solo lifting, very small simulation, reuses cargo/rope | Operator must position the boom when building; cannot move a lifted load horizontally | Implemented and browser-validated | Local to crane behavior |
| Slewing prefab | Rotate and lift through one menu; quickest operational crane | Fixed arm shape/length; does not let players compose their own machine | 2–4 focused engineering days | Low outside cranes if isolated; medium inside crane collisions |
| Explicit modular crane kit (recommended) | Custom tower, arm reach, placement of winch; clear object membership; same menu controls both axes | One joint and winch per assembly initially; supported part set and arm-length cap | 8–15 focused engineering days total, including prefab milestone and verification | Medium in affected building/hauling paths; can be bounded with an opt-in frame |
| General moving structures with real joint/load physics | Full sandbox machinery, multiple joints, natural swinging and reaction forces | Broader architecture, solver tuning, structural failures, moving floors, network bandwidth | 3–6+ engineering weeks; prototype needed before tighter estimate | High until the shared frame/contact systems are proven |

These are planning estimates for one experienced developer working on this code,
including meaningful testing and polish. They are not measured completion times
or guarantees. There is no defensible numerical probability of a major regression.
The scope and isolation of the change matter more than a percentage.

## What the current code implies

- `FriendsBuildPose.rotation` is an integer 0–3. Placement, shape bounds, floor /
  ceiling queries, overlaps and raycasts assume those four orientations. Writing
  an arbitrary angle into this field would break those assumptions.
- The existing freight-wagon attachment path (`attachment` and `vehicleFrame`)
  already demonstrates local-to-world transforms, attached build rendering and
  moving-frame floor/raycast handling. It is useful precedent, but hard-coded
  wagon IDs, deck limits and transport rules make it unsuitable as a crane parent.
- `worldBox` expands framed boxes into world AABBs. Those are fine for broad-phase
  rejection; using them as exact cargo contacts for a long diagonal arm creates
  invisible extra collision volume. Crane narrow-phase needs oriented boxes.
- `FriendsBuilding` owns placement, four-unit snapping, transactions, economy,
  undo/redo and restoration. Touching pieces have no explicit shared object ID or
  persistent parent graph. Contact alone cannot define which tower, wall or arm
  should rotate.
- `FriendsHauling` steps host-owned cargo at 120 Hz. Its current crane guide locks
  X/Y and rotation while the motor controls height. A rotating outlet must move
  the horizontal guide along a checked arc; updating just the visible arm would
  stretch or angle the rope while leaving the load behind.
- `haulingEnvironment` combines terrain, authored builds, trees, transport and
  castle geometry. These must all participate in both arm and cargo sweep checks.
- Build render batches currently update transforms without a build revision change
  only for transport attachments. Articulated parts need a dedicated motion path.
- World replication separates durable building data from frequent motion. The
  current world stamp should not advance on every joint angle update: that would
  repeatedly serialize construction baselines / trigger persistence.

## Construction and object membership

1. Build a static support using normal blocks, pillars or floors.
2. Place a **slewing joint** on a supported surface. Its lower plate stays fixed;
   its upper socket owns the rotating arm frame.
3. Snap compatible beam / boom sections onto the top socket or an existing arm
   socket. Placement visibly highlights the connected moving assembly. Each
   member stores explicit assembly/parent/socket identity and a local pose.
4. Snap a **freight winch** onto an arm end socket. Its outlet is computed from
   the same frame used for visible geometry and collision.
5. Place/link a **crane console** to that assembly. Operating a nearby winch may
   also open the same panel, provided its assembly binding is unambiguous.
6. Enter operating mode only after host validation finds one fixed root, one
   slewing joint, a connected supported arm and exactly one winch.

Use one joint and one winch per assembly initially. Limit the rotating member
count and reach (initial design budget: 32 arm parts, about 32m maximum radius;
confirm through profiling). No joint cycles, chained pivots, moving vehicle
parents, trains/rails on the arm, nested assemblies, or walkable moving platforms
in the first release. The tower is customizable but remains static. Extend the
compatible arm part list after the motion/contact path is proven.

Do not infer “same object” from pieces touching. Explicit socket ownership stops
an arm brushing a tower or adjacent crane from capturing unrelated construction.
A console bound to an assembly discovers its joint and winch through those IDs,
not proximity. Two neighboring cranes therefore remain independent.

## State model and transforms

Separate durable assembly topology from live operational state:

- Durable: assembly ID, root/joint piece ID, member piece IDs, socket/parent IDs,
  member local poses, winch ID, controller binding, design rotation limits and
  saved parked joint angle. Introduce an optional schema extension with validated
  defaults so old worlds retain their original static pieces.
- Live: actual joint angle and angular velocity, target/control intent, actual
  rope length and motor mode, connected cargo ID/anchor, active operator lease,
  blocked reason, motion sequence and timestamp.

Preserve static quarter-turn rotations. Add an explicit assembly frame rather
than interpreting static `rotation` as radians. For yaw-only articulation:

`worldPoint = rootOrigin + rotateZ(jointAngle) * memberLocalPoint`

The inverse transform serves collision, placement and targeting. Derive geometry,
rope outlet, snap sockets and physical colliders from this shared transform. Do
not use separately tuned visual offsets. Start with one yaw-only frame; do not
introduce general 3D rigid-body transforms until a later feature needs them.

Useful implementation boundaries:

- `FriendsAssemblyPose.ts`: frame transforms, precise oriented boxes, local rays.
- `FriendsCraneAssemblies.ts`: topology validation, binding, motor intents, sweeps.
- `FriendsCraneControls.tsx`: one panel for the capabilities of the linked assembly.
- Extend `FriendsBuilding` for explicit member placement / transactions and add a
  distinct motion resolver to rendering. Static pieces keep the existing path.

The final names are implementation choices. The separation of durable topology,
live motion and shared transform math is the requirement.

## Operating controls

One nearby panel shows **Arm** and **Winch** controls when the assembly has a joint
and winch. A standalone fixed winch shows only the Winch controls.

- Arm: rotate left/right, angle readout, optional target-angle dial, and stop arm.
- Winch: raise/lower, cable/depth readout, connect, release and brake.
- Prominent **Stop all** brakes both motors immediately.
- Allow both axes to move together once combined collision checks pass; do not
  expose separate menus that require the player to leave one device to use the
  other. Initial proof can test each axis independently first.
- Commands are host-authoritative and validate distance to the console, life
  state, build access, assembly identity and lease. Use a short renewable operator
  lease so stale/lost input cannot leave a motor moving. Stop/brake commands from
  a nearby authorized teammate take precedence over the lease; other movement
  commands request takeover explicitly.
- Closing the panel, leaving the control point, disconnecting, a stale lease or
  world replacement stops both motors. “Release load” remains a separate action.
- Keyboard/gamepad/touch operate the same command model, with focus trapping and
  visible controls. Space/stop input inside the panel cannot fire or jump.

Store an unwrapped angle for motor integration; display 0–359° to the player.
Treat rotation across 359°/0° consistently, and distinguish “continue clockwise”
from a target angle that requests the shortest path. A stop response should show
whether the boom, load, cable or a protected area blocked travel.

## Load behavior and collision

Recommended first release uses a **guided load**: it remains vertically beneath
the moving outlet and retains its attachment attitude. This fulfills controlled
placement and straight rope requirements. Natural pendulum swing, rope slack and
counterweight forces would be a different load model with higher tuning and
regression cost. Make that deliberate design choice visible in the plan.

For every host step:

1. Compute candidate motor increments with bounded acceleration and speeds.
2. Resolve the proposed member transforms and the cargo's outlet-following arc.
3. Sweep the arm's occupied volumes and the whole rotated cargo hull from current
   to proposed transforms. Use swept broad-phase bounds then precise local-frame
   tests; sample/subdivide angular increments so the outermost point moves only a
   small distance. Check the path between endpoints, not just the destination.
4. Include terrain/caves, fixed builds, other assemblies, trees, train/aircraft
   hulls and players. If blocked, reject that step and brake both axes for the
   first release. Avoid pushing players or forcibly depenetrating them.
5. Check the entire straight cable against obstruction. Treat the parent outlet
   / socket hardware explicitly so the cable does not collide with itself.
6. Commit arm and cargo movement together, publish motion, and retain the existing
   vertical cargo contact solver. Releasing restores gravity, angular freedom and
   bounded carried velocity.

Use a single host commit path. Do not freely teleport the cargo to each new outlet
and run contacts afterward: a short rotation can move a long-arm load several
metres, skipping walls or striking players. Likewise, a freely simulated body
cannot remain under a rotating outlet with the current fixed X/Y guide.

Select a clear swept corridor near the current geometry; do not scan the full
world for every member. Keep protected spawn / railway areas in the sweep checks.
Parking near a wall must not make restoring the crane unsafe. Joining a running
session receives the current angle and load state; a fresh game retains crane
construction but clears attachment to the session-reset salvage cores.

Player riding is deferred. Block joint motion when a player stands on or enters a
rotating member's swept volume. Carrying them correctly would require moving-frame
velocity, landing, jumping, fall recovery, seats and camera handling—the same
class of work already needed for train passengers.

## Rendering, network and persistence budget

- Reuse the existing braided rope; update from the resolved outlet to the resolved
  cargo anchor. One rope mesh, with reused buffers, per visible active winch.
- Keep static supports in static build batches. Keep moving assembly members in
  a dedicated small batch and update instance matrices rather than rebuilding
  meshes, geometry or materials every angle tick.
- Share hook instances and joint/boom geometry, cull distant assemblies, skip
  unchanged matrices/rope buffers, and keep a bounded part count.
- Transmit root motion plus the normal cargo state. Guests derive all arm member
  poses from durable local coordinates, then interpolate angle and winch length
  with matching timestamps. Avoid per-piece transform packets.
- Separate topology revision from motion revision. Do not write disk saves or
  rebuild world baselines every time the motor changes angle. Parked pose saves
  should be throttled/checkpointed while active loads remain session-only.
- Dormant cranes do no cargo stepping or sweep work unless the environment changes.
  Profile 1/4/16 cranes, including stationary cranes, both motors running and a
  long rope. Existing three-load limits bound active cargo solver count.

## Editing, economy and restoration

Validate the assembly graph on the host, including missing parts, cycles, duplicate
membership, invalid local coordinates, unsupported roots, impossible radii and
bad controller references. Never allow client-supplied arbitrary parent transforms.

Each placement/removal is an atomic construction transaction. Removing a boom
segment either requires dismantling its descendants or removes the subtree through
one explicit operation; it must not silently leave a dangling winch. Moving a
loaded joint/member/support is disallowed. Undo/redo applies to membership and
material costs together, rather than just the visible piece. Duplicate network
commands must not duplicate parts or charge twice.

Restoration validates topology, strips invalid live leases, parks motors, and
resolves invalid attachments without losing surrounding world construction.
Test current and older saves, malformed graphs, exported/imported worlds and
host-authoritative late joins. Preserve the legacy transport attachment schema.

## Staged delivery and acceptance gates

1. **Frame/collision proof — about 2–3 days.** Add opt-in yaw frames and exact
   oriented contacts; prove floor, raycast, targeting and collision at 0°, 17°,
   45°, 89°, 180° and across the angle wrap. Static and wagon paths must match
   their prior behavior. Test a single rotating prefab as the experiment.
2. **Motor/load proof — about 2–3 days.** Joint motor, guided load arc, both-axis
   collision checks, brake/release semantics, nearby operating lease and one menu.
   Demonstrate solo pickup → lift → rotate → lower → release with no horizontal
   snapping, tunnel penetration or player displacement.
3. **Construction kit — about 2–4 days.** Joint/boom/winch sockets, explicit
   assembly membership, preview highlights, bindings, limits, costs and atomic
   editing/undo. Build two custom cranes with independent controls side by side.
4. **Replication/save hardening — about 1–2 days.** Durable graph/live motion
   separation, interpolation, disconnect/late join, duplicate intents, restart
   and old-save compatibility. Test a host plus two guests.
5. **Visual/performance and regression verification — about 1–3 days.** Refine
   low-poly joint and boom details, desktop/touch controls, culling and GPU buffer
   reuse. Compare CPU/draw/bandwidth/save-work baselines and run the full suite.

Stages can overlap and some proof code is reused, hence the 8–15 day total is an
estimate rather than a sum of guarantees. Do not open the feature to general
arbitrary parts until these gates pass.

## Regression assessment

The highest-risk changes are continuous-angle collision, cargo motion along the
arm's arc, construction graph editing and confusing motion with durable world
revisions. Wrong signs/axes could render correctly but collide elsewhere; broad
AABBs could create phantom walls; careless follow motion could tunnel or launch
players; save logic could erase old worlds or cause constant serialization.

Reduce these risks with opt-in frames, shared math, immutable topology snapshots,
bounded motors, collision-checked commits, explicit ownership and a separate live
motion channel. Test static and wagon buildings alongside cranes rather than
assuming crane tests cover existing construction.

The current test suite is a useful baseline (1,009 tests passed in the final run with two test workers),
but cannot supply a numerical failure probability for functionality it does not
exercise. With the restricted kit the risk is manageable; a generic articulated
physics sandbox would materially broaden regression exposure.
