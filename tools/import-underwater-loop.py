"""Import only the first minute of the user-approved Pixabay underwater loop."""
import argparse, array, hashlib, json, math, pathlib, subprocess, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = 'https://cdn.pixabay.com/audio/2021/08/09/audio_4ad7ede43a.mp3'
PAGE = 'https://pixabay.com/sound-effects/film-special-effects-underwater-loop-amb-6182/'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', required=True)
    args = parser.parse_args()
    original = pathlib.Path('/tmp') / 'friends-underwater-original.mp3'
    if not original.exists():
        original.write_bytes(urllib.request.urlopen(urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read())
    rate = 32000
    raw = subprocess.check_output([args.ffmpeg, '-v', 'error', '-i', str(original),
        '-t', '60', '-ac', '2', '-ar', str(rate), '-f', 'f32le', '-'])
    samples = array.array('f'); samples.frombytes(raw)
    overlap = rate
    frames = len(samples) // 2
    assert frames == 60 * rate, 'Expected the complete first minute'
    # One-second circular crossfade: 0–60s only, producing a 59s loop.
    output = samples[overlap * 2:]
    for i in range(overlap):
        blend = i / (overlap - 1)
        for channel in range(2):
            output[(frames - 2 * overlap + i) * 2 + channel] = (
                samples[(frames - overlap + i) * 2 + channel] * (1 - blend)
                + samples[i * 2 + channel] * blend)
    rms = math.sqrt(sum(x*x for x in output) / len(output))
    peak = max(map(abs, output))
    gain = min(10**(-23/20) / rms, .5 / peak)
    target = ROOT / 'public/audio/friends/underwater_bubbles_loop.ogg'
    subprocess.run([args.ffmpeg, '-v', 'error', '-y', '-f', 'f32le', '-ac', '2',
        '-ar', str(rate), '-i', '-', '-af', f'volume={gain:.9f}',
        '-c:a', 'libvorbis', '-q:a', '3', str(target)], input=output.tobytes(), check=True)
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    entry = dict(file=target.name, pack='approvedUnderwaterLoop', author='DCSFX (Freesound)',
        title='Underwater [Loop] AMB', sourcePage=PAGE, download=URL,
        license='Pixabay Content License', licenseUrl='https://pixabay.com/service/license-summary/',
        sourceSha256=sha(original), sha256=sha(target), durationSeconds=59,
        bytes=target.stat().st_size,
        processing=f'Only original 0–60s; 1s circular crossfade gives 59s loop; stereo 32kHz Vorbis q3; linear gain {gain:.9f}, RMS target -23dBFS, peak limited to -6dBFS. No synthesis.')
    manifest_path = ROOT / 'public/audio/friends/sources.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['assets'] = [a for a in manifest['assets'] if a.get('pack') != entry['pack']] + [entry]
    manifest['sources']['waterSubmerged'] = PAGE
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(entry, indent=2))

if __name__ == '__main__':
    main()
