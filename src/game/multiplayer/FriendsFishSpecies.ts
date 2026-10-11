/** Lengths are game catch ranges in centimetres, including rare trophy fish. */
export const FISH_SPECIES = {
  koi: { name:'Koi', model:'koi', min:38, commonMax:170, max:357 },
  trout: { name:'Trout', model:'trout', min:15, commonMax:70, max:140 },
  perch: { name:'Perch', model:'snapper', min:12, commonMax:40, max:95 },
  zander: { name:'Zander', model:'snapper', min:18, commonMax:90, max:160 },
  pike: { name:'Pike', model:'trout', min:20, commonMax:110, max:210 },
  mackerel: { name:'Mackerel', model:'tuna', min:15, commonMax:45, max:95 },
  cod: { name:'Cod', model:'grouper', min:25, commonMax:110, max:220 },
  tuna: { name:'Tuna', model:'tuna', min:35, commonMax:220, max:450 },
  shark: { name:'Shark', model:'shark', min:70, commonMax:450, max:850 },
} as const;
export type FishSpecies = keyof typeof FISH_SPECIES;
export const FRESHWATER_FISH = ['trout','perch','zander','pike'] as const;
export const SEA_FISH = ['mackerel','cod','tuna','shark'] as const;
export function fishingCatchSpecies(bodyId:string,sample:number):FishSpecies {
  const r=Math.max(0,Math.min(1,sample));
  if(bodyId!=='sea')return FRESHWATER_FISH[Math.min(3,Math.floor(r*4))];
  return r<.45?'mackerel':r<.80?'cod':r<.97?'tuna':'shark';
}
export function speciesCatchSize(species:FishSpecies,sample:number) {
  const fish=FISH_SPECIES[species],r=Math.max(0,Math.min(1,sample));
  // Small/medium catches dominate; the top 5% reach the trophy band.
  const length=r<.95?fish.min+(fish.commonMax-fish.min)*(r/.95)**1.7:
    (species==='shark'?600:fish.commonMax)+(fish.max-(species==='shark'?600:fish.commonMax))*((r-.95)/.05)**.7;
  return length/85;
}
export const fishSpeciesName = (species:FishSpecies|undefined) => FISH_SPECIES[species??'koi'].name;
export function formatFishLength(size:number) {
  const cm=Math.round(size*85);
  return cm>=100?`${(cm/100).toFixed(2)} m`:`${cm} cm`;
}
