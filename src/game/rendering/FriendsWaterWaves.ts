/** Shared by the visible sheet and the camera waterline mask. */
export const friendsWaterWaveUniforms=`uniform float time,wavePatch,waveAmplitude,ocean,patchHalfExtent,shorebreakStrength;
uniform sampler2D bathymetry;uniform vec2 waterOrigin,waterExtent,patchCentre;`;
export const friendsWaterWaveShader=`      vec4 coastAt(vec2 uv){
        vec2 size=vec2(textureSize(bathymetry,0));
        vec2 cell=clamp(uv*size-.5,vec2(0.),size-1.),base=floor(cell),f=fract(cell);
        vec2 a=(base+.5)/size,b=min(base+1.5,size-.5)/size;
        return mix(mix(texture2D(bathymetry,a),texture2D(bathymetry,vec2(b.x,a.y)),f.x),
          mix(texture2D(bathymetry,vec2(a.x,b.y)),texture2D(bathymetry,b),f.x),f.y);
      }
      float coastPhase(vec2 p,vec4 coast){return coast.g*.026+time*.90+sin(p.x*.003+p.y*.002)*.45;}
      float coastWeight(float depth,vec4 coast){return shorebreakStrength*(1.-smoothstep(65.,150.,depth))*smoothstep(2.,18.,depth)*smoothstep(.015,.05,length(coast.ba))*(1.-smoothstep(.65,1.8,length(coast.ba)));}

float friendsWaterWaveHeight(vec2 p,float baseHeight){
        vec2 uv=(p-waterOrigin)/waterExtent;
        float depth=texture2D(bathymetry,clamp(uv,0.,1.)).r;
        float shallow=smoothstep(2.,72.,depth);
        float edge=ocean>.5?1.-smoothstep(patchHalfExtent-700.,patchHalfExtent,max(abs(p.x-patchCentre.x),abs(p.y-patchCentre.y))):1.;
        vec2 wavePosition=p*mix(1.,1.75,ocean);
        float displacement=sin(dot(wavePosition,vec2(.0051,.0037))-time*.95)*.60
          +sin(dot(wavePosition,vec2(-.0082,.0046))+time*.78)*.28+sin(dot(wavePosition,vec2(.016,.012))-time*1.7)*.12;
        if(ocean>.5&&shorebreakStrength>0.&&depth<150.){
          vec4 coast=coastAt(uv);float phase=coastPhase(p,coast);
          // A steep front and broad trough, bounded by the existing wave cap.
          float crest=pow(max(0.,sin(phase)),3.)*1.2-.2;
          displacement=mix(displacement,crest,coastWeight(depth,coast));
        }
        return displacement*waveAmplitude*wavePatch*shallow*edge;
}`;
