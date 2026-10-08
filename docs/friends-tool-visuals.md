# First-person tool presentation

The held axe, pickaxe and shovel continue to use the existing Survival Kit GLB
models, including their original upgraded variants. Shovel now handles both
left-click excavation and right-click soil placement with one held model. The models are colored with walnut handles, muted blue-gray
steel and brass on the upgraded metal parts. Their existing atlas colors are
sampled once into vertex colors, with separate wood/steel roughness and metalness
inside the same material and draw call. Their original geometry is unchanged.

Connected first-person hands/arms use [WRAD ARMS by wriks](https://github.com/wwwriks/wrad-arms),
licensed under CC0. The original GLB and license are in
`public/models/friends/wrad-arms/`. The original finger rig is posed for the grip,
and the selected connected arm is baked once into a static mesh: 598 triangles
and one draw. No procedural hands or arms are used. The left arm also grips the
existing flashlight body; the original procedural glove/sleeve blocks are removed.

`FriendsToolViewmodels` frames equipment in the existing equipment camera, using
its aspect ratio/FOV, and animates the tool and attached arm as one assembly.
Variant assemblies and asset buffers are cached, without per-frame geometry
creation or repeated loads during tool changes. New equipment lighting is
unshadowed and is disabled when its owners are hidden.

The world camera FOV and the Rope launcher code, meshes, poses and muzzle projector
are unchanged. Combat continues to use its existing viewmodel. Rope does not load
an additional shovel model.

## Verification

- `npm run lint` and `npm run build`.
- Targeted Vitest suites: tool viewmodels, flashlight, hauling muzzle projection,
  tool controls and interactions.
- `node tools/test-friends-tool-visuals.mjs`: original/current paired WebGL captures
  and alternating-frame CPU/GPU measurements on Apple M1/ANGLE Metal. Each mining
  assembly is two draws, compared with one previously. The flashlight is nine,
  compared with ten previously. These are local scene measurements, not a
  guarantee for other hardware or the entire game.
- The browser fixture checks that the premade arm extends beyond the screen edge
  at 70, 98 and 120 degree equipment FOV, in portrait, landscape and ultrawide.
- `tools/friends-tool-review.html` renders the equipment against the production
  island. `node tools/capture-friends-tools.mjs` saves island screenshots.

Captures and measurements are saved under `artifacts/tool-visuals/`.

## Arm proportions and forward alignment

The original connected WRAD mesh now uses a 1.5× larger grip/arm fit, with a
small increase in cross section. The grip stays at the tool socket while a
carry rotation brings the elbow back toward the player. This is a cached bake
of the downloaded rig, with the same 598 triangles and one draw per arm.

The shared leftward handle roll/yaw is removed. Axe and pickaxe working heads
are oriented along camera forward; the shovel retains its blade face and uses
the same forward shaft pitch. Windup pulls back and contact swings forward.
The flashlight body is fitted to the larger left palm and follows camera aim.

Current island captures are in `artifacts/arm-polish/`; the WebGL fixture also
checks base/upgraded tools and framing at 70–120° equipment FOV. These changes
retain two draws per mining assembly and nine for the flashlight.

## Marshmallow stick

The stick uses [Kenney's CC0 Twig](https://poly.pizza/m/xApCbtFYP8), downloaded
and stored with source/license information in `public/models/friends/roasting/`.
Its 64 triangles are fitted into a long wooden skewer, with smooth normals and
subtle grain. A basic shaft remains available if the asset fails to load.

The food uses a shared 576-triangle rounded barrel with slightly uneven sides,
rolled edges, fine surface variation and patchy caramel/char. Cooking state
updates shader uniforms instead of rebuilding geometry or swapping textures.
A subtle material fill keeps the shaded food readable at night without another
light. Burning reuses the existing campfire flame material and geometry.

The local grip uses a fixed normalized screen position at the world camera's
FOV. The shaft, hand and food use a stable palm basis while lowering, and the
roasting tip stays over the real campfire. Every seated player shares the food
and twig buffers; each owns only the material holding their cooking uniforms.
The complete local assembly is three draws and 1,238 triangles, or four draws
while burning. No new rendering pass, light or per-frame geometry is added.

Verification: `FriendsMarshmallowVisuals.test.ts` checks parented cameras/FOV,
real-fire placement, shared resources, cooking updates and async disposal.
`tools/test-marshmallow-visuals.mjs` renders every cooking stage without shader
errors. `tools/test-friends-roasting.mjs` verifies sitting, fuel, roasting,
burning, replacing the food and standing in the production island. Captures
and results are in `artifacts/marshmallow-visuals/`.

### Flashlight palm fit

The left grip mirrors the right across X while retaining the palm/finger-spread
axes. The flashlight follows that grip socket/carry rotation, with the barrel
seated against the palm and sized for the existing curled fingers. The rings
line up beneath the grip; the world beam continues to follow camera aim.
`tools/test-friends-flashlight-grip.mjs` verifies anatomical mirror symmetry
and renders palm, back, side, front and first-person views. These captures and
the zero-error WebGL report are in `artifacts/flashlight-grip/`. Rendering stays
at nine draws and 1,110 triangles for the flashlight/arm assembly.

### Separate palm and shoulder poses

`FriendsArmPose` now poses the source rig before the static bake. Pickaxe,
shovel excavation and filling use an inward palm orientation with the existing shoulder
and elbow endpoints retained. Axe, marshmallow and all tool-model transforms
retain their previous poses. The flashlight keeps its hand/socket fit while
its existing arm bones route the elbow and shoulder behind the camera.

The grip browser regression measures the actual shoulder-opening vertices
across 70–120° FOV and portrait/landscape/ultrawide aspect ratios, requiring
every flashlight shoulder vertex to be behind the camera. It also compares
mining shoulder vertices before/after the hand turn. The former hardcoded palm
normal check was removed: it repeated the pose assumption rather than measuring
the rendered hand. Hand facing is verified visually on the actual island view.
Island review captures are in `artifacts/arm-grip-correction/`. Static arm
triangle counts and draw counts remain unchanged.

The mining hand turn was reversed by 180° around the fixed handle socket after
visual feedback. This changes only the pickaxe/shovel/earthwork grip and its
wrist connection, retaining the elbow, shoulder and tool transforms. Updated
review captures are in `artifacts/palm-direction-fix/`.
