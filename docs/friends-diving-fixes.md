# Deep-diving recovery and underwater audio fixes

The ocean expansion exposed two legacy depths: CoopSimulation recovered all
non-flight players below -600, and FriendsSwimMovement used -480 when no floor
resolver was available. The host now checks the live water field before fall
recovery. A valid swimmer can occupy the full natural or connected flooded water
column, including the deep ocean; a real fall below that column still recovers.
The swimming fallback uses the shared -4096 world bottom. Recovery explicitly
clears swimming/submerged flags alongside movement state.

Audio immersion uses the shared first-person eye height and live water at the
player's head, rather than swimSubmerged (which also represents dive intent).
Entry requires 1.5 units of head immersion; exit retains the state down to .25
units. The renderer schedules surface swimStroke cues only when surfaced, and
FriendsAudio also suppresses swimStroke/waterStep calls while diving.

Two shared low-pass filters, allocated once per audio context, route the existing
effects and ambience buses. Diving smoothly brings their cutoffs to 850/650 Hz,
with effects/ambience gains at 80%/25% of the user's settings. Music retains its
own bus. The existing dive recording loops continuously; resurfacing restores
clear sound, fades that loop out and retains the delayed inhale. Releasing the
last audio consumer restores the dry mix; disposal releases the filter nodes.
No per-frame filter allocations or new assets are required.

Validation:

- Host and guest tests dive to the actual abyss floor and return to the surface;
  invalid falls and host-only flight permissions still behave normally.
- Audio tests cover cue suppression, routing, wet/dry transitions, settings,
  failed downloads, resurface cancellation and release/re-entry.
- The native browser check decodes the real 2.04-second dive asset, observes the
  wet cutoffs and blocked splash voices, then checks dry cutoffs and the inhale.
  Results: artifacts/dive-fixes/audio-checks.json.
- tools/dive-audio-review.html provides a click-to-enable listening comparison.
