import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoopImprintSummary } from './CoopImprintSummary';

describe('CoopImprintSummary', () => {
  it('shows the deployed generation, rating, points, and every stat before launch', () => {
    const markup = renderToStaticMarkup(<CoopImprintSummary language="en" onUpgrade={() => undefined} imprint={{
      operatorId: 'phantom', generation: 7, unspentPoints: 3, successfulExtractions: 5, highestDepth: 4,
      ranks: { power: 2, vitality: 1, mobility: 1, handling: 0, reach: 1 },
    }} />);
    expect(markup).toContain('Generation 07');
    expect(markup).toContain('Choose your initial specialization before deployment');
    expect(markup).toContain('Calibration available: 3');
    expect(markup).toContain('+4% damage');
    expect(markup.match(/<button/g)).toHaveLength(5);
    expect(markup).toContain('A total squad wipe resets these combat ranks');
    for (const stat of ['Power', 'Vitality', 'Mobility', 'Handling', 'Reach']) expect(markup).toContain(stat);
  });

  it('renders the complete Imprint card in Russian without English stat leakage', () => {
    const markup = renderToStaticMarkup(<CoopImprintSummary language="ru" imprint={{
      operatorId: 'phantom', generation: 2, unspentPoints: 1, successfulExtractions: 1, highestDepth: 2,
      ranks: { power: 1, vitality: 1, mobility: 0, handling: 0, reach: 0 },
    }} />);
    for (const text of ['Отпечаток оператора', 'Поколение 02', 'Мощь', 'Живучесть', 'Мобильность', 'Обращение', 'Радиус']) expect(markup).toContain(text);
    for (const leak of ['Power', 'Vitality', 'Mobility', 'Handling', 'Reach', 'Operator Imprint']) expect(markup).not.toContain(leak);
  });

  it('explains when allocation is locked after connecting to a squad', () => {
    const markup = renderToStaticMarkup(<CoopImprintSummary language="en" locked onUpgrade={() => undefined} imprint={{
      operatorId: 'phantom', generation: 1, unspentPoints: 1, successfulExtractions: 0, highestDepth: 0,
      ranks: { power: 0, vitality: 0, mobility: 0, handling: 0, reach: 0 },
    }} />);
    expect(markup).toContain('Allocation locked while connected to a squad');
    expect(markup.match(/disabled=""/g)).toHaveLength(5);
  });

  it('directs a spent operator toward extraction instead of asking for an impossible choice', () => {
    const markup = renderToStaticMarkup(<CoopImprintSummary language="en" onUpgrade={() => undefined} imprint={{
      operatorId: 'phantom', generation: 1, unspentPoints: 0, successfulExtractions: 0, highestDepth: 0,
      ranks: { power: 1, vitality: 0, mobility: 0, handling: 0, reach: 0 },
    }} />);
    expect(markup).toContain('Extract Data Cores to earn more Calibration Points');
    expect(markup).not.toContain('Choose your initial specialization');
  });
});
