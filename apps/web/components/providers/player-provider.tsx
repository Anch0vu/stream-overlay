"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Howl } from "howler";
import type { Track } from "@void/types";

type PlayerContextValue = {
  currentTrack: Track | null;
  isPlaying: boolean;
  playTrack: (track: Track) => void;
  toggle: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const howlRef = useRef<Howl | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      howlRef.current?.unload();
    };
  }, []);

  const value = useMemo<PlayerContextValue>(() => ({
    currentTrack,
    isPlaying,
    playTrack: (track) => {
      if (!track.streamUrl) {
        return;
      }

      howlRef.current?.unload();
      howlRef.current = new Howl({
        src: [track.streamUrl],
        html5: true,
        onplay: () => setIsPlaying(true),
        onpause: () => setIsPlaying(false),
        onstop: () => setIsPlaying(false),
        onend: () => setIsPlaying(false),
      });
      setCurrentTrack(track);
      howlRef.current.play();
    },
    toggle: () => {
      if (!howlRef.current) {
        return;
      }
      if (howlRef.current.playing()) {
        howlRef.current.pause();
      } else {
        howlRef.current.play();
      }
    },
  }), [currentTrack, isPlaying]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer must be used within PlayerProvider");
  }
  return ctx;
}
