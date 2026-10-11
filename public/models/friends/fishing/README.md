# Friends fishing models

Author: Quaternius. License: CC0 1.0 Universal. Downloaded October 9, 2026.

Creator source: https://quaternius.com/packs/cutefish.html
GLB transfer mirror: https://poly.pizza/bundle/Animated-Fish-Bundle-44zhHN1UbT

- rod.glb: Fishing Rod Lvl5, https://poly.pizza/m/aOabqWh68m
  Original transfer: https://static.poly.pizza/cc9df0c6-7e35-403c-a0e0-79f1187f5b65.glb
  64,656 bytes, 1,174 triangles, two palette materials.
- koi.glb: Koi, https://poly.pizza/m/qyGtRmhgzl
  Original transfer: https://static.poly.pizza/d2ba96af-9f0b-45a8-a5b4-248b583f0765.glb
  164,800 bytes, 1,494 triangles, five palette materials, six skin joints.
  Animations: Attack, Death, Out_Of_Water, Swimming_Fast, Swimming_Impulse, Swimming_Normal (Fish_Armature prefix).

Files are unmodified, self-contained GLBs. No external textures or runtime downloads.
The game merges the rod palette into one draw, fits it to the hands, and adds a
bend morph and line-tip socket. It merges the fish palette submeshes into one
vertex-colored Lambert skinned draw while retaining original animations. Clones
share geometry/materials; each visible fish has its own six-joint skeleton.

CC0 license: https://creativecommons.org/publicdomain/zero/1.0/

## October 11 species expansion

The following unmodified, self-contained GLBs were downloaded from Poly Pizza
on October 11, 2026. The game caches species adaptations at runtime; no remote
model downloads occur during play.

- trout.glb: **Trout**, by **Poly by Google**. CC-BY 3.0.
  Source: https://poly.pizza/m/0HCLwTdxvz5
  Download: https://static.poly.pizza/6eac34d9-f6f3-4d08-bbf8-162709a89797.glb
  32,764 bytes, 556 triangles. SHA-256: `1d770869650a3b6f5135cbd0e71b7b8e1b7ea6d854367eb64266318c2da69b0f`.
- tuna.glb: **Tuna**, by **Quaternius**. CC0 1.0.
  Source: https://poly.pizza/m/1tycAcvSVW
  Download: https://static.poly.pizza/95b59647-7cc1-45b4-b136-3ab9e3f5b3ae.glb
  190,904 bytes, 1,446 triangles. SHA-256: `cd4a8651fb0eea5ec23efeccd9a9adeeef927863bceeeb0655fef5c742b8e552`.
- shark.glb: **Shark**, by **Quaternius**. CC0 1.0.
  Source: https://poly.pizza/m/sZR8AMLMz5
  Download: https://static.poly.pizza/fdcb48e0-c02a-431d-a648-6a3b11e54f82.glb
  142,700 bytes, 1,310 triangles. SHA-256: `c6a8b6e3baefd2a8e324e11c449366ca14d1be152c65643d2347baf50e243ba6`.
- snapper.glb: **Red Snapper**, by **Quaternius**. CC0 1.0.
  Source: https://poly.pizza/m/BRKfDKwPTv
  Download: https://static.poly.pizza/05418682-2314-4b64-aa8e-fc4fcd212be8.glb
  155,068 bytes, 1,416 triangles. SHA-256: `0d73784e52fd3c1c5a12a91f8926707697ae4ac2768d5035e3f51100c4859c17`.
- grouper.glb: **Coral Grouper**, by **Quaternius**. CC0 1.0.
  Source: https://poly.pizza/m/Q2GNw9TRzF
  Download: https://static.poly.pizza/6349bd9a-a6b8-40c9-96d6-68a33eaca4b8.glb
  170,948 bytes, 1,588 triangles. SHA-256: `b569df4b15d5a7444888b57718a653ada9f5c5e00c80f8879ec7669d2adf8c60`.

Trout attribution: “Trout” by Poly by Google,
https://poly.pizza/m/0HCLwTdxvz5, licensed under Creative Commons Attribution 3.0
Unported (https://creativecommons.org/licenses/by/3.0/). The original model is
bundled unchanged. Runtime normalization and subtle whole-model wriggling are
added for trout; the pike adaptation changes proportions, colours and markings.
This attribution also appears in the bundled CREDITS.txt.

Quaternius tuna, shark, red snapper and coral grouper are CC0 1.0 Universal
(https://creativecommons.org/publicdomain/zero/1.0/). They retain the pack's six
animations. Perch and zander adapt the snapper; mackerel adapts the tuna; cod
adapts the grouper. Runtime adaptations change proportions, palette and
vertex-coloured stripes/spots. These are stylized approximations, not exact
author-supplied models of those five species. Trout and pike use a static
556-triangle mesh with procedural wriggling; the other six catches are skinned.

Each species template shares geometry/materials. Skeletons belong to visible
catches and are disposed when a pooled presentation changes species.
