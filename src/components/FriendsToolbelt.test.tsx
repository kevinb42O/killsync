import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from '../game/multiplayer/FriendsSimulation';
import { FriendsToolbelt } from './FriendsFieldPack';

describe('transient Friends tool bar',()=>{
  it('removes hidden controls from focus and accessibility while keeping action feedback available',()=>{
    const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot(),frontier=snapshot.friends!.frontier!,player=snapshot.players[0];
    frontier.feedback.host={message:'Harvest collected',until:1000};
    const html=renderToStaticMarkup(<FriendsToolbelt frontier={frontier} player={player} tool={5} visible={false} elapsed={0} onTool={()=>{}} onPack={()=>{}}/>);
    expect(html).toContain('data-visible="false"');expect(html).toContain('aria-hidden="true"');expect(html).toContain('inert=""');
    expect(html).toContain('Harvest collected');
    const shown=renderToStaticMarkup(<FriendsToolbelt frontier={frontier} player={player} tool={5} visible elapsed={0} onTool={()=>{}} onPack={()=>{}}/>);
    expect(shown).toContain('aria-hidden="false"');expect(shown).not.toContain('inert=""');
  });
});
