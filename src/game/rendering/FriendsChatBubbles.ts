import * as THREE from 'three';
import { COOP_CHAT_HISTORY_LIMIT, type CoopChatMessage } from '../multiplayer/CoopChat';
import type { PlayerVisualRig } from './coopOperatorVisuals';

const FONT = '500 13px system-ui, -apple-system, sans-serif';
const LINE_HEIGHT = 18;
const TEXT_WIDTH = 216;
const FADE_MS = 500;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Preserve every character, including emoji and long words, within a small card. */
export function wrapFriendsChatText(text: string, measure: (value: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= TEXT_WIDTH) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const { segment: character } of graphemes.segment(word)) {
      if (line && measure(line + character) > TEXT_WIDTH) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function friendsChatDuration(text: string): number {
  return Math.min(10_000, 4_000 + Array.from(text).length * 35);
}

type Bubble = {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  width: number;
  height: number;
  startedAt: number;
  duration: number;
};

/** One textured quad per active speaker. Text uploads happen only on receipt;
 * animation uses the existing world render and never schedules React updates. */
export class FriendsChatBubbles {
  private readonly bubbles = new Map<string, Bubble>();
  private readonly seen = new Set<string>();
  private readonly cameraPoint = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {}

  show(message: CoopChatMessage, now = performance.now()) {
    if (this.seen.has(message.id)) return;
    this.seen.add(message.id);
    if (this.seen.size > COOP_CHAT_HISTORY_LIMIT) this.seen.delete(this.seen.values().next().value!);
    this.remove(message.playerId);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = FONT;
    const lines = wrapFriendsChatText(message.text, value => ctx.measureText(value).width);
    const width = Math.ceil(Math.max(32, ...lines.map(line => ctx.measureText(line).width))) + 28;
    const height = lines.length * LINE_HEIGHT + 22;
    // Fixed 2x rasterization stays crisp without tying uploads to device DPR.
    canvas.width = (width + 8) * 2;
    canvas.height = (height + 12) * 2;
    ctx.scale(2, 2);
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(15,23,29,.94)';
    ctx.beginPath();
    ctx.roundRect(4, 2, width, height, 11);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width / 2 - 1, height + 1);
    ctx.lineTo(width / 2 + 4, height + 8);
    ctx.lineTo(width / 2 + 9, height + 1);
    ctx.fill();
    ctx.fillStyle = message.playerColor;
    ctx.globalAlpha = .85;
    ctx.beginPath();
    ctx.roundRect(16, 10, 18, 2, 1);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f1f5f7';
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    lines.forEach((line, index) => ctx.fillText(line, 18, 17 + index * LINE_HEIGHT));

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false, fog: false });
    const sprite = new THREE.Sprite(material);
    sprite.name = 'friends-chat-bubble';
    sprite.center.set(.5, 0);
    sprite.visible = false;
    this.scene.add(sprite);
    this.bubbles.set(message.playerId, { sprite, texture, width: width + 8, height: height + 12, startedAt: now, duration: friendsChatDuration(message.text) });
  }

  update(camera: THREE.PerspectiveCamera, viewportHeight: number, rigs: ReadonlyMap<string, PlayerVisualRig>, players: readonly { id: string }[], now = performance.now(), residents?: ReadonlyMap<string, PlayerVisualRig>) {
    if (!this.bubbles.size) return;
    for (const [id, bubble] of this.bubbles) {
      const age = now - bubble.startedAt;
      if (age >= bubble.duration) { this.remove(id); continue; }
      // A chat event can arrive before the next roster snapshot for a new join.
      if (!residents?.has(id) && !players.some(player => player.id === id)) {
        bubble.sprite.visible = false;
        if (age > 1_500) this.remove(id);
        continue;
      }
      const rig = rigs.get(id) ?? residents?.get(id);
      bubble.sprite.visible = false;
      // The local first-person speaker remains visible to everyone else.
      if (!rig || !rig.root.visible || viewportHeight <= 0) continue;
      rig.nameplate.getWorldPosition(bubble.sprite.position);
      bubble.sprite.position.y += 7;
      this.cameraPoint.copy(bubble.sprite.position).applyMatrix4(camera.matrixWorldInverse);
      const depth = -this.cameraPoint.z;
      this.projected.copy(bubble.sprite.position).project(camera);
      if (depth < 35 || depth > 1_400 || this.projected.z < -1 || this.projected.z > 1 || Math.abs(this.projected.x) > 1.15 || Math.abs(this.projected.y) > 1.2) continue;
      const enter = Math.min(1, age / 160);
      const fade = Math.min(1, (bubble.duration - age) / FADE_MS);
      const distanceFade = 1 - THREE.MathUtils.smoothstep(depth, 1_000, 1_400);
      bubble.sprite.material.opacity = enter * fade * distanceFade;
      const pixelsToWorld = 2 * Math.min(depth, 650) / (camera.projectionMatrix.elements[5] * viewportHeight);
      const settle = .96 + .04 * (1 - (1 - enter) ** 3);
      bubble.sprite.scale.set(bubble.width * pixelsToWorld * settle, bubble.height * pixelsToWorld * settle, 1);
      bubble.sprite.visible = true;
    }
  }

  private remove(id: string) {
    const bubble = this.bubbles.get(id);
    if (!bubble) return;
    this.scene.remove(bubble.sprite);
    bubble.texture.dispose();
    bubble.sprite.material.dispose();
    this.bubbles.delete(id);
  }

  dispose() {
    for (const id of this.bubbles.keys()) this.remove(id);
    this.seen.clear();
  }
}
