import { describe,it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FriendsFunBar } from './FriendsFunBar';
const actions={onStone:()=>{},onSeeds:()=>{},onMarshmallow:()=>{},onConfetti:()=>{},onDynamite:()=>{},onGlider:()=>{},onClose:()=>{}};
describe('Fun-bar glider selection',()=>{
  it('offers the sixth slot with a selected equipment indicator',()=>{
    const html=renderToStaticMarkup(<FriendsFunBar {...actions} visible tool={13}/>);
    expect(html).toMatch(/aria-label="Glider" aria-pressed="true" data-tool="13"/);
    expect(html).toContain('<kbd>6</kbd>');expect(html).not.toContain('Equip wing');
  });
  it('disables equipment changes in flight and explains why',()=>{
    const html=renderToStaticMarkup(<FriendsFunBar {...actions} visible tool={13} equipmentLocked/>);
    expect(html.match(/disabled=""/g)).toHaveLength(7);
    expect(html).toContain('Land before changing flight equipment');
  });
});
