/** A host-side, two-axis pendulum. No rope particles or extra rigid bodies.
 * Coordinates and gravity use world units; velocities are relative to the tip. */
export type CraneSway = { x:number; y:number; vx:number; vy:number };
export function craneCableDrop(length:number,x:number,y:number) {
  return Math.sqrt(Math.max(1,length*length-x*x-y*y));
}
export function stepCraneSway(s:CraneSway,length:number,seconds:number,stabilized:boolean,tipDeltaVX=0,tipDeltaVY=0):CraneSway {
  const dt=Math.max(0,Math.min(.1,seconds)),omega=Math.sqrt(320/Math.max(24,length));
  let {x,y,vx,vy}=s;vx-=tipDeltaVX;vy-=tipDeltaVY;
  const damping=stabilized?2*omega:.28;
  const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
  for(let i=0;i<steps;i++) {
    vx=(vx-omega*omega*x*h)*Math.exp(-damping*h);
    vy=(vy-omega*omega*y*h)*Math.exp(-damping*h);
    const speed=Math.hypot(vx,vy);if(speed>280){vx*=280/speed;vy*=280/speed;}
    x+=vx*h;y+=vy*h;
    const radius=Math.hypot(x,y),limit=Math.min(192,length*Math.sin(Math.PI/7));
    if(radius>limit){x*=limit/radius;y*=limit/radius;const outward=(vx*x+vy*y)/(limit*limit);if(outward>0){vx-=outward*x;vy-=outward*y;}}
  }
  if(Math.hypot(x,y)<.015&&Math.hypot(vx,vy)<.03)return {x:0,y:0,vx:0,vy:0};
  return {x,y,vx,vy};
}
