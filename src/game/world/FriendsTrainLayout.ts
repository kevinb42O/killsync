/** Shared consist dimensions, station capacity and freight loading envelope (native units). */
export type ScenicWagonKind = 'touring' | 'flatbed' | 'stake' | 'gondola';
export const SCENIC_WAGONS: readonly ScenicWagonKind[] = ['touring','touring','touring','flatbed','stake','gondola','flatbed','stake','gondola','flatbed'];
export const SCENIC_CAR_LENGTH = 210;
export const SCENIC_CAR_SPACING = 225;
export const SCENIC_TAIL_DISTANCE = SCENIC_WAGONS.length * SCENIC_CAR_SPACING;
export const SCENIC_STOP_OFFSET = (SCENIC_TAIL_DISTANCE + SCENIC_CAR_LENGTH / 2 - 90) / 2;
export const SCENIC_PLATFORM_HALF = 1280;
export const SCENIC_LEVEL_APPROACH = 1344;
export const SCENIC_MAX_KMH = 360;
export const SCENIC_CONTROL = {x:78,y:0,z:0};
export const scenicCargoWagon = (v:{scenic?:boolean;wagonKind?:ScenicWagonKind}) => Boolean(v.scenic && v.wagonKind && v.wagonKind !== 'touring');
