import * as THREE from 'three';
import { FriendsMenuWorld } from './FriendsMenuWorld';
import { friendsMenuCameraPose } from './FriendsMenuCamera';

/** Uses the same terrain, ocean, clouds and lighting as the playable island. */
export function createFriendsMenuScene(host: HTMLElement, paused: () => boolean): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .9;
  renderer.domElement.dataset.renderer = 'friends-menu';
  host.dataset.state = 'loading';
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#aec4bd');
  scene.fog = new THREE.FogExp2('#aec4bd', .000009);
  const camera = new THREE.PerspectiveCamera(58, 1, 10, 180000);
  const sun = new THREE.DirectionalLight('#ffe6c4', 1.85);
  const ambient = new THREE.AmbientLight('#e1f4e5', .65);
  const fill = new THREE.HemisphereLight('#c7e9ff', '#778361', .6);
  scene.add(sun, sun.target, ambient, fill);
  let world: FriendsMenuWorld;
  try {
    world = new FriendsMenuWorld(scene, renderer, camera, { sun, ambient, fill });
  } catch (error) {
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    throw error;
  }
  host.dataset.railway = world.railwayReady ? 'ready' : 'awaiting-route';
  const resize = () => {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.zoom = Math.min(1, camera.aspect / 1.25);
    // Keep the island center visible to the left of the desktop form.
    if (width >= 768) camera.setViewOffset(width, height, width * .14, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host); resize();
  let ready = false;
  let elapsed = 0, previous = performance.now(), lastDraw = -Infinity, frame = 0, disposed = false;
  const onVisibility = () => { previous = performance.now(); };
  document.addEventListener('visibilitychange', onVisibility);
  const render = (now: number) => {
    if (disposed) return;
    const delta = Math.max(0, now - previous);
    previous = now;
    if (!document.hidden) {
      if (ready && !paused()) elapsed += delta;
      // Keep drawing while paused so asynchronously loaded map geometry appears.
      if (now - lastDraw >= (paused() ? 100 : 1000 / 30)) {
        lastDraw = now;
        const { position, target } = friendsMenuCameraPose(elapsed);
        camera.position.set(position.x, position.y, position.z);
        camera.lookAt(target.x, target.y, target.z);
        world.update(elapsed);
        if (host.dataset.phase !== world.phase) host.dataset.phase = world.phase;
        // Reveal the world only after its whole island shell is installed.
        // Partial worker results would expose the pale sea floor through gaps.
        if (!ready && world.ready) {
          ready = true; host.dataset.state = 'ready';
        }
        renderer.render(scene, camera);
      }
    }
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);
  return () => {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    world.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  };
}
