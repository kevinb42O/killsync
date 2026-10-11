# Coastal golfbrekers

Fifteen permanent Belgian-style stone groynes line the western and northern beaches. Each attaches to the coast at a dry sand entrance, rises gradually from -160 to -128, and extends 768–1024 world units out to sea. The sea datum is -168.5. The level central walking strip is 160 units wide, with sloping rubble on both sides.

`FriendsBreakwaters.ts` owns the deterministic layout, walking surfaces, spatial lookup, solid side collision and convex ray intersections. `FriendsTerrain` uses these for host movement, client prediction and fishing obstruction checks. Players can walk to the ends and cast into salt water using the existing fishing controls. Short casts into the stone sides correctly stay dry; cast from an edge or charge the cast to clear the rubble.

`FriendsBreakwaterVisuals.ts` draws each groyne using three static meshes: a low-poly foundation, instanced bevelled top stones, and instanced angular rubble. Two shared stone geometries and two shared materials serve all fifteen structures. Each mesh is independently frustum culled. There are no per-stone physics bodies, dynamic shadows, animation updates, external model downloads or network entities. Floor/support lookup uses 512-unit spatial buckets; fishing rays use a distance broad phase followed by two convex sections per nearby groyne.

Validation:

- Unit/integration coverage samples every entrance and walking strip, checks shared support and stone ray intersections, blocks swimmers at the sides, and walks a host player from beach to tip before casting into the sea.
- Rendering coverage enforces 45 meshes for all fifteen groynes, shared geometry, independent bounds, disabled shadow casting and a total budget below 65,000 triangles.
- `node tools/test-friends-breakwaters.mjs` captures the actual streamed coast and a view from the fishing surface, checks WebGL/page errors, and compares six alternating visible/hidden pairs in a warmed, GPU-synchronized static render.
- The recorded 1440×900 local run adds 3 draw calls and 3,104 triangles from the fishing view. Median render time was approximately 0.360 ms hidden and 0.382 ms visible (about 0.022 ms added). This is a static render measurement on the local machine, not an overall gameplay FPS guarantee; simulation, streaming, other views and hardware can differ.

Screenshots and raw measurements are in `artifacts/breakwaters/`; the browser harness reuses the existing coastal pier review scene. Set `FRIENDS_TEST_ORIGIN` to point it at another development server.
