# Co-op Owner Control

Co-op administration is independent from hosting. The authoritative host runs
accepted commands, but only a browser holding the owner's private P-256 key can
authorize them. The public verification key ships with the game; the private
recovery code must never be committed, shared, pasted into chat, or installed
on a friend's device.

## Provision the owner's browser

1. Open the game on the owner's browser.
2. Press **Ctrl+Shift+O**.
3. Paste the private owner recovery code into the prompt.
4. Wait for the `Owner identity installed` confirmation.

The imported key is stored in IndexedDB as a non-exportable `CryptoKey`. Clear
site storage only if you intend to remove the credential. Keep the recovery
code offline so the same identity can be restored after clearing browser data
or moving to another personal device.

## Open the console

Join or host a co-op run, then press **F1**. The console is not rendered on
browsers without the owner credential. It remains available while spectating
or while the owner has paused the simulation.

Commands are sent over the reliable WebRTC channel. Guest commands are signed
with the private key and bound to the current host session, timestamp, and a
monotonic sequence. Hosts reject invalid, expired, mismatched, and replayed
requests before parsing the command.

## Commands

```text
help
players
status
announce <message>
pause
resume
restart
kick <target> [reason]
heal <target> [amount|full]
revive <target>
redeploy <target>
give <target> <credits|cores|ammo|fabricator|selfrevive> <amount|full>
teleport <target> <me|center|target>
spawn <enemy-type> [count] [near-target]
killall
```

Targets can be `me`, `all`, `alive`, `downed`, `@callsign`, or `#player-id`.
Calls are bounded by the simulation: a spawn command creates no more than 40
enemies and never exceeds the normal global enemy capacity.

Gameplay mutations mark the authoritative snapshot as a **modified run**.
Every peer sees that state, and co-op Imprint/career settlement is skipped for
the run. Inspection, announcements, pause/resume, restart, and moderation do
not by themselves modify progression eligibility.

## Security boundary

The signed-owner design prevents ordinary peers from manufacturing owner
commands, even when one of those peers is hosting. A person who deliberately
modifies the host game's source can still change or ignore its local
authoritative simulation; preventing that requires a dedicated server rather
than peer hosting.
