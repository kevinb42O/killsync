/** Shared by collision, meshing and water; keep lower limits in voxel alignment. */
export const FRIENDS_TERRAIN_BOTTOM=-4096;
export const FRIENDS_BEDROCK_TOP=FRIENDS_TERRAIN_BOTTOM+64;
export const FRIENDS_MIN_EDIT_VOXEL=FRIENDS_BEDROCK_TOP/32;
export const friendsBedrockVoxel=(vz:number)=>vz>=FRIENDS_TERRAIN_BOTTOM/32&&vz<FRIENDS_MIN_EDIT_VOXEL;
