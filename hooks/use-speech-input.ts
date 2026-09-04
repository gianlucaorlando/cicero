'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

type RecognitionResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => Recognition;

function getRecognition(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

const noopSubscribe = () => () => undefined;

/** Browser speech-to-text (Web Speech API). `supported` is false where the API is missing and during SSR. */
export function useSpeechInput(onResult: (transcript: string) => void, lang = 'it-IT') {
  const supported = useSyncExternalStore(noopSubscribe, () => getRecognition() !== null, () => false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = getRecognition();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index][0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [lang, listening, onResult]);

  return { supported, listening, toggle };
}
