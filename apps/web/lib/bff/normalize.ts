import type { Playlist, Track } from "@void/types";

export function normalizeTrack(input: Partial<Track> & Pick<Track, "id" | "source" | "title" | "artist">): Track {
  return {
    id: input.id,
    source: input.source,
    title: input.title,
    artist: input.artist,
    durationMs: input.durationMs ?? null,
    coverUrl: input.coverUrl ?? null,
    playable: input.playable ?? false,
    streamUrl: input.streamUrl ?? null,
  };
}

export function normalizePlaylist(input: Partial<Playlist> & Pick<Playlist, "id" | "source" | "title" | "tracks">): Playlist {
  return {
    id: input.id,
    source: input.source,
    title: input.title,
    description: input.description ?? null,
    coverUrl: input.coverUrl ?? null,
    tracks: input.tracks.map(normalizeTrack),
  };
}
