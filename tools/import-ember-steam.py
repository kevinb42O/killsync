"""Bundle a recorded CC0 steam hiss with reproducible processing and hashes."""
import argparse,array,hashlib,json,math,pathlib,subprocess,tempfile,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
URL='https://cdn.freesound.org/previews/265/265013_4101863-hq.mp3'
PAGE='https://freesound.org/people/sethlind/sounds/265013/'
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);args=p.parse_args()
 original=pathlib.Path(tempfile.gettempdir())/'ember-volcano-audio/steam-radiator.mp3';original.parent.mkdir(exist_ok=True)
 if not original.exists():original.write_bytes(urllib.request.urlopen(urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read())
 filters='highpass=f=100,lowpass=f=7600'
 raw=subprocess.check_output([args.ffmpeg,'-v','error','-ss','8','-i',str(original),'-t','24','-ac','1','-ar','32000','-af',filters,'-f','f32le','-'])
 samples=array.array('f');samples.frombytes(raw);rms=math.sqrt(sum(n*n for n in samples)/len(samples));peak=max(map(abs,samples))
 gain=min(10**(-28/20)/rms,.35/peak)
 filename='ocean_steam_loop.ogg';target=ROOT/'public/audio/friends'/filename
 subprocess.run([args.ffmpeg,'-v','error','-y','-f','f32le','-ac','1','-ar','32000','-i','-','-af',f'volume={gain:.9f}','-c:a','libvorbis','-q:a','4',str(target)],input=raw,check=True)
 entry={'file':filename,'pack':'emberOceanSteam','author':'sethlind','title':'NYC steam radiator hiss.wav','sourcePage':PAGE,'source':URL,'license':'CC0-1.0','licenseUrl':'https://creativecommons.org/publicdomain/zero/1.0/','downloaded':'2026-10-10','originalSha256':sha(original.read_bytes()),'sha256':sha(target.read_bytes()),'edit':f'8–32 seconds; mono 32 kHz Vorbis q4; {filters}; linear gain {gain:.9f}; native pitch and dynamics. Runtime uses an 800 ms seam crossfade.','durationSeconds':len(samples)/32000,'bytes':target.stat().st_size}
 manifest_path=ROOT/'public/audio/friends/sources.json';manifest=json.loads(manifest_path.read_text());manifest['assets']=[a for a in manifest['assets'] if a.get('pack')!='emberOceanSteam']+[entry];manifest['sources']['emberOceanSteam']=PAGE;manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
 (ROOT/'public/audio/friends/ember-steam-sources.json').write_text(json.dumps(entry,indent=2)+'\n');print(json.dumps(entry,indent=2))
if __name__=='__main__':main()
