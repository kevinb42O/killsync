import { useId } from 'react';
import { FRIENDS_BUILD_CATALOG, FRIENDS_FINISHES, friendsShapeBoxes, isSlope, type FriendsBuildShape, type FriendsBuildFinish } from '../game/multiplayer/FriendsBuilding';
import { FRIENDS_TERRAIN_SURFACES } from '../game/world/FriendsTerrainAppearance';
import { isPlayerRail, sampleRail } from '../game/world/FriendsPlayerRail';

export function FriendsPieceIcon({ shape, finish, large = false }: { shape: FriendsBuildShape; finish: FriendsBuildFinish; large?: boolean }) {
  const id = useId().replaceAll(':', ''), d = FRIENDS_BUILD_CATALOG[shape], f = FRIENDS_FINISHES[finish];
  const k = Math.min(84 / ((d.w + d.d) * .866), 76 / (d.h + (d.w + d.d) * .45));
  const project = (x: number, y: number, z: number) => [60 + (x - y) * k * .866, 52 + d.h * k / 2 + (x + y) * k * .45 - z * k];
  const points = (p: number[][]) => p.map(v => project(v[0], v[1], v[2]).join(',')).join(' ');
  const surface = FRIENDS_TERRAIN_SURFACES[finish as keyof typeof FRIENDS_TERRAIN_SURFACES];
  const texture = surface?.asset ?? (finish === 'timber' ? 'WoodFloor051' : undefined);
  const patterns = [f.color, finish === 'grass' ? FRIENDS_TERRAIN_SURFACES.soil.color : f.color];
  const boxes = friendsShapeBoxes(shape).sort((a, b) => a.x + a.y - b.x - b.y || a.z - b.z);
  return <svg className={`friends-piece-icon ${large ? 'friends-piece-icon--large' : ''}`} viewBox="0 0 120 106" aria-hidden="true">
    <defs>{patterns.map((color, i) => <pattern key={i} id={`${id}-${i}`} width="32" height="32" patternUnits="userSpaceOnUse">
      <rect width="32" height="32" fill={color} />
      {texture && <><image href={`${import.meta.env.BASE_URL}textures/frontier/${texture}_1K-JPG_Color.jpg`} width="32" height="32" /><rect width="32" height="32" fill={color} style={{ mixBlendMode: 'multiply' }} /></>}
    </pattern>)}</defs>
    <ellipse cx="60" cy="90" rx="39" ry="8" fill="#031511" opacity=".16" />
    {isPlayerRail(shape) ? <g>{Array.from({ length: 12 }, (_, i) => {
      const p = sampleRail({ x: 0, y: 0, z: 0, rotation: 0, shape }, (i + .5) / 12);
      const a = project(p.x - Math.sin(p.angle) * 53, p.y + Math.cos(p.angle) * 53, 2), b = project(p.x + Math.sin(p.angle) * 53, p.y - Math.cos(p.angle) * 53, 2);
      return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#8f6a45" strokeWidth="4" />;
    })}{[-37, 37].map(side => <polyline key={side} points={Array.from({ length: 25 }, (_, i) => {
      const p = sampleRail({ x: 0, y: 0, z: 0, rotation: 0, shape }, i / 24);
      return project(p.x - Math.sin(p.angle) * side, p.y + Math.cos(p.angle) * side, 6).join(',');
    }).join(' ')} fill="none" stroke="#adc4cb" strokeWidth="3" />)}</g>
      : isSlope(shape) ? <g stroke="#142e2740" strokeWidth=".6">
        <polygon points={points([[-d.w / 2, -d.d / 2, 0], [d.w / 2, -d.d / 2, d.h], [d.w / 2, d.d / 2, d.h], [-d.w / 2, d.d / 2, 0]])} fill={`url(#${id}-0)`} />
        <polygon points={points([[-d.w / 2, d.d / 2, 0], [d.w / 2, d.d / 2, d.h], [d.w / 2, d.d / 2, 0]])} fill={`url(#${id}-1)`} />
        <polygon points={points([[d.w / 2, -d.d / 2, 0], [d.w / 2, -d.d / 2, d.h], [d.w / 2, d.d / 2, d.h], [d.w / 2, d.d / 2, 0]])} fill={`url(#${id}-1)`} opacity=".8" />
      </g> : boxes.map((b, i) => {
        const x = b.x - b.w / 2, y = b.y - b.d / 2, z = b.z, h = z + b.h;
        return <g key={i} stroke="#142e2740" strokeWidth=".55">
          <polygon points={points([[x, y, h], [x + b.w, y, h], [x + b.w, y + b.d, h], [x, y + b.d, h]])} fill={`url(#${id}-0)`} />
          <polygon points={points([[x + b.w, y, z], [x + b.w, y, h], [x + b.w, y + b.d, h], [x + b.w, y + b.d, z]])} fill={`url(#${id}-1)`} />
          <polygon points={points([[x, y + b.d, z], [x, y + b.d, h], [x + b.w, y + b.d, h], [x + b.w, y + b.d, z]])} fill={`url(#${id}-1)`} opacity=".8" />
        </g>;
      })}
  </svg>;
}
