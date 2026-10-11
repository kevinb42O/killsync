import type { IslandStoneBox } from './FriendsIsland';

/** The delivery terrace is a saved mission coordinate. Keep its centre lane
 * and elevation stable when changing the architecture around it. */
export const TIDAL_SANCTUM = { x:27008, y:19456, terrace:352 } as const;

export function sanctumTerrainHeight(x:number,y:number,ground:number){
  const s=TIDAL_SANCTUM;
  const edge=Math.max(Math.abs(x-s.x)-640,Math.abs(y-s.y-128)-896);
  if(edge>=384)return ground;
  const t=Math.max(0,edge/384),blend=t*t*(3-2*t);
  // Cut the hillside out of the sanctuary, retaining the natural shore below.
  return Math.min(ground,128+(Math.max(128,ground)-128)*blend);
}

export function createTidalSanctum():IslandStoneBox[]{
  const s=TIDAL_SANCTUM,boxes:IslandStoneBox[]=[];
  const box=(dx:number,dy:number,z:number,w:number,d:number,h:number,tint:IslandStoneBox['tint']='stone')=>{
    const snap=(n:number)=>Math.round(n/32)*32;
    boxes.push({x:snap(s.x+dx-w/2)+w/2,y:snap(s.y+dy-d/2)+d/2,z,w,d,h,tint});
  };
  // Three broad plinth courses, with a continuous working terrace above.
  box(0,0,-64,1280,1152,192,'dark');
  box(0,0,128,1216,1088,96);
  box(0,0,224,1088,960,96);
  box(0,0,320,1024,896,32);
  // Supported south stairs, 320 wide so the core can be hauled between rails.
  for(let i=0;i<7;i++){
    const top=160+i*32,dy=864-i*64;
    box(0,dy,64,320,64,top-64);
    for(const dx of [-192,192])box(dx,dy,64,64,64,top);
  }
  // Low parapets leave both the stair entrance and the ocean outlook open.
  for(const dx of [-480,480])box(dx,0,352,64,896,64);
  for(const dx of [-336,336])box(dx,416,352,224,64,64);
  // Paired side colonnades, each with sculpted bases, slender shafts and caps.
  for(const dx of [-352,352])for(const dy of [-320,-64,192]){
    box(dx,dy,352,160,160,64);
    box(dx,dy,416,96,96,384);
    box(dx,dy,800,128,128,32,'copper');
    box(dx,dy,832,160,160,64);
  }
  for(const dx of [-352,352])box(dx,-64,896,160,672,64);
  // A high faceted arch frames the sea and sky instead of an incomplete lintel.
  const gatewayY=-224;
  for(const dx of [-192,192]){
    box(dx,gatewayY,352,192,224,64);
    box(dx,gatewayY,416,128,160,448,'dark');
    // Inlaid turquoise only on the front face, facing the approaching player.
    box(dx,gatewayY+96,448,32,32,352,'glow');
    box(dx,gatewayY,864,192,224,64);
  }
  for(let i=0;i<4;i++)for(const sign of [-1,1]){
    box(sign*(160-i*32),gatewayY,928+i*32,64,160,32);
  }
  box(0,gatewayY,1056,128,192,64,'copper');
  box(0,gatewayY+112,1056,64,32,32,'glow');
  // Rear apse and altar: keep the bay at (0,+112) completely unobstructed.
  box(0,-416,352,896,64,96);
  box(0,-368,352,192,96,64,'dark');
  box(0,-368,416,224,128,32,'copper');
  for(const dx of [-480,480])for(const dy of [-416,416]){
    box(dx,dy,416,96,96,96);
    box(dx,dy,512,64,64,32,'copper');
  }
  return boxes;
}
