/** The retained timber fishing dock, moved to the quieter western beach. */
export const FRIENDS_COASTAL_PIER = {
  x: 2592, y: 5800, angle: Math.PI, deck: -96,
  width: 144, sectionLength: 132, sections: 6, modelScale: 48,
  headWidth: 396,
  approachLength:448, rampLength:352, approachWidth:208, approachTop:2,
} as const;

export function coastalPierLocal(x: number, y: number) {
  const p = FRIENDS_COASTAL_PIER, dx = x - p.x, dy = y - p.y;
  const c = Math.cos(p.angle), s = Math.sin(p.angle);
  return { along: dx * c + dy * s, across: -dx * s + dy * c };
}

export function coastalPierApproachHeight(along:number){
  const p=FRIENDS_COASTAL_PIER;
  return p.approachTop+(p.deck-p.approachTop)*Math.max(0,Math.min(1,(along+p.rampLength)/p.rampLength));
}
export function coastalPierApproachWidth(along:number){
  const p=FRIENDS_COASTAL_PIER;
  return p.width+(p.approachWidth-p.width)*Math.max(0,Math.min(1,-along/p.rampLength));
}
/** Clear the sand beneath the wood, with a narrow feathered shoulder. The
 * flat inland landing begins before the cut, so its beach entry stays flush. */
export function coastalPierTerrain(x:number,y:number,height:number){
  const p=FRIENDS_COASTAL_PIER;
  if(x<p.x-224||x>p.x+p.approachLength+208||Math.abs(y-p.y)>208)return height;
  const {along,across}=coastalPierLocal(x,y);
  const smooth=(v:number)=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
  // Rounded sand landing beyond the planks: remove the nearby uphill voxel
  // lip across the entrance width, rather than requiring a jump off the ramp.
  if(height>0){
    const radius=Math.hypot((along+p.approachLength)/1.1,across);
    height*=smooth((radius-64)/112);
  }
  if(along<-416||along>192)return height;
  const top=coastalPierApproachHeight(along),half=coastalPierApproachWidth(along)/2;
  const weight=(1-smooth((Math.abs(across)-half-16)/64))*smooth((along+416)/48)*(1-smooth((along-128)/64));
  const bed=Math.floor((top-24)/32)*32;
  return Math.min(height,height+(bed-height)*weight);
}

/** Deck collision is shared by host simulation and client prediction. */
export function friendsCoastalPierSurface(x: number, y: number) {
  const p = FRIENDS_COASTAL_PIER, { along, across } = coastalPierLocal(x, y);
  if(along>=-p.approachLength&&along<0&&Math.abs(across)<=coastalPierApproachWidth(along)/2)return coastalPierApproachHeight(along);
  const stem = along >= 0 && along <= (p.sections - 1) * p.sectionLength && Math.abs(across) <= p.width / 2;
  const head = along >= (p.sections - 1) * p.sectionLength && along <= p.sections * p.sectionLength && Math.abs(across) <= p.headWidth / 2;
  if (stem || head) return p.deck;
  return undefined;
}
