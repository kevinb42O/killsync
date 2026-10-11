/** A pleasure pier inspired by Blankenberge's concrete promenade and rotunda.
 * Dimensions suit this island; local X runs from the beach out to sea. */
export const FRIENDS_SEASIDE_PIER = {
  x: 4368, y: 4160, angle: -3 * Math.PI / 4,
  landing: -92, deck: 96, rampLanding: 128, ramp: 640, length: 3600, width: 384,
  terraceRadius: 640, pavilionRadius: 448, pavilionHeight: 224,
} as const;

export function seasidePierLocal(x:number,y:number) {
  const p=FRIENDS_SEASIDE_PIER,dx=x-p.x,dy=y-p.y,c=Math.cos(p.angle),s=Math.sin(p.angle);
  return {along:dx*c+dy*s,across:-dx*s+dy*c};
}
export function seasidePierPoint(along:number,across=0) {
  const p=FRIENDS_SEASIDE_PIER,c=Math.cos(p.angle),s=Math.sin(p.angle);
  return {x:p.x+c*along-s*across,y:p.y+s*along+c*across};
}
export function seasidePierDeck(along:number) {
  const p=FRIENDS_SEASIDE_PIER;
  return p.landing+(p.deck-p.landing)*Math.max(0,Math.min(1,(along-p.rampLanding)/(p.ramp-p.rampLanding)));
}
export function friendsSeasidePierSurface(x:number,y:number) {
  const p=FRIENDS_SEASIDE_PIER,{along,across}=seasidePierLocal(x,y);
  if(Math.hypot(along-p.length,across)<=p.terraceRadius)return p.deck;
  if(along>=0&&along<=p.length&&Math.abs(across)<=p.width/2)return seasidePierDeck(along);
  return undefined;
}

/** Rails and the pavilion facade have the same footprint as the visible model.
 * The entrance faces the promenade; jumping above the rails remains possible. */
export function collideSeasidePier(point:{x:number;y:number},z:number,radius:number,height=50) {
  const p=FRIENDS_SEASIDE_PIER,local=seasidePierLocal(point.x,point.y);let collided=false;
  if(local.along>=0&&local.along<p.length-Math.sqrt(p.terraceRadius**2-(p.width/2)**2)) {
    const deck=seasidePierDeck(local.along),distance=Math.abs(Math.abs(local.across)-p.width/2);
    if(z<deck+36&&z+height>deck&&distance<radius+3){local.across=Math.sign(local.across)*(p.width/2+(Math.abs(local.across)<p.width/2?-radius-3:radius+3));collided=true;}
  }
  const dx=local.along-p.length,r=Math.hypot(dx,local.across),angle=Math.atan2(local.across,dx);
  const pushCircle=(wall:number)=>{const delta=wall+(r<wall?-radius-3:radius+3);local.along=p.length+dx/Math.max(.001,r)*delta;local.across=local.across/Math.max(.001,r)*delta;collided=true;};
  // Omit the landward terrace railing where the gangway enters.
  if(z<p.deck+36&&z+height>p.deck&&Math.abs(r-p.terraceRadius)<radius+3&&!(dx<0&&Math.abs(local.across)<p.width/2))pushCircle(p.terraceRadius);
  const entrance=dx<0&&Math.abs(local.across)<88;
  if(z<p.deck+p.pavilionHeight&&z+height>p.deck&&Math.abs(r-p.pavilionRadius)<radius+3&&!entrance)pushCircle(p.pavilionRadius);
  if(collided){const world=seasidePierPoint(local.along,local.across);point.x=world.x;point.y=world.y;}
  return collided;
}

/** Shared analytic hits for the solid glazing, rails and walking slab. */
export function raycastSeasidePier(ray:{x:number;y:number;z:number;dx:number;dy:number;dz:number},maxDistance:number){
  const p=FRIENDS_SEASIDE_PIER,o=seasidePierLocal(ray.x,ray.y),c=Math.cos(p.angle),s=Math.sin(p.angle);
  const da=ray.dx*c+ray.dy*s,dc=-ray.dx*s+ray.dy*c;
  const endA=o.along+da*maxDistance,endC=o.across+dc*maxDistance;
  if(Math.max(o.along,endA)<0||Math.min(o.along,endA)>p.length+p.terraceRadius||Math.max(o.across,endC)<-p.terraceRadius||Math.min(o.across,endC)>p.terraceRadius)return;
  let best:{x:number;y:number;z:number;distance:number;nx:number;ny:number;nz:number}|undefined;
  const hit=(t:number,na:number,nc:number,nz:number)=>{
    if(t<0||t>maxDistance||best&&t>=best.distance)return;
    const n=Math.hypot(na,nc,nz);best={x:ray.x+ray.dx*t,y:ray.y+ray.dy*t,z:ray.z+ray.dz*t,distance:t,nx:(na*c-nc*s)/n,ny:(na*s+nc*c)/n,nz:nz/n};
  };
  const railEnd=p.length-Math.sqrt(p.terraceRadius**2-(p.width/2)**2);
  if(Math.abs(dc)>1e-10)for(const side of [-1,1]){
    const t=(side*p.width/2-o.across)/dc,a=o.along+da*t,z=ray.z+ray.dz*t,deck=seasidePierDeck(a);
    if(a>=0&&a<railEnd&&z>=deck&&z<=deck+36)hit(t,0,side,0);
  }
  const qa=da*da+dc*dc,dx=o.along-p.length;
  if(qa>1e-10)for(const [radius,height,opening] of [[p.terraceRadius,36,p.width/2],[p.pavilionRadius,p.pavilionHeight,88]]){
    const qb=2*(dx*da+o.across*dc),qc=dx*dx+o.across**2-radius**2,disc=qb*qb-4*qa*qc;
    if(disc<0)continue;
    for(const t of [(-qb-Math.sqrt(disc))/(2*qa),(-qb+Math.sqrt(disc))/(2*qa)]){
      const a=dx+da*t,across=o.across+dc*t,z=ray.z+ray.dz*t;
      if(z>=p.deck&&z<=p.deck+height&&!(a<0&&Math.abs(across)<opening))hit(t,a,across,0);
    }
  }
  // Test the top and underside in each flat/ramp section, retaining openings.
  for(const [start,end,slope,intercept] of [[0,p.rampLanding,0,p.landing],[p.rampLanding,p.ramp,(p.deck-p.landing)/(p.ramp-p.rampLanding),p.landing-p.rampLanding*(p.deck-p.landing)/(p.ramp-p.rampLanding)],[p.ramp,p.length+p.terraceRadius,0,p.deck]]){
    const denominator=ray.dz-slope*da;if(Math.abs(denominator)<1e-10)continue;
    for(const underside of [false,true]){
      const t=(slope*o.along+intercept-(underside?18:0)-ray.z)/denominator,a=o.along+da*t,across=o.across+dc*t;
      if(a<start||a>end)continue;
      const world=seasidePierPoint(a,across);
      if(friendsSeasidePierSurface(world.x,world.y)===undefined)continue;
      hit(t,underside?slope:-slope,0,underside?-1:1);
    }
  }
  return best;
}

export const PIER_CAFE_ID = 'seaside-pier-cafe';
export const PIER_CAFE_TABLES = Array.from({length:12},(_,i)=>{
  const angle=i*Math.PI/6;
  return {along:FRIENDS_SEASIDE_PIER.length+Math.cos(angle)*310,across:Math.sin(angle)*310,angle,index:i};
}).filter(table=>table.index!==6); // Leave the landward doorway and its aisle clear.
/** Shared furniture layout: visual chair fronts, seated avatars and exits agree. */
export const PIER_CAFE_CHAIRS = PIER_CAFE_TABLES.flatMap(table=>[-1,1].map((side,j)=>{
  const dx=-Math.sin(table.angle)*side,dy=Math.cos(table.angle)*side;
  const along=table.along+dx*52,across=table.across+dy*52;
  return {along,across,index:table.index*2+j,angle:FRIENDS_SEASIDE_PIER.angle+Math.atan2(-dy,-dx),
    ...seasidePierPoint(along,across),z:FRIENDS_SEASIDE_PIER.deck+18,
    exit:{...seasidePierPoint(along+dx*30,across+dy*30),z:FRIENDS_SEASIDE_PIER.deck},siteId:PIER_CAFE_ID};
}));

/** Sample the whole pile footprint, sinking its base beneath the lowest bed. */
export function seasidePierSupports(ground:(x:number,y:number)=>number) {
  const p=FRIENDS_SEASIDE_PIER,columns:Array<{along:number;across:number;top:number;bottom:number;radius:number}>=[];
  const add=(along:number,across:number,top:number,radius:number)=>{
    const depths:number[]=[];
    for(const dx of [-48,0,48])for(const dy of [-48,0,48]){const w=seasidePierPoint(along+dx,across+dy);depths.push(ground(w.x,w.y));}
    columns.push({along,across,top,radius,bottom:Math.min(...depths)-96});
  };
  const end=p.length-Math.sqrt(p.terraceRadius**2-(p.width/2)**2);
  for(let x=192;x<end;x+=288)for(const side of [-1,1])add(x,side*(p.width/2-40),seasidePierDeck(x)-20,14);
  for(let i=0;i<16;i++){const a=i*Math.PI/8;add(p.length+Math.cos(a)*540,Math.sin(a)*540,p.deck-24,20);}
  return columns;
}
