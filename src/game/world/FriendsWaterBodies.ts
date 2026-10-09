/** Shared immutable datums; kept free of terrain imports for worker/field use. */
export const ISLAND_SEA_LEVEL = -168.5;
export const ISLAND_LAKES = [
  {id:'skyfalls',x:6912,y:20448,rx:1568,ry:1120,level:666.5},
  {id:'gate',x:15520,y:10800,rx:1152,ry:2368,level:602.5},
  {id:'deepmere',x:12128,y:23600,rx:2600,ry:2200,level:154.5},
] as const;

/** Shared irregular basin outline, without a terrain/hydrology import cycle. */
export function waterBasinRadius(x:number,y:number,lake:typeof ISLAND_LAKES[number]){
  const dx=(x-lake.x)/lake.rx,dy=(y-lake.y)/lake.ry,a=Math.atan2(dy,dx);
  return lake.id==='deepmere'?Math.hypot(dx,dy)/(1+.065*Math.sin(a*3+.4)+.025*Math.sin(a*7)):
    Math.hypot(dx,dy)/(1+.13*Math.sin(a*3+.4)+.065*Math.sin(a*7-1.2))+.035*Math.sin(x/170)*Math.sin(y/210);
}

export type SkyfallSample={id:string;index:number;x:number;y:number;side:number;width:number};
export function skyfallCascadeAt(x:number,y:number):SkyfallSample|undefined{
  if(y<18976||y>20384||x<6200||x>7700)return;
  const t=(y-18976)/1312;
  for(const [index,start]of [6464,7360].entries()){
    const cx=start+Math.sin(t*Math.PI)*96+Math.sin(t*8)*40,width=(index?128:192)*(1+.18*Math.sin(t*14));
    const side=Math.abs(x-cx);if(side<width/2+160)return {id:`skyfall-cascade-${index}`,index,x:cx,y,side,width};
  }
}
/** Triangle interpolation for a 64-unit surface, shared by water sources and
 * the distant terrain sampler. The callback may sample the uncarved terrain. */
export function interpolateTerrainSurface(x:number,y:number,height:(x:number,y:number)=>number){
  const gx=Math.floor(x/64)*64,gy=Math.floor(y/64)*64,fx=(x-gx)/64,fy=(y-gy)/64;
  const corner=(x:number,y:number)=>Math.round((height(x-16,y-16)+height(x+16,y-16)+height(x-16,y+16)+height(x+16,y+16))/4);
  const a=corner(gx,gy),b=corner(gx,gy+64),c=corner(gx+64,gy+64),d=corner(gx+64,gy);
  if((gx/64+gy/64)%2)return fx+fy<=1?a+(d-a)*fx+(b-a)*fy:c+(b-c)*(1-fx)+(d-c)*(1-fy);
  return fy>=fx?a+(c-b)*fx+(b-a)*fy:a+(d-a)*fx+(c-d)*fy;
}
