import { describe, expect, it } from 'vitest';
import { CoopArcanaVisuals } from './CoopArcanaVisuals';
import { CoopSimulation } from '../multiplayer/CoopSimulation';
import { CoopFirearmVisualRig } from './coopFirearmVisuals';
import { COOP_FIREARM_IDS, createCoopWeaponRuntime } from '../combat/coopFirearms';
import { COOP_SPELL_SLOTS } from '../combat/coopSpells';
import * as THREE from 'three';

describe('replicated arcana presentation', () => {
  const spellSnapshot = () => {
    const snapshot = new CoopSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot();
    snapshot.projectiles = [{id:1,ownerId:'host',weaponId:'ember_bolt',x:100,y:0,z:28,angle:0,pitch:0,radius:9,velocity:1050,lifeMs:1800}];
    return snapshot;
  };
  it('starts every bolt at its hand origin and converges without changing authoritative hit positions', () => {
    for (const weaponId of ['ember_bolt','cinderhex_engine','astral_lance'] as const) {
      const visuals = new CoopArcanaVisuals(), snapshot = spellSnapshot(); snapshot.projectiles[0].weaponId=weaponId;
      const authoritative = structuredClone(snapshot.projectiles);
      const hand = {position:{x:7,y:30,z:5},initialScale:.06};
      visuals.update(snapshot,60,() => hand);
      const bolt = visuals.group.children[0];
      expect(bolt.position.toArray()).toEqual([7,30,5]);
      expect(bolt.scale.x).toBeLessThan(.1); // no full-size camera-covering orb
      snapshot.projectiles[0].x=150; visuals.update(snapshot,60,() => hand);
      expect(bolt.position.x).toBeGreaterThan(7); expect(bolt.position.z).toBeCloseTo(2.5);
      snapshot.projectiles[0].x=200; visuals.update(snapshot,16,() => hand);
      expect(bolt.position.toArray()).toEqual([200,28,0]);
      expect(snapshot.projectiles[0]).toEqual({...authoritative[0],x:200});
      visuals.dispose();
    }
  });
  it('launches immediately toward the aimed point and adopts the same mesh when the network bolt arrives', () => {
    const visuals = new CoopArcanaVisuals(), snapshot = spellSnapshot(); snapshot.projectiles=[];
    const origin = {position:{x:7,y:30,z:5},initialScale:.06}, target = {x:500,y:28,z:0};
    visuals.predictSpell('host','ember_bolt',1,origin,target,1050);
    const bolt = visuals.group.children[0]; expect(bolt.position.toArray()).toEqual([7,30,5]);
    visuals.update(snapshot,16); visuals.update(snapshot,16);
    const direction = new THREE.Vector3().copy(target).sub(origin.position).normalize();
    expect(bolt.position.distanceTo(new THREE.Vector3(7,30,5).addScaledVector(direction,16.8))).toBeLessThan(.00001);
    const lastPosition = bolt.position.clone(); snapshot.projectiles=spellSnapshot().projectiles;
    visuals.update(snapshot,16,() => origin);
    expect(visuals.group.children).toHaveLength(1); expect(visuals.group.children[0]).toBe(bolt);
    expect(bolt.position.distanceTo(lastPosition)).toBeLessThan(.00001);
    visuals.dispose();
  });
  it('expires unconfirmed predictions and clears flight corrections across run changes', () => {
    const visuals = new CoopArcanaVisuals(), snapshot = spellSnapshot(); snapshot.projectiles=[];
    const origin = {position:{x:7,y:30,z:5},initialScale:.06};
    visuals.predictSpell('host','astral_lance',1,origin,{x:500,y:28,z:0},3600);
    visuals.update(snapshot,200); visuals.update(snapshot,16); expect(visuals.group.children).toHaveLength(0);
    snapshot.projectiles=spellSnapshot().projectiles; visuals.update(snapshot,16,() => origin);
    visuals.clear(); visuals.update(snapshot,16);
    expect(visuals.group.children[0].position.toArray()).toEqual([100,28,0]); visuals.dispose();
  });
  it('samples the final camera and recoil pose before the predicted bolt is first displayed', () => {
    const visuals = new CoopArcanaVisuals(), snapshot = spellSnapshot(); snapshot.projectiles=[];
    visuals.predictSpell('host','ember_bolt',1,{position:{x:7,y:30,z:5},initialScale:.06},{x:500,y:28,z:0},1050);
    const posedHand = {position:{x:9,y:33,z:6},initialScale:.06};
    visuals.update(snapshot,16,() => posedHand);
    expect(visuals.group.children[0].position.toArray()).toEqual([9,33,6]);
    visuals.update(snapshot,16,() => ({position:{x:50,y:40,z:10},initialScale:.06}));
    expect(visuals.group.children[0].position.x).toBeLessThan(30); // emitted bolt no longer follows the hand
    visuals.dispose();
  });
  it('keeps a persistent grenade mesh, removes expired replicas, and caps/disposes explosion effects', () => {
    const visuals = new CoopArcanaVisuals(), snapshot = new CoopSimulation([{ id:'host',label:'Host',color:'#fff' }]).createSnapshot();
    snapshot.grenades = [{ id:1,ownerId:'host',x:100,y:200,z:30,vx:0,vy:0,vz:0,fuseMs:1200 }];
    visuals.update(snapshot,16); const mesh = visuals.group.children[0];
    visuals.update(snapshot,16); expect(visuals.group.children[0]).toBe(mesh);
    expect(mesh.position.toArray()).toEqual([100,30,200]);
    snapshot.grenades = []; visuals.update(snapshot,16); expect(visuals.group.children).toHaveLength(0);
    for(let i=0;i<60;i++) visuals.impact({ id:i,kind:'grenade_detonated',tick:0,atMs:0,x:100,y:200,amount:220 });
    expect(visuals.group.children).toHaveLength(24);
    visuals.update(snapshot,1200); expect(visuals.group.children).toHaveLength(0); visuals.dispose();
  });
  it('creates weapon rigs lazily and reuses them when switching back', () => {
    const rig = new CoopFirearmVisualRig(false); expect(rig.group.children).toHaveLength(1);
    for(const id of COOP_FIREARM_IDS) rig.update(createCoopWeaponRuntime(id),1000,16,false);
    expect(rig.group.children).toHaveLength(COOP_FIREARM_IDS.length);
    const first = rig.group.children[0]; rig.setWeapon('plasma_gun'); expect(first.visible).toBe(true);
    expect(rig.group.children.filter(child => child.visible)).toHaveLength(1); rig.dispose();
  });
  it('shows an open hand and spell core for every caster slot, with no firearm barrels', () => {
    const rig = new CoopFirearmVisualRig(true);
    for(const id of COOP_SPELL_SLOTS) {
      const state = createCoopWeaponRuntime(id); rig.update(state,1000,16,false); rig.fire(id); rig.update(state,1016,16,false);
      const visible = rig.group.children.filter(child => child.visible);
      expect(visible).toHaveLength(1); expect(visible[0].name).toBe('Hellbinder Open Casting Hand');
      expect(visible[0].getObjectByName('Spell Orb')).toBeDefined();
      expect(visible[0].getObjectByName('Continuous Shoulder Sleeve')).toBeDefined();
      expect(visible[0].getObjectByName('Camera Shoulder Anchor')).toBeDefined();
      expect(visible[0].getObjectByName('Spell Orb')?.scale.x).toBeLessThan(.5);
    }
    rig.dispose();
  });
});
