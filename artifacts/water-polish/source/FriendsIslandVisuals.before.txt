import { rowboatWaterCutout } from './FriendsWaterClip';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FriendsDayNightCycle } from './FriendsDayNightCycle';

function lightIslandWater(material:THREE.ShaderMaterial,atmosphere:FriendsDayNightCycle){
  material.uniforms.waterLightDirection=atmosphere.lightDirection;
  material.uniforms.waterLightColor=atmosphere.lightColor;
  material.uniforms.waterDirectStrength=atmosphere.directStrength;
  material.uniforms.waterTint=atmosphere.surfaceTint;
  material.uniforms.waterHorizon={value:atmosphere.horizon};
  material.uniforms.waterZenith={value:atmosphere.zenith};
}
import { ISLAND_SEA_LEVEL, ISLAND_LAKES, ISLAND_VOLCANO, islandVolcanoRadius } from '../world/FriendsIsland';
import { baseTerrainHeight, FRONTIER_SIZE, ISLAND_RUINS } from '../world/FriendsTerrain';
import { FriendsVolcanoSmoke } from './FriendsVolcanoSmoke';
import { FriendsVolcanoGlow } from './FriendsVolcanoGlow';
import { configureTerrainCoverage } from './FriendsTerrainCoverage';
import { FriendsIslandMasonry } from './FriendsIslandMasonry';
import { FriendsCastleTorches } from './FriendsCastleTorches';
import { FriendsCastleStairVisuals } from './FriendsCastleStairVisuals';
import { FriendsRiverVisuals } from './FriendsRiverVisuals';
import { friendsWaterAt, friendsWaterDepth } from '../world/FriendsWaterSurface';
import { FRIENDS_FISHING_DOCK, FRIENDS_FISHING_PLATFORM, FRIENDS_OPPOSITE_DOCK } from '../world/FriendsFishingDock';

/** Static dock detail shares six materials; batch it once instead of submitting
 * a separate draw for every plank, nail, post and lamp each frame. */
function batchDock(group: THREE.Group) {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const object of [...group.children]) {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) continue;
    object.updateMatrix();
    const geometry = object.geometry.clone().applyMatrix4(object.matrix);
    const parts = batches.get(object.material) ?? [];
    parts.push(geometry); batches.set(object.material, parts);
    object.geometry.dispose(); group.remove(object);
  }
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

function createTimberPier(name:string,x:number,y:number,angle:number,deck:number,length:number,width:number,weathered=false,approachLength=0,mooringSide:-1|1=-1) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, deck, y);
  group.rotation.y = -angle;
  const wood = new THREE.MeshStandardMaterial({ color: weathered?0x745238:0x805435, roughness: .86 });
  const planks = new THREE.MeshStandardMaterial({ color: weathered?0x987453:0xa87549, roughness: .82 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x49372b, roughness: .9 });
  const rope = new THREE.MeshStandardMaterial({ color: 0xd1b887, roughness: .9 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8e6841, metalness: .52, roughness: .43 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffcf7b, emissive: 0xf29a36, emissiveIntensity: 1.15, roughness: .32 });
  const box = (w:number,h:number,d:number,px:number,py:number,pz:number,mat:THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); mesh.position.set(px,py,pz); group.add(mesh); return mesh;
  };
  box(length,8,width,0,-4,0,darkWood);
  if(approachLength)box(approachLength,8,width+20,-length/2-approachLength/2,-4,0,darkWood);
  for(let px=-length/2-approachLength+12;px<=length/2-12;px+=22){box(19,1.5,width+(px<-length/2?12:-8),px,.75,0,planks);box(.8,1.6,width+(px<-length/2?12:-8),px+10,.7,0,darkWood);}
  for(const px of [-length/2-approachLength+14,-length/2+132,length/2-132,length/2-14])for(const pz of [-width/2+10,width/2-10]){
    const post=new THREE.Mesh(new THREE.CylinderGeometry(9,12,68,8),darkWood);post.position.set(px,-42,pz);group.add(post);
    const shoe=new THREE.Mesh(new THREE.CylinderGeometry(12,14,8,8),bronze);shoe.position.set(px,-72,pz);group.add(shoe);
  }
  // Short rope rails mark the bank entrance; the lake-facing tip stays open for boarding.
  for(const side of [-1,1])for(const px of [-length/2-approachLength+16,-length/2-approachLength+112]){
    const z=side*(width/2-9),post=new THREE.Mesh(new THREE.CylinderGeometry(3.5,4.4,48,8),wood);post.position.set(px,24,z);group.add(post);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(4.5,10,8),bronze);cap.position.set(px,49,z);group.add(cap);
  }
  for(const side of [-1,1])box(90+approachLength,3,3,-length/2-approachLength/2+64,38,side*(width/2-9),rope);
  // Mooring cleats are on the side that faces the skiff.
  for(const px of [-34,56]){
    const z=mooringSide*(width/2-10);
    const bollard=new THREE.Mesh(new THREE.CylinderGeometry(4,5,12,8),bronze);bollard.position.set(px,8,z);group.add(bollard);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(4.5,10,8),wood);cap.position.set(px,15,z);group.add(cap);
  }
  // Warm lanterns at the water end make the mooring readable at dusk.
  for(const side of [-1,1]){
    const post=new THREE.Mesh(new THREE.CylinderGeometry(3,4,42,8),bronze);post.position.set(length/2-24,21,side*(width/2-12));group.add(post);
    const glow=new THREE.Mesh(new THREE.SphereGeometry(7,12,8),lamp);glow.position.set(length/2-24,44,side*(width/2-12));group.add(glow);
  }
  return batchDock(group);
}

function createDeepmereFishingPlatform(){
  const p=FRIENDS_FISHING_PLATFORM,group=new THREE.Group();group.name='deepmere-detached-fishing-platform';
  group.position.set(p.x,p.deck,p.y);group.rotation.y=-p.angle;
  const wood=new THREE.MeshStandardMaterial({color:0x805435,roughness:.86}),plank=new THREE.MeshStandardMaterial({color:0xb28354,roughness:.82}),dark=new THREE.MeshStandardMaterial({color:0x49372b,roughness:.9}),rope=new THREE.MeshStandardMaterial({color:0xd1b887,roughness:.9}),brass=new THREE.MeshStandardMaterial({color:0x8e6841,metalness:.52,roughness:.43}),amber=new THREE.MeshStandardMaterial({color:0xffcf7b,emissive:0xf29a36,emissiveIntensity:1.15,roughness:.32});
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material)=>{const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.position.set(x,y,z);group.add(q);return q;};
  box(p.length,8,p.width,0,-4,0,dark);
  for(let x=-p.length/2+9;x<=p.length/2-9;x+=18){box(15,1.5,p.width-8,x,.75,0,plank);box(.7,1.6,p.width-8,x+8,.7,0,dark);}
  for(const x of [-p.length/2+12,p.length/2-12])for(const z of [-p.width/2+12,p.width/2-12]){
    const pile=new THREE.Mesh(new THREE.CylinderGeometry(8,11,60,8),dark);pile.position.set(x,-37,z);group.add(pile);
  }
  // A low bench faces the water; rods and warm lamps stay back from the casting edge.
  box(74,7,18,-25,13,31,wood);for(const x of [-54,4])for(const z of [26,36])box(5,18,5,x,3,z,dark);
  for(const z of [-24,-4,16]){
    const holder=new THREE.Mesh(new THREE.CylinderGeometry(4,4,12,8),brass);holder.position.set(42,6,z);group.add(holder);
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(1,1.8,104,6),dark);rod.position.set(52,56,z);rod.rotation.z=-.2;group.add(rod);
    const tip=new THREE.Mesh(new THREE.SphereGeometry(2,8,6),amber);tip.position.set(62,108,z);group.add(tip);
  }
  for(const z of [-p.width/2+16,p.width/2-16]){
    const railPost=new THREE.Mesh(new THREE.CylinderGeometry(3,4,32,8),wood);railPost.position.set(p.length/2-18,16,z);group.add(railPost);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(6,12,8),amber);lamp.position.set(p.length/2-18,34,z);group.add(lamp);
  }
  box(2,2,p.width-32,p.length/2-18,27,0,rope);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(12,2.5,8,28),rope);ring.position.set(-48,16,-p.width/2+24);group.add(ring);
  return batchDock(group);
}

export function islandOceanDepth(x:number,y:number){
  // Deep inland water can lie below sea level. It must not acquire a second
  // ocean surface beneath the translucent freshwater mesh.
  const fresh=friendsWaterAt(x,y)?.level;
  return fresh!==undefined&&fresh>ISLAND_SEA_LEVEL+1?-32:ISLAND_SEA_LEVEL-baseTerrainHeight(x,y);
}

/** Bathymetric water shared by the ocean and carved mountain basins. The
 * negative depth mask cuts water to its terrain shoreline, not a drawn oval. */
export function islandWater(cx:number,cy:number,width:number,length:number,level:number,
  depthAt:(x:number,y:number)=>number, ocean=false,resolution?:number){
  const size=resolution??(ocean?384:160);
  // Lake and river textures use one world-aligned texel lattice. Independent
  // masks otherwise leave a full texel-wide dry seam at their ownership join.
  const grid=32,origin=new THREE.Vector2(ocean?0:Math.floor((cx-width/2)/grid)*grid,ocean?0:Math.floor((cy-length/2)/grid)*grid);
  const nx=ocean?size:Math.ceil((cx+width/2-origin.x)/grid),ny=ocean?size:Math.ceil((cy+length/2-origin.y)/grid);
  const sampleWidth=ocean?FRONTIER_SIZE:nx*grid,sampleLength=ocean?FRONTIER_SIZE:ny*grid;
  const depths=new Float32Array(nx*ny);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)depths[y*nx+x]=depthAt(origin.x+(x+.5)/nx*sampleWidth,origin.y+(y+.5)/ny*sampleLength);
  const bathymetry=new THREE.DataTexture(depths,nx,ny,THREE.RedFormat,THREE.FloatType);
  bathymetry.minFilter=bathymetry.magFilter=THREE.NearestFilter;bathymetry.needsUpdate=true;
  const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,uniforms:{rowboatCutout:rowboatWaterCutout,time:{value:0},bathymetry:{value:bathymetry},
    waterLightDirection:{value:new THREE.Vector3(.55,.36,-.45).normalize()},waterLightColor:{value:new THREE.Color(1,.85,.62)},waterDirectStrength:{value:1},waterTint:{value:new THREE.Color(1,1,1)},waterHorizon:{value:new THREE.Color(.64,.79,.82)},waterZenith:{value:new THREE.Color(.28,.52,.69)},
    patchCentre:{value:new THREE.Vector2()},patchHalfExtent:{value:4096},wavePatch:{value:ocean?0:1},waveAmplitude:{value:ocean?5:1.4},waterOrigin:{value:origin},waterExtent:{value:new THREE.Vector2(sampleWidth,sampleLength)},ocean:{value:ocean?1:0}},
    vertexShader:`varying vec3 seaWorld;uniform float time,wavePatch,waveAmplitude,ocean,patchHalfExtent;
      uniform sampler2D bathymetry;uniform vec2 waterOrigin,waterExtent,patchCentre;
      void main(){vec4 w=modelMatrix*vec4(position,1.);vec2 p=w.xz;
        vec2 uv=(p-waterOrigin)/waterExtent;
        float depth=texture2D(bathymetry,clamp(uv,0.,1.)).r;
        float shallow=smoothstep(2.,72.,depth);
        float edge=ocean>.5?1.-smoothstep(patchHalfExtent-700.,patchHalfExtent,max(abs(p.x-patchCentre.x),abs(p.y-patchCentre.y))):1.;
        float displacement=sin(dot(p,vec2(.0051,.0037))-time*.95)*.60
          +sin(dot(p,vec2(-.0082,.0046))+time*.78)*.28+sin(dot(p,vec2(.016,.012))-time*1.7)*.12;
        w.y+=displacement*waveAmplitude*wavePatch*shallow*edge;
        seaWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform vec4 rowboatCutout;varying vec3 seaWorld;uniform float time;uniform sampler2D bathymetry;uniform vec2 waterOrigin,waterExtent;uniform float ocean,wavePatch,patchHalfExtent,waveAmplitude;uniform vec2 patchCentre;
      uniform vec3 waterLightDirection,waterLightColor,waterTint,waterHorizon,waterZenith;uniform float waterDirectStrength;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float swell(vec2 p){return sin(dot(p,vec2(.0051,.0037))-time*.95)*.60
        +sin(dot(p,vec2(-.0082,.0046))+time*.78)*.28+sin(dot(p,vec2(.016,.012))-time*1.7)*.12;}
      void main(){vec2 p=seaWorld.xz,uv=(p-waterOrigin)/waterExtent;
        float inside=step(0.,uv.x)*step(0.,uv.y)*step(uv.x,1.)*step(uv.y,1.);
        float depth=mix(256.,texture2D(bathymetry,clamp(uv,0.,1.)).r,inside);
        vec2 hullDelta=p-rowboatCutout.xy;float hc=cos(rowboatCutout.z),hs=sin(rowboatCutout.z);
        vec2 hullLocal=vec2(hullDelta.x*hc+hullDelta.y*hs,-hullDelta.x*hs+hullDelta.y*hc)/vec2(67.,30.);
        if(dot(hullLocal,hullLocal)<1.&&abs(seaWorld.y-rowboatCutout.w)<28.)discard;
        if(depth<=1. || (inside<.5 && ocean<.5))discard;
        if(ocean>.5 && wavePatch<.5 && max(abs(p.x-patchCentre.x),abs(p.y-patchCentre.y))<patchHalfExtent-700.)discard;
        float wave=swell(p),ripple=noise(p*.04+vec2(time*.10,-time*.08));
        float shoal=smoothstep(10.,230.,depth);
        vec3 water=mix(vec3(.18,.64,.57),vec3(.018,.145,.23),shoal)*waterTint;
        // Rippled sunlight on shallow sand fades with depth; it never tiles
        // along an island-sized rectangular shore.
        vec2 shimmer=p*.023+vec2(sin(p.y*.009+time*.2),sin((p.x+p.y)*.011-time*.17))*.8;
        float filaments=sin(dot(shimmer,vec2(.8,.6))+noise(shimmer*.7)*6.)
          +sin(dot(shimmer,vec2(-.5,.86))-noise(shimmer*.6)*4.);
        float caustic=pow(max(0.,1.-abs(filaments)),9.);
        water+=vec3(.20,.24,.15)*caustic*(1.-smoothstep(15.,130.,depth))*.28*waterDirectStrength;
        vec3 view=normalize(cameraPosition-seaWorld);
        vec2 gradient=cos(dot(p,vec2(.0051,.0037))-time*.95)*vec2(.0051,.0037)*.60
          +cos(dot(p,vec2(-.0082,.0046))+time*.78)*vec2(-.0082,.0046)*.28
          +cos(dot(p,vec2(.016,.012))-time*1.7)*vec2(.016,.012)*.12;
        gradient*=waveAmplitude*smoothstep(2.,72.,depth);
        vec3 normal=normalize(vec3(-gradient.x,1.,-gradient.y));
        float fresnel=.045+.66*pow(1.-max(0.,dot(view,normal)),4.);
        vec3 reflection=mix(waterHorizon,waterZenith,clamp(view.y,0.,1.));
        water=mix(water,reflection,gl_FrontFacing?fresnel:.06);water+=(wave*.012+ripple*.012)*waterTint;
        float breaker=sin(depth*.105-time*1.1+noise(p/150.)*3.5);
        float foam=(1.-smoothstep(8.,65.,depth))*smoothstep(.40,.88,breaker);
        foam*=.45+.55*noise(p/19.+time*.09);
        water=mix(water,vec3(.89,.95,.91)*waterTint,foam*.78);
        water+=waterLightColor*pow(max(0.,dot(reflect(-waterLightDirection,normal),view)),180.)*.85*waterDirectStrength;
        water=mix(water,waterHorizon,1.-exp(-length(cameraPosition.xz-p)*.000009));
        float patchFade=ocean>.5&&wavePatch>.5?1.-smoothstep(patchHalfExtent-700.,patchHalfExtent,max(abs(p.x-patchCentre.x),abs(p.y-patchCentre.y))):1.;
        float opacity=smoothstep(1.,14.,depth)*patchFade;
        if(!gl_FrontFacing){
          // Snell's window: overhead daylight transmits inside the critical
          // angle; the surrounding underside reflects the teal water volume.
          float cosine=clamp(-dot(view,normal),0.,1.);
          float window=smoothstep(.645,.69,cosine);
          vec3 transmitted=refract(-view,-normal,1.333);
          vec3 sky=mix(waterHorizon,waterZenith,clamp(transmitted.y,0.,1.));
          float clouds=smoothstep(.62,.84,noise(transmitted.xz/max(.18,transmitted.y)*2.8+time*.002));
          sky=mix(sky,waterLightColor*.9,clouds*.35*clamp(waterDirectStrength,0.,1.));
          float sun=pow(max(0.,dot(transmitted,waterLightDirection)),350.)*waterDirectStrength;
          vec3 underside=(vec3(.065,.22,.25)+ripple*.025+wave*.012)*waterTint;
          water=mix(underside,sky+waterLightColor*sun*.7,window);
          water+=vec3(.03,.08,.075)*caustic*window*waterDirectStrength;
          // Above-water hulls, bridge supports and banks show through the
          // window as silhouettes, without another scene render or texture.
          opacity*=mix(.98,.70,window);
        }
        gl_FragColor=vec4(water*.94,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  material.userData.frontierWater=true;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,length,ocean?1:72,ocean?1:72),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.set(cx,level,cy);mesh.userData.bathymetry=bathymetry;
  return mesh;
}
export class FriendsIslandOcean extends THREE.Group {
  private far:THREE.Mesh;private patch:THREE.Mesh;
  constructor(){
    super();this.name='the-surrounding-ocean';
    this.far=islandWater(24000,24000,170000,170000,ISLAND_SEA_LEVEL,islandOceanDepth,true);
    const material=(this.far.material as THREE.ShaderMaterial).clone();
    material.uniforms.bathymetry.value=this.far.userData.bathymetry;
    material.uniforms.rowboatCutout=rowboatWaterCutout;
    material.uniforms.patchCentre=(this.far.material as THREE.ShaderMaterial).uniforms.patchCentre;
    material.uniforms.wavePatch.value=1;
    this.patch=new THREE.Mesh(new THREE.PlaneGeometry(8192,8192,128,128),material);
    this.patch.name='camera-following-wave-grid';this.patch.rotation.x=-Math.PI/2;this.patch.position.y=ISLAND_SEA_LEVEL;
    this.far.renderOrder=1;this.patch.renderOrder=2;this.add(this.far,this.patch);
  }
  update(seconds:number,camera:THREE.Vector3){
    // Stable world-space waves; only one transform and one uniform change.
    const x=Math.round(camera.x/64)*64,z=Math.round(camera.z/64)*64;
    this.patch.position.set(x,ISLAND_SEA_LEVEL,z);
    const far=this.far.material as THREE.ShaderMaterial,near=this.patch.material as THREE.ShaderMaterial;
    far.uniforms.patchCentre.value.set(x,z);far.uniforms.time.value=near.uniforms.time.value=seconds;
  }
  setAtmosphere(atmosphere:FriendsDayNightCycle){for(const mesh of [this.far,this.patch])lightIslandWater(mesh.material as THREE.ShaderMaterial,atmosphere);}
  dispose(){
    (this.far.userData.bathymetry as THREE.Texture).dispose();
    for(const mesh of [this.far,this.patch]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.removeFromParent();
  }
}
export const createIslandOcean=()=>new FriendsIslandOcean();
export function createIslandRuinMaterials(stone:THREE.MeshStandardMaterial) {
  const colors=['#ddd3b9','#89969d','#b77942','#7ad9d1'];
  return colors.map(color=>{
    const m=stone.clone(),decorate=stone.onBeforeCompile;m.color.set(color);m.vertexColors=false;
    m.emissive.set('#526269');m.emissiveIntensity=.025;
    m.onBeforeCompile=(shader,renderer)=>{decorate(shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('diffuseColor*=vec4(mix(primary.rgb,secondary.rgb,.45),primary.a);','diffuseColor*=vec4(mix(vec3(.60),mix(primary.rgb,secondary.rgb,.45),.55),primary.a);');};
    m.customProgramCacheKey=()=> 'island-ruins-v3';return m;
  });
}
export class FriendsIslandVisuals extends THREE.Group {
  private masonry: FriendsIslandMasonry;
  private animated:THREE.ShaderMaterial[]=[];
  private smoke=new FriendsVolcanoSmoke();
  private lavaGlow=new FriendsVolcanoGlow();
  private torches=new FriendsCastleTorches();
  constructor(ruinMaterials:THREE.MeshStandardMaterial[],coverage:THREE.DataTexture,grid:number){
    super();this.name='island-monuments-and-skyfalls';this.add(this.smoke,this.lavaGlow,this.torches,new FriendsCastleStairVisuals(ruinMaterials[0]));
    const materials=Object.fromEntries(['stone','dark','copper','glow'].map((tint,i)=>{
      const m=ruinMaterials[i].clone();m.onBeforeCompile=ruinMaterials[i].onBeforeCompile;m.customProgramCacheKey=ruinMaterials[i].customProgramCacheKey;
      configureTerrainCoverage(m,coverage,grid,'horizon');return [tint,m];
    })) as Record<'stone'|'dark'|'copper'|'glow',THREE.MeshStandardMaterial>;
    this.add(
      createTimberPier('deepmere-fishing-dock',FRIENDS_FISHING_DOCK.x,FRIENDS_FISHING_DOCK.y,FRIENDS_FISHING_DOCK.angle,FRIENDS_FISHING_DOCK.deck,FRIENDS_FISHING_DOCK.length,FRIENDS_FISHING_DOCK.pierWidth),
      createDeepmereFishingPlatform(),
      createTimberPier('deepmere-opposite-dock',FRIENDS_OPPOSITE_DOCK.x,FRIENDS_OPPOSITE_DOCK.y,FRIENDS_OPPOSITE_DOCK.angle,FRIENDS_OPPOSITE_DOCK.deck,FRIENDS_OPPOSITE_DOCK.length,FRIENDS_OPPOSITE_DOCK.width,true,80,1),
    );
    this.masonry=new FriendsIslandMasonry(['stone','dark','copper','glow'].map(t=>materials[t]));this.add(this.masonry);
    // Rune faces sit just outside solid stone and stay visible at every LOD.
    const glow=new THREE.MeshBasicMaterial({color:'#71fff0',toneMapped:false});
    for(const b of ISLAND_RUINS.filter(b=>b.tint==='glow')){
      const rune=new THREE.Mesh(new THREE.PlaneGeometry(b.w*.55,b.h*.85),glow);rune.position.set(b.x,b.z+b.h/2,b.y-b.d/2-.5);rune.rotation.y=Math.PI;this.add(rune);
    }
    // The cascade surfaces are carved, contained water ribbons, constructed
    // with the rivers below. Mist is the only nonphysical waterfall decoration.
    const mistMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
      vertexShader:'varying vec2 mistUv;void main(){mistUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 mistUv;void main(){float a=pow(max(0.,1.-length((mistUv-.5)*2.)),2.);gl_FragColor=vec4(.85,.96,1.,a*.25);}'});
    mistMaterial.userData.frontierExterior=true;
    for(const startX of [6464,7360])for(let i=0;i<3;i++){const mist=new THREE.Mesh(new THREE.PlaneGeometry(400,200),mistMaterial);mist.position.set(startX+60,744+i*48,20240+i*32);mist.rotation.y=i*.7-.7;this.add(mist);}
    for(const lake of ISLAND_LAKES){
      const water=islandWater(lake.x,lake.y,lake.rx*3.2,lake.ry*3.2,lake.level,
        (x,y)=>friendsWaterDepth(x,y,lake.id),false,Math.ceil(Math.max(lake.rx,lake.ry)*3.2/24));
      water.name=lake.id==='gate'?'world-gate-glacial-lake':lake.id==='deepmere'?'deepmere-deep-lake':'skyfalls-carved-basin';
      this.add(water);this.animated.push(water.material as THREE.ShaderMaterial);
    }
    const rivers=new FriendsRiverVisuals(islandWater,ruinMaterials[0]);this.add(rivers);this.animated.push(...rivers.waterMaterials);
    const v=ISLAND_VOLCANO;
    const lava=islandWater(v.x,v.y,3000,3000,v.lavaLevel,(x,y)=>islandVolcanoRadius(x,y)<1100?v.lavaLevel-baseTerrainHeight(x,y):-32);
    const lavaMaterial=new THREE.ShaderMaterial({uniforms:(lava.material as THREE.ShaderMaterial).uniforms,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,
      vertexShader:(lava.material as THREE.ShaderMaterial).vertexShader,
      fragmentShader:`uniform vec4 rowboatCutout;varying vec3 seaWorld;uniform sampler2D bathymetry;uniform vec2 waterOrigin,waterExtent;uniform float time;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        void main(){vec2 uv=(seaWorld.xz-waterOrigin)/waterExtent;float d=texture2D(bathymetry,uv).r;if(d<=0.)discard;
          vec2 p=seaWorld.xz/110.;p+=vec2(sin(p.y*.6+time*.10),cos(p.x*.5-time*.07))*.45;
          p+=vec2(noise(p*.24+time*.018),noise(p*.31-time*.021))*1.4;
          float cells=noise(p+time*.025)*.64+noise(p*2.1-time*.04)*.26+noise(p*4.3)*.10;
          float crust=smoothstep(.44,.66,cells),cracks=pow(max(0.,1.-abs(sin(p.x*.8+p.y*.55+noise(p*.55)*7.))),10.);
          float heat=clamp((1.-crust)*.75+cracks*.80,0.,1.);
          vec3 molten=mix(vec3(.72,.025,.002),vec3(1.,.62,.075),heat);
          vec3 c=mix(vec3(.047,.025,.020),molten,heat);c=mix(vec3(.09,.029,.013),c,smoothstep(0.,36.,d));
          gl_FragColor=vec4(c*(1.+heat*.65),1.);
        }`});
    (lava.material as THREE.Material).dispose();lava.material=lavaMaterial;lavaMaterial.toneMapped=false;lavaMaterial.uniforms.waveAmplitude.value=.4;
    lava.name='ember-caldera-molten-crater';this.add(lava);this.animated.push(lavaMaterial);
    const flowMaterial=lavaMaterial.clone();flowMaterial.uniforms.bathymetry.value=lava.userData.bathymetry;
    flowMaterial.fragmentShader=flowMaterial.fragmentShader.replace('float d=texture2D(bathymetry,uv).r;if(d<=0.)discard;','float d=96.;');
    flowMaterial.vertexShader='varying vec3 seaWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);seaWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
    const positions:number[]=[],flowIndices:number[]=[],steps=72;
    for(let i=0;i<=steps;i++){
      const t=i/steps,r=700+t*2800,angle=1.05+.045*Math.sin(t*8)+.025*Math.sin(t*17),width=180*(1-t)+48;
      for(const side of [-1,1]){
        const x=v.x+Math.cos(angle)*r-Math.sin(angle)*side*width/2,y=v.y+Math.sin(angle)*r+Math.cos(angle)*side*width/2;
        const h=(baseTerrainHeight(x-16,y-16)+baseTerrainHeight(x+16,y-16)+baseTerrainHeight(x-16,y+16)+baseTerrainHeight(x+16,y+16))/4+5;
        positions.push(x,h,y);
      }
      if(i<steps){const n=i*2;flowIndices.push(n,n+2,n+1,n+1,n+2,n+3);}
    }
    const flowGeometry=new THREE.BufferGeometry();flowGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));flowGeometry.setIndex(flowIndices);flowGeometry.computeVertexNormals();
    const flow=new THREE.Mesh(flowGeometry,flowMaterial);flow.name='caldera-breach-lava-flow';this.add(flow);this.animated.push(flowMaterial);

  }
  update(seconds:number,camera:THREE.Vector3){this.smoke.update(seconds);this.lavaGlow.update(seconds);this.torches.update(seconds,camera);for(const m of this.animated)m.uniforms.time.value=seconds;}
  setAtmosphere(atmosphere:FriendsDayNightCycle){
    const shaded=new Set<THREE.ShaderMaterial>();
    this.traverse(object=>{if(!(object instanceof THREE.Mesh))return;for(const m of Array.isArray(object.material)?object.material:[object.material]){
      if(!(m instanceof THREE.ShaderMaterial)||shaded.has(m))continue;shaded.add(m);
      if(m.userData.frontierWater)lightIslandWater(m,atmosphere);
      else if(m.userData.frontierExterior||object===this.smoke){
        m.uniforms.exteriorTint=atmosphere.surfaceTint;
        m.fragmentShader='uniform vec3 exteriorTint;\n'+m.fragmentShader.replace(/}\s*$/,`gl_FragColor.rgb*=exteriorTint;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`);m.needsUpdate=true;
      }
    }});
  }
  dispose(){this.masonry.dispose();this.smoke.dispose();this.lavaGlow.dispose();this.torches.dispose();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);if(o.userData.bathymetry instanceof THREE.Texture)o.userData.bathymetry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof THREE.InstancedMesh)o.dispose();}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.removeFromParent();}
}
