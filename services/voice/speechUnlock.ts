/** Stub para native — unlock só existe na web. */
export function unlockSpeech(): void {}
export function isSpeechPrimed(): boolean {
  return true;
}
export function startSpeechKeepAlive(): () => void {
  return () => {};
}
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return Promise.resolve([]);
}
export function reloadVoices(): Promise<SpeechSynthesisVoice[]> {
  return Promise.resolve([]);
}
