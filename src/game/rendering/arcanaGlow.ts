import * as THREE from 'three';
// One small code-native radial texture is shared by all magical coronas.
export const arcanaGlowTexture = (() => {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d'); if (!context) return new THREE.Texture();
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#fff'); gradient.addColorStop(.16, '#ffffffdf'); gradient.addColorStop(.43, '#ffffff38'); gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
})();
export function arcanaGlow(color: string, size: number, opacity = .5) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: arcanaGlowTexture, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sprite.scale.setScalar(size); return sprite;
}
