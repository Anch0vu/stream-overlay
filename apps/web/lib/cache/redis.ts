import Redis from "ioredis";
import { env } from "../env";

declare global {
  var __voidRedis: Redis | undefined;
}

export const redis = global.__voidRedis ?? new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });

if (!global.__voidRedis) {
  global.__voidRedis = redis;
}
