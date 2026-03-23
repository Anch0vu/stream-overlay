import { resolvePlaylist } from "@/lib/bff/catalog";
import { fail, ok } from "@/lib/bff/response";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playlist = await resolvePlaylist(id);

  if (!playlist) {
    return fail("PLAYLIST_NOT_FOUND", "Playlist not found.", 404);
  }

  return ok(playlist);
}
