# Friends sound direction

Friends mode uses downloaded, credited audio from Kenney, The Cynic Project,
Thimras, Brandon Morris, RavenWolfProds/themightyglider, MentalSanityOff,
transitking, mieki256, Luke.RUSTLTD, and the credited train recordists.
The calm piano/pad theme and quiet material sounds take inspiration from the
feeling of Minecraft exploration. No AI-generated audio was added.

Press Escape during Friends gameplay to open the game menu. Its Audio tab
offers independent music, effects, and ambience volume plus mute, saved locally as
`sunline.audio.v1`. There is no Sound button in the lobby or gameplay HUD. The default
mix puts music in the background. Playback requires a click/key gesture and
suspends with a hidden tab. Leaving Friends stops its loop and active effects.
Live code updates dispose the old audio singleton and close its context, so
an obsolete bird/wind loop cannot survive a module replacement.

`src/game/FriendsAudio.ts` owns asset decoding, bounded effect playback,
non-repeating sample variants, a four-second music seam crossfade, and volume
preferences. `SoundManager` routes existing Friends cues to the downloaded
assets and bypasses its procedural tones/noise in this mode. Survival and solo
keep their existing sound behavior.

Movement footsteps use actual local velocity, stay silent in flight and while
seated, and distinguish meadow/soil, timber/vehicle decks, and stone/paving.
Harvesting distinguishes timber, a real shovel scrape, five mining variants,
and ore. Tool swings play at the host's tool cadence with a barely audible
whoosh (gain 0.008, or 0.003 for the shovel, about 21–22 dB below the previous
mix); harvesting hits and
resource collection remain tied to accepted snapshots. Local tree completion
adds a heavier wood break. Confirmed earthwork, planting, material transfer,
and switching tools have quiet cues. Construction compares
accepted building revisions, skips the initial world load, and limits cues to
nearby edits. Replayed snapshots and rejected placement attempts do not play
success sounds. Treasure openings and completed cargo jobs have quiet cues.
Takeoff uses mieki256's dedicated CC0 jump effect, filtered and reduced by
10 dB with a quiet 0.12 playback gain. Air jumps use the same dedicated effect
at 0.1 gain and a gentle 1.08 playback rate. Neither jump path uses the tool
swish or cloth handling, and held jump input cannot repeat the cue. Landing layers
a recorded body/boot impact with the new contact surface and scales with
impact strength. Existing UI, pickup, damage, and completion hooks use
downloaded samples; firearm/reload hooks use the pre-existing recorded WAV assets.

The soundscape uses three shared downloaded beds: isolated wind, crickets at night,
and stereo coastal waves. It follows the renderer's actual daylight and wind
preview settings, fades outside sounds underground, and adds occasional
stereo leaf rustles beside standing trees. Harvested or unsupported trees no
longer rustle. There are no per-tree audio nodes or timers. Environment/tree
checks run twice per second and leaf events are spaced 5–12 seconds apart.
The wind bed is silent on ordinary low ground and hills. It fades in smoothly
from elevation 1,700 to 2,600 (the island's rocky mountain band), or from 480 to
1,280 units above the actual local terrain during high flight/tower exploration.
Nearby trees reduce exposure; zero wind and underground views remain silent.
The file does not load until exposure becomes audible. Descending fades the
shared wind source to silence and releases it after one second; repeated visits
reuse its decoded buffer. Local tree rustles can still respond to the breeze
without playing a global wind bed on the ground.
Ambient beds decode lazily only after entering a world, play through an
independent gain bus, and are stopped on mode exit or muted/zero ambience.
Hidden tabs suspend the context. There are at most 20 one-shot voices plus
three ambience loops and the music. The coast file loads only on approach,
using the terrain's irregular coastline distance and height above sea level
for a smooth fade. Surf is silent inland, far out at sea, high above the water,
and underground. The 19 nature and movement files total 1,183,661 bytes (about 1.2 MB);
the original large park WAVs are not shipped. The subjective mix can be
auditioned and adjusted using the Audio tab of the Escape menu.

Birds are a bounded local population of four faceted swallows in one opaque
instanced draw call. GPU wing animation alternates flapping and gliding;
analytic shared-clock paths circle and perch on standing trees. Instance poses
update at most 30 times per second and tree anchors refresh every two seconds.
There is no flock physics, shadow pass, individual bird object, or network traffic.
Only a deterministic 8% of trees are eligible bird habitats, with two birds per
anchor. The population is tied to these fixed trees, instead of filling every
nearest tree with a flock wherever the player walks.
Birds disappear underground and at night. Four short real bird recordings load
only when an actual rendered bird is close enough within a 400-unit 3D radius.
Perch height comes from the loaded tree model's bounds. Calls wait 12–24 seconds
after a nearby encounter, last at most 1.2 seconds, and leave 75–135 seconds
between events. The global quiet gap survives leaving/re-entering hearing range.
Peak volume is 0.1 (half the previous level), fades with distance, and pans toward
the nearest bird. Leaving range, going underground/night, muting ambience, hiding
the tab, or exiting the mode stops an active call. No bird audio loops.

The wind bed uses Luke.RUSTLTD's CC0 wind effect from 2010, originally made with
conventional PureData synthesis. It is a downloaded non-AI asset, with no wildlife
in the source and no runtime synthesis. It replaces the mixed park field recording
so any background chirps cannot bypass the bird proximity checks. The new filename
also prevents a browser from reusing the old cached wind asset after a reload.

Both the Grand Traverse and player-built train use downloaded recordings.
The nearest train has at most two active movement loops: the locomotive and
rail/wheel layer, each with its own 3D distance falloff and stereo direction.
Volume and a conservative 0.72–1.2 playback rate follow actual train speed.
There are no per-wagon audio nodes. Parked and distant trains are silent;
loops fade out and are released, while hidden tabs suspend the audio context.
A departing train, slow braking, and a settled stop each trigger one recorded
cue per transition. First snapshots and late joins establish state without
playing a false departure. Motion checks share the twice-per-second soundscape
update. The six train files total 326,816 bytes; assets load only near trains.

H sounds the real locomotive whistle while aboard or nearby, except in build
mode where H keeps its construction binding. The train-controls panel also
exposes the horn for pointer/controller users. The host validates the living
actor's 400-unit operating range and railway access, deduplicates requests,
and enforces an eight-second global cooldown. A tiny transient serial/time/
vehicle ID on ordinary motion snapshots tells nearby guests to play once;
old horn events do not replay on join or save/load. Train sounds use Effects
volume in Escape → Audio. They are separate from the Ambience slider.

Aircraft engines, continuous jetpack propulsion, and cave drip recordings are
not included in this pass.

Source URLs, the shipped pack licenses, and file hashes are in
`public/audio/friends/CREDITS.md` and `public/audio/friends/sources.json`.

The Controls tab uses the same AZERTY/QWERTY/controller/mobile profiles as the
main menu and adds live look sensitivity. Changing profiles does not recreate
the arena or reconnect the session. Performance offers live render resolution
(100/85/70/50%), sun shadows, and the shared cinematic effects preference.
Resolution/shadows/sensitivity persist in `sunline.preferences.v1`. Escape or
Resume returns to play. The menu blocks movement, firing, mouse look, and
controller actions while open, and keeps focus inside the dialog. Other
focused panels close first when Escape is pressed. The shared world continues
while the menu is open. QWERTY C remains crouch; F2 opens world tools.

Campfire eating uses R1nkata’s short CC0 [Soft Chicken Chomp 3](https://freesound.org/people/R1nkata/sounds/723600/) recording (`eat.ogg`, 1.439 seconds), played once at the bite at gain 0.22 through the effects bus. Playback follows the accepted local cooking state, so held inputs and repeated snapshots do not repeat it. After the one-second eating animation, the stick stays empty for five seconds before its fresh marshmallow appears.
