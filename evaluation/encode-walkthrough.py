"""Encode actual 4K browser views with separately generated narration. No uploads."""
import json,subprocess,sys,wave
from pathlib import Path
root=Path(sys.argv[1]);scenes=json.loads((root/'scenes.json').read_text())
clips=[];start=0;vtt=['WEBVTT','']
def stamp(t):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
for s in scenes:
 dest=root/(s['id']+'-final.mp4');duration=s['duration']
 valid=False
 if dest.exists():
  try:
   probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type','-of','json',str(dest)],stderr=subprocess.DEVNULL))
   valid=abs(float(probe['format']['duration'])-duration)<.2 and len(probe['streams'])==2
  except (subprocess.CalledProcessError,KeyError,ValueError):pass
 if not valid: subprocess.run(['ffmpeg','-y','-loglevel','error','-xerror','-framerate','24','-i',str(root/(s['id']+'.png')),'-i',str(root/(s['id']+'.wav')),'-t',str(duration),'-vf',f"loop=loop=-1:size=1:start=0,fade=t=in:st=0:d=0.25,fade=t=out:st={duration-.25}:d=0.25,format=yuv420p",'-c:v','libx264','-threads','4','-preset','ultrafast','-crf','20','-c:a','aac','-b:a','128k','-movflags','+faststart',str(dest)],check=True)
 clips.append("file '"+str(dest)+"'")
 vtt.extend([f'{stamp(start)} --> {stamp(start+duration)}',s['say'],'']);start+=duration
 print(s['id'],'encoded',flush=True)
(root/'concat.txt').write_text('\n'.join(clips))
(root/'walkthrough.vtt').write_text('\n'.join(vtt))
# Join PCM before AAC encoding: segment encoder-delay packets must not overlap.
with wave.open(str(root/'narration.wav'),'wb') as joined:
 for index,scene in enumerate(scenes):
  with wave.open(str(root/(scene['id']+'.wav')),'rb') as audio:
   if index==0: joined.setparams(audio.getparams()); audio_format=(audio.getnchannels(),audio.getsampwidth(),audio.getframerate())
   assert (audio.getnchannels(),audio.getsampwidth(),audio.getframerate())==audio_format
   joined.writeframes(audio.readframes(audio.getnframes()))
subprocess.run(['ffmpeg','-y','-loglevel','error','-xerror','-f','concat','-safe','0','-i',str(root/'concat.txt'),'-i',str(root/'narration.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',str(root.parent/'NOSHASHI-settlement-evaluation-4K.mp4')],check=True)
subprocess.run(['ffmpeg','-y','-loglevel','error','-xerror','-i',str(root.parent/'NOSHASHI-settlement-evaluation-4K.mp4'),'-vf','scale=1920:1080','-c:v','libx264','-threads','2','-preset','veryfast','-crf','23','-c:a','copy','-movflags','+faststart',str(root.parent/'NOSHASHI-settlement-evaluation-preview.mp4')],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',str(root.parent/'NOSHASHI-settlement-evaluation-4K.mp4')]))
assert abs(float(probe['format']['duration'])-start)<1
assert any(x.get('width')==3840 and x.get('height')==2160 for x in probe['streams'])
assert any(x.get('codec_type')=='audio' for x in probe['streams'])
(root/'validation.json').write_text(json.dumps(probe,indent=2))
print('Verified',round(start,2),'seconds, 4K video and audio',flush=True)
