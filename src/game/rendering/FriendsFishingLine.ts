import * as THREE from 'three';
const N=25;
/** Fixed 25-node Verlet line, four constraint passes and one small ribbon draw.
 * The solver is cosmetic and stays independent of host/network frame rate. */
export class FriendsFishingLine extends THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>{
  readonly points=Array.from({length:N},()=>new THREE.Vector3());
  private previous=Array.from({length:N},()=>new THREE.Vector3());
  private start=new THREE.Vector3(Infinity,0,0);
  private end=new THREE.Vector3();
  private accumulator=0;
  private initialized=false;
  private delta=new THREE.Vector3();
  private tangent=new THREE.Vector3();
  private side=new THREE.Vector3();
  private view=new THREE.Vector3();
  private backbone=new THREE.Vector3();
  constructor(){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*2*3),3).setUsage(THREE.DynamicDrawUsage));
    const indices:number[]=[];for(let i=0;i<N-1;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}geometry.setIndex(indices);
    super(geometry,new THREE.MeshBasicMaterial({color:'#d8e9db',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));this.name='fishing-line';this.frustumCulled=false;
  }
  update(from:THREE.Vector3,to:THREE.Vector3,slack:number,dt:number,camera:THREE.Vector3,waterLevel?:number){
    const distance=from.distanceTo(to),length=distance+Math.max(1,slack),step=length/(N-1);
    if(!this.initialized||this.start.distanceTo(from)>120||this.end.distanceTo(to)>140){
      for(let i=0;i<N;i++){this.points[i].lerpVectors(from,to,i/(N-1));this.points[i].y-=Math.sin(i/(N-1)*Math.PI)*slack*.35;this.previous[i].copy(this.points[i]);}this.initialized=true;this.accumulator=0;
    }
    this.start.copy(from);this.end.copy(to);this.accumulator=Math.min(1/30,this.accumulator+Math.min(50,Math.max(0,dt))/1000);
    for(let sub=0;sub<4&&this.accumulator>=1/120;sub++){
      this.accumulator-=1/120;
      for(let i=1;i<N-1;i++){const p=this.points[i],old=this.previous[i];this.delta.subVectors(p,old).multiplyScalar(.96);old.copy(p);p.add(this.delta);p.y-=100/(120*120);
        // A weak curved backbone prevents a near-camera filament from folding
        // behind the eye during long casts or low-frame-rate corrections.
        const t=i/(N-1);this.backbone.lerpVectors(from,to,t);this.backbone.y-=Math.sin(t*Math.PI)*Math.sqrt(Math.max(0,length*length-distance*distance))*.25;p.lerp(this.backbone,.045);
      }
      for(let pass=0;pass<4;pass++){
        this.points[0].copy(from);this.points[N-1].copy(to);
        for(let j=0;j<N-1;j++){const i=pass%2?N-2-j:j,a=this.points[i],b=this.points[i+1];this.delta.subVectors(b,a);const d=this.delta.length();if(d<1e-6)continue;this.delta.multiplyScalar((d-step)/d);
          if(i===0)b.sub(this.delta);else if(i===N-2)a.add(this.delta);else{a.addScaledVector(this.delta,.5);b.addScaledVector(this.delta,-.5);}}
      }
      if(waterLevel!==undefined)for(let i=1;i<N-1;i++){
        // Surface drag keeps loose filament floating instead of hanging far
        // below the lake. Damp the wet nodes without losing the pinned tip.
        const p=this.points[i];if(p.y<waterLevel){p.y=waterLevel;this.previous[i].lerp(p,.25);}
      }
    }
    this.points[0].copy(from);this.points[N-1].copy(to);
    const positions=this.geometry.getAttribute('position') as THREE.BufferAttribute;
    for(let i=0;i<N;i++){
      const p=this.points[i];this.tangent.subVectors(this.points[Math.min(N-1,i+1)],this.points[Math.max(0,i-1)]).normalize();this.view.subVectors(camera,p);this.side.crossVectors(this.tangent,this.view).normalize();
      // A tiny distance-scaled width keeps the filament readable at range.
      const width=Math.max(.002,Math.min(.24,this.view.length()*.0008));
      positions.setXYZ(i*2,p.x+this.side.x*width,p.y+this.side.y*width,p.z+this.side.z*width);positions.setXYZ(i*2+1,p.x-this.side.x*width,p.y-this.side.y*width,p.z-this.side.z*width);
    }
    positions.needsUpdate=true;
  }
  dispose(){this.geometry.dispose();this.material.dispose();}
}
