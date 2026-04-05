"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type SoundEffect =
  | "click"
  | "start"
  | "verified"
  | "suspicious"
  | "inconclusive";

type SoundContextValue = {
  enabled: boolean;
  toggle: () => void;
  play: (effect: SoundEffect) => void;
};

type SoundProviderProps = {
  children: ReactNode;
};

type ToneSpec = {
  frequency: number;
  toFrequency?: number;
  duration: number;
  wave?: OscillatorType;
  volume?: number;
};

const SOUND_STORAGE_KEY = "holmes-sfx-enabled";

const SoundContext = createContext<SoundContextValue | undefined>(undefined);

function scheduleTone(
  context: AudioContext,
  startAt: number,
  spec: ToneSpec,
): number {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  const wave = spec.wave ?? "square";
  const volume = spec.volume ?? 0.04;
  const endAt = startAt + spec.duration;

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(spec.frequency, startAt);
  if (typeof spec.toFrequency === "number") {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, spec.toFrequency),
      endAt,
    );
  }

  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(startAt);
  oscillator.stop(endAt);

  return endAt;
}

function playPattern(context: AudioContext, effect: SoundEffect): void {
  const startAt = context.currentTime + 0.005;

  if (effect === "click") {
    scheduleTone(context, startAt, {
      frequency: 980,
      toFrequency: 780,
      duration: 0.04,
      volume: 0.03,
      wave: "square",
    });
    scheduleTone(context, startAt + 0.045, {
      frequency: 620,
      toFrequency: 500,
      duration: 0.04,
      volume: 0.022,
      wave: "square",
    });
    return;
  }

  if (effect === "start") {
    scheduleTone(context, startAt, {
      frequency: 220,
      toFrequency: 160,
      duration: 0.11,
      volume: 0.05,
      wave: "sawtooth",
    });
    scheduleTone(context, startAt + 0.075, {
      frequency: 120,
      toFrequency: 95,
      duration: 0.14,
      volume: 0.04,
      wave: "triangle",
    });
    scheduleTone(context, startAt + 0.085, {
      frequency: 460,
      toFrequency: 320,
      duration: 0.06,
      volume: 0.018,
      wave: "square",
    });
    return;
  }

  if (effect === "verified") {
    scheduleTone(context, startAt, {
      frequency: 392,
      duration: 0.09,
      volume: 0.05,
      wave: "square",
    });
    scheduleTone(context, startAt + 0.1, {
      frequency: 523,
      duration: 0.09,
      volume: 0.05,
      wave: "square",
    });
    scheduleTone(context, startAt + 0.2, {
      frequency: 659,
      duration: 0.15,
      volume: 0.055,
      wave: "square",
    });
    return;
  }

  if (effect === "suspicious") {
    scheduleTone(context, startAt, {
      frequency: 180,
      toFrequency: 120,
      duration: 0.24,
      volume: 0.055,
      wave: "sawtooth",
    });
    scheduleTone(context, startAt + 0.16, {
      frequency: 95,
      toFrequency: 70,
      duration: 0.2,
      volume: 0.06,
      wave: "triangle",
    });
    return;
  }

  scheduleTone(context, startAt, {
    frequency: 330,
    duration: 0.08,
    volume: 0.03,
    wave: "square",
  });
  scheduleTone(context, startAt + 0.09, {
    frequency: 294,
    duration: 0.09,
    volume: 0.03,
    wave: "square",
  });
}

export function SoundProvider({ children }: SoundProviderProps) {
  const [enabled, setEnabled] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setEnabled(window.localStorage.getItem(SOUND_STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "1" : "0");
  }, [enabled]);

  const getContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") {
      return null;
    }

    if (contextRef.current) {
      if (contextRef.current.state === "suspended") {
        void contextRef.current.resume();
      }
      return contextRef.current;
    }

    const AudioConstructor = window.AudioContext;
    if (!AudioConstructor) {
      return null;
    }

    contextRef.current = new AudioConstructor();
    return contextRef.current;
  }, []);

  const play = useCallback(
    (effect: SoundEffect) => {
      if (!enabled) {
        return;
      }

      const context = getContext();
      if (!context) {
        return;
      }

      playPattern(context, effect);
    },
    [enabled, getContext],
  );

  const toggle = useCallback(() => {
    setEnabled((previous) => !previous);
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      toggle,
      play,
    }),
    [enabled, toggle, play],
  );

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}

export function useSound(): SoundContextValue {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error("useSound must be used within SoundProvider.");
  }
  return context;
}
