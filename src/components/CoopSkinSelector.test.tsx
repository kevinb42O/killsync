import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoopSkinSelector } from './CoopSkinSelector';

describe('CoopSkinSelector', () => {
  it('renders six immediately selectable classes and marks the two elite chassis', () => {
    const markup = renderToStaticMarkup(<CoopSkinSelector value="black_ice" language="en" onChange={() => undefined} />);
    expect(markup.match(/<button/g)).toHaveLength(6);
    expect(markup.match(/Elite chassis/g)).toHaveLength(2);
    expect(markup).toContain('Six classes available');
    expect(markup).toContain('Cryowarden');
    expect(markup).toContain('Winterglass Projector');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('disabled=""');
  });

  it('localizes the selector framing in Russian', () => {
    const markup = renderToStaticMarkup(<CoopSkinSelector value="neon_vanguard" language="ru" onChange={() => undefined} />);
    expect(markup).toContain('Класс бойца');
    expect(markup).toContain('Доступно шесть классов');
    expect(markup).toContain('Элитное шасси');
    expect(markup).toContain('Призыватель бури');
    expect(markup).toContain('Проводник бури');
  });
});
