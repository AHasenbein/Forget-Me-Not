/**
 * Browser speech-to-text for the proof of concept (Chrome/Edge/Safari expose it; Firefox and native do not, so the UI
 * offers a typed fallback). With the phone on speaker one microphone hears both people. A real build would use native
 * speech recognition in a dev build instead.
 */
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | undefined => {
  const g = globalThis as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
};

export const speechSupported = () => ctor() !== undefined;

export type ListenState = 'listening' | 'denied' | 'error' | 'stopped';

/** Keeps listening until `stop()` (the browser ends a session after a pause, so it is restarted). Final phrases only. */
export function startListening(
  onPhrase: (text: string) => void,
  onState: (s: ListenState) => void,
) {
  const Ctor = ctor();
  if (!Ctor) {
    onState('error');
    return { stop: () => undefined };
  }
  let wanted = true;
  let rec: Recognition | undefined;
  const begin = () => {
    rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r?.isFinal && r[0].transcript.trim()) onPhrase(r[0].transcript.trim());
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wanted = false;
        onState('denied');
      }
    };
    rec.onend = () => {
      if (!wanted) return onState('stopped');
      try {
        begin();
      } catch {
        wanted = false;
        onState('error');
      }
    };
    rec.start();
  };
  try {
    begin();
    onState('listening');
  } catch {
    wanted = false;
    onState('error');
  }
  return {
    stop: () => {
      wanted = false;
      try {
        rec?.stop();
      } catch {
        // already stopped
      }
    },
  };
}
