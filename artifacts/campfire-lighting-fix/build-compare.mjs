import { build, preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = process.cwd();
const original = await readFile(resolve(root, 'artifacts/campfire-lighting-fix/FriendsCampfire.before.ts.txt'), 'utf8');
for (const variant of ['before', 'after']) {
  await build({
    root,
    plugins: variant === 'before' ? [{
      name: 'original-campfire-control', enforce: 'pre',
      load(id) { if (id === resolve(root, 'src/game/rendering/FriendsCampfire.ts')) return original; },
    }] : [],
    build: { outDir: `/tmp/killsync-campfire-${variant}`, emptyOutDir: true },
  });
}
for (const [variant, port] of [['before', 3031], ['after', 3032]]) {
  await preview({ root, build: { outDir: `/tmp/killsync-campfire-${variant}` }, preview: { host: '127.0.0.1', port, strictPort: true } });
  console.log(`${variant}: http://127.0.0.1:${port}`);
}
