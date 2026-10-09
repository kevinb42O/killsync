import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FriendsDevMenu } from './FriendsDevMenu';
import { FriendsEnvironmentPreview } from '../game/world/FriendsEnvironmentPreview';
describe('Frontier development menu',()=>{
  it('exposes flight, exact time, pause, cycle speed, wind and reset in one focused dialog',()=>{
    const preview=new FriendsEnvironmentPreview();preview.time(0);preview.change({hour:18,speed:0});
    const markup=renderToStaticMarkup(<FriendsDevMenu environment={preview.state} guestsCanBuild onGuestAccess={()=>{}} flight onFlight={()=>{}} onChange={()=>{}} onClose={()=>{}}/>);
    for(const text of ['Frontier developer settings','Guest permissions','Friends can build','Flight enabled','18:00','Exact time','Cycle speed','Paused','120×','Cloud wind','Reset environment','C / Esc'])expect(markup).toContain(text);
    expect(markup).toContain('aria-modal="true"');expect(markup).toContain('aria-pressed="true"');expect(markup).toContain('Local time override active');
  });
});
