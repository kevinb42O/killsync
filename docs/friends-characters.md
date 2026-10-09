# Friends character presentation

Friends now uses Ghostbia's [Big Walk Avatars](https://ko-fi.com/s/3a8d6b5c5c)
instead of the shared tactical co-op chassis and WRAD first-person arms.
The converted model and source/attribution notes are in
`public/models/friends/big-walk/`.

`FriendsCharacterModel` resolves the CPM colour layers before batching each of
the six body parts. Instances share immutable geometry and atlas; their joint
transforms and arm skeletons remain independent. `FriendsCharacterFinish` assigns
Seafoam, Peach, Lilac, Buttercup and Pistachio from replicated crew colour, with
satin surfaces, subtle grain and preserved eye whites/pupils. First-person hands
keep the shared yellow source finish, as requested. Each arm has shoulder, elbow
and wrist bones in one skinned mesh. Raised palms open outward to clear the head.

`FriendsCharacterVisuals` mounts these parts only in `friends_frontier` and
poses them after the shared co-op presentation. Movement uses replicated
velocity for walking/sprinting; quiet seats and crouching use the artist's
sitting pose. Tool actions move the right arm, and remote tools follow its
actual hand socket. Existing physics, collision height, player coordinates,
nameplates, life states and multiplayer messages remain authoritative.
Other modes retain their co-op operators. The previous body stays available
as a load-error fallback until the character finishes loading.

`FriendsHeldEquipment.loadFriendsGrip` now bakes the model's own selected arm
for the axe, pickaxe, shovel, flashlight and marshmallow stick. Rope uses the
same grip while preserving its muzzle and rope projections. Each grip is one
48-triangle mesh; the 3×3×3 hand retains uniform proportions while the limb
behind the wrist is extended out of the camera frame. Templates are cached,
and asynchronous completion after owner disposal is ignored.

## Verification

- Targeted Vitest suites cover all 13 head layers, atlas UV buffers, independent
  joints/shared geometry, standing height, preserved palm dimensions, walking,
  sitting, hand sockets, disposal, and existing tools/flashlight/roasting/rope.
- `node tools/test-friends-characters.mjs` renders five avatars and all five
  held-tool views, checks for WebGL errors and confirms no WRAD asset requests.
  It also enters a solo island and checks an injected teammate through the
  production multiplayer renderer.
- Mining grips are checked at 70°, 98° and 120° equipment FOV in portrait,
  landscape and ultrawide. Base and upgraded tools are also covered by
  `tools/test-friends-tool-visuals.mjs`.
- The development review is `tools/friends-character-review.html`.
- Captures and renderer checks are saved under `artifacts/big-walk/`.

The measured mining assemblies retain two draw calls, with 132 / 122 / 172
triangles for axe / pickaxe / shovel. The flashlight retains nine draws and
uses 560 triangles. Each full avatar uses six mesh draws. These are fixture
measurements, not a performance guarantee for the entire island.

## Empty hands and gestures

The Friends belt is **1 Empty hands, 2 Axe, 3 Pickaxe, 4 Shovel, 5 Combat, 6 Rope**.
A new island starts empty-handed. Number shortcuts use physical Digit/Numpad
positions, including an unshifted AZERTY row. The construction toolbar stays separate.

- AZERTY: hold **A** for left up and **E** for right up.
- QWERTY: hold **Q** for left up and **E** for right up.
- Hold left/right mouse to point the corresponding arm forward.
- Hold a raise key and that arm’s mouse button to extend it sideways.
- Release to relax; all sixteen combinations blend independently.
- Controller: L2/R2 raise, L1/R1 point; D-pad left/right select Friends tools.
- Mobile: four held gesture buttons appear with empty hands. Pointer cancellation,
  focus loss and modal transitions clear held gestures.

In Friends, **K** adds campfire wood, **Y** paints in construction, and **J** throws
a grenade with Combat equipped. Other game modes keep their previous E bindings.
Cooking owns the hands while seated at the campfire; train/quiet-seat passengers
can gesture. Piloting, building, menus, spectators and death suppress gestures.
Selecting another tool requires releasing held gesture controls before firing.
Empty hands stows flashlight presentation while preserving its preference; leaving
empty hands restores it, and V explicitly equips a flashlight and leaves empty hands.

Protocol v51 carries a four-bit input mask. The host accepts it only for alive,
fresh, empty-handed players outside cooking/piloting, and replicates mask/yaw/pitch
in snapshots. Both interpolators smooth look direction through angle wraparound.
Remote roasting sticks use the character’s actual wrist socket. No pose is saved
into durable world data.

`tools/friends-character-review.html` includes **Automated third person**: a close
running/walking demonstration of all sixteen poses, with pause/next and
front/side/orbit controls. `tools/test-friends-gestures.mjs` checks all sixteen
combinations in the playable arena and over real local WebRTC in both directions,
plus tool changes, stale input, flashlight stow/restore and blur. Its captures and
report are in `artifacts/big-walk/gestures/`. Direction tests check upward, forward
and outward hand placement; geometry tests prevent raised palms entering the head.

First-person gesture shoulders remain fixed in the camera frame. Solid yellow
connections continue from the authored shoulder joints below the screen edge;
they use their own material so atlas transparency cannot cut them away. Framing
accounts for equipment FOV and narrow screens. The gesture browser checks verify
zero shoulder gaps and continuous connections at 70°, 98° and 120° in landscape,
portrait and ultrawide, alongside captures from the playable island.
