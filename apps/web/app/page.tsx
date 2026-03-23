export const dynamic = "force-dynamic";

import { TrackGrid } from "@/components/tracks/track-grid";
import { searchCatalog } from "@/lib/bff/catalog";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() || "electronic";
  const results = await searchCatalog(query);

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm uppercase tracking-[0.3em] text-purple-300">BFF powered discovery</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Search without exposing upstream APIs.</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          VOID normalizes Spotify metadata, playlists, and internal audio sources through Next.js Route Handlers.
        </p>
      </section>
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Top results for “{results.query}”</h2>
          <p className="text-sm text-zinc-400">Every playable track points to `/media/:token`, never to an external origin.</p>
        </div>
        <TrackGrid tracks={results.tracks} />
      </section>
    </div>
  );
}
