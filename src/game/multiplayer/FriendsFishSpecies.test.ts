import { describe, expect, it } from 'vitest';
import { FISH_SPECIES, FRESHWATER_FISH, SEA_FISH, fishingCatchSpecies, speciesCatchSize, formatFishLength } from './FriendsFishSpecies';

describe('fish species and trophy catches',()=>{
  it('keeps all four freshwater species out of sea catches and vice versa',()=>{
    const samples=Array.from({length:10000},(_,i)=>i/10000);
    for(const body of ['lake','river','skyfalls'])expect(new Set(samples.map(r=>fishingCatchSpecies(body,r)))).toEqual(new Set(FRESHWATER_FISH));
    const sea=samples.map(r=>fishingCatchSpecies('sea',r));
    expect(new Set(sea)).toEqual(new Set(SEA_FISH));
    expect(sea.filter(f=>f==='shark')).toHaveLength(300);
    expect(fishingCatchSpecies('sea',1)).toBe('shark');
    expect(fishingCatchSpecies('lake',1)).toBe('pike');
  });
  it.each([...FRESHWATER_FISH,...SEA_FISH])('%s has small, ordinary and very big catches within its own range',species=>{
    const fish=FISH_SPECIES[species];
    expect(speciesCatchSize(species,0)*85).toBeCloseTo(fish.min);
    expect(speciesCatchSize(species,1)*85).toBeCloseTo(fish.max);
    const lengths=Array.from({length:1000},(_,i)=>speciesCatchSize(species,i/1000)*85);
    expect(lengths.every(cm=>Number.isFinite(cm)&&cm>=fish.min&&cm<=fish.max)).toBe(true);
    expect(lengths.filter(cm=>cm>fish.commonMax)).toHaveLength(50-(species==='shark'?0:1));
    expect(lengths[500]).toBeLessThan(fish.commonMax);
  });
  it('reserves six metre and larger sharks for the trophy tail',()=>{
    expect(speciesCatchSize('shark',.949)*85).toBeLessThan(450);
    expect(speciesCatchSize('shark',.95)*85).toBeCloseTo(600);
    expect(speciesCatchSize('shark',1)*85).toBeCloseTo(850);
    expect(formatFishLength(850/85)).toBe('8.50 m');
    expect(formatFishLength(38/85)).toBe('38 cm');
  });
});
