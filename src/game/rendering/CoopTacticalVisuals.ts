import * as THREE from 'three';
import type { CoopPing, CoopSnapshot } from '../multiplayer/CoopSimulation';
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
    for (const station of snapshot.buyStations) {
      if (station.state === 'active' || station.state === 'disabled') continue;
      const key = `capture-station-${station.id}`;
      active.add(key);
      const revealed = station.state === 'available' || station.state === 'capturing';
      const powerState = revealed ? 'revealed' : 'locked';
      const previous = this.zones.get(key);
      // A later site is first constructed in its dormant state. Rebuild it on
      // reveal so its geometry/material initialization is exactly identical
      // to the opening site's available presentation.
      if (previous && previous.userData.stationPowerState !== powerState) {
        this.disposeZone(previous);
        this.zones.delete(key);
      }
      const zone = this.getCaptureStationZone(key);
      zone.userData.stationPowerState = powerState;
      zone.position.set(station.x, 2, station.y);
      const color = station.contested ? '#fb7185' : revealed ? '#2dd4bf' : '#64748b';
      const ring = zone.getObjectByName('ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const fill = zone.getObjectByName('fill') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      ring.visible = revealed; fill.visible = revealed;
      ring.scale.setScalar(station.captureRadius); ring.material.color.set(color);
      fill.scale.setScalar(station.captureRadius); fill.material.color.set(color);
      const terminal = zone.getObjectByName('terminal') as THREE.Group;
      terminal.traverse(node => {
        if (node instanceof THREE.Mesh) {
          const material = node.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
          if ('emissive' in material) material.emissive.set(color);
          material.opacity = revealed ? .82 : .32;
          material.transparent = true;
        }
      });
      const ratio = station.captureProgressMs / Math.max(1, station.captureRequiredMs);
      const litSegments = Math.ceil(ratio * 12);
      const segments = zone.userData.progressSegments as THREE.Mesh[];
      segments.forEach((segment, index) => {
        segment.visible = revealed;
        const material = segment.material as THREE.MeshBasicMaterial;
        material.color.set(index < litSegments ? color : '#17383d');
        material.opacity = index < litSegments ? .86 : .22;
      });
      const locator = zone.getObjectByName('capture-locator') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
      const locatorCore = zone.getObjectByName('capture-locator-core') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
      locator.visible = revealed; locatorCore.visible = revealed;
      locator.material.color.set(color); locatorCore.material.color.set(station.contested ? '#fecdd3' : '#ccfbf1');
      const locatorPulse = .82 + Math.sin(elapsedMs / 420) * .18;
      locator.material.opacity = (station.contested ? .16 : .085) * locatorPulse;
      locatorCore.material.opacity = (station.contested ? .24 : .14) * locatorPulse;
      const signal = zone.getObjectByName('capture-signal') as THREE.Mesh;
      signal.visible = revealed;
      signal.rotation.y = elapsedMs / 1200;
      signal.position.y = 91 + Math.sin(elapsedMs / 600) * 5;
      (signal.material as THREE.MeshBasicMaterial).color.set(color);
    }
    const foundry = snapshot.weaponFoundry;
    if (foundry && foundry.state !== 'locked') {
      const key = `weapon-foundry-${foundry.id}`;
      active.add(key);
      const zone = this.getFoundryZone(key);
      zone.position.set(foundry.x, 2, foundry.y);
      const color = foundry.contested ? '#fb7185' : '#f59e0b';
      const ring = zone.getObjectByName('ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const fill = zone.getObjectByName('fill') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      const capturing = foundry.state === 'available' || foundry.state === 'capturing';
      ring.visible = capturing; fill.visible = capturing;
      ring.scale.setScalar(foundry.captureRadius); fill.scale.setScalar(foundry.captureRadius);
      ring.material.color.set(color); fill.material.color.set(color);
      const ratio = foundry.captureProgressMs / Math.max(1, foundry.captureRequiredMs);
      const hologram = zone.getObjectByName('weapon-hologram')!;
      hologram.rotation.y = elapsedMs / 850; hologram.position.y = 68 + Math.sin(elapsedMs / 420) * 4;
      const calibration = zone.getObjectByName('calibration-rings')!;
      calibration.rotation.y = elapsedMs / 1150; calibration.rotation.z = Math.sin(elapsedMs / 900) * .2;
      const progress = zone.getObjectByName('foundry-progress')!;
      progress.scale.set(Math.max(.02, ratio), 1, 1);
      const beacon = zone.getObjectByName('foundry-beacon') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
      const beaconCore = zone.getObjectByName('foundry-beacon-core') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
      const beaconHalo = zone.getObjectByName('foundry-beacon-halo') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
      const pulse = .86 + Math.sin(elapsedMs / 390) * .14;
      const lockedPower = foundry.state === 'active' ? 1.12 : 1;
      beacon.material.color.set(color); beaconCore.material.color.set(foundry.contested ? '#fff1f2' : '#fff7d6'); beaconHalo.material.color.set(color);
      beacon.material.opacity = .16 * pulse * lockedPower;
      beaconCore.material.opacity = .34 * pulse * lockedPower;
      beaconHalo.material.opacity = .065 * pulse * lockedPower;
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
    for (const ping of snapshot.pings || []) {
      const key = `ping-${ping.id}`;
      active.add(key);
      const zone = this.getPingZone(key, ping);
      // Location pings may be attached to a wall or rooftop rather than the
      // ground, so preserve the authoritative hit elevation.
      zone.position.set(ping.x, 2 + (ping.z || 0), ping.y);
      const remaining = Math.max(0, Math.min(1, (ping.expiresAtMs - elapsedMs) / 1500));
      const pulse = 0.85 + Math.sin(elapsedMs * 0.008) * 0.15;
      const ring = zone.getObjectByName('ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      if (ring) {
        ring.scale.setScalar(24 * pulse);
        ring.material.opacity = 0.8 * remaining;
      }
      const marker = zone.getObjectByName('marker') as THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
      if (marker) {
        marker.position.y = 24 + Math.sin(elapsedMs * 0.005) * 4;
        marker.rotation.y = elapsedMs * 0.003;
        marker.material.opacity = 0.9 * remaining;
      }
      const beam = zone.getObjectByName('beam') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
      if (beam) {
        beam.material.opacity = 0.35 * remaining * pulse;
      }
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

  private getPingZone(key: string, ping: CoopPing) {
    const existing = this.zones.get(key);
    if (existing) return existing;
    const group = new THREE.Group();
    const color = ping.kind === 'enemy' || ping.kind === 'boss'
      ? '#ef4444'
      : ping.kind === 'revive'
      ? '#fbbf24'
      : ping.kind === 'station'
      ? '#38bdf8'
      : ping.playerColor || '#22d3ee';

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    ring.name = 'ring';
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 3.2, 90, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    beam.name = 'beam';
    beam.position.y = 45;
    group.add(beam);

    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(6, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })
    );
    marker.name = 'marker';
    marker.position.y = 24;
    group.add(marker);

    this.scene.add(group);
    this.zones.set(key, group);
    return group;
  }

  private getCaptureStationZone(key: string) {
    const existing = this.zones.get(key);
    if (existing) return existing;
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(.975, 1, 64), new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: .82, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ring.name = 'ring'; ring.rotation.x = -Math.PI / 2; group.add(ring);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: .045, side: THREE.DoubleSide, depthWrite: false }));
    fill.name = 'fill'; fill.rotation.x = -Math.PI / 2; fill.position.y = -.3; group.add(fill);

    // Compact waist-high capture console. Progress is a segmented floor dial,
    // never an opaque vertical bar that can block the player's view.
    const terminal = new THREE.Group(); terminal.name = 'terminal'; group.add(terminal);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(20, 24, 7, 8), new THREE.MeshStandardMaterial({ color: '#15252b', emissive: '#2dd4bf', emissiveIntensity: .08, metalness: .82, roughness: .46 }));
    base.name = 'capture-base'; base.position.y = 3.5; terminal.add(base);
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(25, 20, 20), new THREE.MeshStandardMaterial({ color: '#273c43', emissive: '#2dd4bf', emissiveIntensity: .12, metalness: .76, roughness: .34 }));
    pedestal.name = 'capture-console'; pedestal.position.y = 16; terminal.add(pedestal);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(19, 9, 2), new THREE.MeshBasicMaterial({ color: '#5eead4', transparent: true, opacity: .58, toneMapped: false }));
    screen.name = 'capture-screen'; screen.position.set(0, 19, 11); screen.rotation.x = -.18; terminal.add(screen);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 13, 6), new THREE.MeshStandardMaterial({ color: '#789097', emissive: '#2dd4bf', emissiveIntensity: .08, metalness: .7, roughness: .35 }));
    antenna.name = 'capture-antenna'; antenna.position.y = 32.5; terminal.add(antenna);
    const signal = new THREE.Mesh(new THREE.OctahedronGeometry(7), new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: .68, wireframe: true, toneMapped: false }));
    signal.name = 'capture-signal'; signal.position.y = 46; terminal.add(signal);

    const progressSegments: THREE.Mesh[] = [];
    for (let index = 0; index < 12; index++) {
      const angle = index / 12 * Math.PI * 2;
      const segment = new THREE.Mesh(new THREE.BoxGeometry(11, 1.6, 4), new THREE.MeshBasicMaterial({ color: '#17383d', transparent: true, opacity: .22, toneMapped: false, depthWrite: false }));
      segment.name = `capture-progress-${index}`;
      segment.position.set(Math.cos(angle) * 34, 1.2, Math.sin(angle) * 34);
      segment.rotation.y = -angle;
      terminal.add(segment);
      progressSegments.push(segment);
    }

    // Tall skyline locator, but optically thin: additive, transparent and no
    // depth write. It identifies the site without becoming a solid wall.
    const locator = new THREE.Mesh(new THREE.CylinderGeometry(7, 34, 6_500, 18, 1, true), new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: .085, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    locator.name = 'capture-locator'; locator.position.y = 3_250; group.add(locator);
    const locatorCore = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 5, 6_700, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#ccfbf1', transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    locatorCore.name = 'capture-locator-core'; locatorCore.position.y = 3_350; group.add(locatorCore);

    group.userData.progressSegments = progressSegments;
    this.scene.add(group); this.zones.set(key, group); return group;
  }

  private getFoundryZone(key: string) {
    const existing = this.zones.get(key);
    if (existing) return existing;
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#34281b', emissive: '#6b3b08', emissiveIntensity: .22, metalness: .9, roughness: .32 });
    const amber = new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: .82, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(.975, 1, 64), amber.clone()); ring.name = 'ring'; ring.rotation.x = -Math.PI / 2; group.add(ring);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: .045, side: THREE.DoubleSide, depthWrite: false })); fill.name = 'fill'; fill.rotation.x = -Math.PI / 2; group.add(fill);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(72, 82, 13, 24), metal); platform.position.y = 6.5; group.add(platform);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(53, 58, 10, 24), new THREE.MeshStandardMaterial({ color: '#17120d', emissive: '#f59e0b', emissiveIntensity: .12, metalness: .92, roughness: .25 })); inner.position.y = 15; group.add(inner);
    const progressTrack = new THREE.Mesh(new THREE.BoxGeometry(96, 2, 5), new THREE.MeshBasicMaterial({ color: '#422006', transparent: true, opacity: .8 })); progressTrack.position.set(0, 18, 49); group.add(progressTrack);
    const progress = new THREE.Mesh(new THREE.BoxGeometry(96, 2.5, 6), amber.clone()); progress.name = 'foundry-progress'; progress.position.set(0, 19, 49); group.add(progress);
    const holo = new THREE.Group(); holo.name = 'weapon-hologram'; holo.position.y = 68; group.add(holo);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(45, 9, 12), amber.clone()); holo.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.5, 38, 8), amber.clone()); barrel.rotation.z = Math.PI / 2; barrel.position.x = 37; holo.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(8, 18, 8), amber.clone()); grip.position.set(-8, -12, 0); grip.rotation.z = -.28; holo.add(grip);
    const calibration = new THREE.Group(); calibration.name = 'calibration-rings'; calibration.position.y = 68; group.add(calibration);
    for (const rotation of [new THREE.Euler(Math.PI / 2, 0, 0), new THREE.Euler(0, Math.PI / 2, 0)]) { const torus = new THREE.Mesh(new THREE.TorusGeometry(38, 2.2, 8, 40), amber.clone()); torus.rotation.copy(rotation); calibration.add(torus); }
    for (const x of [-60, 60]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(12, 52, 12), metal); arm.position.set(x, 36, 0); arm.rotation.z = x < 0 ? -.35 : .35; group.add(arm); }
    // Global locator. Normal depth testing keeps buildings physically correct;
    // the extreme height leaves a large amber section visible above rooftops.
    const beaconMaterial = new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: false });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(18, 72, 12_000, 20, 1, true), beaconMaterial); beacon.name = 'foundry-beacon'; beacon.position.y = 6_000; group.add(beacon);
    const beaconCore = new THREE.Mesh(new THREE.CylinderGeometry(5, 13, 12_500, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#fff7d6', transparent: true, opacity: .34, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: false }));
    beaconCore.name = 'foundry-beacon-core'; beaconCore.position.y = 6_250; group.add(beaconCore);
    const beaconHalo = new THREE.Mesh(new THREE.CylinderGeometry(82, 190, 12_000, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: .065, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: false }));
    beaconHalo.name = 'foundry-beacon-halo'; beaconHalo.position.y = 6_000; group.add(beaconHalo);
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
