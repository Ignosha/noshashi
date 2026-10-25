/*
 * Narration for the homepage demo video, read by Piper (free, offline,
 * open-source text to speech). Two steps, both run by
 * .github/workflows/demo-video.yml:
 *
 *   node scripts/narrate-demo.mjs synth <voice.onnx> <dir>
 *     Reads every caption's spoken text from record-demo.mjs --lines,
 *     writes <dir>/<id>.wav and <dir>/durations.json (ms per line). The
 *     recorder reads durations.json so each caption stays on screen until
 *     its line has been read.
 *
 *   node scripts/narrate-demo.mjs mix <dir> <cues.json> <video.mp4> <out.mp4>
 *     Places each clip at the moment its caption appeared (cues.json from
 *     the recorder) and muxes the result under the video.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode, ...args] = process.argv.slice(2);

/** Length of a PCM WAV in ms, from its header: data bytes over byte rate. */
function wavMs(file) {
  const buf = readFileSync(file);
  const byteRate = buf.readUInt32LE(28);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") return Math.round((size / byteRate) * 1000);
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}

if (mode === "synth") {
  const [voice, dir] = args;
  mkdirSync(dir, { recursive: true });
  const lines = JSON.parse(execFileSync("node", [path.join(here, "record-demo.mjs"), "--lines"], { encoding: "utf8" }));
  const durations = {};
  for (const [id, text] of Object.entries(lines)) {
    const wav = path.join(dir, `${id}.wav`);
    execFileSync("python3", ["-m", "piper", "-m", voice, "-f", wav, "--sentence-silence", "0.15"], { input: text });
    durations[id] = wavMs(wav);
    console.log(id, durations[id], "ms", text);
  }
  writeFileSync(path.join(dir, "durations.json"), JSON.stringify(durations, null, 2));
} else if (mode === "mix") {
  const [dir, cuesFile, video, out] = args;
  const cues = JSON.parse(readFileSync(cuesFile, "utf8"));
  const inputs = ["-i", video];
  const delays = [];
  cues.forEach(({ id, at }, i) => {
    inputs.push("-i", path.join(dir, `${id}.wav`));
    delays.push(`[${i + 1}:a]adelay=${at}:all=1[a${i}]`);
  });
  const mixed = cues.map((_, i) => `[a${i}]`).join("");
  const filter = `${delays.join(";")};${mixed}amix=inputs=${cues.length}:normalize=0,apad[aout]`;
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", ...inputs,
    "-filter_complex", filter, "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-shortest",
    "-movflags", "+faststart", out,
  ], { stdio: "inherit" });
} else {
  console.error("usage: narrate-demo.mjs synth <voice.onnx> <dir> | mix <dir> <cues.json> <video.mp4> <out.mp4>");
  process.exit(2);
}
