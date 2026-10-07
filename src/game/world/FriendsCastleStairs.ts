/** Parametric masonry: tangent-continuous curves, eight-unit risers and a
 * shared exact surface for rendering, host collision and client prediction. */
export type StairPoint={x:number;y:number;z:number};
export type StairTread={a:StairPoint;b:StairPoint;nxA:number;nyA:number;nxB:number;nyB:number;width:number;z:number;distance:number;flight:string;railA:number;railB:number};
type XY=[number,number];
type Curve=[XY,XY,XY,XY];
export const CASTLE_STAIR_RISER=8;
export const CASTLE_APPROACH_CURVES:Curve[]=[
  [[18304,13632],[18304,14304],[18496,14944],[19456,14688]],
  [[19456,14688],[20416,14432],[21120,15072],[20480,16128]],
  [[20480,16128],[19840,17184],[17728,15968],[17536,17664]],
  [[17536,17664],[17344,19360],[19264,19360],[20224,18496]],
];
const bezier=(p:Curve,t:number):XY=>{const s=1-t;return [0,1].map(i=>s*s*s*p[0][i]+3*s*s*t*p[1][i]+3*s*t*t*p[2][i]+t*t*t*p[3][i]) as XY;};
const ease=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export type CastleStairs={treads:StairTread[];approach:StairPoint[];floor:(x:number,y:number,z?:number,step?:number)=>number|undefined;at:(x:number,y:number)=>StairTread[];terrainHeight:(x:number,y:number,natural:number)=>number;collide:(p:{x:number;y:number},z:number,radius:number)=>boolean};
const cached=new WeakMap<(x:number,y:number)=>number,CastleStairs>();

export function createCastleStairs(sampleHeight:(x:number,y:number)=>number):CastleStairs{
  const existing=cached.get(sampleHeight);if(existing)return existing;
  const treads:StairTread[]=[],approach:StairPoint[]=[],tiles=new Map<string,StairTread[]>();
  function flight(id:string,raw:XY[],top:number,bottom:number,width:number,descending=true){
    const distances=[0];for(let i=1;i<raw.length;i++)distances.push(distances[i-1]+Math.hypot(raw[i][0]-raw[i-1][0],raw[i][1]-raw[i-1][1]));
    const length=distances.at(-1)!,points:StairPoint[]=[],normals:XY[]=[];
    // Flat arrival aprons and smooth grade easing eliminate a pitch kink at
    // either connection. Small resting landings punctuate the long ascent.
    const progress=(d:number)=>{
      const t=Math.max(0,Math.min(1,(d-96)/(length-192)));
      return .84*t+.16*ease(t);
    };
    const heights=raw.map((p,i)=>top+(bottom-top)*progress(distances[i]));
    if(id==='approach'){
      // Follow the ridge's actual high points before descending. A straight
      // height interpolation would tunnel through its eastern shoulder.
      for(let i=0;i<raw.length;i++){
        const before=raw[Math.max(0,i-1)],after=raw[Math.min(raw.length-1,i+1)],dx=after[0]-before[0],dy=after[1]-before[1],l=Math.hypot(dx,dy)||1;
        const ground=Math.max(...[-width/2,0,width/2].map(o=>sampleHeight(raw[i][0]-dy/l*o,raw[i][1]+dx/l*o)));
        heights[i]=Math.min(top,Math.max(heights[i],ground+64));
      }
      for(let i=heights.length-2;i>=0;i--)heights[i]=Math.max(heights[i],heights[i+1]);
      for(let i=1;i<heights.length;i++)heights[i]=Math.max(heights[i],heights[i-1]-(distances[i]-distances[i-1])*.72);
      // A short final apron lands flush on the ridge, with the cut feathered
      // into its natural ground by the same authored corridor.
      const final=heights.at(-1)!;if(final>bottom)bottom=final;
    }
    for(let i=0;i<raw.length;i++){
      const p=raw[i];
      points.push({x:p[0],y:p[1],z:Math.round(heights[i]/8)*8});
      const before=raw[Math.max(0,i-1)],after=raw[Math.min(raw.length-1,i+1)],dx=after[0]-before[0],dy=after[1]-before[1],l=Math.hypot(dx,dy)||1;
      normals.push([-dy/l,dx/l]);
    }
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],na=normals[i],nb=normals[i+1];
      if(Math.hypot(b.x-a.x,b.y-a.y)<.001)continue;
      const tread:StairTread={a,b,nxA:na[0],nyA:na[1],nxB:nb[0],nyB:nb[1],width,z:descending?a.z:b.z,distance:distances[i],flight:id,railA:56,railB:56};
      treads.push(tread);
      if(id==='approach')approach.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:tread.z});
      const r=width/2+160;
      for(let tx=Math.floor((Math.min(a.x,b.x)-r)/256);tx<=Math.floor((Math.max(a.x,b.x)+r)/256);tx++)for(let ty=Math.floor((Math.min(a.y,b.y)-r)/256);ty<=Math.floor((Math.max(a.y,b.y)+r)/256);ty++){
        const key=`${tx},${ty}`,list=tiles.get(key)||[];list.push(tread);tiles.set(key,list);
      }
    }
  }
  // Reparameterise by arc length: treads stay evenly spaced through fan turns.
  const dense:XY[]=[];
  for(const p of CASTLE_APPROACH_CURVES)for(let i=0;i<600;i++)dense.push(bezier(p,i/600));
  dense.push(CASTLE_APPROACH_CURVES.at(-1)![3]);
  const resample=(input:XY[],spacing=8)=>{
    const result:XY[]=[input[0]];let travelled=0,target=spacing;
    for(let i=1;i<input.length;i++){
      const a=input[i-1],b=input[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.000001)continue;
      while(target<=travelled+length){const t=(target-travelled)/length;result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);target+=spacing;}
      travelled+=length;
    }
    const end=input.at(-1)!,last=result.at(-1)!;if(Math.hypot(end[0]-last[0],end[1]-last[1])>.001)result.push(end);return result;
  };
  const raw=resample(dense),end=raw.at(-1)!,bottom=sampleHeight(end[0],end[1])+32;
  flight('approach',raw,4448,bottom,320);
  // Broad curved court stairs: a quarter-circle fan joins each wall walk.
  for(const side of [-1,1]){
    const path:XY[]=[];
    for(let i=0;i<=500;i++){const t=i/500,angle=Math.PI*.5+t*Math.PI*1.5;path.push([18304+side*(736+Math.cos(angle)*256),12992+Math.sin(angle)*256]);}
    flight(`court-${side}`,resample(path),4448,5088,128,false);
    const join:Curve=[[18304+side*992,12992],[18304+side*992,13134],[18304+side*1106,13248],[18304+side*1248,13248]];
    const landing:XY[]=[];for(let i=0;i<=100;i++)landing.push(bezier(join,i/100));landing.push([18304+side*1536,13248]);
    flight(`court-landing-${side}`,resample(landing),5088,5088,128,false);
  }
  // A two-turn spiral wraps a structural newel in the keep. The final fan
  // unwinds onto the roof rather than meeting it with a square corner.
  const spiral:XY[]=[];
  for(let i=0;i<=1600;i++){const t=i/1600,a=Math.PI*.5+t*Math.PI*4;spiral.push([18304+Math.cos(a)*256,11744+Math.sin(a)*256]);}
  flight('keep',resample(spiral),4448,5824,112,false);
  const exit:Curve=[[18304,12000],[18176,12000],[18016,12000],[17920,12000]];
  const landing:XY[]=[];for(let i=0;i<=120;i++)landing.push(bezier(exit,i/120));
  flight('keep-landing',resample(landing),5824,5824,112,false);

  // The parapet lowers before a court landing meets the wall walk. Keeping
  // a full-height rail across this junction would block the walking circuit.
  for(const id of ['court-landing--1','court-landing-1']){
    const flight=treads.filter(t=>t.flight===id),last=flight.at(-1)!,length=last.distance+Math.hypot(last.b.x-last.a.x,last.b.y-last.a.y);
    for(const t of flight){const end=t.distance+Math.hypot(t.b.x-t.a.x,t.b.y-t.a.y);t.railA=56*ease((length-t.distance-112)/112);t.railB=56*ease((length-end-112)/112);}
  }
  const at=(x:number,y:number)=>tiles.get(`${Math.floor(x/256)},${Math.floor(y/256)}`)||[];
  const floor=(x:number,y:number,z=Infinity,step=8)=>{
    let highest:number|undefined;
    for(const t of at(x,y)){
      if(t.z>z+step+.001||highest!==undefined&&t.z<=highest)continue;
      const dx=t.b.x-t.a.x,dy=t.b.y-t.a.y,l2=dx*dx+dy*dy;
      const along=((x-t.a.x)*dx+(y-t.a.y)*dy)/l2;
      const lip=2/Math.sqrt(l2);if(along<-lip||along>1+lip)continue;
      const clamped=Math.max(0,Math.min(1,along)),px=t.a.x+dx*clamped,py=t.a.y+dy*clamped;
      if(Math.hypot(x-px,y-py)<=t.width/2)highest=t.z;
    }
    return highest;
  };
  const terrainHeight=(x:number,y:number,natural:number)=>{
    let result=natural;
    for(const t of at(x,y)){
      if(t.flight!=='approach')continue;
      const dx=t.b.x-t.a.x,dy=t.b.y-t.a.y,l2=dx*dx+dy*dy,along=Math.max(0,Math.min(1,((x-t.a.x)*dx+(y-t.a.y)*dy)/l2));
      const lateral=Math.hypot(x-t.a.x-dx*along,y-t.a.y-dy*along),weight=1-ease((lateral-t.width/2-16)/128);
      result=Math.min(result,natural-Math.max(0,natural-t.z+80)*weight);
    }
    // The final rounded arrival terrace lands flush in the grass. Its collar
    // is local to the road end and does not shape the mountain beneath it.
    const end=approach.at(-1)!,distance=Math.hypot(x-end.x,y-end.y),landing=1-ease((distance-224)/288);
    return result+(end.z-result)*landing;
  };
  const collide=(p:{x:number;y:number},z:number,radius:number)=>{
    let collided=false;
    for(const t of at(p.x,p.y)){
      if(Math.max(t.railA,t.railB)<=8||z<t.z-8||z>t.z+Math.max(t.railA,t.railB))continue;
      const dx=t.b.x-t.a.x,dy=t.b.y-t.a.y,l2=dx*dx+dy*dy,along=((p.x-t.a.x)*dx+(p.y-t.a.y)*dy)/l2;
      if(l2<.000001||along<0||along>1)continue;
      const px=t.a.x+along*dx,py=t.a.y+along*dy,nx=t.nxA+(t.nxB-t.nxA)*along,ny=t.nyA+(t.nyB-t.nyA)*along,l=Math.hypot(nx,ny),signed=((p.x-px)*nx+(p.y-py)*ny)/l;
      const distance=Math.abs(signed),half=t.width/2;
      if(distance>half+16+radius||distance<half-radius)continue;
      const target=distance<half+8?half-radius:half+16+radius,correction=(target-distance)*Math.sign(signed);
      p.x+=nx/l*correction;p.y+=ny/l*correction;collided=true;
    }
    return collided;
  };
  const stairs={treads,approach,floor,at,terrainHeight,collide};cached.set(sampleHeight,stairs);return stairs;
}
