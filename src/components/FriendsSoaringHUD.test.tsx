import { describe,it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FriendsSoaringHUD } from './FriendsSoaringHUD';
import { createSoaringState } from '../game/multiplayer/FriendsSoaring';
import type { CoopPlayerSnapshot } from '../game/multiplayer/CoopSimulation';
const pilot={lifeState:'alive',angle:0,z:1200,friendsSoaring:{...createSoaringState(0),phase:'flying',inflation:1,climb:1.2,airspeed:9.5,agl:100}} as CoopPlayerSnapshot;
const render=(player=pilot,equipped=true)=>renderToStaticMarkup(<FriendsSoaringHUD player={player} equipped={equipped} timeMs={0}/>);
describe('compact flight instruments',()=>{
  it('shows only essential readings during normal flight',()=>{
    const html=render();expect(html).toContain('+1.2');expect(html).toContain('34');expect(html).toContain('m AGL');
    expect(html.match(/<strong>/g)).toHaveLength(3);expect(html).not.toContain('role="status"');
    for(const clutter of ['Wing sink','altitude','SOARING','look freely','search for lift','arrow shows'])expect(html).not.toContain(clutter);
  });
  it('shows a short recovery cue only while needed and disappears after stowing',()=>{
    expect(render({...pilot,friendsSoaring:{...pilot.friendsSoaring!,phase:'collapsed'}})).toContain('Release brake');
    expect(render({...pilot,friendsSoaring:undefined},false)).toBe('');
  });
});
