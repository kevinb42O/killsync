# Pier café chair

Dining Chair 02 by James Ray Cock, Poly Haven.
Source: https://polyhaven.com/a/dining_chair_02
License: CC0 1.0 (see License.txt).

Original glTF geometry with embedded 1K diffuse, OpenGL normal and packed
AO/roughness/metallic JPEG maps. No runtime network dependency. Twenty-two
chairs share instanced geometry and textures in the seaside pavilion.

`chair-lod.glb` is an offline simplification of the same model with 2,378
triangles (original: 22,013), preserving UVs and the original PBR maps. Rebuild
with `node tools/build-pier-chair-lod.mjs`. The original model is used within
180 world units; both variants are instanced and compacted into one draw each.
