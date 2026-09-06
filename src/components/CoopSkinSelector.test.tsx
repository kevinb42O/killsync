import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoopSkinSelector } from './CoopSkinSelector';

describe('CoopSkinSelector', () => {
  it('renders six immediately selectable skins and marks the two premium finishes', () => {
    const markup = renderToStaticMarkup(<CoopSkinSelector value="black_ice" language="en" onChange={() => undefined} />);
    expect(markup.match(/<button/g)).toHaveLength(6);
    expect(markup.match(/Premium/g)).toHaveLength(2);
    expect(markup).toContain('All unlocked');
    expect(markup).toContain('Black Ice');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('disabled=""');
  });

  it('localizes the selector framing in Russian', () => {
    const markup = renderToStaticMarkup(<CoopSkinSelector value="neon_vanguard" language="ru" onChange={() => undefined} />);
    expect(markup).toContain('Облик бойца');
    expect(markup).toContain('Все доступны');
    expect(markup).toContain('Премиум');
    expect(markup).toContain('Полуночная броня');
    expect(markup).not.toContain('Midnight armor');
  });
});
