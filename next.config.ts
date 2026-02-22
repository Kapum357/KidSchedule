import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: async () => [
    {
      source: "/home",
      destination: "/",
      permanent: true, // 308 redirect (preserves method) for permanent redirects
    },
  ],
  /* other config options here */
};

export default nextConfig;
