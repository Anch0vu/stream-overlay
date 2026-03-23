import { getLikedTracks } from "@/lib/bff/catalog";
import { ok } from "@/lib/bff/response";

export async function GET() {
  const tracks = await getLikedTracks("demo-user").catch(() => []);
  return ok(tracks);
}
