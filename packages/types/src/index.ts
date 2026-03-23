export type TrackSource = "spotify" | "soundcloud" | "void";

export type Track = {
  id: string;
  source: TrackSource;
  title: string;
  artist: string;
  durationMs: number | null;
  coverUrl: string | null;
  playable: boolean;
  streamUrl: string | null;
};

export type Playlist = {
  id: string;
  source: TrackSource;
  title: string;
  description: string | null;
  coverUrl: string | null;
  tracks: Track[];
};

export type SearchResponse = {
  query: string;
  tracks: Track[];
  playlists: Playlist[];
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: Record<string, string | number | boolean | null>;
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
