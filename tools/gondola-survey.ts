/** Read-only design survey. Writes planning artifacts, never game state.
 * Run: npx tsx tools/gondola-survey.ts
 * The span profile is a clearance sketch, not the final trolley/saddle curve.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { baseTerrainHeight, ISLAND_RUINS } from '../src/game/world/FriendsTerrain';
import { ISLAND_LAKES, ISLAND_SEA_LEVEL, islandLakeRadius } from '../src/game/world/FriendsIsland';
import { scenicRailway, scenicStationPoses } from '../src/game/world/FriendsScenicRailway';

const U = 12, out = resolve('artifacts/gondola');
const lower = { x: 3520, y: 21632 }, upper = { x: 6816, y: 18080 };
const dx = upper.x - lower.x, dy = upper.y - lower.y, length = Math.hypot(dx, dy);
const ux = dx / length, uy = dy / length;
function point(t: number) { return { x: lower.x + dx * t, y: lower.y + dy * t }; }
function hullGround(t: number) {
  const p = point(t); let z = -Infinity;
  // Full 18 x 12m level carrier, plus a 2m lateral reserve; voxel-size sampling.
  for (let a = -108; a <= 108; a += 12) for (let b = -96; b <= 96; b += 12)
    z = Math.max(z, baseTerrainHeight(p.x + ux * a - uy * b, p.y + uy * a + ux * b));
  return z;
}
const dockingGround = (start: number, end: number) => Math.max(...Array.from({ length: 33 }, (_, i) => hullGround(start + (end - start) * i / 32)));
const lowerDeck = dockingGround(0, .04) + 96, upperDeck = dockingGround(.96, 1) + 96;
const hanger = 168, sag = 24;
const nodes = [0, .04, .25, .5, .75, .96, 1].map(t => ({ t, z: hullGround(t) + hanger + 96 }));
nodes[0].z = nodes[1].z = lowerDeck + hanger;
nodes[5].z = nodes[6].z = upperDeck + hanger;
function spanAt(t: number) { return Math.min(nodes.length - 2, nodes.findIndex((n, i) => i < nodes.length - 1 && t <= nodes[i + 1].t + 1e-9)); }
function cable(t: number) {
  const i = spanAt(t), a = nodes[i], b = nodes[i + 1], f = (t - a.t) / (b.t - a.t);
  return a.z + (b.z - a.z) * f - (i === 0 || i === 5 ? 0 : 4 * sag * f * (1 - f));
}
// Lift the three support saddles until the whole level hull clears terrain.
// Terminal docking sections have a lower clearance target than travelling spans.
for (let pass = 0; pass < 12; pass++) for (let j = 0; j <= 512; j++) {
  const t = j / 512, i = spanAt(t), f = (t - nodes[i].t) / (nodes[i + 1].t - nodes[i].t);
  const target = (i === 0 || i === 5 ? 2 : 6) * U;
  const gap = hullGround(t) + hanger + target - cable(t);
  if (gap <= 0) continue;
  const movable = [i, i + 1].filter(k => k >= 2 && k <= 4);
  const weight = movable.reduce((s, k) => s + (k === i ? 1 - f : f), 0);
  if (weight > .001) for (const k of movable) nodes[k].z += (gap + 1) / weight;
}
const railway = scenicRailway(), samples: Record<string, number>[] = [];
let minRail = Infinity, minLake = Infinity, minRuin = Infinity, minClearance = Infinity, straightPenetration = -Infinity, routeLength = 0;
let previous: { x: number; y: number; z: number } | undefined;
for (let j = 0; j <= 512; j++) {
  const t = j / 512, p = point(t), ground = baseTerrainHeight(p.x, p.y), deck = cable(t) - hanger;
  const clearance = deck - hullGround(t); minClearance = Math.min(minClearance, clearance);
  straightPenetration = Math.max(straightPenetration, hullGround(t) - (lowerDeck + (upperDeck - lowerDeck) * t));
  for (const r of railway.points) minRail = Math.min(minRail, Math.hypot(p.x - r.x, p.y - r.y));
  for (const b of ISLAND_RUINS) minRuin = Math.min(minRuin, Math.hypot(Math.max(0, Math.abs(p.x - b.x) - b.w / 2), Math.max(0, Math.abs(p.y - b.y) - b.d / 2)));
  // Include both lateral edges, not just the cable centreline.
  for (const side of [-96, 0, 96]) minLake = Math.min(minLake, islandLakeRadius(p.x - uy * side, p.y + ux * side, ISLAND_LAKES[0]));
  if (previous) routeLength += Math.hypot(p.x - previous.x, p.y - previous.y, cable(t) - previous.z);
  previous = { ...p, z: cable(t) };
  samples.push({ t, x: p.x, y: p.y, ground: ground / U, hullGround: hullGround(t) / U, deck: deck / U, cable: cable(t) / U, clearance: clearance / U, chainage: length * t / U });
}
function horizon(sx: number, sy: number) {
  let maximum = -Infinity, blocker;
  for (let distance = 32; distance <= 40000; distance += 32) {
    const x = upper.x + sx * distance, y = upper.y + sy * distance, z = baseTerrainHeight(x, y);
    const angle = Math.atan2(z - (upperDeck + 20), distance) * 180 / Math.PI;
    if (angle > maximum) { maximum = angle; blocker = { x, y, z, distance }; }
  }
  return { terrainHorizonDegrees: maximum, blocker };
}
const result = {
  status: 'Preliminary natural-terrain design survey; no saved builds or terrain edits inspected',
  unitsPerMetre: U, lower: { ...lower, ground: baseTerrainHeight(lower.x, lower.y), deck: lowerDeck },
  upper: { ...upper, ground: baseTerrainHeight(upper.x, upper.y), deck: upperDeck },
  horizontalMetres: length / U, verticalRiseMetres: (upperDeck - lowerDeck) / U, cablePathMetres: routeLength / U,
  cruiseSecondsAt5MetresPerSecond: routeLength / U / 5,
  minimumRailCentrelineDistanceMetres: minRail / U, minimumLakeRadiusAcrossSweep: minLake,
  minimumAuthoredRuinDistanceMetres: minRuin / U, minimumHullGroundClearanceMetres: minClearance / U,
  straightRouteMaximumTerrainPenetrationMetres: straightPenetration / U,
  supports: nodes.map((n, i) => { const p = point(n.t); return { kind: i === 0 || i === 6 ? 'terminal' : i === 1 || i === 5 ? 'terminal approach gantry' : 'line tower', ...p, cableElevationMetres: n.z / U, groundElevationMetres: baseTerrainHeight(p.x, p.y) / U, heightMetres: (n.z - baseTerrainHeight(p.x, p.y)) / U }; }),
  sunrise: horizon(.832050294, -.554700196), sunset: horizon(-.832050294, .554700196),
  caveats: ['Profile requires smooth saddle transitions and a new full sweep before implementation.', 'Terrain scan excludes vegetation, saves, station footprints, access roads and foundations.', 'Horizon scan covers terrain along the exact horizon sun bearings, not trees or all solar elevations.', 'The shore-to-rail access route remains an unsurveyed design proposal.'], samples,
};
if (minClearance < 2 * U || minLake <= 1 || minRail < 100 * U || result.supports.some(s => !Number.isFinite(s.heightMetres) || s.heightMetres > 100))
  throw new Error('Preliminary route failed clearance/location/support-height gates; revise the alignment before writing artifacts.');
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'survey.json'), JSON.stringify(result, null, 2) + '\n');

const box = { x0: 2600, x1: 10400, y0: 16300, y1: 24400 }, map = { x: 60, y: 82, w: 650, h: 510 };
const mx = (x: number) => map.x + (x - box.x0) / (box.x1 - box.x0) * map.w;
const my = (y: number) => map.y + (y - box.y0) / (box.y1 - box.y0) * map.h;
let cells = '';
for (let x = box.x0; x < box.x1; x += 80) for (let y = box.y0; y < box.y1; y += 80) {
  const h = baseTerrainHeight(x + 40, y + 40), water = h < ISLAND_SEA_LEVEL;
  const shade = Math.max(25, Math.min(78, 35 + h / 120));
  cells += `<rect x="${mx(x).toFixed(1)}" y="${my(y).toFixed(1)}" width="${(80 / (box.x1 - box.x0) * map.w + .3).toFixed(1)}" height="${(80 / (box.y1 - box.y0) * map.h + .3).toFixed(1)}" fill="${water ? '#32606d' : `hsl(147,16%,${shade}%)`}"/>`;
}
const lake = ISLAND_LAKES[0];
const railPath = railway.points.filter((_, i) => i % 10 === 0).map(p => `${mx(p.x).toFixed(1)},${my(p.y).toFixed(1)}`).join(' ');
const px = (s: number) => 800 + s / (length / U) * 490, py = (z: number) => 565 - z / 460 * 410;
const groundPath = samples.map(s => `${px(s.chainage).toFixed(1)},${py(s.hullGround).toFixed(1)}`).join(' ');
const deckPath = samples.map(s => `${px(s.chainage).toFixed(1)},${py(s.deck).toFixed(1)}`).join(' ');
let towers = '', ticks = '';
for (const n of nodes.slice(2, 5)) { const p = point(n.t); towers += `<line x1="${px(length * n.t / U)}" x2="${px(length * n.t / U)}" y1="${py(baseTerrainHeight(p.x, p.y) / U)}" y2="${py(n.z / U)}" stroke="#d0b882" stroke-width="4"/>`; }
for (let z = 0; z <= 400; z += 100) ticks += `<line x1="800" x2="1290" y1="${py(z)}" y2="${py(z)}" stroke="#344553"/><text x="785" y="${py(z) + 5}" text-anchor="end" fill="#b7c5ca">${z}m</text>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="710" viewBox="0 0 1360 710" role="img" aria-label="Skyfalls freight gondola surveyed route and preliminary clearance profile">
<defs><clipPath id="map"><rect x="60" y="82" width="650" height="510"/></clipPath></defs>
<rect width="1360" height="710" fill="#172630"/><g font-family="Arial,sans-serif" font-size="17" fill="#eef2ec">
<text x="60" y="42" font-size="26">Skyfalls Freight Gondola → Last Light Lookout</text>
<text x="60" y="67" fill="#b7c5ca">Surveyed natural terrain • proposed layout • X/Y horizontal, Z up • 12 units = 1m</text>
<g clip-path="url(#map)">${cells}<ellipse cx="${mx(lake.x)}" cy="${my(lake.y)}" rx="${lake.rx / (box.x1 - box.x0) * map.w}" ry="${lake.ry / (box.y1 - box.y0) * map.h}" fill="#66b7c5" opacity=".65"/>
<polyline points="${railPath}" fill="none" stroke="#ebe5bc" stroke-width="3"/>
<line x1="${mx(lower.x)}" y1="${my(lower.y)}" x2="${mx(upper.x)}" y2="${my(upper.y)}" stroke="#edaa72" stroke-width="4"/>
</g>
<circle cx="${mx(lower.x)}" cy="${my(lower.y)}" r="7" fill="#edaa72"/><text x="${mx(lower.x) - 12}" y="${my(lower.y) + 28}">Shore cargo depot</text>
<circle cx="${mx(upper.x)}" cy="${my(upper.y)}" r="7" fill="#edaa72"/><text x="${mx(upper.x) + 15}" y="${my(upper.y) - 12}">Last Light Lookout</text>
<text x="${mx(lake.x) - 35}" y="${my(lake.y) + 18}" fill="#172630">Skyfalls lake</text>
<text x="${mx(8000) + 15}" y="${my(23200) + 12}" fill="#172630">Skyfalls Shore rail</text>
<text x="78" y="108">N ↑</text><text x="78" y="570" fill="#172630">Ocean</text>
<text x="800" y="112">Preliminary level-deck clearance profile</text>
${ticks}<polyline points="${groundPath}" fill="none" stroke="#9db5a8" stroke-width="2"/><polyline points="${deckPath}" fill="none" stroke="#edaa72" stroke-width="3"/>${towers}
<text x="800" y="600">0m</text><text x="1290" y="600" text-anchor="end">${Math.round(length / U)}m horizontal</text>
<text x="800" y="633" fill="#edaa72">Orange: deck path</text><text x="800" y="658" fill="#9db5a8">Green: highest ground under full carrier</text>
<text x="60" y="633">${Math.round(routeLength / U)}m travel • ${Math.round((upperDeck - lowerDeck) / U)}m rise • ~2-minute ride</text>
<text x="60" y="661" fill="#b7c5ca">Rail stays clear. Lake ellipse is schematic; shoreline clearance uses the actual lake function.</text>
<text x="60" y="687" fill="#b7c5ca">Final station footprints, access road, vegetation and saved construction still require validation.</text>
</g></svg>`;
writeFileSync(resolve(out, 'route-and-profile.svg'), svg);
await sharp(Buffer.from(svg)).png().toFile(resolve(out, 'route-and-profile.png'));
const { samples: _, ...summary } = result;
console.log(JSON.stringify(summary, null, 2));
