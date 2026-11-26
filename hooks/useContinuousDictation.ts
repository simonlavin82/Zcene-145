import { useState, useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const FATAL_SPEECH_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'bad-grammar',
  'language-not-supported',
]);

const RESTART_BACKOFF_MS = 150;
const MAX_CONSECUTIVE_NON_SILENCE_ERRORS = 5;

const getSpeechRecognitionCtor = (): any => {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
};

/**
 * Combines committed text with live interim speech recognition text cleanly,
 * avoiding duplicate spaces and optionally clamping to a max character budget.
 */
export function combineDictationText(
  committed: string,
  interim: string,
  maxLength?: number
): string {
  let cleanInterim = (interim || '').trim();
  let combined = committed || '';
  if (cleanInterim) {
    // Normalize exact brand word "zcene" -> "Zcene" without touching "scene"
    cleanInterim = cleanInterim.replace(/\bzcene\b/gi, 'Zcene');

    // Auto-capitalize first alphabetic char ONLY at start of empty input or after terminal punctuation/newline
    const shouldCapitalizeStart =
      !combined.trim() || /(?:[.!?]|\n)\s*$/.test(combined);
    if (shouldCapitalizeStart) {
      cleanInterim = cleanInterim.replace(
        /^([^A-Za-z]*)([a-z])/,
        (_, prefix: string, ch: string) => `${prefix}${ch.toUpperCase()}`
      );
    }

    if (!combined) {
      combined = cleanInterim;
    } else if (/\s$/.test(combined)) {
      combined = `${combined}${cleanInterim}`;
    } else {
      combined = `${combined} ${cleanInterim}`;
    }
  }
  return typeof maxLength === 'number' ? combined.slice(0, maxLength) : combined;
}

export interface UseContinuousDictationOptions {
  onFinalTranscript: (chunk: string) => void;
  lang?: string;
  onFatalError?: (errorCode: string) => void;
}

export interface StopDictationOptions {
  /** When true (default), any pending interim transcript is flushed via onFinalTranscript. */
  flushInterim?: boolean;
}

export interface UseContinuousDictationReturn {
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  start: () => void;
  /** Stops listening and returns any pending interim transcript text (trimmed). */
  stop: (options?: StopDictationOptions) => string;
  toggle: () => void;
  clearInterim: () => void;
}

/**
 * Shared manual-stop continuous dictation hook across Chrome, Edge, and Safari.
 *
 * Keeps listening across natural pauses and browser silence timeouts (`no-speech` / `onend`)
 * until explicitly stopped via `stop()`, `toggle()`, or unmount, while immediately halting
 * on fatal permission/hardware errors with a rapid-error circuit breaker.
 */
export function useContinuousDictation({
  onFinalTranscript,
  lang,
  onFatalError,
}: UseContinuousDictationOptions): UseContinuousDictationReturn {
  const isSupported = Boolean(getSpeechRecognitionCtor());
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<any>(null);
  const userWantsListeningRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveErrorCountRef = useRef<number>(0);
  const interimTranscriptRef = useRef<string>('');

  const onFinalTranscriptRef = useRef(onFinalTranscript);
  onFinalTranscriptRef.current = onFinalTranscript;
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;
  const langRef = useRef(lang);
  langRef.current = lang;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const detachAndStopInstance = useCallback((instance: any) => {
    if (!instance) return;
    try {
      instance.onresult = null;
      instance.onerror = null;
      instance.onend = null;
    } catch (_) {}
    try {
      instance.stop();
    } catch (_) {}
  }, []);

  const clearInterim = useCallback(() => {
    interimTranscriptRef.current = '';
    setInterimTranscript('');
  }, []);

  const stop = useCallback(
    ({ flushInterim = true }: StopDictationOptions = {}): string => {
      userWantsListeningRef.current = false;
      consecutiveErrorCountRef.current = 0;
      clearRestartTimer();

      const activeInstance = recognitionRef.current;
      recognitionRef.current = null;
      detachAndStopInstance(activeInstance);

      const pending = interimTranscriptRef.current.trim();
      interimTranscriptRef.current = '';

      if (isMountedRef.current) {
        setInterimTranscript('');
        setIsListening(false);
      }

      if (flushInterim && pending) {
        onFinalTranscriptRef.current(pending);
      }

      return pending;
    },
    [clearRestartTimer, detachAndStopInstance]
  );

  const startSession = useCallback(() => {
    if (!isMountedRef.current || !userWantsListeningRef.current) return;
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      userWantsListeningRef.current = false;
      setIsListening(false);
      return;
    }

    clearRestartTimer();

    // Ensure any previous instance is cleanly detached before spawning a fresh session
    if (recognitionRef.current) {
      const prev = recognitionRef.current;
      recognitionRef.current = null;
      detachAndStopInstance(prev);
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang =
        langRef.current ||
        (typeof navigator !== 'undefined' && navigator.language) ||
        'en-US';

      recognitionRef.current = recognition;

      recognition.onresult = (event: any) => {
        if (!isMountedRef.current || !userWantsListeningRef.current) return;
        consecutiveErrorCountRef.current = 0;

        const results = event?.results;
        if (!results || typeof results.length !== 'number') return;

        const startIdx = typeof event?.resultIndex === 'number' ? event.resultIndex : 0;
        const finalChunks: string[] = [];
        const interimChunks: string[] = [];

        for (let i = startIdx; i < results.length; i++) {
          const result = results[i];
          const transcript = String(result?.[0]?.transcript || '');
          if (!transcript) continue;
          // Treat missing `isFinal` as final for backwards compatibility with simple mock events
          if (result?.isFinal !== false) {
            const trimmed = transcript.trim();
            if (trimmed) finalChunks.push(trimmed);
          } else {
            const trimmed = transcript.trim();
            if (trimmed) interimChunks.push(trimmed);
          }
        }

        const nextInterim = interimChunks.join(' ').trim();
        interimTranscriptRef.current = nextInterim;
        setInterimTranscript(nextInterim);

        if (finalChunks.length > 0) {
          onFinalTranscriptRef.current(finalChunks.join(' '));
        }
      };

      recognition.onerror = (event: any) => {
        if (!isMountedRef.current) return;
        const errorCode = String(event?.error || '');

        if (FATAL_SPEECH_ERRORS.has(errorCode)) {
          userWantsListeningRef.current = false;
          consecutiveErrorCountRef.current = 0;
          clearRestartTimer();
          if (recognitionRef.current === recognition) {
            recognitionRef.current = null;
          }
          detachAndStopInstance(recognition);
          interimTranscriptRef.current = '';
          setInterimTranscript('');
          setIsListening(false);
          onFatalErrorRef.current?.(errorCode);
          return;
        }

        // Ignore natural silence timeouts (`no-speech`); circuit-break repeated non-silence errors
        if (errorCode && errorCode !== 'no-speech') {
          consecutiveErrorCountRef.current += 1;
          if (consecutiveErrorCountRef.current >= MAX_CONSECUTIVE_NON_SILENCE_ERRORS) {
            userWantsListeningRef.current = false;
            clearRestartTimer();
            if (recognitionRef.current === recognition) {
              recognitionRef.current = null;
            }
            detachAndStopInstance(recognition);
            interimTranscriptRef.current = '';
            setInterimTranscript('');
            setIsListening(false);
            onFatalErrorRef.current?.(errorCode);
          }
        }
      };

      recognition.onend = () => {
        if (!isMountedRef.current) return;
        if (recognitionRef.current && recognitionRef.current !== recognition) return;
        recognitionRef.current = null;

        // Flush any in-flight interim words before silence auto-restart so nothing gets dropped
        const pending = interimTranscriptRef.current.trim();
        if (pending) {
          interimTranscriptRef.current = '';
          setInterimTranscript('');
          onFinalTranscriptRef.current(pending);
        }

        if (userWantsListeningRef.current) {
          clearRestartTimer();
          restartTimerRef.current = setTimeout(() => {
            restartTimerRef.current = null;
            startSession();
          }, RESTART_BACKOFF_MS);
        } else {
          setIsListening(false);
        }
      };

      setIsListening(true);
      recognition.start();
    } catch (_) {
      userWantsListeningRef.current = false;
      recognitionRef.current = null;
      interimTranscriptRef.current = '';
      if (isMountedRef.current) {
        setInterimTranscript('');
        setIsListening(false);
      }
    }
  }, [clearRestartTimer, detachAndStopInstance]);

  const start = useCallback(() => {
    if (!getSpeechRecognitionCtor()) return;
    if (userWantsListeningRef.current) return;
    userWantsListeningRef.current = true;
    consecutiveErrorCountRef.current = 0;
    startSession();
  }, [startSession]);

  const toggle = useCallback(() => {
    if (userWantsListeningRef.current || isListening) {
      stop({ flushInterim: true });
    } else {
      start();
    }
  }, [isListening, start, stop]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      userWantsListeningRef.current = false;
      clearRestartTimer();
      const activeInstance = recognitionRef.current;
      recognitionRef.current = null;
      detachAndStopInstance(activeInstance);
    };
  }, [clearRestartTimer, detachAndStopInstance]);

  return {
    isSupported,
    isListening,
    interimTranscript,
    start,
    stop,
    toggle,
    clearInterim,
  };
}
