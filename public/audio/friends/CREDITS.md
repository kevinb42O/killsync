# Sunline / Friends audio credits

Downloaded from the original publishers on 2026-10-08 and 2026-10-09. Effects use
CC0-1.0 except the attributed feeding-bird recordings documented below;
the two music tracks and campfire recording use the Pixabay Content License.
Per-file licenses, publisher labels, source URLs and hashes are preserved in
`sources.json`. Assets are bundled locally; gameplay does not contact the
publishers or depend on their servers.

## Music

- `exploration.ogg`: **Cornerian Flight Academy, VGM Yume - Minecraft Title Theme Lofi** — the main exploration soundtrack.
  [Publisher/source](https://pixabay.com/music/beats-cornerian-flight-academy-vgm-yume-minecraft-title-theme-lofi-439427/).
  Original download: https://cdn.pixabay.com/audio/2025/11/19/audio_766da5bfec.mp3
- `castle.ogg`: **Game Music_ Soundtrack_Exploration _ Peaceful Area** by **Sonic289** — the castle approach, stairs and grounds soundtrack.
  [Publisher/source](https://pixabay.com/music/solo-piano-game-music-soundtrack-exploration-peaceful-area-372769/).
  Original download: https://cdn.pixabay.com/audio/2025/07/10/audio_9116a3530e.mp3
  The publisher labels this track “AI generated” and “Content ID Registered”.

Both user-selected tracks use the [Pixabay Content License](https://pixabay.com/service/license-summary/).
Full recordings are converted to stereo 44.1 kHz Vorbis quality 5 and matched
to -18 LUFS / -3 dBTP / LRA 8. Playback adds a four-second loop-seam crossfade,
an eight-second transition between themes, and reduced background volume.
Leaving the castle returns to the main recording at its remembered position.

## Campfire

- `campfire_woods.ogg`: **Campfire in the Woods** by **DRAGON-STUDIO**.
  [Publisher/source](https://pixabay.com/sound-effects/nature-campfire-in-the-woods-467491/),
  [Pixabay Content License](https://pixabay.com/service/license-summary/).
  Original download: https://cdn.pixabay.com/audio/2026/01/16/audio_9b2a34b5c3.mp3
  Full 61-second recording, converted to mono 32 kHz Vorbis quality 4, filtered
  at 80–8,000 Hz and normalized to -23 LUFS / -3 dBTP / LRA 8. Playback adds a
  two-second seam crossfade and fades/pans relative to the fire's position.

## Effects

**Kenney** — https://kenney.nl

- Impact Sounds (2019): https://kenney.nl/assets/impact-sounds
  - Grass, wood and concrete footsteps; wood, mining, soft and metal impacts.
- RPG Audio (2014): https://kenney.nl/assets/rpg-audio
  - Coins, leather handling, cloth, blade swish, book opening.
- Interface Sounds (2020): https://kenney.nl/assets/interface-sounds
  - Click, selection, confirmation, error and glass cues.

The three `LICENSE-*.txt` files preserve the licenses shipped in the original
archives. `sources.json` records every selected filename and SHA-256 digest.
Kenney effects retain their original bytes; runtime volume and occasional
playback rate changes adapt the recordings to game events. Five mining
variants and three heavy wood break variants
avoid a single repeating hit.

## Nature and movement recordings

**Park ambiences** — Thimras, 2022-07-25, CC0-1.0.

- Publisher/license: https://opengameart.org/content/park-ambiences
- Original birds: https://opengameart.org/sites/default/files/park_ambience_birds.wav
- Recorded in a public park in Adelaide, South Australia.
  `bird_call_000.ogg` through `bird_call_003.ogg` are four 1.8-second excerpts
  starting at 22.05, 29.25, 72.55, and 85.15 seconds. They are filtered at
  1–7.5 kHz, normalized to -20 LUFS, and faded at the edges. These short calls
  are never looped or pitch shifted. The large original WAV files are not shipped.

**wind1** — Luke.RUSTLTD, 2010-10-01; CC0-1.0.

- Publisher/license: https://opengameart.org/content/wind1
- Original download: https://opengameart.org/sites/default/files/wind1.wav
- A conventional wind effect made with PureData, following Andy Farnell's
  sound-design tutorial, in 2010. This is a downloaded, non-AI effect, not a
  field recording; it contains no wildlife. The game performs no synthesis.
- `wind_clean.ogg` uses seconds 12–48, converted to mono 32 kHz Vorbis quality
  3, filtered at 80–4,000 Hz and normalized to -24 LUFS / -3 dBTP / LRA 8.
  Runtime playback crossfades the loop seam. This replaces the park ambience
  bed so background wildlife cannot bypass proximity-controlled bird calls.

**Random Sounds Samples** — Augmentality (Brandon Morris), submitted by
HaelDB, 2010-09-26; selected CC0-1.0 license.

- Publisher/license: https://opengameart.org/content/random-sounds-samples
- Original leaves: https://opengameart.org/sites/default/files/moving%20leaves%20stereo.ogg
- Original crickets: https://opengameart.org/sites/default/files/cricket%20ambienc276.ogg
- `leaves.ogg` preserves the recorded original. `crickets.ogg` uses its first
  12.27 seconds, converted to mono 32 kHz Vorbis and normalized like the park
  recordings. Ambient playback uses a two-second loop-seam crossfade.

**Shovel Sound** — RavenWolfProds, edited by themightyglider, 2020-06-27;
CC0-1.0. `shovel.ogg` preserves the original download.

- Publisher/license: https://opengameart.org/content/shovel-sound
- Original download: https://opengameart.org/sites/default/files/shovel_0.ogg
- Original recording: https://freesound.org/people/RavenWolfProds/sounds/503672/

**Jump and Run and Stand — Jump SE** — mieki256, 2013-09-18; CC0-1.0.

- Publisher/license: https://opengameart.org/content/jump-and-run-and-stand
- Original download: https://opengameart.org/sites/default/files/jump.flac
- `jump.ogg` uses the entire dedicated jump clip, converted to mono 32 kHz
  Vorbis quality 4, filtered at 100–3,200 Hz, reduced by 10 dB, and given a
  3 ms opening / 16 ms closing fade. Runtime playback adds a quiet gain.
  This replaces cloth handling at takeoff and blade-swing audio for air jumps.

**Jump Landing Sound** — MentalSanityOff, submitted by qubodup, 2012-05-12;
CC0-1.0. `landing.wav` preserves the original download.

- Publisher/license: https://opengameart.org/content/jump-landing-sound
- Original download: https://opengameart.org/sites/default/files/jumpland.wav
- Original recording: https://www.freesound.org/people/MentalSanityOff/sounds/148796/

All processing edits downloaded recordings; it does not generate new audio.
`sources.json` includes hashes of each bundled asset and original hashes plus
exact processing notes for the compressed ambience excerpts.

**wavesound.wav** — transitking, 2005-11-28; CC0-1.0.

- Publisher/license: https://freesound.org/people/transitking/sounds/11505/
- Public high-quality recording preview: https://cdn.freesound.org/previews/11/11505_31028-hq.mp3
- Recorded in Stonington, Maine: stereo waves washing over coastal bedrock
  and draining through cracks. `surf.ogg` uses seconds 36–76 of the publisher's
  MP3 preview, converted to stereo 32 kHz Vorbis, filtered below 80 Hz and above
  8 kHz, normalized to -24 LUFS / -3 dBTP / LRA 8, and crossfaded at playback.
  The original recording's CC0 license covers this derivative too.

The pre-existing firearm/reload WAV files live in the parent audio directory
and retain their existing provenance. This pass does not replace those assets.

CC0-1.0: https://creativecommons.org/publicdomain/zero/1.0/

## Recorded train sounds

All six train files use the publishers' public high-quality MP3 previews of
CC0 recordings. They are converted to mono 32 kHz Vorbis quality 4, filtered
below 90 Hz / above 7 kHz, and normalized to -23 LUFS / -3 dBTP / LRA 8.
One-shot cues have 60 ms opening and 400 ms closing fades. Source and output
hashes and the exact excerpt boundaries are preserved in `sources.json`.

- `train_drive.ogg`: **steam train from 1912 locomotive – loop**, xo9rh11o3w,
  2013-09-14, CC0. Full 19.076-second loop.
  https://freesound.org/people/xo9rh11o3w/sounds/199828/
- `train_rail.ogg`: **Train on Railway Loop**, MeijstroAudio, 2017-09-13,
  CC0. Full 5.75-second loop, derived by its publisher from jordir's CC0
  **Train.wav**, recorded with a Roland R-26.
  https://freesound.org/people/MeijstroAudio/sounds/402074/
  https://freesound.org/people/jordir/sounds/372873/
- `train_depart.ogg`: **steam-train-leaving-moor-st-station.wav**, keithpeter,
  2011-07-26, CC0. Seconds 24–28 of an actual Hall-class steam locomotive
  departing Birmingham Moor Street, recorded on a Zoom H2.
  https://freesound.org/people/keithpeter/sounds/125211/
- `train_brake.ogg` and `train_stop.ogg`: **G47-16-Steam Train In Stop.wav**,
  craigsmith / USC Cinema, 2018-08-27, CC0. Seconds 34–38 and 81–85,
  respectively. Historical mechanical train approach, braking, and steam
  recordings digitized from the USC Cinema archive.
  https://freesound.org/people/craigsmith/sounds/438765/
- `train_horn.ogg`: **Steam Whistle.mp3**, Bidone, 2009-04-28, CC0.
  Full 3.201-second recorded old steam-locomotive whistle.
  https://freesound.org/people/Bidone/sounds/71778/

The engine and rail loops receive an 80 ms playback seam crossfade.
Only their playback speed and gain follow train motion; no audio is generated.

- `eat.ogg`: **Soft Chicken Chomp 3** by **R1nkata**, [Freesound](https://freesound.org/people/R1nkata/sounds/723600/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Full 1.439-second public Ogg preview; unchanged, played quietly at the marshmallow bite.

## Dev flight foliage

- `flight_foliage_000.ogg` through `flight_foliage_002.ogg`: **20 Rustles of
  dry leaves** by **qubodup**, [OpenGameArt](https://opengameart.org/content/20-rustles-dry-leaves), CC0 1.0.
  Download: https://opengameart.org/sites/default/files/qubodup-rustle.7z
  Full `rustle01.flac`, `rustle02.flac` and `rustle03.flac` recordings,
  converted to mono 32 kHz Vorbis quality 4, filtered below 70 Hz and above
  8.5 kHz, normalized to -20 LUFS / -3 dBTP / LRA 8, with 12 ms opening and
  60 ms closing fades. Gameplay plays bounded 650 ms excerpts at varying
  speed/gain for close canopy brushing. Original and output hashes are
  preserved in `sources.json`. All processing edits downloaded audio.

## Approved Friends world and interaction effects

These 21 user-approved Pixabay recordings produce 33 bundled Ogg files.
They use the [Pixabay Content License](https://pixabay.com/service/license-summary/).
Individual source pages, observed preview URLs, original hashes, output hashes
and exact excerpt boundaries are recorded in `sources.json`. The importer is
`tools/import-friends-pixabay.py`. No source recordings are generated at runtime.

- `cargo_stone.ogg`: [Film Special Effects Rocks](https://pixabay.com/sound-effects/film-special-effects-rocks-6129/).
- `cargo_wood.ogg`: [Film Special Effects Chest Slam](https://pixabay.com/sound-effects/film-special-effects-chest-slam-85122/).
- `cave_air.ogg`: [Film Special Effects Cave Wind 10](https://pixabay.com/sound-effects/film-special-effects-cave-wind-10-76283/).
- `cave_drips_000.ogg`, `cave_drips_001.ogg`, `cave_drips_002.ogg`, `cave_drips_003.ogg`, `cave_drips_004.ogg`: [Nature Droplets In A Cave](https://pixabay.com/sound-effects/nature-droplets-in-a-cave-482871/).
- `chest_coins.ogg`: [Film Special Effects Coins Spill](https://pixabay.com/sound-effects/film-special-effects-coins-spill-62512/).
- `chest_latch.ogg`: [Film Special Effects Wooden Trunk Latch 1](https://pixabay.com/sound-effects/film-special-effects-wooden-trunk-latch-1-183944/).
- `chest_lid.ogg`: [Household Chest Opening](https://pixabay.com/sound-effects/household-chest-opening-87569/).
- `chest_reward.ogg`: [Film Special Effects Short Success Sound Glockenspiel Treasure Video Game](https://pixabay.com/sound-effects/film-special-effects-short-success-sound-glockenspiel-treasure-video-game-6346/).
- `flashlight.ogg`: [Film Special Effects Flashlight Click](https://pixabay.com/sound-effects/film-special-effects-flashlight-click-46073/).
- `lava.ogg`: [Nature Lava Loop 3](https://pixabay.com/sound-effects/nature-lava-loop-3-28887/).
- `mining_break.ogg`: [Film Special Effects Rock Falling 010](https://pixabay.com/sound-effects/film-special-effects-rock-falling-010-104938/).
- `night_vision.ogg`: [Film Special Effects Night Vision](https://pixabay.com/sound-effects/film-special-effects-night-vision-100467/).
- `reel_motor.ogg`: [Film Special Effects Electric Motor Whir](https://pixabay.com/sound-effects/film-special-effects-electric-motor-whir-77588/).
- `reel_ratchet.ogg`: [Film Special Effects Ratchet Mechanism](https://pixabay.com/sound-effects/film-special-effects-ratchet-mechanism-594621/).
- `rope_creak_000.ogg`, `rope_creak_001.ogg`, `rope_creak_002.ogg`: [Film Special Effects Rope Under Tension](https://pixabay.com/sound-effects/film-special-effects-rope-under-tension-7144/).
- `rope_hook.ogg`: [Film Special Effects Metal Clanking Light](https://pixabay.com/sound-effects/film-special-effects-metal-clanking-light-96330/).
- `steam.ogg`: [Technology Air Or Steam Pressure Release](https://pixabay.com/sound-effects/technology-air-or-steam-pressure-release-29600/).
- `step_mud_000.ogg`, `step_mud_001.ogg`, `step_mud_002.ogg`, `step_mud_003.ogg`: [Household Footsteps Mud](https://pixabay.com/sound-effects/household-footsteps-mud-68694/).
- `step_water_000.ogg`, `step_water_001.ogg`, `step_water_002.ogg`, `step_water_003.ogg`: [Film Special Effects Footsteps Water 01](https://pixabay.com/sound-effects/film-special-effects-footsteps-water-01-73731/).
- `volcano.ogg`: [Nature Volcano](https://pixabay.com/sound-effects/nature-volcano-71156/).
- `waterfall.ogg`: [Nature Waterfall 01 Loop](https://pixabay.com/sound-effects/nature-waterfall-01-loop-74884/).

The excerpts are mono 32 kHz Vorbis quality 4, with a 70 Hz high-pass
(35 Hz for lava/volcano), 8.5 kHz low-pass, short opening/closing fades, and
fixed linear RMS normalization targets of -28 dBFS for environmental beds,
-24 dBFS for volcanic rumble, -22 dBFS for the motor and -21 dBFS for effects,
bounded by -5 dBFS oversampled peaks. The five individual drop excerpts instead
use a -9 dBFS oversampled peak target; each preserves one attack and its natural
tail. The exact processing and original/output hashes are in `sources.json`.
No dynamic loudness processing is applied to the new excerpts. Playback
adds an 800 ms seam crossfade to environmental loops and 80 ms to the motor.
Cave reflections use four filtered delay taps on the existing recordings.

## Feeding birds — field recordings added 2026-10-09

These are recordings of real birds. The bundled excerpts preserve native pitch
and dynamics. They are trimmed, filtered to reduce distant rumble, faded at the
cuts, given a bounded linear gain and encoded as mono 32 kHz Vorbis q5.
Exact excerpt times, original and output hashes, edits and licenses are recorded
under `birdFieldRecordings` in `sources.json`.

- `bird_robin_000.ogg`, `bird_robin_001.ogg`, `bird_robin_002.ogg`:
  **Robin #1, #4 and #7**, recorded by **Joseph Sardin / BigSoundBank**.
  [Robin #1](https://bigsoundbank.com/robin-1-s1667.html),
  [Robin #4](https://bigsoundbank.com/rouge-gorge-4-s1670.html),
  [Robin #7](https://bigsoundbank.com/rouge-gorge-7-s1673.html).
  [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- `bird_blue_tit_000.ogg`, `bird_blue_tit_001.ogg`,
  `bird_wings_000.ogg`, `bird_wings_001.ogg`:
  **Eurasian Blue Tit Call and Wing Sounds**, recorded by **David /
  naturenotesuk** with a Zoom H1essential and clippy microphone.
  [Original recording and publisher](https://freesound.org/people/naturenotesuk/sounds/830034/).
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Edited from the publisher's publicly provided high-quality preview.
- `bird_sparrow_000.ogg`, `bird_sparrow_001.ogg`,
  `bird_sparrow_002.ogg`, `bird_startled_000.ogg`, `bird_startled_001.ogg`:
  **House Sparrow — XC86749**, recorded by **Jonathon Jongsma** at Powderhorn
  Park, Minneapolis, on 2011-08-03.
  [Original recording and attribution](https://commons.wikimedia.org/wiki/File:Passer_domesticus_-_House_Sparrow_-_XC86749.ogg),
  [xeno-canto source](https://xeno-canto.org/86749).
  These edited audio files are distributed under
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

In-game calls are individual phrases with quiet gaps; wing flutters accompany
arrival and departure. Calls use the visible species, stereo direction and
distance, and the player's Ambience volume. The short startled cue is a recorded
sparrow chirp used for the campfire reaction. Audio assets stay local during play.

## Stone throwing

- The throw swish reuses `knifeSlice.ogg` from Kenney's RPG Audio pack, and
  landing impacts reuse the stone impacts from Kenney's Impact Sounds pack.
  Both packs are [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- `stone_oof.mp3` is **Oof 2** by **u_b9zlfeiqje**, bundled under the
  [Pixabay Content License](https://pixabay.com/service/license-summary/).
  [Source page](https://pixabay.com/sound-effects/people-oof-2-580732/).
