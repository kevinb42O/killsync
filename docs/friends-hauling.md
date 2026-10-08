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

- 5 equips the rope launcher. Click a visible cargo surface within 40m to attach;
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

## Freight cranes and ground crew

Find **Freight crane**, **Slewing joint**, **Crane boom**, **Freight winch** and
**Crane console** in the construction library's Workshop category. The original
freight crane remains a fixed vertical lift. The modular kit lets you build the
tower and platform with ordinary construction pieces, then compose a rotating arm.

Place a slewing joint on fixed ground or a supported platform. Aim at its top to
snap an 8m boom section into its socket. Aim at the next boom to extend its free
end; R changes the next section's direction, including elbows. Snap one freight
winch to the free end. Each member stores an explicit parent and pivot ID, so
neighboring buildings never rotate with it. One joint, one winch, up to 32 members
and 32m maximum arm radius are supported. The winch can also be mounted alone over
a drop. The pivot is 10.7m tall, providing space for the arm above its operator.

A crane console links to the nearest fixed crane or pivot within 20m when placed.
Stand beside that console or the crane base and press F (controller Y / touch USE).
The same menu controls the linked joint and winch. **Rotate left/right**, **Hold
arm**, **Raise**, **Lower**, **Stop / hold**, **Stop all**, **Connect load** and
**Release load** are available according to the installed parts. Rotation and
vertical lift can run together. Hold a direction button to move and release it
to brake that axis. Mouse, touch, and keyboard Space/Enter holds are supported;
releasing outside the button still brakes. Losing window focus or closing your
controls brakes held movement. Closing your controls brakes both motors.

The live load camera follows the hook or attached cargo and shows the landing
area. Orbit, zoom, switch to whole-crane framing, and toggle its light. It uses the
existing world render and reuses the flashlight beam; there is no second world
render, camera canvas, render texture or extra light. Closing restores the player
camera and flashlight preference. Terrain and build obstruction checks select a
clear camera angle or shorten the view. On smaller screens the camera stays above
independently scrolling controls. Mission compass, F prompt, combat reticle,
minimap, toolbelt and squad overlay are suppressed while this menu is open.

Solo players can align and lower the hook, then use **Connect load** remotely.
The core must be settled and unstrapped, directly beneath the outlet, with the
hook close to its lifting plate. Connecting preserves its position and attitude.
For teamwork, a living crew member beside the hook and core gets **F · Connect
load to crane hook** or **F · Disconnect crane hook**, without opening a menu or
needing control of the motors. Reach is 8m from the character's hand, with a clear
path and an aligned, nearby hook. This works with controller Y and touch USE too.
Ground-crew actions preserve the console operator and their lease, and brake the
motors during attachment/detachment. The console remains fully operable for solo
use. If standing beside the crane base, F continues to open its controls.

A nearby operator owns movement commands. A second operator can observe, press
**Stop all**, or explicitly **Take controls** (which brakes both motors first).
Emergency braking preserves the current operator. Heartbeats renew a three-second
lease; departure, death, disconnection, lost access or a missed lease brakes an
active articulated crane. Closing an observer's panel does not stop its operator.

The host computes guided load movement beneath the rotating outlet. It checks
intermediate arm, cargo and cable poses against terrain, authored structures and
trees, transport, crew and other loads before committing movement. Both motors
stall on an obstruction, preserving the current pose without accumulating cable
stretch or arm travel. Cargo retains contact physics vertically; release restores
gravity. This is a guided crane, with no free pendulum swing or chained pivots.

Dismantle from the tip inward after releasing the load and braking. Parent edits,
orphan connections and conflicting sockets are rejected; undo/redo validates the
whole resulting graph. Durable saves store member coordinates relative to the
pivot and its last braked angle. Cargo/jobs/tethers follow the existing expedition
session reset rules. Live angles and hook state travel in island motion snapshots,
and guests interpolate arm and cargo together across the angle wrap. Rotation
does not create a durable build revision every frame; a stopped joint parks its
angle once.

The steel/brass parts each use one merged, vertex-coloured instanced geometry and
no downloaded model or texture. Nearby hooks share an instance batch. Cables use
the existing three-strand braided rope with reusable buffers; stationary ropes
retain their GPU buffers and do not cast shadows. Moving build colliders update
small rigid transforms independently of cached terrain contacts.

Outside free construction mode the recipes are: freight crane 12 planks / 6 ingots;
joint 8 stone / 6 ingots; boom 4 planks / 2 ingots; winch 6 planks / 4 ingots;
console 4 planks / 1 ingot.

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

Inclined railway pieces remain future work.
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
