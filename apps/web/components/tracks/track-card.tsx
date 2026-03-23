"use client";

import Image from "next/image";
import { useOptimistic, useState } from "react";
import type { Track } from "@void/types";
import { Button } from "@void/ui/components/button";
import { Card, CardContent } from "@void/ui/components/card";
import { Heart, Play } from "lucide-react";
import { usePlayer } from "../providers/player-provider";

export function TrackCard({ track }: { track: Track }) {
  const { playTrack } = usePlayer();
  const [liked, setLiked] = useState(false);
  const [optimisticLiked, toggleOptimistic] = useOptimistic<boolean, void>(liked, (state) => !state);

  return (
    <Card className="overflow-hidden bg-zinc-900/80">
      <CardContent className="p-4">
        <div className="mb-4 aspect-square overflow-hidden rounded-lg bg-zinc-800">
          {track.coverUrl ? (
            <Image src={track.coverUrl} alt={track.title} width={320} height={320} className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="space-y-1">
          <h3 className="truncate font-medium text-white">{track.title}</h3>
          <p className="truncate text-sm text-zinc-400">{track.artist}</p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="secondary" size="sm" disabled={!track.playable} onClick={() => playTrack(track)}>
            <Play className="mr-2 h-4 w-4" />
            Play
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              toggleOptimistic();
              setLiked((current) => !current);
            }}
          >
            <Heart className={`h-4 w-4 ${optimisticLiked ? "fill-purple-400 text-purple-400" : "text-zinc-400"}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
