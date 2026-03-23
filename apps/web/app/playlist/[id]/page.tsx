export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { TrackGrid } from "@/components/tracks/track-grid";
import { resolvePlaylist } from "@/lib/bff/catalog";

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playlist = await resolvePlaylist(id);

  if (!playlist) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-purple-300">Playlist</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">{playlist.title}</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">{playlist.description ?? "Normalized through the VOID BFF."}</p>
      </div>
      <TrackGrid tracks={playlist.tracks} />
    </div>
  );
}
