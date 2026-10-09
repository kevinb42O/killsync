# Friends compact toolbelt and casual fishing plan

Status: implemented, October 9, 2026. See [implementation and validation](friends-fishing.md).
The original proposal below records the design. Final timing was adjusted after
play feedback to a random 7–28 second wait and a 2.8 second automatic reel.

## Intended experience

Fishing is a small, playful activity in Friends mode: equip a rod, cast into
water, watch the bobber, click when it goes under, and receive a fish in your
hands. The pleasure comes from the cast, responsive line, splash, surprise fish
size, and physical handling afterwards. No bait inventory, upgrades, tension
minigame, repeated clicking, or fishing economy.

## Existing integration points

- `FriendsFieldPack.tsx` renders the toolbelt. `frontier.css` currently gives
  desktop buttons 74px width and 67px minimum height, plus a stock row and hints.
- `FriendsToolControls.ts` owns slot order and wheel selection. Current order is
  empty hands, axe, pickaxe, shovel, combat, rope. Keep these shortcuts and append
  fishing in slot 7; field pack stays G. Use a new tool ID (7), not a repurposed ID.
- `FriendsWaterSurface.ts` exposes `friendsWaterAt`, the shared water level,
  depth and body identity used by water, swimmers and boats. This covers rivers,
  lakes, coastal sea and existing cascade pools without fishing spot markers.
- `CoopSimulation.ts` owns authoritative input and action edges;
  `FriendsExpedition.ts` owns shared Friends state. `protocol.ts` validates
  network inputs. Extend these explicitly rather than routing rod clicks into
  harvesting, weapons, or the hauling rope.
- `FriendsHeldEquipment.ts`, `FriendsCharacterModel.ts`, character visuals and
  `MultiplayerRendererBridge.ts` provide existing hands, equipment cameras and
  teammate hand attachment points. Reuse the current character assets.
- `FriendsRopeMesh.ts` is a large braided hauling rope. Its reusable-buffer
  approach is useful, but its geometry and rope thickness are unsuitable for
  fishing line. Give fishing a separate, much smaller line implementation.

The working tree already contains river, swimming and rowboat changes. Implement
against that current water system and preserve those edits.

## Compact toolbar

- Reduce desktop slots to approximately 52–56px wide and 46–48px tall, with
  18–20px icons, smaller padding, and a clear selected state.
- Remove the permanently stacked stock row. Place a small capacity indicator
  with the field-pack button; detailed timber/stone/ore counts remain in the pack.
- Show the selected tool's name and a short contextual instruction in one slim
  line. Keep full names in accessible labels and hover/focus tooltips.
- Aim for a toolbar footprint around 60–70px high, including its short hint.
  Integrate the work-face toggle without adding another permanent row.
- Keep the existing five-second hide/reveal behavior, wheel selection, keyboard
  navigation, hidden-state focus handling and reduced-motion behavior.
- Touch controls retain at least 44px targets. On narrow screens, allow horizontal
  slot scrolling rather than shrinking targets below that size.
- Fishing prompts remain visible while needed even if the toolbelt has hidden.

## Models and presentation

Use a downloaded Quaternius rod and one animated fish from the same visual family:

- Creator source: [Animated Cute Fish Pack](https://quaternius.com/packs/cutefish.html),
  which includes fish, rods and lures under CC0.
- Rod candidate: [Fishing Rod](https://poly.pizza/m/aOabqWh68m), available in
  FBX/glTF under CC0.
- Fish candidate: Koi from the
  [Animated Fish Bundle](https://poly.pizza/bundle/Animated-Fish-Bundle-44zhHN1UbT),
  which provides GLB versions of the pack. Its bright markings should make
  catches readable against both water and terrain.

First inspect the actual downloaded files: triangle counts, material count,
animations, pivot, rig and rod-tip location. Verify swim/flop clips rather than
assuming particular animation names. If the selected export omits a flop clip,
use the creator's source animation or a small tail/body procedural animation.
Bundle only the selected rod, fish and required textures locally; record the
source and license in the existing asset manifest/README. No runtime CDN loads.

Use one fish mesh with continuous size variation, roughly 0.75–1.6 times the
normal size, with occasional larger catches within comfortable hand framing.
Size affects appearance, not difficulty. No species collection screen.

## Fishing interaction

| State | Player action | Result |
| --- | --- | --- |
| Ready | Aim at water and click | Short arm/rod cast; bobber follows a visible arc and splashes down |
| Waiting | Watch the bobber | Gentle floating, a few teasing nibbles, then a clear submerge |
| Bite | Click once | Automatically reel the fish in over about 1–1.5 seconds |
| Holding fish | Left-click | Throw the fish in the direction the player is looking |
| Holding fish | Right-click | Gently drop the fish beside/in front of the player |
| Cast active | Right-click | Retrieve/cancel the line without a fish |
| Dropped fish nearby | F | Pick it up again and hold it, if the player's hands are available |

- Start with a randomized 3–7 second wait and a generous approximately 4 second
  bite window. A missed bite gets another chance after a short wait without
  requiring a new cast. Early reeling simply retrieves the bobber.
- A bite visibly submerges the bobber and produces a small splash and clear
  sound. A short contextual cue helps players identify when to reel.
- Consume click edges once, require a new click after the cast, and prevent a
  continuously held cast button from auto-catching or immediately throwing the
  catch. Suppress combat aim, artifact actions, reload and harvest logic as
  appropriate while fishing or holding a fish.
- Validate the actual water intersection before starting: water must be exposed,
  reachable within a comfortable bounded cast range, and deep enough for the
  bobber. Terrain/buildings in front of water block the cast. Invalid casts
  return immediately with a brief hint; they never leave a stuck line.
- Allow fishing throughout existing exposed lake, river and sea water, including
  from banks, bridges and docks. Use shared water queries, not hardcoded zones.
- Permit fishing as a seated rowboat passenger with correct moving attachment
  points; the rowing seat retains its oar controls. Cancel a cast when entering
  an incompatible seat, swimming/diving, building, changing tools, dying or
  disconnecting, or when distance/obstacles make the cast invalid.
- A held fish temporarily owns both hands and can be carried while walking.
  Tool/build/vehicle changes gently drop it first rather than deleting it or
  storing it invisibly. Teammates can see the held fish and throw.

## Fishing line and rod feel

- A thin, readable line attached to the actual rod tip and bobber. Fit the rod
  to the existing hands; animate cast follow-through, mild idle motion, tip
  flex on bites and tension during retrieval.
- Use approximately 20–32 reusable Verlet points with pinned endpoints and a
  small fixed number of distance-constraint iterations. Gravity creates slack;
  slight damped motion keeps it alive. Retrieval reduces the paid-out length.
- Clamp simulation time steps and substeps. Reset cleanly on teleports or large
  network corrections so the line never explodes or trails across the island.
- Render through one reusable ribbon or thin low-sided tube buffer per active
  line, with stable screen readability; no rebuilt TubeGeometry each frame,
  braid, extra lights, shadow casting or new full-screen pass.
- Keep authoritative cast/bobber travel separate from cosmetic line nodes.
  Reject obstructed trajectories and use bounded, coarse nearby collision
  checks for line/bobber movement. Retrieve cleanly when obstructed rather than
  adding a snagging minigame.
- Bridge equipment/world camera spaces deliberately: the visible first-person
  rod tip must meet the world line across different FOVs and aspect ratios.
  Remote players attach their line directly to the world rod tip.

## Fish after the catch

- Finish retrieval by stowing the rod and presenting the fish across the player's
  palms, with a little wriggle. A brief size label can appear once.
- Thrown/dropped fish follow a short gravity trajectory with simple swept
  collision against terrain and built surfaces. Preserve size and fish identity
  through holding, throwing, landing and picking up; never spawn duplicates.
- On dry ground or a dry built surface, play unmistakable **spartelen op het
  droge**: tail flicks, body bends, irregular small hops and rolls. Keep motion
  bounded and collision-aware so fish stay on the ground rather than jittering,
  falling through floors, or hopping indefinitely away.
- On entering water, splash, switch to swimming, and move away for several
  seconds before fading below the surface. Sample the same water/depth field
  along a short bounded escape path so the fish does not swim onto land or
  through submerged obstructions. Shallow water uses a smaller tail motion
  and keeps the fish within the available depth.
- Re-evaluate water entry after movement and terrain/surface changes. A flopping
  fish knocked into water starts swimming; a fish dropped onto a bridge stays dry.
- Let a player pick up a dry fish and throw it back later. Other players can pick
  it up too, with one host-validated owner at a time.

## Performance and multiplayer

- Host owns fishing phases, bite timings, fish sizes/IDs, ownership, collision
  outcomes and cleanup. Clients interpolate motion and animate the line,
  ripples, tail and flop locally. Existing monotonic action IDs or equivalent
  validated commands prevent repeated packet delivery from repeating actions.
- Replicate compact cast/fish state and phase timestamps in Friends snapshots;
  never replicate every rope node, bone transform or splash particle. Increment
  the protocol version and update input validators, sanitizers and defaults.
- Catch availability is generated for each valid cast. Do not simulate a fish
  population across the full 48,000-unit island.
- At most one active line and one held fish per player. Start with a shared
  cap of 32 loose fish, excluding held catches. Reclaim old unattended fish
  gracefully under pressure; never delete a held fish. Keep ordinary nearby
  dropped fish available long enough to play with them.
- Share source geometry/textures/materials; keep animation state per visible
  fish only. Use distance culling and reduced update rates for distant fish and
  remote lines. Pool fish presentation objects and splash/ripple effects.
- Remove swim-away fish promptly. Clean up long-unattended loose fish after
  about 90 seconds out of player range; use a short fade if cap pressure requires
  removal of an old visible loose fish. No permanent fish accumulation in saves.
- No fishing work runs in combat mode, and no line solver runs without a cast.
  Dispose owned buffers/listeners on teardown without disposing shared assets.
- Measure incremental CPU/GPU time, draw calls and memory in the production
  scene: idle, one cast, five simultaneous casts, and the loose-fish cap. Budgets
  are targets to verify, not performance claims before measurement.

## Implementation order and acceptance

1. **Toolbar and asset preparation.** Compact the bar, append slot 7, inspect and
   bundle the selected models, and fit the rod/fish to local and remote hands.
2. **Fishing loop and replication.** Add `FriendsFishing` simulation/state,
   water/trajectory validation and input ownership, then integrate snapshots,
   protocol validation, prompts and a dedicated fishing visual system.
3. **Line polish and physical catches.** Add line constraints and rod motion,
   catch presentation, throw/drop/pickup, dry flopping and water escape. Tune
   timings and effects around the simple three-step loop.
4. **Verification and performance.** Run lint/build and targeted meaningful
   simulation/network regressions. Use browser fixtures and real island captures
   for the toolbar, cast, bite, retrieve, hand-held fish, dry flop and release.

Acceptance checks:

- Existing six tool shortcuts, wheel selection and pack access still work;
  fishing is slot 7. The full bar fits common desktop and narrow layouts.
- Valid casts work in representative lakes, river reaches, sea and cascade
  pools, day and night; land and occluded water reject cleanly.
- One successful bite click delivers exactly one held fish, with no timing or
  reeling challenge. Early click, missed bite, stale input and cancellation are
  predictable. Controller/touch equivalents use the same semantics.
- Throw/drop trajectories work on banks, slopes, built floors and bridges.
  Dry fish visibly flop, can be picked up, and swim away upon returning to water.
- Host/guest see consistent casts, holds, throws and pickups, including late
  join, duplicate inputs, moving rowboat passenger, disconnect and teardown.
- No rod/line gap across supported FOV/aspect ratios, no loose-fish memory growth
  after repeated catches, and measured added cost remains small under five-player
  casting and capped loose-fish stress. Existing water/boat/rope behavior passes
  relevant regression checks.
