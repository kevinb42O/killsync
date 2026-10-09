# Friends mode assets

The seven Kenney pack folders contain models by Kenney under CC0 1.0.
The quaternius folder adds six textured nature models by Quaternius under CC0 1.0;
see its README.md for the original source, transfer mirror and modifications.
Original license files are included in each pack folder. The selected GLB files
are copied without modification; transformations and assembly happen in the game.

Primary sources, downloaded October 5, 2026:
- Train Kit: https://kenney.nl/assets/train-kit (v1.1)
- Space Kit: https://kenney.nl/assets/space-kit (v1.0)
- Nature Kit: https://kenney.nl/assets/nature-kit (v1.0)
- Building Kit: https://kenney.nl/assets/building-kit
- Castle Kit: https://kenney.nl/assets/castle-kit
- Watercraft Kit: https://kenney.nl/assets/watercraft-kit (v2.1, downloaded October 9, 2026)
- Survival Kit: https://kenney.nl/assets/survival-kit

Only selected models and their required texture are bundled, not entire packs.
See manifest.json for provenance per file. No runtime request goes to Kenney.
The train uses the bullet locomotive and monorail flatbed chassis with authored,
walkable passenger decks. The Sunskiff combines the cargo hull, chair, cockpit
and generator models with an open cabin and animated ducted rotors.

The library contains a curated selection of models. The valley uses instanced trees,
rocks, grasses and flowers, modular greenhouse windows and an Archive tower,
station architecture, campsites, workshop furniture and trail signs.

The held axe, pickaxe and shovel now use Survival Kit GLBs, including their
upgraded variants. No tool blade or shaft is approximated with primitive geometry.

The Reedwater skiff uses Watercraft Kit’s `boat-row-large.glb` (118-triangle hull, 15,988 bytes) and its original palette texture. Its bundled static paddle pair is hidden at runtime. Authored oars, brass rowlocks, a shared two-person bench and wakes supply the manual rowing animation. The original CC0 license is included under `watercraft-kit/License.txt`.

Fishing uses Quaternius’s CC0 Fishing Rod Lvl5 and animated Koi from the Cute Fish Pack, downloaded October 9, 2026. Source, transfer links, sizes and clip names are recorded in `fishing/README.md`. The source GLBs are unmodified; runtime palette merging reduces the fish's five submeshes to one skinned draw with shared geometry and a six-bone skeleton per visible fish.
