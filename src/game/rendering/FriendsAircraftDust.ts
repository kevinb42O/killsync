import * as THREE from 'three';
import type { FriendsVehicle } from '../multiplayer/FriendsExpedition';

const CAPACITY = 96;
/** One draw call, fixed buffers, no textures, lights, shadows or physics bodies. */
export class FriendsAircraftDust {
  readonly points: THREE.Points;
  private positions = new Float32Array(CAPACITY * 3);
  private life = new Float32Array(CAPACITY);
  private size = new Float32Array(CAPACITY);
  private vx = new Float32Array(CAPACITY);
  private vy = new Float32Array(CAPACITY);
  private vz = new Float32Array(CAPACITY);
  private cursor = 0;
  private emission = 0;
  private lastMs?: number;
  private clearance = Infinity;
  constructor(parent: THREE.Group) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('life', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      vertexShader: `attribute float life;attribute float size;varying float alpha;void main(){alpha=sin(clamp(life/1.8,0.,1.)*3.14159)*.22;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*projectionMatrix[1][1]*600./max(1.,-mv.z),1.,96.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.15,1.,r))*alpha;if(a<.003)discard;gl_FragColor=vec4(.65,.57,.43,a);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include', ';\n#include'),
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'helicopter-rotor-dust';
    this.points.frustumCulled = false; // World-space particles move outside the initial bounds.
    this.points.visible = false;
    parent.add(this.points);
  }
  update(vehicle: FriendsVehicle | undefined, elapsedMs: number) {
    const dt = this.lastMs === undefined ? 0 : Math.max(0, Math.min(.05, (elapsedMs-this.lastMs)/1000));
    this.lastMs = elapsedMs;
    let alive = 0;
    const drag = Math.exp(-1.5*dt);
    for (let i=0;i<CAPACITY;i++) {
      if (this.life[i]<=0) continue;
      this.life[i]=Math.max(0,this.life[i]-dt);
      const j=i*3;
      this.positions[j]+=this.vx[i]*dt;this.positions[j+1]+=this.vy[i]*dt;this.positions[j+2]+=this.vz[i]*dt;
      this.vx[i]*=drag;this.vz[i]*=drag;this.vy[i]*=Math.exp(-.6*dt);
      this.size[i]+=24*dt;
      if(this.life[i]>0)alive++;
    }
    const clearance=vehicle?.groundZ===undefined?Infinity:Math.max(0,vehicle.z-14-vehicle.groundZ);
    if(vehicle?.pilotId && clearance<240) {
      const wash=1-clearance/240;
      this.emission+=dt*48*wash*wash;
      if(this.clearance>2 && clearance<=2)this.emission+=24;
      while(this.emission>=1){this.emit(vehicle,wash);this.emission--;alive++;}
    } else this.emission=0;
    this.clearance=clearance;
    this.points.visible=alive>0;
    if(alive>0)for(const attribute of Object.values(this.points.geometry.attributes))attribute.needsUpdate=true;
  }
  private emit(vehicle: FriendsVehicle, wash: number) {
    const i=this.cursor++%CAPACITY,j=i*3,angle=Math.random()*Math.PI*2,r=45+Math.random()*105,speed=(45+Math.random()*90)*wash;
    this.positions[j]=vehicle.x+Math.cos(angle)*r;
    this.positions[j+1]=vehicle.groundZ!+3+Math.random()*5;
    this.positions[j+2]=vehicle.y+Math.sin(angle)*r;
    this.vx[i]=Math.cos(angle)*speed;this.vy[i]=12+Math.random()*25;this.vz[i]=Math.sin(angle)*speed;
    this.life[i]=1.8;this.size[i]=22+Math.random()*26;
  }
}
