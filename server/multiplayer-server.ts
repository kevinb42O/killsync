import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMultiplayerRouter } from './multiplayerSignaling';

const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use(express.json({ limit: '64kb' }));
app.use('/api/multiplayer', createMultiplayerRouter());
app.use(express.static(path.join(root, 'dist')));
app.get('*', (_, response) => response.sendFile(path.join(root, 'dist', 'index.html')));
app.listen(Number(process.env.PORT) || 3000, () => console.log('Multiplayer server listening.'));
