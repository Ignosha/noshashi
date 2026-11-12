"""Local tutorial narration. Requires kokoro-onnx, numpy and its public model files."""
import json,sys,wave
from pathlib import Path
import numpy as np
import onnxruntime as rt
from kokoro_onnx import Kokoro
root=Path(sys.argv[1]);model_dir=Path(sys.argv[2]);root.mkdir(parents=True,exist_ok=True)
scenes=json.loads((Path(__file__).parent/'walkthrough.json').read_text())
options=rt.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1;options.log_severity_level=3
model=Kokoro.from_session(rt.InferenceSession(str(model_dir/'kokoro-v1.0.int8.onnx'),sess_options=options,providers=['CPUExecutionProvider']),str(model_dir/'voices-v1.0.bin'))
for scene in scenes:
 text=scene['say'].replace('NOSHASHI','Noshashi').replace('XRP','X R P')
 audio,rate=model.create(text,voice='am_michael',speed=.94,lang='en-us')
 duration=max(15,len(audio)/rate+1.2)
 audio=np.pad(audio,(int(rate*.3),max(0,int(rate*(duration-.3))-len(audio))))
 with wave.open(str(root/(scene['id']+'.wav')),'wb') as output:
  output.setnchannels(1);output.setsampwidth(2);output.setframerate(rate);output.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
 scene['duration']=len(audio)/rate
 print(scene['id'],scene['duration'],flush=True)
(root/'scenes.json').write_text(json.dumps(scenes,indent=2))
