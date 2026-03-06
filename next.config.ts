import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure pdfkit is only used server-side
  serverComponentsExternalPackages: ["pdfkit", "fontkit", "pdf-lib"],

  images: {
    loader: "default",
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31_536_000,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },

  redirects: async () => [
    {
      source: "/home",
      destination: "/",
      permanent: true, // 308 redirect (preserves method) for permanent redirects
    },
  ],

  headers: async () => [
    {
      // Apply security headers to all routes
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: [
            "camera=()",
            "microphone=()",
            "geolocation=()",
          ]
            .join(", ")
            // ensure deprecated features aren't sneaked in by Next itself
            .split(",")
            .map((s) => s.trim())
            .filter((s) => !s.startsWith("interest-cohort"))
            .join(", "),
        },
        ...(process.env.NODE_ENV === "production"
          ? [
              {
                key: "Strict-Transport-Security",
                value: "max-age=31536000; includeSubDomains; preload",
              },
            ]
          : []),
        // CSP is set dynamically in middleware with a per-request nonce.
      ],
    },
    {
      // Stricter caching for auth pages
      source: "/(login|signup|forgot-password|reset-password)/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
  ],
};

export default nextConfig;
