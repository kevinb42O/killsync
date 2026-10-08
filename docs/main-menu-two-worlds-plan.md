# Main menu: two worlds, one entrance

Chosen design · 9 October 2026 · Implemented

## Direction

Split the desktop menu evenly into two full-height, side-by-side worlds. Friends is always on the left; Survival is always on the right. Each gets its own scenery, type, palette, button shapes, copy and sound. A small shared utility strip holds the app-level controls.

Selected direction: **Two worlds**, the immersive version in the accompanying concept. The user chose this design on 9 October 2026. Use its full-height scenery, soft cream fade on Friends and dark city fade on Survival as the implementation reference. The alternative **Welcome panels** is not the selected direction.

The main menu answers one question: what kind of experience do you want today? Friends should feel like a place to spend an afternoon. Survival should feel like a dangerous operation about to begin.

## Composition

- Desktop: a 50/50 division. Both identities have equal visual weight, readable descriptions and an entry button at the same height. Neither is presented as a secondary mode.
- A narrow, straight seam separates the worlds. It may carry a restrained warm-to-cyan light, but there is no giant versus symbol or battle between the modes.
- A quiet top strip says “Choose your world.” Keep the existing KILLSYNC combat branding inside the Survival half; its large red “KILL” lettering would undermine the Friends atmosphere if placed over both.
- A shared bottom strip holds Settings, Fullscreen, account-level access and a discreet author credit. Expand account XP details when requested rather than using the large current profile box on the entrance screen.
- Coins, data cores, operator selection, Neural Lab and Intel Archive belong to Survival. Preserve account progression and data; the change is where these controls are presented.
- Keep the main entrance to one primary action per side. Friends hosting, joining and solo choices stay in its existing setup. Survival's existing Solo Recon remains a smaller, explicit route.

## Friends: Sunline

**Emotion:** welcoming, curious, playful, social. Think a small outdoor adventure with friends: warm daylight, little discoveries, things to build and places to wander.

**Scenery:** use the actual Sunline island, framed around a sunny shoreline, greenery and recognizable construction. Favor inviting areas over the volcano or combat imagery. Later, add a small campfire or gently moving train as an environmental detail. Keep the action area visually quiet.

**Palette:** cream `#F8F5ED`, forest ink `#253C32`, sage `#486B57`, peach `#EDB898`, sky `#BBDCDD`, and a small sunny-yellow accent `#F2CF77`. These extend the existing Friends setup palette.

**Type and shapes:** rounded, friendly sans serif; sentence case; generous spacing. Rounded pills, soft corners and simple leaf or sun icons. One playful detail, such as a tilted Sunline label, gives personality without filling the screen with stickers.

**Entrance copy:**

- Identity: “Sunline · Friends mode”
- Heading: “A little adventure, together.”
- Description: “Mine, build, fly and see where the day takes you.”
- Primary action: “Let's play”
- Small supporting line: “Your island. Your people. Your pace.”

The primary action opens the existing Friends setup, where “Open my island,” “Join a friend” and “Play on my own” already belong. Friends means a style of play, so it must still welcome someone playing alone.

## Survival: KILLSYNC

**Emotion:** hostile, electric, ominous, intense. Think an armed squad entering a city where something has gone badly wrong.

**Scenery:** reuse `public/neon_cityscape_bg.png`, with a clearer silhouette and more visible neon than the current heavily dimmed background. Layer restrained crimson breach light, industrial shadows and cyan edges. A later operator silhouette can strengthen the shooter identity; it should remain behind the text and controls.

**Palette:** near-black `#080D15`, steel `#182634`, pale text `#ECF4F4`, cyan `#65DFEC`, crimson `#E74959`. Crimson expresses danger; cyan identifies controls and technology. Limit purple to distant city lights.

**Type and shapes:** condensed uppercase display type, tight headings and monospace technical labels. Cut corners, thin rules and deliberate hard edges. Keep body copy comfortably readable.

**Entrance copy:**

- Identity: “KILLSYNC · Survival”
- Heading: “Enter the breach.”
- Description: “Link your squad. Rewrite the battlefield. Survive the swarm.”
- Primary action: “Enter the breach”
- Secondary route: “Solo Recon”
- Supporting labels: “Operators,” “Neural Lab,” “Intel Archive”

Nightmare remains visibly named inside Survival, with its real saved state. Achievements remain accessible; verify their current scope before deciding whether their entry is inside Survival or the shared account area.

## Interaction and atmosphere

1. Start at equal width with both actions available. Nothing moves simply because the pointer crosses the seam.
2. Hover or keyboard focus brightens the selected side and lifts its button by about 2px. Friends uses a soft response; Survival sharpens its border and neon. Avoid layout expansion on hover because it moves the target.
3. Activate an entry: expand that world toward the full screen over roughly 300–400ms, then hand off to its existing setup. Keep the chosen action visually anchored. Do not wait for a heavy scene to load before opening setup.
4. Back from setup returns to the same split, with focus restored to the entry used. A direct Friends invite still bypasses the entrance and opens Friends setup.
5. Friends click sounds use its existing gentle UI palette. Survival keeps its electronic click. Blend any ambience after intentional selection; never play two soundtracks simultaneously or switch them rapidly on hover. Respect mute and browser audio activation.
6. Reduced motion uses a simple immediate change or short fade, with static scenery. Screen visibility and existing pause settings stop decorative rendering.

Cloud drift, floating dust and city rain are optional polish. The composition and typography must communicate both worlds when all motion is stopped. Avoid flashing effects, constant title glitches and particles over text.

## Responsive layout

- At approximately 900px and above, retain side-by-side worlds. Use container size as the final criterion: descriptions and controls must fit at readable sizes.
- Portrait phones stack Friends above Survival, using a compact scenic band and opaque action area per mode. Keep both entry buttons visible near the initial view where practical, and permit normal page scrolling.
- Short landscape screens keep the horizontal division but shrink decorative space before reducing text size. Keep the shared strip compact and allow scrolling when necessary.
- Test at 320px, 390px, 768px, 1024px and 1440px, including short heights and 200% zoom. Buttons need at least 44px touch targets, visible focus and sufficient text contrast.

## Implementation plan

### Phase 1: composition and routing

Extract the `MENU` presentation in `src/App.tsx` into a proposed `MainMenu` component, with `FriendsModePanel`, `SurvivalModePanel` and `MainMenuUtilities`. Pass callbacks and real profile values down from App. Give each panel scoped styles and independent visual tokens.

Preserve the existing routes:

| Entry | Current behavior to retain |
| --- | --- |
| Friends | Set `multiplayerGameMode` to `friends`; open `MULTIPLAYER_SETUP` |
| Survival | Set `multiplayerGameMode` to `survival`; open `MULTIPLAYER_SETUP` |
| Solo Recon | Open `SOLO_SETUP` |
| Operators | Open `OPERATOR_SELECT` |
| Neural Lab | Open `PERMANENT_UPGRADES` |
| Intel Archive | Open `INTEL_ARCHIVE` |
| Settings | Open `SETTINGS` |

Keep Admin Dashboard behind its existing access check, in a discreet utility location. Preserve Nightmare, currencies, achievements and XP behavior while regrouping their presentation.

Replace positional styling such as `.main-menu-actions > button:nth-child(...)` with named, scoped component classes. Restrict `MenuEffects` and electric/tentacle click effects to Survival; they currently sit at the global menu level and must not spill into Friends.

### Phase 2: scenery

Use the user-provided static image on the main-menu Friends half and the existing city artwork on Survival. The user chose a static entrance on 9 October 2026 to reduce menu rendering cost. Keep the live animated island on the second Friends screen. The supplied artwork is stored as `public/sunline-menu-bg.webp`, with its original preserved in `artifacts/main-menu/sunline-source.png`. Its baked-in Sunline title is the only visible Sunline title on the entrance.

Do not mount `FriendsMenuBackdrop` on the entrance. On the second Friends screen, show a centered, enlarged hand-drawn sun and island sketch directly on the scenery until the renderer reports its island shell ready, then reveal the animated scenery. There is no loading card or visible loading copy; localized status remains available to assistive technology. Keep the setup form usable while scenery loads. If scenery fails, show a quiet explanation and retain the usable setup. Honor reduced motion and provide both English and Russian copy.

### Phase 3: identity and transitions

Apply the separate typography, shapes, mode-specific hover and click sounds. Connect selection transitions to real setup navigation and restore focus on return. Preserve direct-invite behavior and pause/reduced-motion preferences.

### Phase 4: validation

Run the project's build and TypeScript checks. Verify mode routing, direct Friends invites, back navigation, solo entry, keyboard operation and touch. Use targeted behavior tests only for routing or lifecycle regressions introduced by extraction. Inspect both identities at desktop and phone sizes. Check that repeated opening and closing does not leave a Friends renderer or audio owner active, and that no Survival effects appear on Friends.

## Acceptance

A first-time player understands the difference before reading more than one sentence. Friends is warm and playful; Survival is unmistakably a dark shooter. Both are equally easy to enter. Each selected mode carries its identity into its existing setup. All current progression, saves and connection behavior remain functional.

This proposal creates a menu identity and navigation structure. It does not require new gameplay, a friend graph or new world-save behavior.

## Implementation and verification

`MainMenu.tsx` now owns the split entrance, with scoped styles in `main-menu.css`. App retains routing and progression state. Both entrance backgrounds are static; no island canvas mounts until Friends setup opens. The animated second screen, scenery pause control, saves and connection choices are retained. The loader observes the renderer readiness signal and clears when the island is ready.

TypeScript and the production build pass. Four targeted setup/scenery test files pass (12 tests). Desktop browser checks confirm Friends and Survival entry, Operators, Neural Lab, Settings, restored focus, and loader removal after live scenery becomes ready.
