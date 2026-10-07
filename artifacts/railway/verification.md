# Railway verification — 7 October 2026

- Tunnel/terrain/engineering checks: 37 tests passed in the final nine-file run. The station geometry check exceeded its previous 30-second timeout while other work and rendering were running. It passed separately after increasing its allowance to 60 seconds (actual rerun: 1.70 seconds). All 38 checks are accounted for in `verification-tunnel-roofs.log` and `verification-tunnel-stations.log`.
- The tunnel regression scans cover and walkable ground across every enclosed section, compares excavation boundaries against voxel collision around the complete circuit, and compares detailed and block roof faces at four actual tunnel locations.
- Longer-train targeted validation: 97 tests passed; subsequent integration validation: 31 passed; model surface validation: 3 passed. These stages overlap; counts are not summed into a unique-test total.
- TypeScript: passed.
- Production build: passed. The existing large-bundle warning remains.
- Visual inspection: the previously open coastal tunnel roof is closed; deep mountain surfaces and tunnel lighting/lining were also inspected in the actual review renderer.

The tunnel changes keep the railway elevation fixed, preserve the natural mountain arch passage, and share the bore survey between lining and terrain. Shallow roofs receive two solid terrain layers. Exact distant excavation uses the collision voxel boundaries, and smooth mountain terrain samples inside thin cover slabs.
