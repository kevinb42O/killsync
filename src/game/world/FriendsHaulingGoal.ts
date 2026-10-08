import { FRIENDS_SPAWN_PLATFORM, FRIENDS_HAULING_PLATFORMS } from './FriendsTerrain';

/** Bring the distant salvage home to the existing spawn deck. */
export const FRIENDS_DELIVERY_BAY = {
  id: 'delivery-bay', name: 'DELIVERY BAY',
  x: FRIENDS_SPAWN_PLATFORM.x - 16, y: FRIENDS_SPAWN_PLATFORM.y,
  z: FRIENDS_SPAWN_PLATFORM.top, width: 160, depth: 160,
  color: '#a5f279',
} as const;

export type HaulingGoal={id:string;name:string;x:number;y:number;z:number;width:number;depth:number;color:string};
/** Every load carries a dispatch, a distinct destination and a route challenge. */
export const FRIENDS_HAULING_JOBS = [
  {
    id:'lantern-core',name:'Lantern core',number:1,pickup:{...FRIENDS_HAULING_PLATFORMS[0],name:'LANTERN CLEARING'},goal:FRIENDS_DELIVERY_BAY,
    mission:{
      title:'Bring the Light Home',issuer:'Edda · Sunline dockmaster',difficulty:'FIRST HAUL',
      dispatch:'Good news: we found a working Lantern core. Bad news: it has the athletic ability of a brick. You’re its legs now.',
      objective:'Bring the Lantern core to the green Delivery Bay on the spawn deck.',
      route:['Follow the green compass home. Pick a gentle line through the hills; build ramps across awkward ledges.', 'Walk to pull. Hold aim to reel, and stand still on solid ground when you need a stronger winch.', 'Park the whole core in the green square, release the rope, let it settle, then deliver it.'],
      completionTitle:'Home Has a Heartbeat',completion:'One very stubborn lump of machinery, safely home. The dock crew owes you a warm drink. The castle keeper has a bigger favour in mind.',
    },
  },
  {
    id:'ridge-core',name:'Watchfire core',number:2,pickup:{...FRIENDS_HAULING_PLATFORMS[1],name:'RIDGE STAGING'},
    goal:{id:'castle-delivery',name:'CASTLE COURTYARD',x:18304,y:13248,z:4448,width:160,depth:160,color:'#83d9f2'},
    mission:{
      title:'A Light for the Crown',issuer:'Keeper Rowan · Highfall Castle',difficulty:'MOUNTAIN ASCENT',
      dispatch:'Highfall’s watchfire needs a new core. The castle has a magnificent view and approximately a million stairs. You get to enjoy both. The core gets the scenic route.',
      objective:'Haul the Watchfire core up to Highfall Castle. Deliver it to the blue bay in the courtyard, just inside the south gate.',
      route:['Your atlas marks STAIRWAY START on the eastern ridge. Reach the broad stone viaduct there, then follow its sweeping stairway uphill.', 'Stay ahead of the core on the climb. Use the powered reel from solid ground, and take the broad turns slowly.', 'Pass between the torches at the south gate. Park inside the blue courtyard square and let the core settle before delivering.'],
      completionTitle:'Special Delivery · Altitude Included',completion:'The Watchfire core is inside Highfall Castle. Every stair, every turn, every metre uphill: your crew earned this view.',
    },
  },
  {
    id:'sanctum-core',name:'Sanctum core',number:3,pickup:{...FRIENDS_HAULING_PLATFORMS[2],name:'SUNLINE FREIGHT YARD'},
    goal:{id:'sanctum-delivery',name:'TIDAL SANCTUM BAY',x:27008,y:19568,z:352,width:128,depth:128,color:'#d5afff'},
    mission:{
      title:'Return to Sender',issuer:'Mira · Tidal archivist',difficulty:'LONG HAUL · RUIN STEPS',
      dispatch:'This core belongs to the ancient ocean gateway. Someone “borrowed” it centuries ago. Consider this the island’s most overdue return.',
      objective:'Take the Sanctum core across the island to the Tidal Sanctum. Deliver it to the purple bay at the top of the monument’s south stairs.',
      route:['Collect the core at the freight yard south of Sunline Commons. Survey the route to the eastern ocean monument; a train or aircraft can help with the long haul.', 'The monument’s south face has a narrow stone stairway. Keep the core centred, reel from above, and build a ramp if a ledge needs help.', 'Leave the core fully inside the purple square on the upper terrace. Let it settle, then deliver it.'],
      completionTitle:'Only a Few Centuries Late',completion:'The Sanctum core is back on its terrace. The archivist has waived the late fee. Mostly because nobody could count that high.',
    },
  },
] as const;
export function haulingJob(cargo:{id:string}){return FRIENDS_HAULING_JOBS.find(job=>job.id===cargo.id)??FRIENDS_HAULING_JOBS[0];}
export function haulingGoal(cargo:{id:string}):HaulingGoal{return haulingJob(cargo).goal;}
export function haulingPickup(cargo:{id:string}){const p=haulingJob(cargo).pickup;return {x:p.x,y:p.y,z:p.top};}
export function cargoDelivered(hauling:{delivered:boolean;completedCargoIds?:readonly string[]},cargo:{id:string}){
  return hauling.delivered||Boolean(hauling.completedCargoIds?.includes(cargo.id));
}
