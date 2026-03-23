import type { Track } from "@void/types";
import { normalizeTrack } from "../bff/normalize";
import { env } from "../env";
import { issueMediaToken } from "../media/token";

const SOUNDCLOUD_API = "https://api-v2.soundcloud.com";

export async function getSoundcloudTrack(id: string): Promise<Track | null> {
  if (!env.SOUNDCLOUD_CLIENT_ID) {
    return null;
  }

  const response = await fetch(`${SOUNDCLOUD_API}/tracks/${id}?client_id=${env.SOUNDCLOUD_CLIENT_ID}`, {
    next: { revalidate: 120 },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const mediaToken = payload.media?.transcodings?.[0]?.url
    ? await issueMediaToken({
        upstreamUrl: `${payload.media.transcodings[0].url}?client_id=${env.SOUNDCLOUD_CLIENT_ID}`,
        contentType: "audio/mpeg",
      })
    : null;

  return normalizeTrack({
    id: String(payload.id),
    source: "soundcloud",
    title: payload.title,
    artist: payload.user?.username ?? "Unknown artist",
    durationMs: payload.duration ?? null,
    coverUrl: payload.artwork_url ?? null,
    playable: Boolean(mediaToken),
    streamUrl: mediaToken ? `/media/${mediaToken}` : null,
  });
}
