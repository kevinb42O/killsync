# Premade crane placement stall

The CPU profile identified a synchronous `getProgramInfoLog` query during the first render. A second trace tagged the calls to the braided crane cable and telescopic steel batches. Those meshes did not exist during startup shader preparation.

The fix creates hidden, zero-count batches and a hidden cable reserve before arrival. Explicit startup warmup markers let the existing asynchronous shader preparation discover their actual instancing, vertex colour, texture and shadow-receiving variants. Steel and winch batches reserve eight cranes and grow geometrically. Gameplay and collision code are unchanged.

The controlled placement-window maximum render duration was **161.1 ms before** and **11.3 ms after**. Blocking crane shader-log queries disappeared in the after trace. Exact timings vary by device; unrelated background world shader preparation is still present. See `performance.json` for methodology and caveats and the before/after trace files for the timed calls.

Verification: 183 tests across 13 files passed, TypeScript passed, and the production browser crane scenario passed construction, load connection, simultaneous movement, rotation, brakes, maximum 256m extension, camera manipulation and touch controls with no page errors. Existing telescope-crane screenshots were copied here for this run.
