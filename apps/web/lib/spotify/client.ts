import type { Playlist, Track } from "@void/types";
import { env } from "../env";
import { normalizePlaylist, normalizeTrack } from "../bff/normalize";

const SPOTIFY_API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getSpotifyToken() {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    return null;
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const credentials = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Spotify token");
  }

  const payload = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return payload.access_token;
}

async function spotifyFetch(path: string) {
  const token = await getSpotifyToken();
  if (!token) {
    return null;
  }

  const response = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Spotify request failed: ${path}`);
  }

  return response.json();
}

export async function searchSpotify(query: string): Promise<{ tracks: Track[]; playlists: Playlist[] }> {
  const payload = await spotifyFetch(`/search?type=track,playlist&q=${encodeURIComponent(query)}&limit=8`);
  if (!payload) {
    return { tracks: [], playlists: [] };
  }

  const tracks = (payload.tracks?.items ?? []).map((item: any) =>
    normalizeTrack({
      id: item.id,
      source: "spotify",
      title: item.name,
      artist: item.artists?.map((artist: any) => artist.name).join(", ") ?? "Unknown artist",
      durationMs: item.duration_ms ?? null,
      coverUrl: item.album?.images?.[0]?.url ?? null,
      playable: false,
      streamUrl: null,
    }),
  );

  const playlists = (payload.playlists?.items ?? []).map((item: any) =>
    normalizePlaylist({
      id: item.id,
      source: "spotify",
      title: item.name,
      description: item.description || null,
      coverUrl: item.images?.[0]?.url ?? null,
      tracks: [],
    }),
  );

  return { tracks, playlists };
}

export async function getSpotifyTrack(id: string): Promise<Track | null> {
  const payload = await spotifyFetch(`/tracks/${id}`);
  if (!payload) {
    return null;
  }

  return normalizeTrack({
    id: payload.id,
    source: "spotify",
    title: payload.name,
    artist: payload.artists?.map((artist: any) => artist.name).join(", ") ?? "Unknown artist",
    durationMs: payload.duration_ms ?? null,
    coverUrl: payload.album?.images?.[0]?.url ?? null,
    playable: false,
    streamUrl: null,
  });
}

export async function getSpotifyPlaylist(id: string): Promise<Playlist | null> {
  const payload = await spotifyFetch(`/playlists/${id}`);
  if (!payload) {
    return null;
  }

  return normalizePlaylist({
    id: payload.id,
    source: "spotify",
    title: payload.name,
    description: payload.description || null,
    coverUrl: payload.images?.[0]?.url ?? null,
    tracks: (payload.tracks?.items ?? []).map((row: any) =>
      normalizeTrack({
        id: row.track.id,
        source: "spotify",
        title: row.track.name,
        artist: row.track.artists?.map((artist: any) => artist.name).join(", ") ?? "Unknown artist",
        durationMs: row.track.duration_ms ?? null,
        coverUrl: row.track.album?.images?.[0]?.url ?? null,
        playable: false,
        streamUrl: null,
      }),
    ),
  });
}
