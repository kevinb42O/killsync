import * as THREE from 'three';
import type { FriendsVehicle } from '../multiplayer/FriendsExpedition';

/** Smooth the orbit relative to the aircraft, inheriting its translation
 * immediately. This avoids a chase camera falling behind a fast-moving hull. */
export class FriendsVehicleCamera {
  private vehicleId?: string;
  private previous = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private focusOffset = new THREE.Vector3();
  update(camera: THREE.PerspectiveCamera, vehicle: FriendsVehicle, yaw: number, pitch: number, deltaMs: number) {
    const rowing=vehicle.kind==='rowboat',distance=rowing?238:640,height=rowing?104:250;
    const orbitPitch = THREE.MathUtils.clamp(pitch, -.35, .85);
    const desired = new THREE.Vector3(Math.sin(yaw) * Math.cos(orbitPitch) * distance, height + Math.sin(orbitPitch) * (rowing?150:360), Math.cos(yaw) * Math.cos(orbitPitch) * distance);
    const focus = new THREE.Vector3(-Math.sin(yaw) * (rowing?12:60), rowing?28:48, -Math.cos(yaw) * (rowing?12:60));
    if (this.vehicleId !== vehicle.id) { this.vehicleId = vehicle.id; this.offset.copy(desired); this.focusOffset.copy(focus); }
    const blend = 1 - Math.exp(-8 * Math.max(0, deltaMs) / 1000);
    this.offset.lerp(desired, blend); this.focusOffset.lerp(focus, blend);
    this.previous.set(vehicle.x, vehicle.z, vehicle.y);
    camera.position.copy(this.previous).add(this.offset); camera.position.y = Math.max(35, camera.position.y);
    camera.lookAt(this.previous.clone().add(this.focusOffset));
    camera.fov = THREE.MathUtils.lerp(camera.fov, rowing?70:72, 1 - Math.exp(-10 * Math.max(0, deltaMs) / 1000)); camera.updateProjectionMatrix();
  }
  reset() { this.vehicleId = undefined; }
}
