# Friends menu redesign — implementation-ready plan

Date: 7 October 2026. Status: implemented in the active Friends setup; live island scenery replaces the original captured-image approach.

## 1. Design decision

Make entering Friends mode feel like arriving somewhere you want to spend time with people. A real view of Sunline's island fills the screen. A warm, opaque welcome panel provides a name field and three clear routes: open your island, join a friend, or play on your own. Once connected, that panel becomes a small gathering room with names and an invite code.

The island is the hero. People and invitations are the interface. Operator equipment, combat classes, tactical telemetry and loadout configuration leave this flow entirely.

Chosen direction: **Sunline, together**. Cream surfaces, sage actions, dark forest text, restrained peach accents, rounded corners, sentence case and generous breathing room. This is a full replacement of the Friends setup presentation, including its host, guest and manual connection states.

Chosen character: **Solar Guard (`solar_guard`)** for everyone in Friends mode. Its existing warm palette fits Sunline, it already has a complete model, and it needs no new character asset. Do not make the character a prominent menu feature. Identify people using their names, initials and existing player colors.

## 2. Scope

- Start at `MULTIPLAYER_SETUP` after the user selects Friends mode, or opens a Friends invite.
- Finish when a Friends launch hands control to `MultiplayerArena`, or the user returns to the main menu.
- Replace the entire Friends welcome screen, host room, guest connection/waiting room, invite handling, discovery presentation and manual fallback presentation.
- Make small supporting changes to setup state, Friends player seed normalization and room metadata where required for this menu to behave correctly.
- Keep the main-menu entry, survival setup presentation, survival preferences, in-game HUD, map, field pack, construction, gameplay systems and world-save format outside the redesign.
- No world reset, new save slots, private-room feature, account system, friend graph, gameplay rebalance or active-game player admission feature.
- Avoid overwriting existing work: the checkout already contains many edits across Friends rendering, gameplay and documentation. Work against the current files and use narrow patches.

## 3. Findings that inform the design

| Current implementation | Consequence for the redesign |
| --- | --- |
| `ManualMultiplayerSetup.tsx` owns survival and Friends UI and WebRTC lifecycle in one component. | Separate presentation from connection behavior; do not copy the networking code into a second implementation. |
| Friends still displays `CoopSkinSelector`, survival tabs and tactical labels. | Give Friends its own component tree and scoped stylesheet. Recoloring shared tactical CSS is insufficient. |
| `PublicLobby` and `PublicLobbyInfo` contain no game-mode metadata. | Advertise and preserve mode through MQTT and optional HTTP signaling before filtering the Friends room list. |
| `COOP_MAX_PLAYERS` is 5. | Design for one host and up to four friends. Read the constant rather than hard-code capacity in behavior. |
| Joining an `in_game` room sets `spectatingRef` true. | Label this action “Watch”; never promise playable mid-session joining. |
| `FriendsWorldStorage.ts` stores one host-local world with `savedAt`, a previous copy and IndexedDB mirroring. | Offer “Continue your island” when a valid save exists. Explain that the world lives on the host's browser/device. |
| `MultiplayerArena` hydrates Friends saves when the host launches. | Menu reads are informational; preserve the existing hydration and save pipeline. |
| Hosted Friends sessions start with guest building access disabled. | Do not imply every guest can edit immediately. Keep permissions in the existing gameplay flow. |
| `FriendsDayNight.ts` and `FriendsDayNightCycle.ts` already implement a 24-minute shared world cycle. | Capture menu scenery using actual map lighting. The menu's decorative cycle never changes the live world's clock. |
| Invite URLs already carry `room` and `mode`. | Preserve URL entry and auto-join for saved valid names, with useful visible connection states. |
| The existing Friends setup test expects “Reality Breach.” | Replace that expectation: survival content should no longer appear on the Friends screen. |

## 4. Welcome screen composition

### Desktop

Full-bleed island scenery, with no tactical city, scanning grid or signal ornaments. Top left: a small back control and “Friends mode.” Top right: language selection and a discreet “Pause scenery” control. Bottom left: a small location caption, “Sunline island.”

Place a 420–460px welcome panel in the right third, with a 48px desktop outer margin. Keep at least half of the view clear for the map. At 1280px width, use approximately 56px outer space and a 440px panel; at 1920px, cap content placement at a centered 1600px composition to avoid pushing the panel to the edge.

Panel contents, in order:

1. Small identity line: “Sunline · Friends mode.”
2. Heading: **“A little adventure, together.”**
3. One short description: “Explore the island, make something, and see where the day takes you.”
4. Visible label “Your name” and a name field.
5. Compact save context: “Continue your island” and “Saved [localized date/time] on this device,” or “Your first island” and “Your progress will be saved on this device.”
6. One primary full-width button: **“Open my island.”**
7. One secondary full-width button: **“Join a friend.”**
8. A quiet text button: **“Play on my own.”**
9. One short note: “Open islands appear in the room list. Your world is saved on this device.”

Do not include a mode picker after selecting Friends, command tabs, a character carousel, gear statistics, a feature-card grid, currency, unlocks or a second oversized brand header.

### Join panel

“Join a friend” changes the same panel's contents; it does not launch a second modal over the first.

- Back action returns to welcome and preserves the name and entered code.
- Heading: “Where are we meeting?”
- Name remains visible in a compact editable row.
- Label “Room code,” input and “Join” button form one clear group.
- Preserve existing code normalization and 16-character input limit; accept pasted text with surrounding whitespace. If accepting invite URLs, parse only supported `room` and `mode` parameters with `URL`, never navigate to the pasted URL.
- Below a divider: “Open islands” with a small refresh button.
- Display up to three comfortably spaced rows before the list scrolls, showing host name, capacity and state. Longer lists occupy the panel's scroll region rather than growing the entire screen indefinitely.
- Row examples: “Lena's island · 2 of 5 · Gathering” with “Join”; “Sam's island · 5 of 5 · Full”; “Mika's island · Exploring” with “Watch.”
- A full waiting room has a disabled “Full” button. An active room uses the existing spectator path, even if all player slots are occupied.
- Empty list: “No open islands yet.” / “Start one of your own, or ask a friend for their room code.”
- Fetch failure: “We couldn't load the room list.” / “You can still try a room code.” Include “Try again.” Do not present failures as a successful empty list.
- No friend names, online presence or invitations are fabricated; these are public rooms, not a personal friend list.
- “Connection help” sits at the bottom as a collapsed disclosure.

## 5. Host gathering room

After room creation, preserve the scenery and panel position. The panel changes to:

1. Heading “Your island is open.”
2. Copy “Send a friend your invite link, then head out when you're ready.”
3. Room code in clear, selectable monospace text, with “Copy code.” Use the actual generated code; do not imply a fixed format that the generator does not enforce.
4. “Copy invite link” as a visible secondary action. On success: “Link copied” for 2.5 seconds. Code success lasts 2 seconds, matching existing behavior.
5. Section “Who's coming?” with “[current] of [max]” and rows for real connected players. Each row has a circular initial, name and state; the host gets a small “Host” label, the local player gets “You.”
6. One gentle empty row: “Room for [remaining] more.” Do not draw four large empty soldier cards.
7. Primary action “Head into the island.” It remains usable with only the host once room setup is complete. No compulsory waiting period or new ready-up mechanism.
8. Secondary text action “Close room.” This returns to welcome and closes signaling/session resources without altering the saved world.
9. Small contextual note “The island is saved on the host's device.”

Connection state, not a separate ready vote, drives the roster. On arrival: add the row with a brief 160ms fade and announce “[name] joined.” On disconnection: remove the stale row, update capacity and announce “[name] left.” Reconcile roster entries against connected peer IDs; existing handlers primarily append players and must be audited so launch does not include disconnected ghosts.

Copy failure: keep the code selectable and show “Couldn't copy. Select the code and copy it manually.” Do not hide the useful data behind a failed button.

Opening an island uses existing public hosting. There is no privacy switch because neither discovery nor room creation currently implements one.

## 6. Guest connection and waiting room

Maintain the same island and panel shell through all guest states.

| State | Heading and detail | Actions |
| --- | --- | --- |
| Resolving code | “Finding your friend's island…” | Cancel |
| Negotiating connection | “Making a little room for you…” / “Connecting to [host]'s island.” | Cancel |
| Connected, waiting | “You're invited.” / “Waiting for [host] to head into the island.” | Leave room |
| Spectator connection | “Let's see what they're making.” / “Joining as a viewer.” | Cancel |
| Host starts | “See you on the island.” | Brief transition to gameplay |
| Timeout | “We couldn't reach that island.” / “Check the code or ask your friend to reopen their room.” | Try again, Back |
| Host closes before launch | “That room has closed.” / “Your friend can open a new one.” | Back to join |
| Mode mismatch | “That code opens a Survival room.” / “Use a Friends room code to meet on the island.” | Back to join |

Waiting guests see the same name-first roster. Hide equipment, operator classes, weapons and “connected / synced” telemetry. Use a small static connection symbol or a quiet loading indicator; avoid pulsing full panels.

The guest never sees a fake start button. The existing host remains responsible for starting. Leaving clears the timeout, closes the join/session, clears pending ready state and returns to join with the previous code and name preserved.

Unknown legacy room modes: omit from the Friends room browser. A direct code attempt may connect far enough to validate the authoritative mode. Add mode to the pre-launch roster/session metadata rather than waiting until `start` to reveal an incompatible room. Keep existing survival defaults for old clients; never silently reinterpret an untyped room as Friends.

## 7. Name, launch and fixed-character rules

- Keep the current nickname storage key and normalization: Unicode letters and numbers, spaces, `_` and `-`; collapse whitespace, trim, limit to 16 characters; minimum 2 characters.
- Placeholder “What should we call you?”; initial value is the saved name.
- Do not show an error on first render. On blur or attempted submit, show “Use 2–16 letters or numbers. Spaces, _ and - are welcome.” Associate it with the field. Disable launch while invalid and expose the reason beside the field.
- Enter submits the relevant form: welcome opens the island; join submits the code. In a textarea for manual connection codes, Enter stays text input.
- Lock identity editing while connecting or in a room; switching back to welcome/join re-enables it.
- Define one `FRIENDS_OPERATOR_ID = 'solar_guard'` constant and one pure Friends seed normalizer. Set both `operatorId` and `skinId` consistently.
- Apply normalization to the initial Friends local seed, received Friends roster entries, host launch participants, solo launch participants and guest parsed `start` payloads. Any Friends-only `skin_update` must not restore another operator.
- Preserve IDs, labels and player colors so people remain distinct. Do not change survival's stored character/skin selection.
- Friends launches use a neutral imprint loadout with zero ranks, rather than borrowing a previously selected combat operator's imprint. Use the existing normalizer and supported imprint operator mapping; imprint IDs may differ from multiplayer skin IDs, so do not assume `solar_guard` is a valid imprint ID. Never write these temporary defaults into the user's progression profile.
- Preserve the existing operator's gameplay implementation; no new abilities or visual/model redesign. This makes the user-requested single character consistent across launch paths.
- Friends always launches with `gameMode: 'friends'` and `worldId: 'friends_frontier'`.
- Solo invokes the existing solo session path without creating a public lobby and loads the same local island save.

## 8. Island backdrop and day/night treatment

### Production choice: live island rendering inside the menu

Mount an owned Three.js canvas directly behind the Friends form. Use `FriendsMenuWorld` to compose the actual terrain horizon, forest, ocean, island landmarks, clouds and day/night renderer, without initializing gameplay caves or railway excavation. No image captures, videos, embedded review page, review controls, gameplay HUD, weapons, or camera input handlers are part of the backdrop.

Look at the middle of the 48,000-unit map: `(24,000, 600, 24,000)`. Start at altitude 12,000 with a 36,000-unit horizontal orbit radius. Ease down to altitude 4,300 over 65 seconds, then vary altitude between 4,300 and 6,350 and coastal radius between 32,600 and 35,000. A six-minute orbit uses gentle speed modulation and central framing changes to reveal landmarks and railway spans, with occasional passages through actual clouds. Use a 58-degree field of view; offset desktop framing so the island remains visible to the left of the form. Adapt projection to portrait viewports while retaining the same orbit around the center.

Set the existing environment clock to 60 times normal progression and cloud wind to 50% of normal speed, 0.5. A full day takes 24 seconds of active menu time. Lava remains emissive through all phases and three warm point lights illuminate the crater rim and flowing lava channel. This menu clock is isolated from saved world time and multiplayer state. Stars animate on normal frame time and use filtered face-local kernels. Cloud shadows use a vertical projection so their footprints share the visible clouds’ 50% wind instead of sweeping across the terrain with accelerated sunlight. The current railway renderer uses island-wide visibility and is refreshed by development hot updates.

“Pause scenery” freezes time, wind and camera together. Keep drawing at a reduced frequency while paused so asynchronously loaded geometry still appears. Respect the stored motion preference and reduced-motion setting. Hidden tabs do not advance the scene and do not catch up on return.

Render at a maximum of 30 frames per second and cap device pixel ratio at 1.25. Dispose the world, workers, renderer, animation frame and resize observer when leaving setup. The canvas is decorative, `aria-hidden` and ignores pointer input. The form is usable while scenery loads; a sage gradient remains available if WebGL initialization fails.

### Review mockup limitation

The accompanying inline concept uses an existing coastline capture and approximate day/dusk/night color treatments to review layout and tone. Those treatments are approximate; the production menu now renders actual lighting live. Its room names and code are presentation examples, and its actions do not connect to real sessions.

## 9. Visual specification

| Token / element | Specification |
| --- | --- |
| Panel | `#F8F5ED`, opaque; 28px radius; 32px desktop padding; single soft shadow `0 20px 64px #182C2526` |
| Main text | Forest `#253C32` |
| Secondary text | Muted forest `#52685B`; verify >=4.5:1 on the panel |
| Primary action | Sage `#486B57`, light text `#FFFFFF`; hover `#3B5B49` |
| Secondary action | Pale sage `#E8EDE3`, forest text; quiet border `#CFD9CE` |
| Input | `#FFFFFF`, border `#A8B8A9`; stronger border only on focus |
| Small accent | Warm peach `#E9C3A7`; decorative only unless contrast verified |
| Focus | 3px dark sage outline, 3px offset; visible on every actionable control |
| Errors | Deep rust `#8A3E32` on a pale warm background, with text and icon; no red neon |
| Headline | Existing project sans-serif stack; 36px/1.15 desktop, 30px mobile; medium/semibold |
| Body / fields | 15–16px / 1.5; editable fields >=16px on mobile |
| Supporting text | 13px / 1.45; no 8–10px tactical microcopy |
| Buttons | Minimum 48px height, 14px radius, 16px horizontal padding, 16px label |
| Icons | Existing Lucide, 18–20px, consistent thin stroke; simple people, leaf, link, arrow, sun/moon icons |
| Spacing | 4, 8, 12, 16, 24, 32, 48px scale; 24px between functional groups |
| Roster avatar | 36px circle with initial; color reinforces identity, name remains authoritative |

Use normal case for all meaningful labels. Reserve monospace for room/manual codes. No beveled polygons, clipped corners, hard cyan/fuchsia glows, scanlines, uppercase command strings or animated warning markers. Do not blur text-bearing surfaces or lower the panel opacity to make scenery visible.

## 10. Responsive layout and input

- >=1100px: right-side panel, left-side scenery; 48–64px outer space.
- 768–1099px: panel 420px, outer space 24px; scenery remains visible behind and to the left; no narrow second column.
- <768px: panel centered below a roughly 160px scenery/header opening; width `calc(100% - 32px)`, cap 460px, 20–24px padding. Full screen can scroll naturally.
- <=360px: 16px panel padding, 16px outer margins, 30px heading and full-width actions; join input/action may stack.
- Short landscape screens: allow one content scroller, keep back and primary actions reachable. Avoid simultaneous body and panel scrolling.
- Use `100dvh` where appropriate with a safe fallback and safe-area insets; avoid fixed pixel heights for panels.
- Browser zoom 200%, Cyrillic labels and 16-character names must remain readable without horizontal scrolling. Long public host names truncate visually with the full accessible label.
- Keep form state when resizing, changing language or pausing scenery.
- Scope arrow/Enter/gamepad input so the game underneath cannot move, shoot or take pointer lock while setup is visible. Preserve the app's existing gamepad behavior; do not introduce a new navigation scheme casually.

## 11. Motion and audio

- Screen entrance: 240ms opacity transition and at most 8px panel translation.
- Panel state switch: 160ms fade, no theatrical sideways fly-in. Move focus to the new panel heading after the switch.
- Buttons: 140ms color transition; no scale bounce or glow explosion.
- Copy success: label replacement without changing button width.
- Connection loading: one small indicator; no screenwide pulse.
- Reduced motion disables panel translation, roster animation and automatic scenery movement.
- Keep current mute/volume preference. Do not add menu music or start ambient audio automatically.
- Existing UI click/hover sounds may be inherited, but omit repeated hover playback for scenery/discovery refresh and keep this menu visually quiet. A new softer sound asset is not a dependency.

## 12. Accessibility and localization

- Treat the top-level setup as the active full-screen menu with an appropriate heading and labelled region. Avoid `aria-modal` unless the implementation actually supplies dialog semantics, focus containment and inert background.
- Name and room fields have real labels. Errors use `aria-describedby`; submission errors use `role="alert"` once per failure.
- Announce connection changes and copy success with a small `aria-live="polite"` region. Do not announce every discovery poll or scenery phase.
- Roster states include text; color alone is never a readiness signal. Decorative initials do not duplicate spoken names unnecessarily.
- Clear focus destination after moving welcome → join → waiting room. Restore focus to the previous initiating action on back.
- Escape cancels a pending connection, leaves a waiting room, returns from join to welcome, or closes welcome to the main menu, in that order. Do not let Escape propagate to gameplay.
- Keyboard navigation follows the visible document order. All controls work without hover; touch targets >=44px, primary controls 48px.
- Add Friends-specific English/Russian strings through the current `CoopLanguage` system. Do not reuse “deploy,” “callsign,” “infiltrating” or other survival messages merely to preserve old keys.
- Resolve low-level signaling statuses to a small typed set of friendly Friends messages. Retain technical details only in expanded connection help if useful.
- Use locale-aware save dates and counts. Never show “Saved” without a valid save, and never promise successful storage before the existing persistence code confirms it.

## 13. Connection help

Preserve direct WebRTC offers/answers as a secondary path. Inside “Connection help,” explain: “If a room code isn't working, you can connect by exchanging connection text.”

Two routes: “Create connection text” and “Use connection text.” Show numbered steps, labeled textareas, copy buttons and back actions. Direct host: create and copy offer, accept friend's reply, see a real connection state, then “Head into the island.” Additional peer offers remain available under “Invite another friend.” Direct guest: paste offer, create/copy reply, wait for host.

Use the same typography and cream/sage surfaces; no raw tactical fallback screen. Do not expose ICE servers, MQTT terminology or protocol versions in the primary UI. Preserve the manual protocol's existing compatibility rules and validate mode in the reliable session metadata. If a manual path cannot establish mode until launch, clearly defer acceptance and reject mismatches at that boundary.

## 14. Code organization and implementation sequence

### Step A — extract presentation-independent setup behavior

Create `src/components/useMultiplayerSetup.ts` for existing session refs, lifecycle, nickname, connection operations, copy operations, roster and handoff behavior. Extract existing behavior first with survival tests passing; avoid a networking rewrite. Expose typed state/actions, including accurate discovery loading/error and connection phase rather than presentation-only strings.

Keep `ManualMultiplayerSetup.tsx` as the route/controller facade. Survival retains its existing rendered tree. Friends renders `FriendsModeSetup.tsx` through the same facade, preserving the existing App entry and callbacks. Shared setup should not automatically write a Friends seed into survival preference storage.

### Step B — consistent Friends identity

Create `src/game/multiplayer/FriendsMenuIdentity.ts` with the fixed operator constant and pure seed normalization. Call it only when authoritative mode is Friends, including `createSoloMultiplayerLaunch`. Cover roster and start handling, inconsistent skin/operator inputs and saved imprints. Keep late spectator admission unchanged; no playable in-game join feature is introduced.

### Step C — mode-aware discovery

Add optional `gameMode` to `PublicLobby` in `LobbySignaling.ts`, `PublicLobbyInfo` and advertisements in `UnifiedSignaling.ts`, and `Room`/`PublicRoom` plus create serialization in `server/multiplayerSignaling.ts`. Preserve it through list mapping, discovery heartbeats and HTTP/MQTT deduplication. Prefer mode-known data when deduplicating one room from two transports; do not discard it accidentally.

Default omitted metadata to the existing legacy survival behavior; only advertise new Friends rooms explicitly as Friends. Friends discovery filters explicit Friends rooms. Preserve the survival menu's compatible discovery behavior. Add host session metadata before launch so a code join can detect the actual mode. Freeze room mode at creation; removing the Friends mode picker prevents mid-room mismatch.

### Step D — dedicated Friends screen

Create `src/components/FriendsModeSetup.tsx` and `src/components/friends-menu.css`, with root `.friends-menu`. Decompose only where useful: welcome/join panel, shared roster and invite block. Do not import the tactical `CoopSkinSelector`, `CoopWorldSelector` or `CoopImprintSummary` into this presentation.

Existing `multiplayer.css` can stay for survival; new Friends rules must not target `.coop-*` or generic `button`, `input`, `header` or `section` selectors globally. Remove obsolete Friends setup modifier rules only after checking every reference. Leave the main-menu entry styling intact.

### Step E — live scenery

`FriendsMenuBackdrop.tsx` lazily mounts `FriendsMenuScene.ts`. `FriendsMenuCamera.ts` defines the orbit, focus, altitude, 60× time and 50% cloud wind. Reuse the playable world visuals directly; retain no review controls or captured-image layers. Own and dispose all menu renderer resources.

### Step F — localization, errors and save context

Add Friends-specific keys to `i18n.ts`. Read and validate the current world once when opening welcome; display `savedAt` without traversing/meshing saved terrain. Do not rewrite saves. Distinguish first world from stored world and actual discovery failure from no rooms. Make cancellation reliable during both ICE fetch and room creation: use an attempt token/abort signal so delayed promises cannot recreate a room after leaving.

### Step G — verify and refine

Run focused behavior tests, typecheck and build. Inspect actual browser layouts and two-client flows; adjust typography, panel positioning and live camera framing until the screen meets the acceptance checklist. Capture final screenshots of welcome, join, host, guest, error, mobile and night states.

## 15. Verification plan

### Targeted behavior tests

- Friends markup contains welcome actions and no operator selector, class stats, imprint controls, level selection, combat branding or survival command tabs.
- Survival markup and selection behavior retain their existing expectations; change the old Friends test's “Reality Breach” expectation specifically.
- Friends host/solo/guest launch envelopes always have Friends mode/world and the same operator/skin, including malformed or mismatched legacy seed inputs.
- Temporary Friends identity does not mutate skin/operator preference or progression local storage.
- Discovery mode metadata survives broker advertisements, optional HTTP transport and deduplication; unknown/survival rooms do not enter the Friends list.
- Room code/invite normalization, valid/invalid names, single-flight submits, late async cancellation, timeout cleanup, failed copying and disconnect roster reconciliation.
- Existing manual offer/answer connection behavior and room capacity are preserved.
- Backdrop adjacent phase weights sum to 1, loop wraps without flashing, missing images hold a valid frame, and reduced motion/visibility do not leave timers running.

Use mock signaling and actual controlled connection events, not snapshots that only mirror new markup. Add browser interaction checks using existing tooling if available; do not install a large new test framework merely for visual layout.

### Browser review matrix

1280×720, 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, 360×640 and short landscape. Review at default and 200% zoom; English and Russian; keyboard only; reduced motion; slow image load; blocked clipboard; offline discovery.

Use two separate browser contexts for a real host/guest flow. Check invite URL opening, roster accuracy, copy actions, guest cancellation, host closing, one-host launch, multiplayer start, spectator labeling for an active room, manual fallback and the same fixed character in gameplay. Inspect returning to survival for unchanged character preferences. Measure menu loading and idle CPU/memory; menu must never start terrain workers or accumulate timers after repeatedly opening/closing.

Commands: `npm run lint`, focused `npm test -- ...`, then `npm run build`. Establish any existing failures before attributing them to this work. A full suite run is appropriate if shared session/signaling extraction changes behavior across modes.

## 16. Acceptance checklist

- [ ] The first Friends screen clearly communicates exploring and creating together.
- [ ] At least half of desktop scenery remains visible; the panel is calm and readable in every light phase.
- [ ] Users can host, join by code, discover a Friends room and play alone without visiting a loadout tab.
- [ ] Everyone uses the single fixed character through all Friends launch paths.
- [ ] Hosting is accurately described as public; there is no nonfunctional privacy control.
- [ ] Player capacity, connected roster and spectator actions reflect real session behavior.
- [ ] Host-local saving is described accurately; entering the menu never mutates or resets the island.
- [ ] Friends discovery never presents a known Survival room as an island.
- [ ] Connection failures explain the next useful action without overwhelming the screen.
- [ ] Manual connection help works and looks like part of the same menu.
- [ ] Every action is reachable on mobile, with keyboard, at 200% zoom and with reduced motion.
- [ ] No tactical glow/grid/card styling leaks into Friends; no new Friends styling leaks into survival.
- [ ] Background assets come from the actual map; decorative cycling never changes gameplay time.
- [ ] Real host/guest, solo, spectator and cancellation flows pass review.
- [ ] Typecheck/build pass, relevant tests pass, and any baseline failures are documented.

## 17. Delivery order and decisions already made

Build the state/identity/discovery foundations first, then the complete Friends screen, then the live island renderer and final visual polish. Deliver the whole menu flow together; a beautiful welcome screen followed by the old tactical waiting room would not meet this plan.

The layout, palette, typography, fixed character, background approach, actions, copy, save semantics and host/guest states are decided above. No design questionnaire is needed before implementation. Final camera framing is verified against the live rendered island while preserving this composition.

## 18. Planning deliverables verified

Created this specification and an interactive concept covering welcome, host, join and guest states. Checked the concept's JavaScript syntax and inspected its desktop appearance and 360px mobile layout in the browser. The mobile preview has no horizontal overflow; hosting and joining change to the intended gathering-room views. These are concept checks, not verification of production networking or final lighting assets. The subsequent implementation now replaces the production Friends setup, including hosting, joining, manual connection, the fixed Solar Guard identity, and a live island renderer. The initial concept remains a design reference only.
