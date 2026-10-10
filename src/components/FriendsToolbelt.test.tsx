import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from '../game/multiplayer/FriendsSimulation';
import { FriendsToolbelt } from './FriendsFieldPack';
import { FriendsHUD } from './FriendsHUD';

describe('transient Friends tool bar',()=>{
  it('shows one shovel with both actions and updates Combat/Rope shortcuts',()=>{
    const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot();
    const html=renderToStaticMarkup(<FriendsToolbelt frontier={snapshot.friends!.frontier!} player={snapshot.players[0]} tool={3} elapsed={0} onTool={()=>{}} onPack={()=>{}}/>);
    expect(html).not.toContain('Earthwork');
    expect(html.match(/<span>Shovel<\/span>/g)).toHaveLength(1);
    expect(html).toContain('Right-click places soil');
    expect(html).toMatch(/<kbd>5<\/kbd>(?:(?!<\/button>).)*<span>Combat<\/span>/);
    expect(html).toMatch(/<kbd>6<\/kbd>(?:(?!<\/button>).)*<span>Rope<\/span>/);
  });
  it('removes hidden controls from focus and accessibility while keeping action feedback available',()=>{
    const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot(),frontier=snapshot.friends!.frontier!,player=snapshot.players[0];
    frontier.feedback.host={message:'Harvest collected',until:1000};
    const html=renderToStaticMarkup(<FriendsToolbelt frontier={frontier} player={player} tool={5} visible={false} elapsed={0} onTool={()=>{}} onPack={()=>{}}/>);
    expect(html).toContain('data-visible="false"');expect(html).toContain('aria-hidden="true"');expect(html).toContain('inert=""');
    expect(html).not.toContain('Harvest collected');
    for (const visible of [false, true]) {
      const hud=renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={player} interactionLabel="F" toolbeltVisible={visible}/>);
      expect(hud).toContain('<div class="frontier-feedback" role="status">Harvest collected</div>');
      expect(hud).toContain(`data-toolbelt-visible="${visible}"`);
      expect(hud).not.toContain('aria-hidden="true"'); expect(hud).not.toContain('inert=""');
    }
    const shown=renderToStaticMarkup(<FriendsToolbelt frontier={frontier} player={player} tool={5} visible elapsed={0} onTool={()=>{}} onPack={()=>{}}/>);
    expect(shown).toContain('aria-hidden="false"');expect(shown).not.toContain('inert=""');
  });
  it('only shows unexpired action feedback for the local player',()=>{
    const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot();
    snapshot.friends!.frontier!.feedback.host={message:'Harvest collected',until:1000};
    snapshot.friends!.frontier!.feedback.guest={message:'Guest harvest',until:2000};
    snapshot.elapsedMs=1000;
    const html=renderToStaticMarkup(<FriendsHUD snapshot={snapshot} player={snapshot.players[0]} interactionLabel="F"/>);
    expect(html).not.toContain('Harvest collected'); expect(html).not.toContain('Guest harvest');
  });
});
