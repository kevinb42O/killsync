# Friends Fun bar

Press **T** to switch into Fun, including from construction or its expanded
library. Press it again to return to empty hands. **1** selects Stone and **2**
selects Seeds; **3** selects Marshmallow. The wheel cycles all three slots,
including while seated at the campfire. The normal tool bar also has a
small Fun button for touch users. The bar fades after five seconds, like the
existing tool and build bars. Activity controls stay small and visible.

## Stones and falls

Hold the primary button to charge a throw, then release. A quick click throws
immediately. A shallow, fast water impact skips, losing speed on each bounce;
a steep or slow impact sinks. Water uses the shared lake, river and sea field.
Every impact creates shared ripples and droplets. A fresh pebble appears after
450 ms. The existing Big Walk hand holds the pebble and animates its release.

Swept, host-owned collisions stop stones at terrain, construction, vehicles,
trees and players. Friend hits emit the existing `player_damaged` presentation
event with zero damage: the victim receives the red survival overlay, camera
reaction and hit sound. Hard landings above 900 units/second emit the same
effect. Neither interaction removes health or adds an incoming-hit text notice.
Swimming and developer flight do not generate hard-landing flashes.

## Bird feeding

Primary scatters a handful of seeds onto nearby dry outdoor ground. One to
three birds approach, land, hop and peck for 20 seconds, then linger another
25 seconds before flying away. Seed patches expire after 60 seconds. Secondary holds out
the seed hand without scattering. After eight seconds of stillness, there is
a 12% chance of a hand visitor every three seconds. Visits are intentionally
not guaranteed. A bird approaches, perches on the hand/arm, and eats the visible
seeds over six seconds, then stays perched indefinitely while the arm remains
still and extended, even after the seeds are gone. It looks around instead of
continuing to peck an empty hand. Moving, turning sharply, lowering the hand, stowing
seeds or disconnecting makes it take off.

Seeds scattered inside the Commons fire ignite visiting birds after they
land; shared flickering flames follow their startled takeoff.

The same seed interaction works standing and on existing outdoor seats,
including benches and campfire chairs. Roofs/cave ceilings prevent attraction.
The hand uses the existing character asset. Robin, blue tit and sparrow models
are code-authored with articulated wings, tails, heads, beaks, feet and eye
highlights. The local bird perches in the hand's viewmodel; peers attach it to
the character's posed wrist socket. Birds, scattered seeds and decreasing palm
seeds are shared transient host state; they are omitted from durable saves.
Active flocks are capped at twelve birds and twelve seed patches.

Feeding and perched birds use twelve bundled real field-recording excerpts:
three robin phrases, two blue tit calls, three sparrow chirps, two wing flutters
and two short startled chirps. Calls keep native pitch, choose variants without
immediate repeats and use irregular quiet gaps. One flock call can start every
850 ms; distance and camera-relative stereo direction place birds in the scene.
The hand companion stays close and audible. Arrival and takeoff flutter once,
and campfire ignition adds a short startled call. These sounds respect Ambience,
mute, tab visibility and the shared audio voice limit. Assets load lazily when
birds exist, and do not contact external servers during gameplay. Attribution,
licenses, excerpt edits and hashes are in public/audio/friends/CREDITS.md and
sources.json.

## Marshmallows

Sitting at the Commons campfire automatically selects Marshmallow in Fun.
Scrolling switches freely between stones, seeds and marshmallows; stones can
be thrown from chairs and benches. Standing up keeps the selected Fun item.
The marshmallow stick can be carried anywhere and its toast level survives
switching to another slot. Primary roasts only within reach of the fire and
while aimed toward it. Secondary eats (gamepad LT), R replaces (gamepad X),
and K adds wood by the fire (gamepad up). Small activity buttons support touch.
The original roasting, burning, eating and five-second refill remain shared
host state. Peers see the carried stick in the posed hand. The local hand,
shaft, food and burning effect use the existing foreground equipment pass with
cleared world depth. Projection conversion preserves the original framing and
exact screen alignment of the fire target. Other players' sticks retain world
depth, including when switching to third person.

## Verification

- `FriendsStones.test.ts`: charge/release/refill, replay suppression, swept
  player/wall hits, shallow vs steep water impacts, stowing and stale input,
  harmless hit replication, and real hard-landing events.
- `FriendsBirds.test.ts`: flock identities and feeding timing, rare hand visits,
  patience and scare behavior, outdoor seats, excluded environments, and the
  real island baseline/motion codec.
- `FriendsBirdAudio.test.ts`: call timing, species, distance, stereo placement,
  flock overlap limits and attribution/hash checks for all twelve recordings.
- `FriendsBirdVisuals.test.ts`: empty-hand companion attachment, smooth takeoff
  and shared ignition presentation.
- `FriendsCampfireSimulation.test.ts`: toast preservation across stowing and
  standing, fire reach, secondary eating, refill and equipped-stick replication.
- `node tools/test-friends-fun-arena.mjs`: production arena input and rendering,
  with captures in `artifacts/fun-bar`. The review fixes the bird random source
  only inside its browser session to exercise rare perches reliably.

Protocol version 57 includes all three Fun slots and the equipped marshmallow
players, lingering bird phases and ignition timing in transient shared state.
