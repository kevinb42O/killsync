# Coastal timber pier

- Model: [Modular Wooden Pier](https://polyhaven.com/a/modular_wooden_pier)
- Artist: Rico Cilliers / Poly Haven
- License: [CC0 1.0](https://polyhaven.com/license), including redistribution and commercial use.
- Downloaded: 2026-10-11 from Poly Haven's public asset API.

`pier.glb` contains the original straight sections 02 and 03, with embedded
1K diffuse, OpenGL normal and packed AO/roughness/metalness
textures. JPEGs were recompressed at quality 85. Each section's deck is centred
in X/Z with its walking plane at Y=0; the original mesh detail and UVs remain.
The runtime assembles five approach spans and three crosswise spans into a
T-shaped landing, with length/height at 48 world units per metre. The stem is widened to a 144-unit walking deck; the T head retains its original dimensions. A 208-unit-wide beach landing narrows into a sloped timber gangway, with plank heights matching the shared analytic walking surface. The gangway reuses the source timber material and batches its planks into one mesh.
The resulting local asset is approximately 4.1 MB and needs no remote requests.

Placement and shared deck collision: `src/game/world/FriendsCoastalPier.ts`.
The retained fishing dock is on the western beach at (2592, 5800), extending
west into the sea. The deck is at -96, above the sea datum (-168.5), and meets
the beach through the gangway. A small feathered terrain clearance beneath the shore spans prevents sand intersecting the planks. A small rounded sand landing clears the adjacent uphill lip at the entrance. The inland timber landing starts on the beach level, and the sloped surface removes the need to jump over the beach’s voxel steps. The large pleasure pier occupies the northwest
beach separately. Existing inland fishing docks are independent.
