import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BUILD_TOOLBAR } from '../game/multiplayer/FriendsBuildControls';
import { FRIENDS_BUILD_CATALOG } from '../game/multiplayer/FriendsBuilding';
import { FriendsBuildPalette } from './FriendsBuildPalette';

const props = {
  shape: 'block' as const, finish: 'stone' as const, toolbar: DEFAULT_BUILD_TOOLBAR, rotation: 0,
  expanded: false, message: null, placementHint: 'Ready to build', saveStatus: 'Saved locally', host: true, moving: false,
  onShape: () => {}, onFinish: () => {}, onAssign: () => {}, onExpand: () => {}, onAction: () => {},
  onTrainAction: () => {}, onExport: () => {}, onImport: () => {},
};

describe('compact construction bar', () => {
  it('provides exactly eight named, draggable shortcuts with a selected slot', () => {
    const html = renderToStaticMarkup(<FriendsBuildPalette {...props} />);
    expect(html.match(/aria-label="Slot \d:/g)).toHaveLength(8);
    expect(html.match(/draggable="true"/g)).toHaveLength(8);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).not.toContain('build-system__header');
    expect(html).not.toContain('build-key-guide');
    expect(html).toContain('Open construction library');
  });
  it('removes idle slots from accessibility and focus and hides the idle placement hint', () => {
    const html = renderToStaticMarkup(<FriendsBuildPalette {...props} visible={false} message="Gather materials" />);
    expect(html).toContain('data-visible="false"');
    expect(html).toContain('aria-hidden="true" inert=""');
    expect(html).not.toContain('role="status"');
    const shown = renderToStaticMarkup(<FriendsBuildPalette {...props} message="Gather materials" />);
    expect(shown).toContain('role="status">Gather materials');
  });
  it('keeps the library accessible while idle and provides drag and keyboard assignment', () => {
    const html = renderToStaticMarkup(<FriendsBuildPalette {...props} expanded visible={false} />);
    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(html).not.toContain('inert=""');
    expect(html).toContain('Search construction pieces');
    expect(html).toContain(`Assign ${FRIENDS_BUILD_CATALOG.block.name} to slot 1`);
    expect(html.match(/draggable="true"/g)!.length).toBeGreaterThan(8);
  });
});
