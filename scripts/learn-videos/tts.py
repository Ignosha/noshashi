"""Narration for the Learn videos, spoken by Kokoro (Apache-2.0, runs locally).

Reads a JSON list of {"text", "out"} from argv[1] and writes each line as
raw 16-bit mono PCM at 24 kHz to "out", skipping files that already exist
(the name is a hash of the text and voice, so an edit re-speaks only that
line). Model files come from the kokoro-onnx GitHub release:
  kokoro-v1.0.int8.onnx and voices-v1.0.bin, in the directory in argv[2].
"""
import json
import os
import sys

import numpy as np
from kokoro_onnx import Kokoro

VOICE = "af_heart"
SPEED = 1.0

jobs = [j for j in json.load(open(sys.argv[1])) if not os.path.exists(j["out"])]
if jobs:
    model_dir = sys.argv[2]
    k = Kokoro(os.path.join(model_dir, "kokoro-v1.0.int8.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))
    for n, j in enumerate(jobs, 1):
        samples, rate = k.create(j["text"], voice=VOICE, speed=SPEED, lang="en-us")
        assert rate == 24000, rate
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
        tmp = j["out"] + ".tmp"
        with open(tmp, "wb") as f:
            f.write(pcm)
        os.replace(tmp, j["out"])
        print(f"  spoke {n}/{len(jobs)}", flush=True)
