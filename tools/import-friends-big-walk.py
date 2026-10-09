"""Convert Ghostbia's local CPM export to a self-contained Friends asset.

Format reference: tom5454/CustomPlayerModels, shared/io/IOHelper.java,
shared/model/Cube.java and shared/parts/ModelPartAnimation.java. This importer
reads data only; it never evaluates code or follows CPM's hosted-resource links.
Usage: python3 tools/import-friends-big-walk.py /path/BigWalkAvatars.cpmmodel
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct


class Reader:
    def __init__(self, data):
        self.data, self.i = data, 0

    def take(self, n):
        if n < 0 or self.i + n > len(self.data):
            raise ValueError('Truncated CPM data')
        result = self.data[self.i:self.i + n]
        self.i += n
        return result

    def byte(self):
        return self.take(1)[0]

    def short(self):
        return struct.unpack('>h', self.take(2))[0]

    def var(self):
        result = 0
        for shift in range(0, 35, 7):
            value = self.byte()
            result |= (value & 127) << shift
            if not value & 128:
                return result
        raise ValueError('Invalid CPM varint')

    def block(self):
        return self.take(self.var())

    def text(self):
        return self.block().decode('utf-8')

    def vec(self):
        return [round(self.short() / 682, 6) for _ in range(3)]

    def angle(self):
        return [round(self.short() / 65535 * math.tau, 6) for _ in range(3)]


POSES = 'CUSTOM STANDING WALKING RUNNING SNEAKING SWIMMING FALLING SLEEPING RIDING FLYING DYING SKULL_RENDER GLOBAL CREATIVE_FLYING EATING_LEFT EATING_RIGHT RETRO_SWIMMING JUMPING SNEAK_WALK PUNCH_LEFT PUNCH_RIGHT ARMOR_HEAD ARMOR_BODY ARMOR_LEGS ARMOR_BOOTS WEARING_ELYTRA BOW_LEFT BOW_RIGHT CROSSBOW_LEFT CROSSBOW_RIGHT CROSSBOW_CH_LEFT CROSSBOW_CH_RIGHT TRIDENT_LEFT TRIDENT_RIGHT TRIDENT_SPIN SPYGLASS_LEFT SPYGLASS_RIGHT HOLDING_LEFT HOLDING_RIGHT'.split()


def animations(data):
    reader, result = Reader(data), {}
    while True:
        kind = reader.byte()
        if kind == 0:
            break
        r = Reader(reader.block())
        if kind == 1:
            pose, key, flags = r.byte(), r.byte(), r.byte()
            result[key] = dict(name=r.text() if pose == 0 else POSES[pose], add=bool(flags & 1), tracks={})
        elif kind == 2:
            key, name, flags = r.byte(), r.text(), r.byte()
            result[key] = dict(name=name, add=bool(flags & 1), loop=bool(flags & 2), tracks={})
        elif kind == 7:
            key, count, frames, duration = r.byte(), r.byte(), r.byte(), r.short()
            result[key].update(frames=frames, duration=duration, components=[r.var() for _ in range(count)])
        elif kind in (3, 4, 5, 6, 12):
            key, component = r.byte(), r.byte()
            a = result[key]
            track = a['tracks'].setdefault(a['components'][component], {})
            channel = {3: 'rotation', 4: 'position', 5: 'visible', 6: 'color', 12: 'scale'}[kind]
            if kind == 5:
                bits = r.take((a['frames'] + 7) // 8)
                values = [bool(bits[i // 8] & (1 << (i % 8))) for i in range(a['frames'])]
            else:
                read = r.angle if kind == 3 else (lambda: [r.byte() for _ in range(3)]) if kind == 6 else r.vec
                values = [read() for _ in range(a['frames'])]
            track[channel] = values
        elif kind == 13:
            key, value = r.byte(), r.byte()
            result[key]['default'] = value
        elif kind == 16:
            key, group = r.byte(), r.text()
            result[key]['group'] = group
    return list(result.values())


def convert(source, directory):
    raw = source.read_bytes()
    if raw[0] != 0x53 or (sum(raw[1:-2]) & 65535) != int.from_bytes(raw[-2:], 'big'):
        raise ValueError('Invalid CPM header or checksum')
    r = Reader(raw[1:-2])
    name, author, header, overflow = r.text(), r.text(), r.block(), r.block()
    # The supplied legacy file embeds the definition referenced by its header.
    if not overflow or overflow[0] != 0x53:
        raise ValueError('This importer requires an embedded legacy CPM definition')
    if (sum(overflow[1:-2]) & 65535) != int.from_bytes(overflow[-2:], 'big'):
        raise ValueError('Invalid embedded definition checksum')
    r = Reader(overflow[1:-2])
    cubes = []
    for index in range(r.var()):
        cube = dict(id=index + 10, size=[r.byte() / 10 for _ in range(3)], position=r.vec(), offset=r.vec(), rotation=r.angle(), parent=r.var(), textureSize=r.byte(), visible=True, meshScale=[1, 1, 1], inflate=0)
        if cube['textureSize']:
            cube['uv'] = [r.byte(), r.byte()]
        else:
            cube['color'] = [r.byte() for _ in range(3)]
        cubes.append(cube)
    by_id = {c['id']: c for c in cubes}
    roots, clips, texture, effects = [], [], None, {}
    while True:
        kind = r.byte()
        part = Reader(r.block())
        if kind == 0:
            break
        if kind == 5:
            texture_size = [part.short(), part.short()]
            texture = part.block()
        elif kind == 7:
            roots.append(dict(id=part.var(), position=part.vec(), rotation=part.angle()))
        elif kind == 10:
            clips = animations(part.data)
        elif kind == 12:
            key, root_type = part.var(), part.byte()
            by_id[key]['extraRoot'] = root_type
        elif kind == 8:
            effect = part.byte()
            effects[effect] = effects.get(effect, 0) + 1
            if effect in (0, 1, 2, 5, 6, 7, 10):
                cube = by_id.get(part.var())
                if cube is None:
                    continue
                if effect == 2:
                    cube['visible'] = False
                elif effect == 0:
                    cube['glow'] = True
                elif effect == 1:
                    cube['inflate'], cube['meshScale'] = part.short() / 682, part.vec()
                elif effect == 6:
                    cube['uv'] = [part.var(), part.var()]
                elif effect == 5:
                    mask, faces = part.byte(), {}
                    for face in range(6):
                        if mask & (1 << face):
                            faces[face] = [part.var() for _ in range(4)] + [part.byte()]
                    cube['faces'] = faces
                elif effect == 7:
                    cube['item'] = True
                elif effect == 10:
                    cube['extrude'] = True
        elif kind != 1:
            raise ValueError(f'Unsupported CPM part: {kind}')
    if texture is None or texture[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Missing PNG atlas')
    directory.mkdir(parents=True, exist_ok=True)
    asset = dict(name=name, author=author, sourceSha256=hashlib.sha256(raw).hexdigest(), textureSize=texture_size, roots=roots, cubes=cubes, animations=clips)
    (directory / 'character.json').write_text(json.dumps(asset, separators=(',', ':')) + '\n')
    (directory / 'atlas.png').write_bytes(texture)
    print(json.dumps(dict(name=name, author=author, cubes=len(cubes), textureSize=texture_size, effects=effects, animations=[dict(name=a['name'], frames=a.get('frames'), components=a.get('components'), default=a.get('default')) for a in clips]), indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('public/models/friends/big-walk'))
    args = parser.parse_args()
    convert(args.source, args.output)
