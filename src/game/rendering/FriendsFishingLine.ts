import * as THREE from 'three';
const N=25;
export const FISHING_LINE_WIDTH_PX=3.25;
/** A continuous gravity-sag curve avoids constraint-solver kinks when the rod
 * or networked float moves. One reusable ribbon keeps a readable pixel width. */
export class FriendsFishingLine extends THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>{
  readonly points=Array.from({length:N},()=>new THREE.Vector3());
  private sides=Array.from({length:N},()=>new THREE.Vector3());
  private start=new THREE.Vector3(Infinity,0,0);
  private end=new THREE.Vector3();
  private sag=0;
  private initialized=false;
  private tangent=new THREE.Vector3();
  private side=new THREE.Vector3();
  private view=new THREE.Vector3();
  private forward=new THREE.Vector3();
  private right=new THREE.Vector3(1,0,0);
  private cameraRotation=new THREE.Quaternion();
  constructor(){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*2*3),3).setUsage(THREE.DynamicDrawUsage));
    const indices:number[]=[];for(let i=0;i<N-1;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}geometry.setIndex(indices);
    super(geometry,new THREE.MeshBasicMaterial({color:'#fff1cc',side:THREE.DoubleSide,toneMapped:false}));this.name='fishing-line';this.frustumCulled=false;
  }
  update(from:THREE.Vector3,to:THREE.Vector3,slack:number,dt:number,camera:THREE.Vector3,waterLevel?:number,renderCamera?:THREE.PerspectiveCamera,viewportHeight=900){
    const distance=from.distanceTo(to),extra=Math.max(0,slack),targetSag=Math.sqrt(extra*(2*distance+extra))*.32;
    const reset=!this.initialized||this.start.distanceTo(from)>120||this.end.distanceTo(to)>140;
    if(reset){this.sag=targetSag;this.initialized=true;for(const side of this.sides)side.set(0,0,0);}
    else this.sag=THREE.MathUtils.lerp(this.sag,targetSag,1-Math.exp(-Math.max(0,Math.min(100,dt))*.018));
    this.start.copy(from);this.end.copy(to);
    for(let i=0;i<N;i++){
      const t=i/(N-1),p=this.points[i];p.lerpVectors(from,to,t);p.y-=Math.sin(t*Math.PI)*this.sag;
      // Keep loose line just above the water, clear of the surface's depth
      // buffer. Leave the rod tip and float attachment exactly pinned.
      if(waterLevel!==undefined&&i>0&&i<N-1)p.y=Math.max(p.y,waterLevel+.8);
    }
    if(renderCamera){renderCamera.getWorldDirection(this.forward);this.right.set(1,0,0).applyQuaternion(renderCamera.getWorldQuaternion(this.cameraRotation));}
    const tangentFov=Math.tan(THREE.MathUtils.degToRad((renderCamera?.fov??85)/2)),pixels=Math.max(1,viewportHeight);
    const positions=this.geometry.getAttribute('position') as THREE.BufferAttribute;
    for(let i=0;i<N;i++){
      const p=this.points[i];this.tangent.subVectors(this.points[Math.min(N-1,i+1)],this.points[Math.max(0,i-1)]).normalize();this.view.subVectors(camera,p);
      this.side.crossVectors(this.tangent,this.view);
      // Looking along a strand makes the billboard axis ambiguous. Reuse its
      // last direction at that singularity, and keep neighboring edges aligned.
      if(this.side.lengthSq()<1e-8)this.side.copy(this.sides[i].lengthSq()?this.sides[i]:i>0?this.sides[i-1]:this.right);
      this.side.normalize();
      const reference=i>0?this.sides[i-1]:this.sides[i];if(this.side.dot(reference)<0)this.side.negate();this.sides[i].copy(this.side);
      const depth=renderCamera?Math.max(renderCamera.near,-this.view.dot(this.forward)):Math.max(.025,this.view.length());
      // Half-width: 2 * depth * tan(fov/2) is the visible world-space height.
      const width=FISHING_LINE_WIDTH_PX*depth*tangentFov/pixels;
      positions.setXYZ(i*2,p.x+this.side.x*width,p.y+this.side.y*width,p.z+this.side.z*width);positions.setXYZ(i*2+1,p.x-this.side.x*width,p.y-this.side.y*width,p.z-this.side.z*width);
    }
    positions.needsUpdate=true;
  }
  dispose(){this.geometry.dispose();this.material.dispose();}
}
