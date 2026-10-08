"""Import the user-approved Friends SFX. Run with --ffmpeg /path/to/ffmpeg.

Sources are public preview URLs observed on their individual Pixabay pages.
Originals stay in the temporary cache; only bounded, processed Oggs ship.
"""
import argparse, array, concurrent.futures, hashlib, json, math, pathlib, subprocess, tempfile, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
# name, page slug, observed CDN path, maximum shipped duration
SOURCES = [
    ('cave_drips', 'nature-droplets-in-a-cave-482871', '2026/02/10/audio_a02ffddc37', 7),
    ('cave_air', 'film-special-effects-cave-wind-10-76283', '2022/03/15/audio_81fa30ae60', 14),
    ('waterfall', 'nature-waterfall-01-loop-74884', '2022/03/15/audio_13cd4bfe9d', 15),
    ('lava', 'nature-lava-loop-3-28887', '2022/03/09/audio_ba53ca7f79', 16),
    ('steam', 'technology-air-or-steam-pressure-release-29600', '2022/03/10/audio_d6e42fe1b4', 2),
    ('volcano', 'nature-volcano-71156', '2022/03/15/audio_955042a86d', 18),
    ('chest_latch', 'film-special-effects-wooden-trunk-latch-1-183944', '2024/01/02/audio_d78bbc68af', 1),
    ('chest_lid', 'household-chest-opening-87569', '2022/03/15/audio_a66ad77cf9', 1.5),
    ('chest_coins', 'film-special-effects-coins-spill-62512', '2022/03/14/audio_40e1a92480', 2),
    ('chest_reward', 'film-special-effects-short-success-sound-glockenspiel-treasure-video-game-6346', '2021/08/04/audio_bb630cc098', 3),
    ('rope_hook', 'film-special-effects-metal-clanking-light-96330', '2022/03/19/audio_0d1a632ac2', .65),
    ('rope_creak', 'film-special-effects-rope-under-tension-7144', '2021/08/09/audio_544db85256', 1.5),
    ('reel_motor', 'film-special-effects-electric-motor-whir-77588', '2022/03/15/audio_2d709dcdbd', 8),
    ('reel_ratchet', 'film-special-effects-ratchet-mechanism-594621', '2026/08/30/audio_e2aae3154f', .7),
    ('step_water', 'film-special-effects-footsteps-water-01-73731', '2022/03/15/audio_d08a11836f', .5),
    ('step_mud', 'household-footsteps-mud-68694', '2022/03/14/audio_7fca9646d2', .55),
    ('flashlight', 'film-special-effects-flashlight-click-46073', '2022/03/10/audio_92d4dca247', .6),
    ('night_vision', 'film-special-effects-night-vision-100467', '2022/03/24/audio_409b3d2af4', 2),
    ('mining_break', 'film-special-effects-rock-falling-010-104938', '2022/03/24/audio_9f1af95e3c', 1.5),
    ('cargo_stone', 'film-special-effects-rocks-6129', '2021/08/04/audio_bc8f0bbb5d', 1),
    ('cargo_wood', 'film-special-effects-chest-slam-85122', '2022/03/15/audio_15a003bada', .7),
]
LOOPS = {'cave_air', 'waterfall', 'lava', 'volcano', 'reel_motor'}
# Five reviewed attacks, each bounded before the next drop. Keep the ring-out.
DROP_EXCERPTS = [(0.55, 1.25), (1.75, 2.45), (3.10, 3.85), (4.50, 5.25), (5.94, 6.69)]

def sha(data): return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--ffmpeg', required=True); args = parser.parse_args()
    output = ROOT / 'public/audio/friends'; cache = pathlib.Path(tempfile.gettempdir()) / 'friends-pixabay-approved'; cache.mkdir(exist_ok=True)
    manifest_path = output / 'sources.json'; manifest = json.loads(manifest_path.read_text())
    assets = []
    def acquire(source):
        name, slug, cdn, maximum = source; url = f'https://cdn.pixabay.com/audio/{cdn}.mp3'; original = cache / f'{name}.mp3'
        if not original.exists():
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=30) as response: original.write_bytes(response.read())
        raw = subprocess.check_output([args.ffmpeg, '-v', 'error', '-i', str(original), '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'])
        samples = array.array('f'); samples.frombytes(raw)
        if not samples or max(map(abs, samples)) < .001: raise RuntimeError(f'Empty/silent source: {name}')
        duration = len(samples) / 16000
        # Find well-separated transient peaks for individual footsteps/creaks.
        hop = 160
        energy = [sum(v*v for v in samples[i:i+hop]) / hop for i in range(0, len(samples), hop)]
        peaks = []
        count = 5 if name == 'cave_drips' else 4 if name.startswith('step_') else 3 if name == 'rope_creak' else 1
        for index in sorted(range(len(energy)), key=lambda i: energy[i], reverse=True):
            time = index / 100
            if all(abs(time - old) > (.9 if name == 'cave_drips' else max(.8, maximum)) for old in peaks): peaks.append(time)
            if len(peaks) == count: break
        if len(peaks) < count: raise RuntimeError(f'Not enough distinct excerpts: {name}')
        for number, peak in enumerate(sorted(peaks)):
            loop = name in LOOPS
            start = 0 if loop or name in {'chest_lid', 'chest_reward', 'night_vision'} else max(0, peak - (.08 if name.startswith('step_') else .15))
            start = {'chest_lid': .45, 'reel_motor': .8}.get(name, start)
            length = min(maximum if name != 'cave_drips' else 2.4, duration-start)
            filename = f'{name}_{number:03}.ogg' if count > 1 else f'{name}.ogg'
            if name == 'cave_drips':
                start, end = DROP_EXCERPTS[number]; length = end - start
            level = -22 if name == 'reel_motor' else -24 if name == 'volcano' else -28 if loop else -21
            highpass = 35 if name in {'volcano', 'lava'} else 70
            filters = f'highpass=f={highpass},lowpass=f=8500,afade=t=in:d=0.006,afade=t=out:st={max(0,length-.05)}:d=0.05'
            # Linear normalization preserves the attack/echo relationship. Short
            # sparse effects must not use gated/dynamic loudness normalization.
            prepared = subprocess.check_output([args.ffmpeg, '-v', 'error', '-ss', str(start), '-i', str(original), '-t', str(length), '-ac', '1', '-ar', '96000', '-af', filters, '-f', 'f32le', '-'])
            data = array.array('f'); data.frombytes(prepared)
            peak = max(map(abs, data)); rms = math.sqrt(sum(v*v for v in data)/len(data))
            ceiling = .35 if name == 'cave_drips' else math.pow(10, -5/20)
            scale = ceiling / peak if name == 'cave_drips' else min(math.pow(10, level/20)/rms, ceiling/peak)
            subprocess.run([args.ffmpeg, '-v', 'error', '-y', '-f', 'f32le', '-ac', '1', '-ar', '96000', '-i', '-', '-af', f'volume={scale}', '-ar', '32000', '-c:a', 'libvorbis', '-q:a', '4', str(output / filename)], input=prepared, check=True)
            normalization = 'Single isolated drop; linear oversampled peak normalization to -9 dBFS' if name == 'cave_drips' else f'Linear RMS target {level} dBFS, bounded by -5 dBFS oversampled peaks'
            assets.append({'file':filename, 'pack':'approvedPixabay', 'sourcePage':f'https://pixabay.com/sound-effects/{slug}/', 'download':url,
                           'license':'Pixabay Content License', 'licenseUrl':'https://pixabay.com/service/license-summary/',
                           'sourceSha256':sha(original.read_bytes()), 'sha256':sha((output/filename).read_bytes()),
                           'processing':f'Mono 32 kHz Vorbis q4; excerpt {start:.3f}–{start+length:.3f}s; highpass {highpass} Hz / lowpass 8500 Hz; {normalization}; 6 ms opening / 50 ms closing fades.'})
        print(name, f'{duration:.2f}s original, {count} processed excerpt(s)', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: list(pool.map(acquire, SOURCES))
    files = {a['file'] for a in assets}; manifest['assets'] = [a for a in manifest['assets'] if a['file'] not in files] + sorted(assets, key=lambda a:a['file'])
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__': main()
