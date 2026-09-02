import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import express from 'express';
import { createMultiplayerRouter } from './server/multiplayerSignaling';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), {
      name: 'multiplayer-lobby-service',
      configureServer(server) {
        // Vite's Connect responses do not have Express's `json`/`status`
        // helpers. Wrap the router in an Express app before mounting it.
        const multiplayerApp = express();
        multiplayerApp.use(express.json({ limit: '64kb' }));
        multiplayerApp.use(createMultiplayerRouter());
        server.middlewares.use('/api/multiplayer', multiplayerApp);
      },
    }],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
