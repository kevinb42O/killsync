# Friends hauling

The Lantern salvage core starts on a marked pickup platform about **750m
east-northeast of spawn** (world position 14800, 4464). The platform follows the
surveyed clearing's local height instead of the arrival deck's elevation. The
platform stays flat and clear of excavation, soil placement and new construction.
Every game start resets the core upright at the centre, with no straps, ropes or
momentum, even when opening an existing world save. Moving it, joining players or
returning home during that session does not reset it. The hauling goal resets
with the core each new game; other saved world progress remains intact.

Haul the core home to the green **Delivery Bay** on the player spawn deck.
Its painted square, floating label, beacon and ground arrows identify the goal.
An amber light column follows the block, visible through terrain and fog, day or
night. Its height and minimum apparent width keep it readable across the island.
M opens the atlas on the hauling route, with both the live core and its
destination. The persistent top-left information panel is removed. Selecting a
tool shows the bottom tool bar for five seconds, then it slides off-screen;
selecting a tool again reveals it and restarts the timer.
Park the entire block inside the square, let it settle and press F beside it.
Delivery accepts a tipped core on the deck, but rejects partial overlap, an
airborne or underground load, moving cargo and vehicle straps. Completion is
shared by the crew; the delivery beacon becomes a check mark and the core's light
column turns green. The core stays movable and findable after completion.

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
and ramp wedges; nearby tree trunks and transport hulls also collide.

Live ropes can bend around up to two nearby voxel edges. Every leg must be clear,
and routing has a 96-check budget. A clear direct path unwraps the rope. Complex
obstructions still require repositioning; this is not a general knot solver.
Large climbs depend on the pull angle and available force. Higher ground, a
loading ramp, or more coordinated reels improve the route.

The thick rope is three geometric strands with fibre colour and normal textures.
Each rope shares reusable mesh buffers and needs one main-scene draw call.
The held launcher is attached to the equipment camera; its muzzle and opening
are projected into the world camera after camera movement, preserving alignment
at high FOV. Reeling does not zoom the camera.

New winch/elevator structures and inclined railway pieces are future work.
Existing combat, harvesting, building, train and aircraft controls remain.

## Development checks

`tools/hauling-review.html` is an isolated visual fixture with no saves or network.
Hauling, rigid-body traversal, replication, save restoration, rotated loading,
rope geometry and high-FOV muzzle alignment have dedicated regression tests.

Physics dependency: [cannon-es](https://github.com/pmndrs/cannon-es), MIT licensed.
