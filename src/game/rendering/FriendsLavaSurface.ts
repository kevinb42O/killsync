/** Shared world-space crust: the caldera and its outlet use the same palette
 * and detail scale. Fine fissures sit inside broad, slowly moving crust rafts. */
export const LAVA_SURFACE_GLSL=`
float lavaHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float lavaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(lavaHash(i),lavaHash(i+vec2(1,0)),f.x),mix(lavaHash(i+vec2(0,1)),lavaHash(i+1.),f.x),f.y);}
vec3 lavaSurface(vec2 world,float seconds,float descent,float cooling){
  vec2 p=world/110.-vec2(.49757,.86742)*seconds*(.035+descent*.16);
  vec2 warp=vec2(lavaNoise(p*.38+seconds*.012),lavaNoise(p*.41-seconds*.009));
  p+=(warp-.5)*1.9;
  float field=lavaNoise(p)*.58+lavaNoise(p*2.13)*.29+lavaNoise(p*4.71)*.13;
  float crust=smoothstep(.43,.64,field+cooling*.1);
  float fissure=(1.-smoothstep(.012,.055,abs(field-.515)))*( .48+.52*lavaNoise(p*3.7));
  float heat=clamp((1.-crust)*.72+fissure*.7,0.,1.);
  vec3 rock=mix(vec3(.038,.023,.019),vec3(.095,.041,.023),lavaNoise(p*7.3));
  vec3 molten=mix(vec3(.65,.026,.003),vec3(1.35,.67,.09),pow(heat,2.2));
  molten*=.76+.24*lavaNoise(p*6.3);
  molten+=vec3(.025,.008,.002)*(lavaNoise(p*21.7)-.5);
  return mix(rock,molten,heat)*(1.-cooling*.38);
}
`;
