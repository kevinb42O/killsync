import * as THREE from 'three';
import type { CoopSnapshot } from '../multiplayer/CoopSimulation';
import { COOP_UPLINK_RADIUS } from '../multiplayer/CoopRunDirector';

export class CoopTacticalVisuals {
  private readonly zones = new Map<string, THREE.Group>();

  constructor(private readonly scene: THREE.Scene) {}

  update(snapshot: CoopSnapshot, elapsedMs: number) {
    const active = new Set<string>();
    const objective = snapshot.run.objective;
    if (objective) {
      const key = `objective-${objective.id}`;
      active.add(key);
      const zone = this.getZone(key, true);
      const uplink = objective.kind === 'uplink';
      const color = objective.contested ? '#fb7185' : uplink ? '#2dd4bf' : '#fbbf24';
      zone.position.set(objective.x, 2, objective.y);
      const ring = zone.getObjectByName('ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      ring.scale.setScalar(uplink ? COOP_UPLINK_RADIUS : 65);
      ring.material.color.set(color);
      const fill = zone.getObjectByName('fill') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      fill.scale.setScalar(uplink ? COOP_UPLINK_RADIUS : 65); fill.material.color.set(color); fill.material.opacity = .045;
      const beacon = zone.getObjectByName('beacon')!;
      beacon.visible = uplink;
      const signal = zone.getObjectByName('signal') as THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
      signal.rotation.y = elapsedMs / 1200;
      signal.position.y = 125 + Math.sin(elapsedMs / 600) * 7;
      signal.material.color.set(color);
      const progress = zone.getObjectByName('progress')!;
      progress.scale.y = Math.max(.01, objective.progress / objective.required);
      progress.position.y = 3 + 45 * progress.scale.y;
    }
    for (const hazard of snapshot.hazards || []) {
      const key = `hazard-${hazard.id}`;
      active.add(key);
      const zone = this.getZone(key, false, hazard.kind);
      zone.position.set(hazard.x, 3, hazard.y);
      const progress = Math.max(0, Math.min(1, (elapsedMs - hazard.startsAtMs) / (hazard.resolvesAtMs - hazard.startsAtMs)));
      const detonated = elapsedMs >= hazard.resolvesAtMs;
      const ring = zone.getObjectByName('ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const fill = zone.getObjectByName('fill') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      ring.material.color.set(detonated ? '#ffffff' : hazard.color);
      ring.scale.setScalar(hazard.radius);
      ring.material.opacity = detonated ? .7 : .75 + Math.sin(elapsedMs / 70) * .2;
      fill.material.color.set(hazard.color);
      fill.scale.setScalar(hazard.radius * (detonated ? 1 : Math.max(.05, progress)));
      fill.material.opacity = detonated ? .3 : .08 + progress * .13;
      const inner = zone.getObjectByName('inner') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const marker = zone.getObjectByName('marker') as THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
      inner.material.color.set(hazard.color);
      inner.visible = hazard.kind === 'artillery' || hazard.kind === 'shockwave';
      inner.scale.setScalar(hazard.radius * (hazard.kind === 'shockwave' ? .12 + progress * .83 : .42 + Math.sin(elapsedMs / 100) * .035));
      inner.material.opacity = detonated ? 0 : hazard.kind === 'shockwave' ? .30 + progress * .55 : .8;
      marker.visible = hazard.kind === 'lunge' || hazard.kind === 'ambush';
      marker.material.color.set(hazard.color);
      marker.position.y = 9 + (1 - progress) * 28;
      marker.rotation.y = elapsedMs / (hazard.kind === 'ambush' ? 90 : 180);
      marker.scale.setScalar(hazard.radius * (.10 + progress * .055));
      marker.material.opacity = detonated ? 0 : .35 + progress * .6;
    }
    for (const [key, zone] of this.zones) {
      if (active.has(key)) continue;
      this.disposeZone(zone); this.zones.delete(key);
    }
  }

  dispose() {
    for (const zone of this.zones.values()) this.disposeZone(zone);
    this.zones.clear();
  }

  private getZone(key: string, objective: boolean, hazardKind?: string) {
    const existing = this.zones.get(key);
    if (existing) return existing;
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(.975, 1, 64), new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ring.name = 'ring'; ring.rotation.x = -Math.PI / 2; group.add(ring);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: .06, side: THREE.DoubleSide, depthWrite: false }));
    fill.name = 'fill'; fill.rotation.x = -Math.PI / 2; fill.position.y = -.3; group.add(fill);
    if (!objective) {
      const inner = new THREE.Mesh(new THREE.RingGeometry(.88, 1, hazardKind === 'shockwave' ? 20 : 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      inner.name = 'inner'; inner.rotation.x = -Math.PI / 2; inner.position.y = .35; group.add(inner);
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .8, wireframe: true, depthWrite: false, toneMapped: false }));
      marker.name = 'marker'; marker.visible = false; group.add(marker);
    }
    if (objective) {
      const beacon = new THREE.Group(); beacon.name = 'beacon'; group.add(beacon);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(22, 30, 12, 6), new THREE.MeshStandardMaterial({ color: '#33494d', metalness: .75, roughness: .4 }));
      base.position.y = 6; beacon.add(base);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(4, 8, 90, 6), new THREE.MeshStandardMaterial({ color: '#b4c6c9', metalness: .7, roughness: .3 }));
      column.position.y = 50; beacon.add(column);
      const progress = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 90, 8), new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: .6, toneMapped: false }));
      progress.name = 'progress'; beacon.add(progress);
      const signal = new THREE.Mesh(new THREE.OctahedronGeometry(16), new THREE.MeshBasicMaterial({ color: '#2dd4bf', wireframe: true, toneMapped: false }));
      signal.name = 'signal'; signal.position.y = 125; group.add(signal);
    }
    this.scene.add(group); this.zones.set(key, group); return group;
  }

  private disposeZone(zone: THREE.Group) {
    this.scene.remove(zone);
    zone.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(material => material.dispose());
    });
  }
}
