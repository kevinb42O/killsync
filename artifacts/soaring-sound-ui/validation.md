# Soaring sound, compact HUD, and connected brake cords

- 88 targeted tests passed across audio, HUD, geometry, flight physics and shared simulation.
- TypeScript type check passed; production build passed (existing large-chunk advisory).
- Browser review: forward hands visible, overhead canopy and cords visible, crew rigs, braking, desktop and phone HUD dimensions, both phone grips visible, trusted audio activation and complete mute cleanup. No page errors.
- Instrument strip: 236 × 40 px desktop; 208 × 36 px phone.
- Production Friends Arena: Fun slot 6 equips, Stone stows, slot 6 relaunches, flying locks equipment, default weapon arms disappear. Desktop and touch browser checks passed.
- Actual audio engine offline-rendered to `flight-audio-preview.wav`: 14 seconds, peak 0.190 (well below clipping). Sequence: ordinary trim air rush, weak lift, strong lift, significant sink, recovery warning, trim.
- Full suite: 2,096 passed; four timeout failures in FriendsHaulingTraversal and FriendsCastleCargo. All nine tests in those two files passed serially on recheck with a 30-second default timeout (castle retains its explicit timeout). Detailed logs are saved beside this report. No cargo implementation or timeout configuration was changed.

Wind source and processing hashes: `public/audio/friends/soaring-sources.json`. Cloth recording credits: `public/audio/friends/CREDITS.md`. Vario is original Web Audio synthesis.
