import { ok } from "@/lib/bff/response";

export async function POST() {
  return ok({
    provider: "spotify",
    status: "pending",
    message: "Spotify account linking should be initiated through Better Auth server-side flows.",
  });
}
