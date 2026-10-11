import * as THREE from 'three';

/** A seamless 64 KiB cloud-detail map (about 85 KiB with mipmaps) baked once, replacing twelve sine hashes
 * per sky pixel. It contains no color data and needs no external asset. */
export function createNightNebulaTexture() {
  const size = 256, data = new Uint8Array(size * size);
  const smooth = (n: number) => n * n * (3 - 2 * n);
  const noise = (u: number, v: number, grid: number) => {
    const x = u * grid, y = v * grid, ix = Math.floor(x), iy = Math.floor(y);
    const hash = (a: number, b: number) => {
      const n = Math.sin((a % grid) * 127.1 + (b % grid) * 311.7 + 19 * 74.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const fx = smooth(x - ix), fy = smooth(y - iy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size, v = (y + .5) / size;
    data[y * size + x] = Math.round(255 * (noise(u, v, 16) * .55 + noise(u, v, 32) * .30 + noise(u, v, 64) * .15));
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const meteorRandom = (slot: number, salt: number) => {
  const value = Math.sin(slot * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** One reusable streak; no particles, textures, timers or per-frame allocations. */
export function updateNightMeteor(seconds: number, head: THREE.Vector3, tail: THREE.Vector3) {
  const clock = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const slot = Math.floor(clock / 18);
  const age = clock - slot * 18 - (5 + meteorRandom(slot, 1) * 7);
  if (age <= 0 || age >= 1.4) return 0;
  const progress = age / 1.4, azimuth = meteorRandom(slot, 2) * Math.PI * 2;
  const elevation = .55 + meteorRandom(slot, 3) * .45 - progress * .28;
  const angle = azimuth + progress * .32;
  head.set(Math.cos(angle) * Math.cos(elevation), Math.sin(elevation), Math.sin(angle) * Math.cos(elevation));
  const tailAngle = angle - .10, tailElevation = elevation + .0875;
  tail.set(Math.cos(tailAngle) * Math.cos(tailElevation), Math.sin(tailElevation), Math.sin(tailAngle) * Math.cos(tailElevation));
  const fadeIn = Math.min(1, age / .12), fadeOut = Math.min(1, (1.4 - age) / .45);
  return fadeIn * fadeOut;
}

// All celestial detail stays in the existing sky pass. Local disc branches
// restrict planet shading to a few pixels; daytime skips all night work.
export const NIGHT_SKY_GLSL = /* glsl */ `
  uniform vec3 meteorHead,meteorTail;
  uniform float meteorStrength;
  uniform sampler2D nebulaMap;
  float lunarCrater(vec2 uv,vec2 centre,float radius){
    float r=length(uv-centre)/radius;
    float rim=(r-.86)/.13;
    return -.055*exp(-r*r*3.)+.035*exp(-rim*rim);
  }
  float skyGaussian(float x){return exp(-x*x);}
  vec3 planet(vec3 c,vec3 air,vec3 d,vec3 direction,float radius,vec3 tint,float kind,float pixel){
    // Keep every expensive surface lookup inside a tiny disc-sized region.
    // All edge widths derive from the same angular pixel footprint, so the
    // branch contains no derivatives and can be skipped by the GPU.
    if(dot(d,direction)<.998) return c;
    vec3 right=normalize(cross(vec3(0.,1.,0.),direction)),up=cross(direction,right);
    vec2 uv=vec2(dot(d,right),dot(d,up))/radius;
    float r=length(uv),aa=max(pixel/radius,.002);
    float extent=kind<.5?2.65:1.14;
    if(r>extent+aa) return c;
    vec3 light=normalize(vec3(dot(sunDirection,right),dot(sunDirection,up),-dot(sunDirection,direction)));
    float transmission=exp(-.105/max(direction.y,.08));
    float visibility=stars*smoothstep(.015,.20,direction.y);
    float coverage=1.-smoothstep(1.-aa*.5,1.+aa*.5,r);
    vec3 normal=vec3(uv,sqrt(max(0.,1.-r*r)));
    vec3 ringNormal=normalize(vec3(-.25,.86,.44));
    vec3 ringPoint=vec3(uv,-dot(ringNormal.xy,uv)/ringNormal.z);
    float ringRadius=length(ringPoint),ringAA=aa/ringNormal.z;
    float ringOpacity=0.,ringFront=0.;vec3 ringColor=vec3(0.);
    if(kind<.5){
      float inner=smoothstep(1.28-ringAA*.5,1.35+ringAA*.5,ringRadius);
      float outer=1.-smoothstep(2.38-ringAA*.5,2.48+ringAA*.5,ringRadius);
      float division=1.-.86*skyGaussian((ringRadius-1.91)/max(.045,ringAA*.5));
      // Suppress fine radial bands once they fall below a screen pixel.
      float fine=sin(ringRadius*72.)*exp(-ringAA*ringAA*72.*72.*.20);
      float broad=.5+.5*sin(ringRadius*12.+.8);
      ringOpacity=inner*outer*division*(.76+.12*broad+.018*fine);
      // The globe casts a soft, directional shadow onto the ring plane.
      float shadowDistance=length(cross(ringPoint,light));
      float shadow=(1.-smoothstep(.96-ringAA,1.02+ringAA,shadowDistance))*step(dot(ringPoint,light),0.);
      float ringLight=.30+.55*abs(dot(ringNormal,light));
      ringColor=mix(vec3(.36,.30,.23),vec3(.68,.58,.43),broad)*ringLight;
      ringColor*=1.-shadow*.88;
      ringColor=mix(air,ringColor,transmission);
      // Front rings may overlap the globe; far rings disappear behind it.
      ringFront=step(normal.z,ringPoint.z)*coverage;
      c=mix(c,ringColor,ringOpacity*visibility*(1.-ringFront)*(1.-coverage));
    }
    if(r<1.+aa){
      float latitude=dot(normal,ringNormal);
      float longitude=atan(normal.x,normal.z);
      vec2 detailUv=vec2(longitude/6.2831853+.5+time*.00015,latitude*.5+.5);
      // Explicit mip selection keeps cloud/terrain detail stable even when a
      // whole planet is just a few pixels wide. No implicit branch derivatives.
      float detailLod=max(0.,log2(max(1.,aa*128.)));
      float detail=textureLod(nebulaMap,detailUv,detailLod).r;
      float detailFine=textureLod(nebulaMap,detailUv*vec2(2.,1.5)+vec2(.21,.37),detailLod+1.).r;
      float ndl=dot(normal,light);
      float diffuse=max(0.,ndl);
      float limb=pow(max(0.,1.-normal.z),2.);
      vec3 albedo,atmosphere;
      if(kind<.5){
        float belts=.5+.5*sin(latitude*26.+(detail-.5)*1.8);
        float fineBelts=sin(latitude*65.)*exp(-aa*aa*65.*65.*.20);
        albedo=tint*mix(vec3(.80,.78,.73),vec3(1.08,1.04,.95),belts);
        albedo*=.96+.065*(detailFine-.5)+.018*fineBelts;
        atmosphere=vec3(.33,.40,.49);
        // Ring shadow on the globe uses the same tilted plane as the rings.
        float planeLight=dot(ringNormal,light);
        float intersection=-dot(ringNormal,normal)/(abs(planeLight)>.01?planeLight:.01);
        float shadowRadius=length(normal+light*intersection);
        float ringShadow=smoothstep(1.30-aa,1.40+aa,shadowRadius)*(1.-smoothstep(2.36-aa,2.48+aa,shadowRadius))*step(0.,intersection);
        diffuse*=1.-ringShadow*.38;
      }else if(kind<1.5){
        float land=smoothstep(.47,.61,detail+sin(latitude*9.)*.055);
        albedo=mix(tint,vec3(.14,.25,.24),land*.58);
        float clouds=smoothstep(.49,.70,detailFine+sin(latitude*17.+detail*5.)*.055);
        albedo=mix(albedo,vec3(.70,.78,.80),clouds*.68);
        float polar=smoothstep(.77,.97,abs(latitude));
        albedo=mix(albedo,vec3(.69,.79,.82),polar*.72);
        atmosphere=vec3(.13,.43,.73);
      }else{
        float terrain=smoothstep(.30,.73,detail);
        albedo=mix(tint*vec3(.61,.65,.72),tint*vec3(1.12,1.02,.88),terrain);
        albedo*=.90+.16*detailFine;
        atmosphere=vec3(.47,.27,.19);
      }
      // A small sky-colored fill preserves the night side without a black
      // cutout. Transmission puts the entire body behind the local air.
      vec3 surface=albedo*(.035+diffuse*.72)+air*.20;
      float litRim=limb*smoothstep(-.12,.32,ndl);
      surface+=atmosphere*litRim*(kind<.5?.045:.14);
      surface=mix(air,surface,transmission);
      c=mix(c,surface,coverage*visibility);
    }
    if(kind<.5) c=mix(c,ringColor,ringOpacity*visibility*ringFront);
    // Thin atmospheric limb, with a wider but very faint outer scattering.
    float shell=skyGaussian((r-1.015)/max(.025,aa*.65));
    float outerGlow=exp(-max(0.,r-1.)*48.)*smoothstep(1.-aa,1.+aa,r);
    float sunlitEdge=smoothstep(-.15,.45,dot(normalize(vec3(uv,.12)),light));
    vec3 halo=kind<.5?vec3(.23,.29,.37):kind<1.5?vec3(.12,.36,.65):vec3(.36,.19,.12);
    c+=halo*(shell*.025+outerGlow*.012)*sunlitEdge*visibility*transmission;
    return c;
  }
  vec3 nightSky(vec3 c,vec3 d,float pixel){
    vec3 air=c;
    float horizonFade=smoothstep(.015,.22,d.y);
    if(d.y<=0.) return c;
    // Broad, continuous filaments rather than screen-space grain. The band is
    // anchored in direction space, so it remains steady as the camera moves.
    float across=dot(d,normalize(vec3(.25,.8,.48)));
    float along=dot(d,normalize(vec3(.89,-.08,-.46)));
    float wisps=sin(along*19.+sin(d.z*13.))*sin(d.x*23.-d.z*11.);
    float band=skyGaussian(across/.145);
    vec3 galaxy=vec3(0.);
    if(band>.001){
      vec2 nebulaUv=vec2(along*14.,across*36.);
      float cloud=texture2D(nebulaMap,nebulaUv/16.).r;
      float core=skyGaussian((across+.022+wisps*.012)/(.032+cloud*.035));
      float dust=skyGaussian((across-.012+sin(along*27.)*.015+(cloud-.5)*.04)/.022);
      galaxy=mix(vec3(.014,.024,.052),vec3(.047,.028,.055),.5+.5*sin(along*8.));
      galaxy=galaxy*band*(.3+cloud*1.2)+vec3(.037,.042,.060)*core*(.35+cloud);
      galaxy*=1.-dust*.72;
    }
    c+=galaxy*stars*horizonFade;
    c=planet(c,air,d,normalize(vec3(-.62,.48,-.62)),.018,vec3(.66,.53,.37),0.,pixel);
    c=planet(c,air,d,normalize(vec3(.76,.38,-.52)),.009,vec3(.10,.32,.52),1.,pixel);
    c=planet(c,air,d,normalize(vec3(-.35,.30,.89)),.005,vec3(.52,.25,.15),2.,pixel);
    if(meteorStrength>0.&&dot(d,meteorHead)>.985){
      vec3 segment=meteorHead-meteorTail;
      float t=clamp(dot(d-meteorTail,segment)/dot(segment,segment),0.,1.);
      float distanceToTrail=length(d-normalize(meteorTail+segment*t));
      float width=max(pixel*.65,.00022);
      float trail=exp(-pow(distanceToTrail/width,2.))*pow(t,2.);
      float headGlow=exp(-pow(length(d-meteorHead)/(width*1.25),2.));
      c+=(mix(vec3(.32,.53,.85),vec3(.76,.86,1.),t)*trail*1.35+vec3(.85,.93,1.)*headGlow*1.4)*meteorStrength*stars*horizonFade;
    }
    return c;
  }
`;
