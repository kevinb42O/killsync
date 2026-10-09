# Big Walk Avatars — Ghostbia

Source: [Big Walk — CPM Models](https://ko-fi.com/s/3a8d6b5c5c), by Ghostbia.
Downloaded by the user on 2026-10-09 as `BigWalkAvatars.cpmmodel`.
The creator describes this as unaffiliated Big Walk / House House fan work.
The download supplied no general-purpose reuse license; this asset must not be
labelled CC0 or covered by the Kenney/Quaternius licenses elsewhere in this folder.

`character.json` and `atlas.png` are converted from that file, preserving the
artist's 403-node hierarchy, 512×512 PNG atlas, colour layers and pose tracks.
The raw source is retained in `artifacts/big-walk/source/BigWalkAvatars.cpmmodel`.
Its SHA-256 is recorded in `character.json`.

Reproduce the conversion from the repository root:

```sh
python3 tools/import-friends-big-walk.py artifacts/big-walk/source/BigWalkAvatars.cpmmodel
```

The importer reads CPM's embedded legacy definition and verifies both file
checksums. It does not execute downloaded code or request the hosted model link.
The binary format was checked against the original
[CustomPlayerModels source](https://github.com/tom5454/CustomPlayerModels).

Friends selects the closest authored head colour to the existing crew colour,
with the pack's yellow upper body and blue lower body. First-person equipment
uses those same yellow limbs. Each avatar batches its selected geometry into
six independently animated parts. Minecraft-only props, armour roots and
inactive colour layers are excluded from the render meshes.
