/** Eight padded cloud volumes packed into one 64³ RG texture. Density and
 * vertical optical depth are baked once; the fragment shader only samples them. */
export const CLOUD_VOLUME_TILE = 32;
export const CLOUD_VOLUME_SIZE = CLOUD_VOLUME_TILE * 2;
export const CLOUD_WIND = { x: 42, z: 14 };
const hash = (x:number,y:number,z:number) => {
  let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
};
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function noise(x:number,y:number,z:number){
  const a=Math.floor(x),b=Math.floor(y),c=Math.floor(z),fx=smooth(0,1,x-a),fy=smooth(0,1,y-b),fz=smooth(0,1,z-c);
  let sum=0;for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)sum+=hash(a+dx,b+dy,c+dz)*(dx?fx:1-fx)*(dy?fy:1-fy)*(dz?fz:1-fz);return sum;
}
let cached:Uint8Array|undefined;
export function createCloudVolume(){
  if(cached)return cached;
  const size=CLOUD_VOLUME_SIZE,tile=CLOUD_VOLUME_TILE,data=new Uint8Array(size**3*2);
  for(let kind=0;kind<8;kind++){
    const lobes=Array.from({length:13},(_,i)=>{
      const seed=kind*29+i;
      return {x:(hash(seed,1,2)-.5)*1.18,y:-.22+hash(seed,3,4)*.72,z:(hash(seed,5,6)-.5)*.88,
        rx:.23+hash(seed,7,8)*.23,ry:.24+hash(seed,9,10)*.33,rz:.24+hash(seed,11,12)*.26};
    });
    const ox=(kind%2)*tile,oy=(Math.floor(kind/2)%2)*tile,oz=Math.floor(kind/4)*tile;
    for(let z=0;z<tile;z++)for(let x=0;x<tile;x++){
      let overhead=0;
      for(let y=tile-1;y>=0;y--){
        const px=x/(tile-1)*2-1,py=y/(tile-1)*2-1,pz=z/(tile-1)*2-1;
        let body=smooth(1,.38,Math.hypot(px/.82,(py+.27)/.30,pz/.65))*.8;
        for(const l of lobes)body+=smooth(1,.45,Math.hypot((px-l.x)/l.rx,(py-l.y)/l.ry,(pz-l.z)/l.rz))*.65;
        const detail=noise(px*4+kind*7,py*4,pz*4)*.70+noise(px*11,py*11+kind*13,pz*11)*.30;
        const edge=1-smooth(.82,.98,Math.max(Math.abs(px),Math.abs(py),Math.abs(pz)));
        const density=smooth(.10,.90,body*(.40+detail))*edge;
        const index=2*(x+ox+size*(y+oy+size*(z+oz)));
        data[index]=Math.round(density*255);
        data[index+1]=Math.round(Math.exp(-overhead*.19)*255);overhead+=density;
      }
    }
  }
  cached=data;return data;
}

/** Shared by the visible cloud and the shadow pass, including edge wrapping. */
export const CLOUD_SAMPLE_GLSL = `
uniform sampler3D densityMap;
vec2 wrapCloud(vec2 p){return mod(p+vec2(9000.),vec2(66000.))-vec2(9000.);}
vec2 cloudSample(vec3 q,vec4 seed){
  if(max(abs(q.x),max(abs(q.y),abs(q.z)))>.98)return vec2(0.,1.);
  q.x*=seed.x>.5?-1.:1.;q.z*=seed.y>.5?-1.:1.;
  float kind=floor(seed.w*7.999);
  vec3 tile=vec3(mod(kind,2.),mod(floor(kind/2.),2.),floor(kind/4.));
  vec3 uv=(tile+(q*.5+.5)*(31./32.)+.5/32.)*.5;
  return texture(densityMap,uv).rg;
}`;
