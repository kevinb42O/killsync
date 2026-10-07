import { type RailAlignment } from './FriendsRailAlignment';
export type RailwaySection={start:number;end:number};
/** Refine both ends of each engineering section. This makes portals, linings,
 * abutments and approach details agree at the same chainage. */
export function surveyRailwaySections(route:RailAlignment,predicate:(distance:number)=>boolean,mergeGap=0):RailwaySection[]{
  const sections:RailwaySection[]=[];let start:number|undefined,previous=predicate(0),previousDistance=0;if(previous)start=0;
  for(let distance=32;distance<=route.length;distance=Math.min(route.length,distance+32)){
    const inside=predicate(distance);
    if(inside!==previous){let lo=previousDistance,hi=distance;for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(predicate(mid)===previous)lo=mid;else hi=mid;}const boundary=(lo+hi)/2;
      if(inside)start=boundary;else if(start!==undefined){sections.push({start,end:boundary});start=undefined;}
    }
    previous=inside;previousDistance=distance;if(distance===route.length)break;
  }
  if(start!==undefined)sections.push({start,end:route.length});
  const merged:RailwaySection[]=[];
  for(const section of sections){const last=merged.at(-1);if(last&&section.start-last.end<=mergeGap)last.end=section.end;else merged.push({...section});}
  return merged;
}
export function sectionContains(sections:readonly RailwaySection[],distance:number){return sections.some(s=>distance>=s.start&&distance<=s.end);}
