import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FriendsDayNightCycle } from '../src/game/rendering/FriendsDayNightCycle';
import { updateNightMeteor } from '../src/game/rendering/FriendsNightSky';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .1, 110000);
camera.position.set(0, 0, .01);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false; controls.enableZoom = false;
controls.target.set(-.62, .40, -.62); controls.update();
const sun = new THREE.DirectionalLight(), ambient = new THREE.AmbientLight(), fill = new THREE.HemisphereLight();
scene.add(sun, sun.target, ambient, fill);
const cycle = new FriendsDayNightCycle(scene, renderer, camera, { sun, ambient, fill });
const hour = document.querySelector<HTMLInputElement>('#hour')!;
const animate = document.querySelector<HTMLInputElement>('#animate')!;
let seconds = 0, previous = performance.now();
document.querySelector('#night')!.addEventListener('click', () => { hour.value = '0'; });
document.querySelector('#dusk')!.addEventListener('click', () => { hour.value = '18.8'; });
document.querySelector('#day')!.addEventListener('click', () => { hour.value = '12'; });
const lookAt = (x: number, y: number, z: number, fov: number) => {
  controls.target.set(camera.position.x + x, camera.position.y + y, camera.position.z + z);
  camera.fov = fov; camera.updateProjectionMatrix(); controls.update();
};
document.querySelector('#wide')!.addEventListener('click', () => lookAt(-.62, .40, -.62, 70));
document.querySelector('#planet')!.addEventListener('click', () => lookAt(-.62, .48, -.62, 16));
document.querySelector('#blue')!.addEventListener('click', () => lookAt(.76, .38, -.52, 12));
document.querySelector('#rocky')!.addEventListener('click', () => lookAt(-.35, .30, .89, 10));
document.querySelector('#moon')!.addEventListener('click', () => {
  const direction = cycle.sky.material.uniforms.moonDirection.value as THREE.Vector3;
  lookAt(direction.x, direction.y, direction.z, 12);
});
document.querySelector('#meteor')!.addEventListener('click', () => {
  const head = new THREE.Vector3(), tail = new THREE.Vector3();
  for (seconds = 5; seconds < 13; seconds += .02) if (updateNightMeteor(seconds, head, tail) > .9) break;
  controls.target.copy(head); camera.fov = 70; camera.updateProjectionMatrix(); controls.update();
  hour.value = '0'; animate.checked = false;
});
addEventListener('wheel', e => { camera.fov = THREE.MathUtils.clamp(camera.fov + Math.sign(e.deltaY) * 4, 15, 95); camera.updateProjectionMatrix(); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
// Read-only fixture controls for shader QA and repeatable GPU measurements.
Object.assign(window, { skyReview: { scene, camera, renderer, cycle, controls, setSeconds(value: number) { seconds = value; } } });
function frame(now: number) {
  requestAnimationFrame(frame);
  if (animate.checked) seconds += Math.min(100, now - previous) / 1000;
  previous = now;
  cycle.update(((Number(hour.value) - 9 + 24) % 24) * 60000, seconds * 1000);
  renderer.render(scene, camera);
  document.querySelector('#stats')!.textContent = `${cycle.state.clock} · ${renderer.info.render.calls} sky draws · ${renderer.info.render.points} stars · ${renderer.info.render.triangles} triangles`;
}
requestAnimationFrame(frame);
