"use client";

import { Pause, Play } from "lucide-react";
import { Button } from "@void/ui/components/button";
import { usePlayer } from "../providers/player-provider";

export function PlayerBar() {
  const { currentTrack, isPlaying, toggle } = usePlayer();

  return (
    <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-zinc-800 bg-zinc-950/95 px-6 py-4 backdrop-blur">
      <div>
        <p className="text-sm font-medium text-white">{currentTrack?.title ?? "Nothing playing"}</p>
        <p className="text-xs text-zinc-400">{currentTrack?.artist ?? "Start a stream through the VOID proxy"}</p>
      </div>
      <Button variant="secondary" size="icon" onClick={toggle} disabled={!currentTrack}>
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
    </div>
  );
}
