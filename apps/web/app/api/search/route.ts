import { searchCatalog } from "@/lib/bff/catalog";
import { fail, ok } from "@/lib/bff/response";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return fail("INVALID_QUERY", "The q query parameter is required.", 400);
  }

  const data = await searchCatalog(q);
  return ok(data);
}
