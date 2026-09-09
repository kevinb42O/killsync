<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

**Current game version:** v0.1.0

**Multiplayer protocol:** 30 (all players must run the same version)

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4f35457b-60aa-4227-a2dc-e6c714a217c7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Public co-op squads

For local multiplayer testing without a second browser or another player,
choose **Initialize Run** on the main menu. It opens a local-only deployment
screen where you can choose a callsign, operator class, Imprint allocation, and
unlocked world before starting the one-player co-op simulation. This path does
not browse, create, or join a lobby and does not perform WebRTC signaling. The
**Multiplayer** screen continues to provide the public and direct squad flows.
**Host public squad** can also start with one player; direct hosting offers
**Start match solo** after creating its connection offer.

See [MULTIPLAYER_AUDIT.md](MULTIPLAYER_AUDIT.md) for the audit, implemented fixes,
verification results, and prioritized follow-up work. Multiplayer protocol 30
requires every squad member to reload after updating.

The **Co-op squads** menu lists live public lobbies and connects players with a
single click. The lobby service only carries room metadata and short-lived
WebRTC offers/answers; combat traffic stays on the peer connection.

For a production deployment, serve the built app and lobby service together:

1. `npm run build`
2. `npm run serve:multiplayer`

Set `TURN_URLS` and `TURN_SHARED_SECRET` on that server (and the same
`static-auth-secret` in coturn) to make expiring TURN relay fallback available
for restrictive home, work, or school networks.
If the lobby service is hosted separately, set `VITE_MULTIPLAYER_SIGNALING_URL`
at build time to its public origin. Never put TURN credentials in a `VITE_`
variable: the service returns them through its server-side ICE configuration endpoint.

The bundled signaling store is intentionally single-process. The server refuses
`WEB_CONCURRENCY > 1` unless deployment explicitly declares a shared room store
and sticky routing with `MULTIPLAYER_SHARED_ROOM_STORE=true`.

## Co-op owner control

Co-op includes a cryptographically authenticated owner console whose authority
is independent from the host role. See [COOP_OWNER_ADMIN.md](COOP_OWNER_ADMIN.md)
for private-browser provisioning, console controls, commands, modified-run
rules, and the peer-host security boundary.
