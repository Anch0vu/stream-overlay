export const dynamic = "force-dynamic";

import { TrackGrid } from "@/components/tracks/track-grid";
import { getLikedTracks } from "@/lib/bff/catalog";

export default async function LibraryPage() {
  const tracks = await getLikedTracks("demo-user").catch(() => []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold text-white">Your liked tracks</h1>
        <p className="text-zinc-400">Optimistic likes are ready for Better Auth sessions and persisted likes.</p>
      </div>
      <TrackGrid tracks={tracks} />
    </div>
  );
}
