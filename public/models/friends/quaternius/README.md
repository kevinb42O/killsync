# Quaternius — Ultimate Stylized Nature

Author: Quaternius. License: CC0 1.0 Universal. Original License.txt included.
Primary source: https://quaternius.com/packs/ultimatestylizednature.html

Selected trees: PineTree_1, PineTree_3, PineTree_5, BirchTree_1, MapleTree_1;
selected undergrowth: Bush. Models include UVs, authored leaf cards, bark,
leaf color and bark normal textures. They are instanced by the frontier renderer.

The author's Google Drive download had exceeded its public download quota.
Public transfer mirror used for the same CC0 models and textures:
https://github.com/DefinitelyMaybe/FunBit/tree/b3f25813df0e7244b062ee29cdec537051d4c7a6/static/Ultimate-Stylized-Nature

Downloaded 2026-10-05. Converted the mirror's embedded-buffer glTF JSON to GLB,
restored its texture bindings using the pack's named textures, set bark metalness
to zero and leaf alpha testing to 0.45. Files are local and need no external host.
Texture filenames and original geometry are preserved. No scripts from the
mirror were downloaded or executed.

Bark-only detail index lists (`*_BarkLOD.json`) are generated with
`node tools/build-frontier-tree-lods.mjs` using meshoptimizer. These CC0 derived
meshes share the original vertex positions, UVs and normals. Foliage geometry and
textures are unchanged at every viewing distance; wood detail is selected from
projected simplification error. The simplifier runs offline, never in the game.
