/** Shared immutable datums; kept free of terrain imports for worker/field use. */
export const ISLAND_SEA_LEVEL = -168.5;
export const ISLAND_LAKES = [
  {id:'skyfalls',x:6912,y:20448,rx:1568,ry:1120,level:666.5},
  {id:'gate',x:15520,y:10800,rx:1152,ry:2368,level:602.5},
  {id:'deepmere',x:12128,y:23600,rx:2600,ry:2200,level:154.5},
] as const;
