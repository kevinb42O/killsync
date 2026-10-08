# Sunline / Friends audio credits

Downloaded from the original publishers on 2026-10-08. All new audio in this
directory is CC0-1.0. No AI audio generators were used. These named releases
date from 2005–2022 (music: 2019), before modern generative audio services.
The source recordings are bundled locally; gameplay does not contact the
publishers or depend on their servers.

## Music

**Vaporware / Calm Piano 1** — The Cynic Project / cynicmusic.com / pixelsphere.org.

- Publisher and license: https://opengameart.org/content/calm-piano-1-vaporware
- Original download: https://opengameart.org/sites/default/files/003_Vaporware_2.mp3
- Published 2019-05-11; CC0-1.0.
- `vaporware.mp3` is the original, unmodified file. Playback adds a four-second
  linear crossfade between the tail and opening for a smooth repeating loop,
  a two-second initial fade, and reduced background volume.

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

This sound direction uses original free assets. It includes no Minecraft or
C418 recordings.

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
