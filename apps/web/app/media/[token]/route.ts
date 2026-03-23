import { readMediaToken } from "@/lib/media/token";

const demoMap = new Map<string, string>([
  ["demo-midnight-signal", "https://storage.voidsound.pro/audio/midnight-signal.mp3"],
  ["demo-fracture-bloom", "https://storage.voidsound.pro/audio/fracture-bloom.mp3"],
]);

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const payload = demoMap.has(token)
    ? { upstreamUrl: demoMap.get(token)!, contentType: "audio/mpeg" }
    : await readMediaToken(token).catch(() => null);

  if (!payload) {
    return new Response("Not found", { status: 404 });
  }

  const upstream = await fetch(payload.upstreamUrl, {
    headers: { "User-Agent": "VOID-Media-Proxy/1.0" },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream unavailable", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": payload.contentType,
      "Cache-Control": "private, max-age=60",
      "X-VOID-Upstream": "hidden",
    },
  });
}
