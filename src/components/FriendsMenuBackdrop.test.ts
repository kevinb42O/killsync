import { describe, expect, it } from 'vitest';
import { FRIENDS_MENU_SCENERY, friendsMenuCameraPosition, friendsMenuCameraPose } from '../game/rendering/FriendsMenuCamera';
import { FriendsEnvironmentPreview } from '../game/world/FriendsEnvironmentPreview';
import { createFrontierCloudField, CLOUD_FIELD_MARGIN, CLOUD_FIELD_SPAN } from '../game/world/FriendsCloudField';
import { baseTerrainHeight } from '../game/world/FriendsTerrain';
import { CLOUD_WIND } from '../game/rendering/FriendsCloudVolume';

describe('Friends menu live scenery', () => {
  it('keeps the accepted opening, descends smoothly, then varies the coastal distance and height', () => {
    const { center, radius, altitude, cloudAltitude, descentDurationMs } = FRIENDS_MENU_SCENERY;
    const initial = friendsMenuCameraPose(0);
    expect(Math.hypot(initial.position.x - center.x, initial.position.z - center.z)).toBeCloseTo(radius);
    expect(initial.position.y).toBe(altitude);
    expect(initial.target).toEqual(center);
    expect(friendsMenuCameraPosition(descentDurationMs / 2).y).toBeCloseTo((altitude + cloudAltitude) / 2);
    expect(friendsMenuCameraPosition(descentDurationMs).y).toBe(cloudAltitude);
    const distances = new Set<number>();
    for (let elapsed = 65000; elapsed < 720000; elapsed += 1000) {
      const { position, target } = friendsMenuCameraPose(elapsed);
      const distance = Math.hypot(position.x - center.x, position.z - center.z);
      expect(distance).toBeGreaterThanOrEqual(32600 - 1e-8);
      expect(distance).toBeLessThanOrEqual(35000 + 1e-8);
      expect(position.y).toBeGreaterThanOrEqual(4300);
      expect(position.y).toBeLessThanOrEqual(6350);
      expect(Math.hypot(target.x - center.x, target.z - center.z)).toBeLessThan(1200);
      distances.add(Math.round(distance / 100));
    }
    expect(distances.size).toBeGreaterThan(15);
  });
  it('has no camera cuts or velocity discontinuity at the descent and lap boundaries', () => {
    const step = 10;
    for (const elapsed of [65000, 155000, 230000, 360000, 720000]) {
      const before = friendsMenuCameraPosition(elapsed - step), at = friendsMenuCameraPosition(elapsed), after = friendsMenuCameraPosition(elapsed + step);
      const velocityChange = Math.hypot(after.x - 2 * at.x + before.x, after.y - 2 * at.y + before.y, after.z - 2 * at.z + before.z) / step;
      expect(velocityChange).toBeLessThan(.001);
      expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)).toBeLessThan(20);
    }
  });
  it('keeps the camera clear of terrain throughout the changing path', () => {
    for (let elapsed = 0; elapsed < 720000; elapsed += 1000) {
      const position = friendsMenuCameraPosition(elapsed);
      expect(position.y - baseTerrainHeight(position.x, position.z)).toBeGreaterThan(800);
    }
  });
  it('advances the environment at 60 times normal speed with 50 percent wind', () => {
    const environment = new FriendsEnvironmentPreview();
    environment.change({ hour: 9, speed: FRIENDS_MENU_SCENERY.timeScale, windSpeed: FRIENDS_MENU_SCENERY.windSpeed });
    expect(environment.time(1000, 1000)).toBe(60000);
    expect(environment.windSeconds).toBe(.5);
    expect(environment.state.speed).toBe(60);
    expect(environment.state.windSpeed).toBe(.5);
    expect(environment.time(1000, 1000)).toBe(60000);
  });
  it('occasionally crosses a real cloud bank and spends most of the orbit in clear air', () => {
    const clouds = createFrontierCloudField();
    const wrap = (value: number) => ((value + CLOUD_FIELD_MARGIN) % CLOUD_FIELD_SPAN + CLOUD_FIELD_SPAN) % CLOUD_FIELD_SPAN - CLOUD_FIELD_MARGIN;
    let crossings = 0;
    for (let seconds = 65; seconds < 600; seconds++) {
      const camera = friendsMenuCameraPosition(seconds * 1000);
      const windSeconds = seconds * FRIENDS_MENU_SCENERY.windSpeed;
      if (clouds.some(cloud => {
        const x = wrap(cloud.x + CLOUD_WIND.x * windSeconds), z = wrap(cloud.z + CLOUD_WIND.z * windSeconds);
        return ((camera.x - x) / cloud.width) ** 2 + ((camera.y - cloud.altitude) / cloud.height) ** 2 + ((camera.z - z) / cloud.depth) ** 2 < .5;
      })) crossings++;
    }
    expect(crossings).toBeGreaterThan(0);
    expect(crossings).toBeLessThan(100);
  });
});
