import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendsHauling } from '../game/multiplayer/FriendsHauling';
import type { HaulingSnapshot } from '../game/multiplayer/FriendsHauling';
import { FRIENDS_HAULING_JOBS } from '../game/world/FriendsHaulingGoal';
import { FriendsHaulingBriefing } from './FriendsHaulingBriefing';
import { HaulingBriefingTracker } from './useFriendsHaulingBriefing';

function tether(h:HaulingSnapshot,cargoId:string,playerId='host'){
  h.ropes=[{id:playerId,cargoId,anchorX:36,anchorY:0,anchorZ:26,length:120,tension:0,blocked:false}];
}
describe('hauling dispatch events',()=>{
  it('opens only for a new local attachment, including switching loads and reattaching',()=>{
    const tracker=new HaulingBriefingTracker(),h=new FriendsHauling().snapshot();
    expect(tracker.observe(h,'host')).toBeUndefined();
    tether(h,'lantern-core','guest');expect(tracker.observe(h,'host')).toBeUndefined();
    tether(h,'lantern-core');expect(tracker.observe(h,'host')).toEqual({cargoId:'lantern-core',kind:'mission'});
    for(let i=0;i<20;i++)expect(tracker.observe(structuredClone(h),'host')).toBeUndefined();
    tether(h,'ridge-core');expect(tracker.observe(h,'host')).toEqual({cargoId:'ridge-core',kind:'mission'});
    h.ropes=[];expect(tracker.observe(h,'host')).toBeUndefined();
    tether(h,'ridge-core');expect(tracker.observe(h,'host')).toEqual({cargoId:'ridge-core',kind:'mission'});
  });
  it('announces new deliveries once, including crew deliveries, without replaying saved progress',()=>{
    const tracker=new HaulingBriefingTracker(),h=new FriendsHauling().snapshot();
    h.completedCargoIds=['lantern-core'];expect(tracker.observe(h,'host')).toBeUndefined();
    h.completedCargoIds.push('ridge-core');expect(tracker.observe(h,'host')).toEqual({cargoId:'ridge-core',kind:'complete'});
    expect(tracker.observe(structuredClone(h),'host')).toBeUndefined();
    tether(h,'ridge-core');expect(tracker.observe(h,'host')).toEqual({cargoId:'ridge-core',kind:'complete'});
    h.completedCargoIds.push('sanctum-core');h.delivered=true;
    expect(tracker.observe(h,'host')).toEqual({cargoId:'sanctum-core',kind:'complete'});
  });
  it('resets on session/player changes and rejects unknown rope targets',()=>{
    const tracker=new HaulingBriefingTracker(),h=new FriendsHauling().snapshot();
    tether(h,'unknown');expect(tracker.observe(h,'host')).toBeUndefined();
    tether(h,'lantern-core');expect(tracker.observe(h,'guest')).toBeUndefined();
    expect(tracker.observe(h,'host')).toEqual({cargoId:'lantern-core',kind:'mission'});
    expect(tracker.observe(undefined,'host')).toBeUndefined();
    expect(tracker.observe(h,'host')).toEqual({cargoId:'lantern-core',kind:'mission'});
  });
});
describe('mission messages',()=>{
  it.each(FRIENDS_HAULING_JOBS)('gives $name its own objective, route advice and persistent dismiss controls',job=>{
    const markup=renderToStaticMarkup(<FriendsHaulingBriefing briefing={{cargoId:job.id,kind:'mission'}} hauling={new FriendsHauling().snapshot()} interactionLabel="F" onClose={()=>{}}/>);
    expect(markup).toContain(job.mission.title);
    expect(markup).toContain(job.mission.objective);
    for(const hint of job.mission.route)expect(markup).toContain(hint);
    expect(markup).toContain('role="dialog"');expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('LET’S HAUL');expect(markup).toContain('Close mission briefing');
  });
  it('points to remaining work after a delivery, and celebrates all three only when finished',()=>{
    const h=new FriendsHauling().snapshot();h.completedCargoIds=['sanctum-core'];
    const render=()=>renderToStaticMarkup(<FriendsHaulingBriefing briefing={{cargoId:'sanctum-core',kind:'complete'}} hauling={h} interactionLabel="F" onClose={()=>{}}/>);
    expect(render()).toContain('Only a Few Centuries Late');expect(render()).toContain('Next dispatch: Bring the Light Home');expect(render()).toContain('1/3 DELIVERED');
    h.completedCargoIds=FRIENDS_HAULING_JOBS.map(j=>j.id);h.delivered=true;
    expect(render()).toContain('All dispatches complete');expect(render()).toContain('3/3 DELIVERED');
  });
});
