<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

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

For local multiplayer testing without a second browser or another player, open
**Multiplayer**, enter your name, and choose **Solo test**. This runs the same
co-op simulation without a signaling server or connection-code exchange.
**Host public squad** can also start with one player; direct hosting offers
**Start match solo** after creating its connection offer.

See [MULTIPLAYER_AUDIT.md](MULTIPLAYER_AUDIT.md) for the audit, implemented fixes,
verification results, and prioritized follow-up work. Multiplayer protocol 11
requires both peers to reload after updating.

The **Co-op squads** menu lists live public lobbies and connects players with a
single click. The lobby service only carries room metadata and short-lived
WebRTC offers/answers; combat traffic stays on the peer connection.

For a production deployment, serve the built app and lobby service together:

1. `npm run build`
2. `npm run serve:multiplayer`

Set `TURN_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL` on that server to make
TURN relay fallback available for restrictive home, work, or school networks.
If the lobby service is hosted separately, set `VITE_MULTIPLAYER_SIGNALING_URL`
at build time to its public origin. Never put TURN credentials in a `VITE_`
variable: the service returns them through its server-side ICE configuration endpoint.
