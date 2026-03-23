import { betterAuth } from "better-auth";
import { env } from "../env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET
    ? {
        spotify: {
          clientId: env.SPOTIFY_CLIENT_ID,
          clientSecret: env.SPOTIFY_CLIENT_SECRET,
          redirectURI: env.SPOTIFY_REDIRECT_URI,
          scope: ["user-read-email", "playlist-read-private", "user-library-read"],
        },
      }
    : undefined,
});
