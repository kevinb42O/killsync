import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RealityBreachHUD } from './RealityBreachHUD';
import type { CoopRealityBreachSnapshot } from '../game/multiplayer/CoopRealityBreach';

const breach: CoopRealityBreachSnapshot = { cycle: 1, phase: 'linking', x: 6000, y: 6000,
  anchors: [{ id: 1, x: 6200, y: 6000 }], requiredAnchors: 1, linkedAnchors: 0,
  progressMs: 2000, remainingMs: 48_000, reward: 160 };

describe('Reality Breach instructions', () => {
  it('explains the actual solo requirement and exposes accessible synchronization progress', () => {
    const html = renderToStaticMarkup(<RealityBreachHUD breach={breach} language="en" />);
    expect(html).toContain('1 operator on separate rings');
    expect(html).toContain('Linked anchors burn crossing enemies');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain('48s');
  });

  it('shows the outcome reward, localizes Russian, and omits obsolete anchors after resolution', () => {
    const html = renderToStaticMarkup(<RealityBreachHUD breach={{ ...breach, phase: 'overdrive' }} language="en" />);
    expect(html).toContain('+¤ 160 each');
    expect(html).not.toContain('breach-hud__anchors');
    const ru = renderToStaticMarkup(<RealityBreachHUD breach={{ ...breach, phase: 'surge' }} language="ru" />);
    expect(ru).toContain('ВРАЖДЕБНЫЙ ИМПУЛЬС');
    expect(renderToStaticMarkup(<RealityBreachHUD language="en" />)).toBe('');
  });
});
