import Redis from "ioredis";
import { z } from "zod";

const env = z.object({
  REDIS_URL: z.string().min(1),
}).parse({
  REDIS_URL: process.env.REDIS_URL,
});

const redis = new Redis(env.REDIS_URL);

async function warmSearchIndex() {
  const now = new Date().toISOString();
  await redis.set("worker:last-run", now);
  console.log(`[worker] search cache heartbeat @ ${now}`);
}

async function main() {
  await warmSearchIndex();
  setInterval(warmSearchIndex, 60_000);
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
