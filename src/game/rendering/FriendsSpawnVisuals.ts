import * as THREE from 'three';
import type { CoopCombatEvent, CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';

export const FRIENDS_ARRIVAL_MS = 1500;
type Arrival = { root: THREE.Group; age: number; beam: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>; rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[]; sparks: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[] };

/** A world-space teleport effect: no camera transforms, shake, or physics. */
export class FriendsSpawnVisuals extends THREE.Group {
  private players = new Set<string>();
  private lastEvent = new Map<string, number>();
  private arrivals = new Map<string, Arrival>();

  constructor() { super(); this.name = 'friends-player-arrivals'; }

  update(players: readonly CoopPlayerSnapshot[], events: readonly CoopCombatEvent[], deltaMs: number) {
    for (const [id, effect] of this.arrivals) {
      effect.age += Math.max(0, deltaMs);
      if (effect.age >= FRIENDS_ARRIVAL_MS) { this.release(effect); this.arrivals.delete(id); }
      else this.animate(effect);
    }
    const arriving = new Set<string>();
    for (const player of players) {
      const eventId = events.reduce((id, event) => event.kind === 'player_redeployed' && event.playerId === player.id ? Math.max(id, event.id) : id, -1);
      if (player.lifeState === 'alive' && (!this.players.has(player.id) || eventId > (this.lastEvent.get(player.id) ?? -1))) {
        arriving.add(player.id);
        this.start(player);
      }
      this.players.add(player.id);
      this.lastEvent.set(player.id, Math.max(eventId, this.lastEvent.get(player.id) ?? -1));
    }
    for (const id of this.players) if (!players.some(player => player.id === id)) { this.players.delete(id); this.lastEvent.delete(id); }
    return arriving;
  }

  private start(player: CoopPlayerSnapshot) {
    const previous = this.arrivals.get(player.id); if (previous) this.release(previous);
    const root = new THREE.Group(); root.name = `arrival-${player.id}`; root.position.set(player.x, player.z, player.y); this.add(root);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 160, 40, 1, true), new THREE.ShaderMaterial({
      uniforms: { progress: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float progress;varying vec2 vUv;void main(){float fade=sin(progress*3.14159);float scan=pow(max(0.,1.-abs(vUv.y-progress)*7.),3.);float bands=.5+.5*sin(vUv.y*110.-progress*24.);gl_FragColor=vec4(.32,1.,.82,fade*(.025+scan*.22+bands*.015));}',
    }));
    beam.position.y = 80; root.add(beam);
    const rings = [0, 1].map(() => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(29, 31, 64), new THREE.MeshBasicMaterial({ color: '#8de6ce', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI/2; ring.position.y = 1; root.add(ring); return ring;
    });
    const sparks = Array.from({ length: 16 }, (_, i) => {
      const spark = new THREE.Mesh(new THREE.OctahedronGeometry(i%3 ? 1.1 : 1.8), new THREE.MeshBasicMaterial({ color: i%3 ? '#8de6ce' : '#ffe2aa', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      root.add(spark); return spark;
    });
    const effect = { root, age: 0, beam, rings, sparks }; this.arrivals.set(player.id, effect); this.animate(effect);
  }

  private animate(effect: Arrival) {
    const t = effect.age/FRIENDS_ARRIVAL_MS;
    effect.beam.material.uniforms.progress.value = t;
    effect.rings.forEach((ring, i) => {
      const phase = Math.max(0, Math.min(1, (t-i*.14)/.75));
      ring.scale.setScalar(1+phase*3.4); ring.material.opacity = t > i*.14 ? Math.sin(phase*Math.PI)*.65 : 0;
    });
    effect.sparks.forEach((spark, i) => {
      const phase = Math.min(1, t*(1+i%4*.12)), angle = i*Math.PI*2/16+phase*1.8;
      const radius = 44+(1-phase)*18;
      spark.position.set(Math.cos(angle)*radius, 5+phase*120, Math.sin(angle)*radius);
      spark.rotation.set(phase*3, angle, phase*2); spark.material.opacity = Math.sin(phase*Math.PI)*.8;
    });
  }

  private release(effect: Arrival) {
    effect.root.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); node.material.dispose(); } });
    effect.root.removeFromParent();
  }
  clear() { for (const effect of this.arrivals.values()) this.release(effect); this.arrivals.clear(); this.players.clear(); this.lastEvent.clear(); return this; }
  dispose() { this.clear(); this.removeFromParent(); }
}
