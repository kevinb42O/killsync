import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SoloRunSetup } from './SoloRunSetup';

describe('SoloRunSetup', () => {
  it('offers run configuration and deployment without any lobby controls', () => {
    const markup = renderToStaticMarkup(
      <SoloRunSetup onClose={() => undefined} onLaunch={() => undefined} />,
    );

    expect(markup).toContain('KILLSYNC SOLO');
    expect(markup).toContain('Operator Class');
    expect(markup).toContain('Operator Imprint');
    expect(markup).toContain('Deployment world');
    expect(markup).toContain('Deploy Solo');
    expect(markup).toContain('No lobby will be created');
    expect(markup).not.toContain('Host Public Squad');
    expect(markup).not.toContain('Live Squad Frequencies');
    expect(markup).not.toContain('room code');
    expect(markup).not.toContain('Peer-to-Peer WebRTC');
  });
});
