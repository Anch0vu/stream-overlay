import { db, likedTracks } from "@void/db";
import { desc, eq } from "drizzle-orm";
import type { Playlist, SearchResponse, Track } from "@void/types";
import { redis } from "../cache/redis";
import { getSoundcloudTrack } from "../soundcloud/client";
import { getSpotifyPlaylist, getSpotifyTrack, searchSpotify } from "../spotify/client";
import { normalizeTrack } from "./normalize";

const DEMO_VOID_TRACKS: Track[] = [
  normalizeTrack({
    id: "void-midnight-city",
    source: "void",
    title: "Midnight Signal",
    artist: "VOID Originals",
    durationMs: 215000,
    coverUrl: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=640&q=80",
    playable: true,
    streamUrl: "/media/demo-midnight-signal",
  }),
  normalizeTrack({
    id: "void-fracture",
    source: "void",
    title: "Fracture Bloom",
    artist: "VOID Originals",
    durationMs: 189000,
    coverUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=640&q=80",
    playable: true,
    streamUrl: "/media/demo-fracture-bloom",
  }),
];

export async function searchCatalog(query: string): Promise<SearchResponse> {
  const cacheKey = `search:${query.toLowerCase()}`;
  await redis.connect().catch(() => undefined);
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as SearchResponse;
  }

  const spotify = await searchSpotify(query);
  const response: SearchResponse = {
    query,
    tracks: [...DEMO_VOID_TRACKS, ...spotify.tracks],
    playlists: spotify.playlists,
  };

  await redis.set(cacheKey, JSON.stringify(response), "EX", 120);
  return response;
}

export async function resolveTrack(id: string): Promise<Track | null> {
  if (id.startsWith("void-")) {
    return DEMO_VOID_TRACKS.find((track) => track.id === id) ?? null;
  }

  if (id.startsWith("sc_")) {
    return getSoundcloudTrack(id.replace("sc_", ""));
  }

  return getSpotifyTrack(id);
}

export async function resolvePlaylist(id: string): Promise<Playlist | null> {
  return getSpotifyPlaylist(id);
}

export async function getLikedTracks(userId: string) {
  const rows = await db.select().from(likedTracks).where(eq(likedTracks.userId, userId)).orderBy(desc(likedTracks.createdAt)).limit(50);
  return rows.map((row) =>
    normalizeTrack({
      id: row.trackId,
      source: row.source,
      title: row.title,
      artist: row.artist,
      durationMs: row.durationMs,
      coverUrl: row.coverUrl,
      playable: row.playable,
      streamUrl: row.streamUrl,
    }),
  );
}
