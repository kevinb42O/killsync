import * as THREE from 'three';
import type { CoopArtifactEffectSnapshot, CoopPing, CoopSnapshot } from '../multiplayer/CoopSimulation';
import { resolveCoopMissionNavigationTarget } from '../multiplayer/CoopFieldMissions';
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
    const missionColors = {
      toxic_hunt: '#4ade80', demolition: '#fb7185', hostage_recovery: '#fbbf24',
      signal_hijack: '#22d3ee', courier_intercept: '#c084fc',
    } as const;
    for (const site of snapshot.fieldMissions?.sites || []) {
      if (site.state !== 'available') continue;
      const key = `field-mission-pickup-${site.id}`;
      active.add(key);
      const beacon = this.getMissionBeacon(key, missionColors[site.kind], 'pickup');
      this.updateMissionBeacon(beacon, site.x, site.y, elapsedMs, 44, true);
    }
    const fieldMission = snapshot.fieldMissions?.active;
    if (fieldMission) {
      const color = missionColors[fieldMission.kind];
      const navigationTarget = resolveCoopMissionNavigationTarget(fieldMission, snapshot.enemies);
      if (navigationTarget) {
        const key = `field-mission-objective-${fieldMission.id}`;
        active.add(key);
        const beacon = this.getMissionBeacon(key, color, 'objective');
        const defending = fieldMission.points.some(point => point.state === 'defending');
        this.updateMissionBeacon(beacon, navigationTarget.x, navigationTarget.y, elapsedMs, defending ? 96 : 72, true);
      }
      if (fieldMission.kind === 'demolition') {
        for (const [pointIndex, point] of fieldMission.points.entries()) {
          if (point.state === 'locked') continue;
          const key = `field-mission-demolition-${fieldMission.id}-${point.id}`;
          active.add(key);
          const charge = this.getDemolitionCharge(key);
          const isCurrentPoint = (fieldMission.stage.endsWith('_a') ? pointIndex === 0 : pointIndex === 1);
          const progress = isCurrentPoint ? Math.max(0, Math.min(1, fieldMission.progress / Math.max(1, fieldMission.required))) : point.state === 'completed' ? 1 : 0;
          this.updateDemolitionCharge(charge, point.x, point.y, point.state, progress, elapsedMs);
        }
      }
      for (const drive of fieldMission.drives) {
        if (drive.collected) continue;
        const key = `field-mission-drive-${drive.id}`;
        active.add(key);
        const beacon = this.getMissionBeacon(key, '#c084fc', 'drive');
        this.updateMissionBeacon(beacon, drive.x, drive.y, elapsedMs, 25, false);
      }
      if (fieldMission.hostage && fieldMission.hostage.state !== 'secured') {
        const hostage = fieldMission.hostage;
        const carrier = hostage.carrierId ? snapshot.players.find(player => player.id === hostage.carrierId) : undefined;
        const carrierAngle = carrier?.angle || 0;
        const hostageX = carrier ? carrier.x - Math.cos(carrierAngle) * 23 + Math.cos(carrierAngle + Math.PI / 2) * 9 : hostage.x;
        const hostageY = carrier ? carrier.y - Math.sin(carrierAngle) * 23 + Math.sin(carrierAngle + Math.PI / 2) * 9 : hostage.y;
        const key = `field-mission-hostage-${fieldMission.id}`;
        active.add(key);
        const beacon = this.getMissionBeacon(key, '#fbbf24', 'hostage');
        this.updateMissionBeacon(beacon, hostageX, hostageY, elapsedMs, hostage.state === 'carried' ? 18 : 42, hostage.state !== 'carried');
        const rig = beacon.getObjectByName('marker')!;
        rig.rotation.y = carrier ? -carrierAngle + Math.PI / 2 : elapsedMs / 1_400;
        rig.scale.y = hostage.state === 'captive' ? .74 : 1;
        const restraint = rig.getObjectByName('hostage-restraint') as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
        if (restraint) restraint.visible = hostage.state !== 'carried';
        if (hostage.state === 'carried') {
          const recovery = fieldMission.points[1];
          const recoveryKey = `field-mission-hostage-recovery-${fieldMission.id}`;
          active.add(recoveryKey);
          const recoveryBeacon = this.getMissionBeacon(recoveryKey, '#fde68a', 'exfil');
          this.updateMissionBeacon(recoveryBeacon, recovery.x, recovery.y, elapsedMs, 125, true);
        }
      }
    }
    if (snapshot.privateExfil?.state === 'inbound') {
      const key = 'private-exfil-inbound';
      active.add(key);
      const beacon = this.getMissionBeacon(key, '#f59e0b', 'exfil');
      this.updateMissionBeacon(beacon, snapshot.privateExfil.x, snapshot.privateExfil.y, elapsedMs, 90, true);
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
    for (const effect of snapshot.artifactEffects || []) {
      const key = `artifact-${effect.id}`;
      active.add(key);
      const zone = this.getArtifactZone(key, effect.kind);
      zone.position.set(effect.x, 3, effect.y);
      const color = effect.kind === 'stormcall' ? '#60a5fa' : effect.kind === 'dawnwall' ? '#fbbf24' : effect.kind === 'emberling' ? '#fde68a' : '#fb923c';
      const pulse = .88 + Math.sin(elapsedMs * (effect.kind === 'stormcall' ? .018 : .009)) * .12;
      const ring = zone.getObjectByName('ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const fill = zone.getObjectByName('fill') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      const inner = zone.getObjectByName('inner') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const marker = zone.getObjectByName('marker') as THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
      ring.material.color.set(color); fill.material.color.set(color); inner.material.color.set(effect.empowered ? '#fff7ed' : color); marker.material.color.set(color);
      ring.scale.setScalar(effect.radius * pulse); fill.scale.setScalar(effect.radius); inner.scale.setScalar(effect.radius * (.3 + .12 * pulse));
      ring.material.opacity = effect.kind === 'dawnwall' ? .9 : .65; fill.material.opacity = effect.kind === 'dawnwall' ? .11 : .055; inner.material.opacity = .6;
      marker.visible = effect.kind === 'hellseed' || effect.kind === 'emberling';
      marker.position.y = effect.kind === 'emberling' ? 18 + Math.sin(elapsedMs * .012) * 4 : 34 + Math.sin(elapsedMs * .008) * 5;
      marker.rotation.y = elapsedMs * (effect.kind === 'emberling' ? .009 : .004);
      marker.scale.setScalar(effect.kind === 'emberling' ? 8 : effect.empowered ? 18 : 13);
      const signature = zone.getObjectByName('artifact-signature') as THREE.Group;
      signature.scale.setScalar(effect.radius * (effect.kind === 'emberling' ? .9 : 1));
      signature.rotation.y = elapsedMs * (effect.kind === 'stormcall' ? .0028 : effect.kind === 'dawnwall' ? -.00045 : .0018);
      const signaturePulse = .88 + Math.sin(elapsedMs * (effect.kind === 'stormcall' ? .015 : .01)) * .12;
      signature.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const material = node.material as THREE.MeshBasicMaterial;
        if (material.transparent) material.opacity = (material.userData.baseOpacity as number || .62) * signaturePulse;
      });
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

  /** Each persistent class artifact gets a recognizable world silhouette in
   * addition to its exact gameplay-radius floor ring. All dimensions below
   * are normalized and scaled by the authoritative effect radius in update. */
  private getArtifactZone(key: string, kind: CoopArtifactEffectSnapshot['kind']) {
    const existing = this.zones.get(key);
    if (existing) return existing;
    const group = this.getZone(key, false, 'artifact');
    const signature = new THREE.Group(); signature.name = 'artifact-signature'; group.add(signature);
    const color = kind === 'stormcall' ? '#60a5fa' : kind === 'dawnwall' ? '#fbbf24' : kind === 'emberling' ? '#fde68a' : '#fb923c';
    const glow = (value = color, opacity = .62) => {
      const material = new THREE.MeshBasicMaterial({ color: value, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      material.userData.baseOpacity = opacity;
      return material;
    };

    if (kind === 'stormcall') {
      signature.userData.artifactKind = 'stormcall-crown';
      for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.34 + ringIndex * .22, .014 + ringIndex * .004, 6, 36), glow(ringIndex === 1 ? '#e0f2fe' : color, .55 + ringIndex * .1));
        ring.rotation.x = Math.PI / 2; ring.position.y = .23 + ringIndex * .09; ring.rotation.z = ringIndex * .42; signature.add(ring);
      }
      for (let rodIndex = 0; rodIndex < 4; rodIndex++) {
        const angle = rodIndex / 4 * Math.PI * 2;
        const rod = new THREE.Mesh(new THREE.ConeGeometry(.028, .30, 5), glow('#ffffff', .82));
        rod.position.set(Math.cos(angle) * .58, .18, Math.sin(angle) * .58); signature.add(rod);
      }
    } else if (kind === 'dawnwall') {
      signature.userData.artifactKind = 'dawnwall-bastion';
      for (let panelIndex = 0; panelIndex < 12; panelIndex++) {
        const angle = panelIndex / 12 * Math.PI * 2;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(.22, .28, .025), glow(panelIndex % 3 === 0 ? '#fff7d6' : color, panelIndex % 3 === 0 ? .88 : .54));
        panel.position.set(Math.cos(angle) * .91, .15, Math.sin(angle) * .91); panel.rotation.y = -angle; signature.add(panel);
      }
      const crown = new THREE.Mesh(new THREE.TorusGeometry(.48, .022, 6, 28), glow('#fff7d6', .78));
      crown.rotation.x = Math.PI / 2; crown.position.y = .34; signature.add(crown);
    } else if (kind === 'hellseed') {
      signature.userData.artifactKind = 'hellseed-crown';
      const seed = new THREE.Mesh(new THREE.IcosahedronGeometry(.13, 0), glow('#fff7ed', .88)); seed.position.y = .20; signature.add(seed);
      for (let thornIndex = 0; thornIndex < 8; thornIndex++) {
        const angle = thornIndex / 8 * Math.PI * 2;
        const thorn = new THREE.Mesh(new THREE.ConeGeometry(.035, .28 + thornIndex % 2 * .1, 5), glow(thornIndex % 2 ? color : '#7c2d12', .68));
        thorn.position.set(Math.cos(angle) * .34, .14, Math.sin(angle) * .34); thorn.rotation.z = Math.PI * .16; thorn.rotation.y = -angle; signature.add(thorn);
      }
      for (const radius of [.28, .52]) {
        const rune = new THREE.Mesh(new THREE.TorusGeometry(radius, .014, 5, 6), glow(color, .58)); rune.rotation.x = Math.PI / 2; signature.add(rune);
      }
    } else {
      signature.userData.artifactKind = 'emberling-core';
      const core = new THREE.Mesh(new THREE.DodecahedronGeometry(.22, 0), glow('#fff7d6', .9)); core.position.y = .35; signature.add(core);
      for (let moteIndex = 0; moteIndex < 4; moteIndex++) {
        const angle = moteIndex / 4 * Math.PI * 2;
        const mote = new THREE.Mesh(new THREE.TetrahedronGeometry(.07, 0), glow(color, .72));
        mote.position.set(Math.cos(angle) * .42, .25 + (moteIndex % 2) * .18, Math.sin(angle) * .42); signature.add(mote);
      }
    }
    return group;
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

  private getMissionBeacon(key: string, color: string, kind: 'pickup' | 'objective' | 'drive' | 'hostage' | 'exfil') {
    const existing = this.zones.get(key);
    if (existing) return existing;
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(.82, 1, kind === 'pickup' ? 6 : 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .82, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    );
    ring.name = 'ring'; ring.rotation.x = -Math.PI / 2; group.add(ring);
    const beamHeight = kind === 'objective' ? 9_000 : kind === 'exfil' ? 2_400 : 850;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(kind === 'objective' ? 7 : 1.4, kind === 'objective' ? 28 : kind === 'exfil' ? 16 : 7, beamHeight, kind === 'objective' ? 20 : 10, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'objective' ? .16 : .10, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, depthTest: kind !== 'objective', toneMapped: false }),
    );
    beam.name = 'beam'; beam.position.y = beamHeight / 2; beam.renderOrder = kind === 'objective' ? 22 : 0; group.add(beam);
    if (kind === 'objective') {
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(2.5, 6, 9_300, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .48, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false }),
      );
      core.name = 'objective-core'; core.position.y = 4_650; core.renderOrder = 23; group.add(core);
      const bands = new THREE.Group(); bands.name = 'objective-bands';
      for (let index = 0; index < 11; index++) {
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(34 + index % 2 * 8, 2.8, 5, 20, Math.PI * 1.42),
          new THREE.MeshBasicMaterial({ color: index % 3 === 0 ? '#ffffff' : color, transparent: true, opacity: .78, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }),
        );
        band.name = `objective-band-${index}`; band.rotation.x = Math.PI / 2; band.position.y = 320 + index * 720; band.renderOrder = 24; bands.add(band);
      }
      group.add(bands);
      const crown = new THREE.Mesh(
        new THREE.OctahedronGeometry(24, 0),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .95, wireframe: true, depthWrite: false, depthTest: false, toneMapped: false }),
      );
      crown.name = 'objective-crown'; crown.position.y = 150; crown.renderOrder = 25; group.add(crown);
    }
    if (kind === 'hostage') group.add(this.createHostageMarker());
    else {
      const geometry = kind === 'drive' ? new THREE.BoxGeometry(12, 5, 18)
        : kind === 'pickup' ? new THREE.CylinderGeometry(9, 14, 28, 6)
          : new THREE.OctahedronGeometry(kind === 'exfil' ? 16 : 11, 0);
      const marker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .92, wireframe: kind === 'objective' || kind === 'exfil', toneMapped: false }));
      marker.name = 'marker'; marker.position.y = kind === 'pickup' ? 18 : 28; group.add(marker);
    }
    group.userData.beaconKind = kind;
    group.name = `field-mission-${kind}-beacon`;
    this.scene.add(group); this.zones.set(key, group); return group;
  }

  private updateMissionBeacon(group: THREE.Group, x: number, y: number, elapsedMs: number, radius: number, tall: boolean) {
    group.position.set(x, 2, y);
    const pulse = .88 + Math.sin(elapsedMs / 330) * .12;
    const ring = group.getObjectByName('ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    ring.scale.setScalar(radius * pulse);
    const beam = group.getObjectByName('beam') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
    const objective = group.userData.beaconKind === 'objective';
    beam.visible = tall; beam.material.opacity = tall ? objective ? .12 + pulse * .08 : .075 + pulse * .035 : 0;
    const marker = group.getObjectByName('marker')!;
    marker.rotation.y = elapsedMs / (group.userData.beaconKind === 'pickup' ? 900 : 600);
    marker.position.y = (group.userData.beaconKind === 'hostage' ? 0 : group.userData.beaconKind === 'pickup' ? 18 : 28) + Math.sin(elapsedMs / 420) * (group.userData.beaconKind === 'hostage' ? 1.2 : 4);
    if (objective) {
      const core = group.getObjectByName('objective-core') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
      core.material.opacity = .34 + pulse * .18;
      const bands = group.getObjectByName('objective-bands') as THREE.Group;
      bands.rotation.y = elapsedMs / 1_050;
      bands.children.forEach((band, index) => {
        band.rotation.z = elapsedMs / (1_250 + index * 45) * (index % 2 ? -1 : 1);
        (band as THREE.Mesh).scale.setScalar(.88 + pulse * .14);
      });
      const crown = group.getObjectByName('objective-crown') as THREE.Mesh;
      crown.rotation.y = elapsedMs / 430;
      crown.rotation.z = elapsedMs / 760;
      crown.position.y = 150 + Math.sin(elapsedMs / 240) * 12;
    }
  }

  /** A readable, persistent charge prop. The old demolition objective was
   * represented only by the generic navigation diamond, so arming, countdown,
   * and the detonated site were visually indistinguishable. */
  private getDemolitionCharge(key: string) {
    const existing = this.zones.get(key);
    if (existing) return existing;
    const group = new THREE.Group();
    group.name = 'demolition-charge-site';

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(26, 31, 5, 10), new THREE.MeshStandardMaterial({ color: '#24171b', emissive: '#7f1d1d', emissiveIntensity: .2, metalness: .82, roughness: .38 }));
    pad.name = 'charge-pad'; pad.position.y = 2.5; group.add(pad);
    const body = new THREE.Group(); body.name = 'charge-body'; body.position.y = 8; group.add(body);
    for (const x of [-9, 0, 9]) {
      const canister = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 26, 8), new THREE.MeshStandardMaterial({ color: '#48151c', emissive: '#fb7185', emissiveIntensity: .22, metalness: .44, roughness: .48 }));
      canister.rotation.z = Math.PI / 2; canister.position.set(x, 7, 0); body.add(canister);
    }
    const controller = new THREE.Mesh(new THREE.BoxGeometry(21, 13, 12), new THREE.MeshStandardMaterial({ color: '#111827', emissive: '#fb7185', emissiveIntensity: .18, metalness: .78, roughness: .28 }));
    controller.name = 'charge-controller'; controller.position.set(0, 15, 0); body.add(controller);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(13, 6, 1.2), new THREE.MeshBasicMaterial({ color: '#fb7185', transparent: true, opacity: .72, toneMapped: false }));
    screen.name = 'charge-screen'; screen.position.set(0, 16, 6.5); body.add(screen);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 17, 6), new THREE.MeshStandardMaterial({ color: '#64748b', metalness: .9, roughness: .25 }));
    antenna.position.set(9, 28, 0); body.add(antenna);
    const status = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 7), new THREE.MeshBasicMaterial({ color: '#fb7185', transparent: true, opacity: .9, toneMapped: false }));
    status.name = 'charge-status'; status.position.set(-8, 16, 6.7); body.add(status);

    const armingRing = new THREE.Group(); armingRing.name = 'charge-progress'; group.add(armingRing);
    const segments: THREE.Mesh[] = [];
    for (let index = 0; index < 16; index++) {
      const angle = index / 16 * Math.PI * 2;
      const segment = new THREE.Mesh(new THREE.BoxGeometry(8, 1.5, 3.5), new THREE.MeshBasicMaterial({ color: '#3f1720', transparent: true, opacity: .3, toneMapped: false, depthWrite: false }));
      segment.position.set(Math.cos(angle) * 38, 1.3, Math.sin(angle) * 38);
      segment.rotation.y = -angle; armingRing.add(segment); segments.push(segment);
    }
    const crater = new THREE.Mesh(new THREE.CircleGeometry(38, 28), new THREE.MeshBasicMaterial({ color: '#090405', transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide }));
    crater.name = 'charge-crater'; crater.rotation.x = -Math.PI / 2; crater.position.y = .4; crater.visible = false; group.add(crater);
    group.userData.progressSegments = segments;
    this.scene.add(group); this.zones.set(key, group); return group;
  }

  private updateDemolitionCharge(group: THREE.Group, x: number, y: number, state: 'available' | 'arming' | 'defending' | 'completed', progress: number, elapsedMs: number) {
    group.position.set(x, 2, y);
    const detonated = state === 'completed';
    const armed = state === 'defending';
    const body = group.getObjectByName('charge-body') as THREE.Group;
    const pad = group.getObjectByName('charge-pad') as THREE.Mesh;
    const crater = group.getObjectByName('charge-crater') as THREE.Mesh;
    body.visible = !detonated; pad.visible = !detonated; crater.visible = detonated;
    if (detonated) return;

    const fastPulse = .45 + Math.sin(elapsedMs / (armed ? 85 : 240)) * .45;
    const status = group.getObjectByName('charge-status') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    const screen = group.getObjectByName('charge-screen') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
    status.material.color.set(armed ? '#fef2f2' : state === 'arming' ? '#fb923c' : '#fb7185');
    status.material.opacity = armed ? .5 + fastPulse * .5 : .64 + fastPulse * .24;
    screen.material.color.set(armed ? '#ef4444' : state === 'arming' ? '#fb923c' : '#fb7185');
    screen.material.opacity = armed ? .55 + fastPulse * .4 : .68;
    body.rotation.y = Math.sin(elapsedMs / 1_400) * .04;

    const ratio = armed ? progress : state === 'arming' ? progress : 0;
    const segments = group.userData.progressSegments as THREE.Mesh[];
    const lit = Math.ceil(ratio * segments.length);
    segments.forEach((segment, index) => {
      const material = segment.material as THREE.MeshBasicMaterial;
      const active = index < lit;
      material.color.set(active ? armed ? '#ef4444' : '#fb923c' : '#3f1720');
      material.opacity = active ? .72 + fastPulse * .2 : .3;
    });
  }

  private createHostageMarker() {
    const rig = new THREE.Group(); rig.name = 'marker'; rig.userData.isHostageNpc = true;
    const clothing = new THREE.MeshStandardMaterial({ color: '#6b4f24', emissive: '#fbbf24', emissiveIntensity: .16, roughness: .82 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1f2937', emissive: '#fbbf24', emissiveIntensity: .06, roughness: .9 });
    const skin = new THREE.MeshStandardMaterial({ color: '#d6a77a', roughness: .9 });
    const glow = new THREE.MeshBasicMaterial({ color: '#fde68a', transparent: true, opacity: .9, toneMapped: false });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(15, 19, 9), clothing); torso.name = 'hostage-torso'; torso.position.y = 27; rig.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), skin); head.name = 'hostage-head'; head.position.y = 42; rig.add(head);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(2.8, 13, 3, 7), dark); leg.name = `hostage-leg-${side}`; leg.position.set(side * 4, 10, 0); rig.add(leg);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 12, 3, 7), clothing); arm.name = `hostage-arm-${side}`; arm.position.set(side * 9, 27, 2); arm.rotation.z = side * .42; rig.add(arm);
    }
    const restraint = new THREE.Mesh(new THREE.TorusGeometry(4.2, 1.1, 5, 14), glow);
    restraint.name = 'hostage-restraint'; restraint.position.set(0, 22, 7); restraint.rotation.x = Math.PI / 2; rig.add(restraint);
    const outline = new THREE.Mesh(new THREE.CapsuleGeometry(11, 31, 4, 10), new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: .09, wireframe: true, depthWrite: false, toneMapped: false }));
    outline.name = 'hostage-outline'; outline.position.y = 21; rig.add(outline);
    return rig;
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
