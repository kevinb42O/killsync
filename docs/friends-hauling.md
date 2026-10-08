# Friends hauling

Three salvage cores start in **three separate marked staging areas**. Every new game
resets all three upright, with no straps, ropes, momentum or completed deliveries;
other saved world progress remains intact. Joining or returning home during a
session does not reset the loads.

The suggested order increases the route challenge and changes the destination:

| Load | Pickup | Destination | Route |
| --- | --- | --- | --- |
| Lantern core | Lantern clearing (14800, 4464) | Green Delivery Bay on the spawn deck | about 750m |
| Watchfire core | Ridge staging (20784, 18544), beside the castle stairway's foot | Blue courtyard bay inside Highfall Castle's south gate | about 1km of winding stairs, over 270m of ascent |
| Sanctum core | Sunline freight yard (6864, 8016), south of Sunline Commons | Purple Tidal Sanctum Bay on the stepped monument | about 1.94km direct; transport can help |

All three can be hauled independently by the crew. Each core has its own light
column and delivery bay; the second and third shells use their bay colours.
The **top-left 3D compass** points to the next pickup when detached. Once tethered,
it points to that specific load's delivery bay relative to the player's heading,
showing the destination name, distance, height difference and shared delivery
count. The arrow gives a bearing, rather than computing a traversable route.
Each pickup has its own name on the compass, coloured markings and a sign.
M opens the atlas on the tethered load's route, or the next undelivered load.
The atlas also lists every load and bay.

Tethering a load opens its **Sunline Dispatch**: a short character message,
the delivery objective, three route tips and the hauling controls. The messages
stay open until dismissed with the continue button, close button or Escape;
gameplay input is blocked while reading, but the shared world keeps running.
The rope stays attached. The mission title on the compass reopens the dispatch.
Fresh network snapshots do not reopen a dismissed message; a new attachment does.

The three dispatches are **Bring the Light Home**, **A Light for the Crown** and
**Return to Sender**. The castle mission follows the broad eastern stone viaduct
and its sweeping stairs to the south gate. Its bay is on the level courtyard
floor, away from the gate columns. The atlas fits the full winding approach and
marks **STAIRWAY START** at its foot. The final mission crosses the island to the
ocean monument, with transport suggested for the long journey. Each delivery
opens a distinct completion message and names the next unfinished dispatch.

Park the entire block inside its own square, let it settle and press F beside it.
Delivery accepts a tipped core on its supporting surface, but rejects partial
overlap, an airborne or underground load, moving cargo and vehicle straps.
Completion is tracked per core and shared by the crew; its delivery beacon becomes
a check mark and its light column turns green. The cores remain movable after
completion. Delivering all three completes the session's hauling objectives.

Selecting a tool shows the bottom tool bar for five seconds, then it slides
off-screen; selecting a tool again reveals it and restarts the timer.

## Controls

- 6 equips the rope launcher. Click a visible cargo surface within 40m to attach;
  another click or R releases your rope.
- Walk to pull. Hold aim (RMB, controller LT, or the touch aim button) to reel.
  Stand still on solid ground to brace the powered reel. This keeps the operator
  in place while the clutch caps pulling force and slips under overload instead
  of winding up unlimited stretch.
- Crouch while holding aim to feed rope out. Teammates can help brake a heavy
  descent. Switching tools releases your tether.
- F secures settled cargo that is fully on a passenger deck, or releases its
  straps. Tipped loads retain their orientation; securing does not teleport
  ground cargo aboard. The aircraft cockpit must stay clear.

## Physics and presentation

Cargo uses a small host-owned cannon-es rigid-body simulation with fixed 120 Hz
steps. Ropes apply capped forces at their actual rotating hit points, so an
off-centre pull can pitch, roll and turn the load. Gravity, contact reactions,
sliding friction and momentum continue even when a rope is blocked or released.
The visible cargo shell and its upswept skid collision hull share one profile.
The cargo solver converts friction force limits to per-tick impulses and keeps
averaged contact points in the correct body frames, preventing sticky or
direction-dependent hauling at 120 Hz.

Only the local solid voxel field around the core becomes physics colliders.
Adjacent solids merge into boxes, preserving excavated caves and ceilings.
Collision regions cache until the core moves to another 128-unit cell or terrain,
builds or vegetation change. Resting cargo sleeps. Builds use their authored boxes
and ramp wedges; cargo follows an incline envelope over the small authored stair
risers, matching the player traversal envelope. The castle fan stairs use convex
grade envelopes and exact parapets. Their hidden voxel backing is excluded from
cargo contacts so it cannot create phantom walls above the paving. Nearby cargo loads
block one another, rather than overlapping; nearby tree trunks and transport hulls also collide.

Live ropes can bend around up to two nearby voxel edges. Every leg must be clear,
and routing has a 96-check budget. A clear direct path unwraps the rope. Complex
obstructions still require repositioning; this is not a general knot solver.
Ropes also route over player-built ramp and stair edges. Solo pulling strength,
rope stiffness and damping are tuned to haul up connected ramps and stairs. The
reel stops at a 32-unit cable length and towing adds damping to prevent powered
overshoot at a crest. Grounded rope recoil follows the local floor, and shared
ramp/landing faces do not catch the player's collision cylinder. Full voxel walls
remain solid; large ledges still depend on pull angle and coordinated force.

Operator recoil is limited to 160 world units/second in collision-checked 120 Hz
steps. A falling load or wrapped corner that consumes the cable makes the clutch
slip instead of snapping the player onto the anchor. Recoil cannot move a grounded
operator off a ledge, and cargo velocity is never copied into player movement.
Cargo speeds and spin are capped after contact resolution as well as before it.
Lost or invalid cargo releases its tethers before recovering at its own pickup.

The thick rope is three geometric strands with fibre colour and normal textures.
Each rope shares reusable mesh buffers and needs one main-scene draw call.
The held launcher is attached to the equipment camera; its muzzle and opening
are projected into the world camera after camera movement, preserving alignment
at high FOV. Reeling does not zoom the camera.

New winch/elevator structures and inclined railway pieces are future work.
Existing combat, harvesting, building, train and aircraft controls remain.

## Development checks

`tools/hauling-review.html` and `tools/hauling-goal-review.html?view=compass` are
isolated visual fixtures with no saves or network.
Solo traversal of all five ramp/stair shapes in all four orientations, the full
castle approach and courtyard delivery, reeling
while walking, per-load delivery, compass bearings, hauling replication, save
restoration, briefing attachment/completion edges, mission content, rotated loading,
rope geometry and high-FOV muzzle alignment have dedicated regression tests.

Physics dependency: [cannon-es](https://github.com/pmndrs/cannon-es), MIT licensed.
