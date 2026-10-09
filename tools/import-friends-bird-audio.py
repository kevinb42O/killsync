"""Bundle real bird recordings and preserve each excerpt's attribution/license.
Run with --ffmpeg /path/to/ffmpeg. Publicly provided recordings; no synthesis.
"""
import argparse, array, hashlib, json, math, pathlib, subprocess, tempfile, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE={
 'robin1':('robin-1.ogg','https://bigsoundbank.com/UPLOAD/ogg/1667.ogg','https://bigsoundbank.com/robin-1-s1667.html','Joseph Sardin','CC0-1.0','https://creativecommons.org/publicdomain/zero/1.0/'),
 'robin4':('robin-4.ogg','https://bigsoundbank.com/UPLOAD/ogg/1670.ogg','https://bigsoundbank.com/rouge-gorge-4-s1670.html','Joseph Sardin','CC0-1.0','https://creativecommons.org/publicdomain/zero/1.0/'),
 'robin7':('robin-7.ogg','https://bigsoundbank.com/UPLOAD/ogg/1673.ogg','https://bigsoundbank.com/rouge-gorge-7-s1673.html','Joseph Sardin','CC0-1.0','https://creativecommons.org/publicdomain/zero/1.0/'),
 'blue':('blue-tit.mp3','https://cdn.freesound.org/previews/830/830034_7455632-hq.mp3','https://freesound.org/people/naturenotesuk/sounds/830034/','David / naturenotesuk','CC-BY-4.0','https://creativecommons.org/licenses/by/4.0/'),
 'sparrow':('sparrow.ogg','https://upload.wikimedia.org/wikipedia/commons/d/dc/Passer_domesticus_-_House_Sparrow_-_XC86749.ogg','https://commons.wikimedia.org/wiki/File:Passer_domesticus_-_House_Sparrow_-_XC86749.ogg','Jonathon Jongsma','CC-BY-SA-3.0','https://creativecommons.org/licenses/by-sa/3.0/'),
}
# Reviewed complete phrases, individual chirps and two close wing flutters.
EXCERPTS=[
 ('bird_robin_000.ogg','robin1',0,2.28,800),
 ('bird_robin_001.ogg','robin4',0,3.11,800),
 ('bird_robin_002.ogg','robin7',0,2.64,800),
 ('bird_blue_tit_000.ogg','blue',2.18,1.03,900),
 ('bird_blue_tit_001.ogg','blue',3.50,.9,900),
 ('bird_sparrow_000.ogg','sparrow',.16,1.4,1000),
 ('bird_sparrow_001.ogg','sparrow',3.32,1.42,1000),
 ('bird_sparrow_002.ogg','sparrow',7.20,1.54,1000),
 ('bird_wings_000.ogg','blue',7.40,.94,180),
 ('bird_wings_001.ogg','blue',10.48,.70,180),
 ('bird_startled_000.ogg','sparrow',.22,.60,1000),
 ('bird_startled_001.ogg','sparrow',4.23,.65,1000),
]
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--ffmpeg',required=True);args=parser.parse_args()
 output=ROOT/'public/audio/friends';cache=pathlib.Path(tempfile.gettempdir())/'friends-bird-sources';cache.mkdir(exist_ok=True)
 assets=[]
 for filename,key,start,duration,highpass in EXCERPTS:
  source_name,url,page,author,license_name,license_url=SOURCE[key];original=cache/source_name
  if not original.exists():
   request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
   original.write_bytes(urllib.request.urlopen(request,timeout=30).read())
  # Preserve native pitch/dynamics; remove distant rumble, taper cuts and encode.
  filters=f'highpass=f={highpass},lowpass=f=11000,afade=t=in:d=0.02,afade=t=out:st={duration-.04}:d=0.04'
  raw=subprocess.check_output([args.ffmpeg,'-v','error','-ss',str(start),'-i',str(original),'-t',str(duration),'-ac','1','-ar','32000','-af',filters,'-f','f32le','-'])
  samples=array.array('f');samples.frombytes(raw)
  peak=max(map(abs,samples),default=0)
  if peak<.001:raise RuntimeError(f'Empty/silent excerpt: {filename}')
  gain=min(8,.65/peak)
  subprocess.run([args.ffmpeg,'-v','error','-y','-f','f32le','-ac','1','-ar','32000','-i','-','-af',f'volume={gain}','-c:a','libvorbis','-q:a','5',str(output/filename)],input=raw,check=True)
  assets.append({'file':filename,'pack':'birdFieldRecordings','author':author,'sourcePage':page,'source':url,'license':license_name,'licenseUrl':license_url,'downloaded':'2026-10-09','originalSha256':sha(original.read_bytes()),'sha256':sha((output/filename).read_bytes()),'edit':f'Excerpt {start:.2f}-{start+duration:.2f}s; mono 32 kHz Vorbis q5; {filters}; linear gain {gain:.6f}. Native pitch, no synthesis or looping. This edited audio retains the source license.'})
  print(filename,round(len(samples)/32000,2),'seconds',(output/filename).stat().st_size,'bytes')
 manifest_path=output/'sources.json';manifest=json.loads(manifest_path.read_text())
 manifest['assets']=[a for a in manifest['assets'] if a.get('pack')!='birdFieldRecordings']+assets
 manifest['sources'].update({key:value[2] for key,value in SOURCE.items()})
 manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
if __name__=='__main__':main()
