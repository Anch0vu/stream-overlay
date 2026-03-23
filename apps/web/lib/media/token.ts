import { SignJWT, jwtVerify } from "jose";
import { redis } from "../cache/redis";
import { env } from "../env";

const encoder = new TextEncoder();
const secret = encoder.encode(env.MEDIA_PROXY_SECRET);

type MediaPayload = {
  upstreamUrl: string;
  contentType: string;
};

export async function issueMediaToken(payload: MediaPayload) {
  const token = await new SignJWT({ scope: "media" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);

  await redis.connect().catch(() => undefined);
  await redis.set(`media:${token}`, JSON.stringify(payload), "EX", 600);
  return token;
}

export async function readMediaToken(token: string): Promise<MediaPayload | null> {
  await jwtVerify(token, secret);
  await redis.connect().catch(() => undefined);
  const raw = await redis.get(`media:${token}`);
  return raw ? (JSON.parse(raw) as MediaPayload) : null;
}
