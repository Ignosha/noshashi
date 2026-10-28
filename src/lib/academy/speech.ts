/**
 * Read-aloud, using the voice built into the computer.
 *
 * The browser's speech synthesis runs on the device with the operating
 * system's own voices: free, offline, and nothing is sent anywhere. macOS
 * and Windows webviews provide it. Some Linux webviews do not, so callers
 * check canSpeak() and say so rather than showing a button that does nothing.
 */

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Say `text`, replacing anything being said. Calls onEnd when finished or stopped. */
export function speak(text: string, rate = 1, onEnd?: () => void): void {
  if (!canSpeak()) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(spoken(text));
  u.rate = Math.min(1.4, Math.max(0.6, rate));
  u.lang = "en-US";
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/**
 * Text as it should sound. Long addresses and hashes are read as their
 * first few characters rather than spelled out for half a minute.
 */
export function spoken(text: string): string {
  return text
    .replace(/\b(r[1-9A-HJ-NP-Za-km-z]{24,34})\b/g, (a) => `the address starting ${a.slice(0, 5).split("").join(" ")}`)
    .replace(/\b[0-9A-F]{64}\b/g, (h) => `the hash starting ${h.slice(0, 4).split("").join(" ")}`)
    .replace(/→/g, " gives ")
    .replace(/×/g, " times ")
    .replace(/\bXRPL\b/g, "X R P L")
    .replace(/\bNO-GO\b/g, "no go");
}
