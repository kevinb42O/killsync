import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createOuterIslandBathymetry, applyOuterIslandBathymetry } from './FriendsOuterIslandWater';
import { DISTANT_ISLANDS } from '../world/FriendsOuterIslands';

describe('outer island shoreline integration', () => {
  it('represents dry land, shallow shelves and open water with one bounded static atlas', () => {
    const atlas = createOuterIslandBathymetry(), data=atlas.texture.image.data as Uint16Array;
    const width=atlas.texture.image.width, tile=atlas.texture.image.height;
    expect(data.byteLength).toBeLessThan(380000);
    expect(atlas.regions).toHaveLength(DISTANT_ISLANDS.length);
    for(let island=0;island<DISTANT_ISLANDS.length;island++) {
      let dry=0,shallow=0,deep=0;
      for(let z=0;z<tile;z++) for(let x=0;x<tile;x++) {
        const depth=THREE.DataUtils.fromHalfFloat(data[(z*width+island*tile+x)*4]);
        expect(Number.isFinite(depth)).toBe(true);
        if(depth<0)dry++; else if(depth<150)shallow++; else deep++;
      }
      expect(dry).toBeGreaterThan(500);expect(shallow).toBeGreaterThan(30);expect(deep).toBeGreaterThan(1000);
    }
    const material=new THREE.ShaderMaterial({fragmentShader:'#include <fog_pars_fragment>\nfloat depth=mix(256.,texture2D(bathymetry,clamp(uv,0.,1.)).r,inside);\ncoast=coastAt(uv);surfPhase=coastPhase(p,coast);surfWeight=coastWeight(depth,coast)*inside;'});
    applyOuterIslandBathymetry(material,atlas);
    expect(material.uniforms.outerCoastAtlas.value).toBe(atlas.texture);
    expect(material.fragmentShader).toContain('if(ocean>.5 && inside<.5 && outerCoastEnabled>.5)');
    expect(material.fragmentShader).toContain('coast=outerWater>.5?outerCoast:coastAt(uv)');
    atlas.texture.dispose();material.dispose();
  });
});
