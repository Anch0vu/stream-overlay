# VOID Sound MVP Monorepo

Production-ready MVP architecture for the VOID music streaming platform.

## Stack

- TypeScript end-to-end
- Next.js App Router with Route Handlers as BFF
- shadcn/ui inspired component system with dark theme
- Howler.js playback through `/media/:token`
- Better Auth for authentication
- PostgreSQL + Drizzle ORM
- Redis cache/session/media-token storage
- Nginx edge + core reverse proxy topology
- Docker Compose for local development

## Monorepo layout

```text
apps/
  web/      # Next.js BFF + UI
  worker/   # background sync/cache invalidation worker
packages/
  db/       # Drizzle schema + database client
  types/    # normalized shared API contracts
  ui/       # shared UI primitives
infra/
  nginx/    # RU edge and NL core Nginx configs
  docker/   # container recipes
```

## Architecture

```text
Client (RU)
  -> ru.voidsound.pro (Nginx edge)
  -> voidsound.pro (NL core Nginx)
  -> Next.js BFF Route Handlers
  -> External APIs (Spotify metadata/search/playlists, SoundCloud metadata, internal audio storage)
```

Critical rule: the client never calls external APIs directly. All upstream traffic is handled by the BFF.

## Local development

```bash
cp .env.example .env
docker compose up --build
```

Services:

- `web`: Next.js app on `http://localhost:3000`
- `worker`: background worker
- `postgres`: PostgreSQL on `localhost:5432`
- `redis`: Redis on `localhost:6379`
- `nginx-edge`: simulates `ru.voidsound.pro` on `localhost:8080`
- `nginx-core`: simulates `voidsound.pro` on `localhost:8081`

## Key routes

- `GET /api/search?q=`
- `GET /api/tracks/:id`
- `GET /api/playlists/:id`
- `GET /api/me/likes`
- `POST /api/auth/spotify/connect`
- `GET /media/:token`

## Notes

- Spotify is used strictly for metadata, search, artwork, and playlists.
- Audio playback is always proxied through `/media/:token`.
- Route Handlers return normalized payloads from `@void/types`.
