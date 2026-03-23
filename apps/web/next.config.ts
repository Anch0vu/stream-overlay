import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@void/db", "@void/types", "@void/ui"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "i1.sndcdn.com" },
      { protocol: "https", hostname: "cf-hls-media.sndcdn.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
