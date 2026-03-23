import type { Track } from "@void/types";
import { TrackCard } from "./track-card";

export function TrackGrid({ tracks }: { tracks: Track[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tracks.map((track) => (
        <TrackCard key={`${track.source}:${track.id}`} track={track} />
      ))}
    </div>
  );
}
