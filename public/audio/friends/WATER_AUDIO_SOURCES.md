# Water movement audio

These recordings were downloaded from Pixabay on 2026-10-09. Pixabay identifies each as free for use under the Pixabay Content License; the creator states that commercial and personal use is permitted and attribution is optional.

| Local file | Recording | Creator and source |
| --- | --- | --- |
| `water_splash_effect.mp3` | Water Splash Effect (443133) | [DRAGON-STUDIO](https://pixabay.com/sound-effects/nature-water-splash-effect-443133/) |
| `splashing_water.mp3` | Splashing Water (443136) | [DRAGON-STUDIO](https://pixabay.com/sound-effects/nature-splashing-water-443136/) |
| `cinematic_dive_underwater.mp3` | Cinematic Dive Underwater (467471) | [DRAGON-STUDIO](https://pixabay.com/sound-effects/cinematic-dive-underwater-467471/) |
| `water_breath_in.mp3` | Inalare (274160) | [Pensieri_Profondi_Scuba](https://pixabay.com/sound-effects/people-inalare-274160/) |

License: [Pixabay Content License](https://pixabay.com/service/license-summary/).

## Continuous submerged loop

`underwater_bubbles_loop.ogg` uses only 0:00–1:00 of [Underwater [Loop] AMB by DCSFX (Freesound)](https://pixabay.com/sound-effects/film-special-effects-underwater-loop-amb-6182/), downloaded 2026-10-10 under the Pixabay Content License. A one-second circular crossfade produces a 59-second loop. Stereo 32 kHz Vorbis q3 reduces the 4.79 MB original to 417 KB; linear normalization targets -23 dBFS RMS with a -6 dBFS peak ceiling. Native pitch is preserved. Reproduce with `tools/import-underwater-loop.py --ffmpeg /path/to/ffmpeg`.

The cinematic dive plays once on submersion; this loop continues until surfacing. The loop follows Effects volume and mute, bypassing the water filter because the recording is already submerged. Surface strokes remain suppressed underwater.
