import { resolveTrack } from "@/lib/bff/catalog";
import { fail, ok } from "@/lib/bff/response";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const track = await resolveTrack(id);

  if (!track) {
    return fail("TRACK_NOT_FOUND", "Track not found.", 404);
  }

  return ok(track);
}
