import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from '../game/multiplayer/FriendsSimulation';
import { FriendsToolbelt } from './FriendsFieldPack';

describe('transient Friends tool bar',()=>{
  it('shows one shovel with both actions and updates Combat/Rope shortcuts',()=>{
    const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot();
    const html=renderToStaticMarkup(<FriendsToolbelt frontier={snapshot.friends!.frontier!} player={snapshot.players[0]} tool={3} elapsed={0} onTool={()=>{}} onPack={()=>{}}/>);
    expect(html).not.toContain('Earthwork');
    expect(html.match(/<span>Shovel<\/span>/g)).toHaveLength(1);
    expect(html).toContain('Right-click places soil');
    expect(html).toMatch(/<kbd>4<\/kbd>.*?<span>Combat<\/span>/);
    expect(html).toMatch(/<kbd>5<\/kbd>.*?<span>Rope<\/span>/);
  });
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
