import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3014';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__fall-overlay-test.html', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>',
  }));
  await page.goto(origin + '/__fall-overlay-test.html');
  await page.evaluate(async () => {
    const refresh = await import('/@react-refresh');
    refresh.default.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const { default: { createElement, StrictMode } } = await import('/node_modules/.vite/deps/react.js');
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { CinematicVignetteOverlay } = await import('/src/components/CinematicVignetteOverlay.tsx');
    const root = createRoot(document.getElementById('root'));
    window.renderHit = lastHitTime => root.render(createElement(StrictMode, null,
      createElement(CinematicVignetteOverlay, { lastHitTime })));
    window.flashOpacity = () => [...document.querySelectorAll('#root div')]
      .find(node => node.style.background.includes('239, 68, 68'))?.style.opacity;
    window.renderHit(0);
  });
  const render = async value => { await page.evaluate(value => window.renderHit(value), value); };
  const opacity = async value => { await page.waitForFunction(value => window.flashOpacity() === value, value); };
  await opacity('0');
  await render(1); await opacity('0.65');
  await page.waitForTimeout(50);
  await render(2); await opacity('0.65');
  await page.waitForTimeout(30);
  await render(0); await opacity('0');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.flashOpacity()), '0', 'clearing a recent hit must not leave a permanent red overlay');
  // The arena reuses 1 after clearing its nullable hit counter.
  await render(1); await opacity('0.65');
  await opacity('0');
  await render(0); await opacity('0');
  await render(1); await opacity('0.65');
  await opacity('0');
  assert.deepEqual(errors, []);
  console.log('PASS: rapid impacts clear, reused hit counters flash again, and every flash expires under React StrictMode.');
} finally {
  await browser.close();
}
