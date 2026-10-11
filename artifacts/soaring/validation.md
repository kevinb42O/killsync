# Soaring verification — 11 October 2026

- `soaring-tests.log`: 28 tests passed across flight/weather, real-terrain launch
  and guest prediction, visual geometry/lifecycle, and shared environment tests.
- `regression-tests.log`: 102 tests passed across existing prediction,
  swimming, developer flight, interpolation, Friends audio, expedition and
  fishing-boat behavior, using two workers to avoid full-suite resource contention.
- `browser-report.json`: production renderer captures in forward, wing-up,
  crew and volcanic views; three glider rigs; finite camera; no page/console
  errors; zero WebGL error for each capture after initialization. Interactive
  foot launch passed.
- `arena-report.json`: real MultiplayerArena UI passed L equip, button stow,
  second equip and downhill launch. First-person wing present and default
  hands hidden. No page errors.
- `network-report.json`: six actual WebRTC checks passed, including guest
  launch, late-join equipment state, independent wing heading, and trimmed
  flight after stale input. No transport errors.
- `lint.log`: TypeScript check passed.
- `build.log`: production build passed, with the existing large-chunk warning.
- `git diff --check`: passed.

The first unrestricted full-suite run reported 2,019 passing and 21 failing tests.
Seventeen failures were timeouts under parallel load; the focused movement/audio/
expedition regression rerun passed. Two ocean assertions were reproduced in a
throwaway copy using the original pre-soaring movement controller (see
`baseline-failures.log`). Cave-route failures in the initial broad run did not
reproduce in that copy of the current checkout. The shared checkout also contains
other ongoing changes; the complete repository suite is not claimed to be green.
