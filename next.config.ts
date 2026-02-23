import type { NextConfig } from "next";
const cloudinaryCloudName =
  process.env.CLOUDINARY_CLOUD_NAME ??
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ??
  (() => {
    const cloudinaryUrl = process.env.CLOUDINARY_URL;
    if (!cloudinaryUrl) return undefined;
    try {
      return new URL(cloudinaryUrl).host;
    } catch {
      return undefined;
    }
  })();
const imgixDomain = process.env.IMGIX_DOMAIN ?? process.env.NEXT_PUBLIC_IMGIX_DOMAIN;
let imageLoaderConfig: { loader: "cloudinary" | "imgix" | "default"; path?: string } = {
  loader: "default",
};

if (cloudinaryCloudName) {
  imageLoaderConfig = {
    loader: "cloudinary",
    path: `https://res.cloudinary.com/${cloudinaryCloudName}/image/upload/`,
  };
} else if (imgixDomain) {
  imageLoaderConfig = {
    loader: "imgix",
    path: `https://${imgixDomain}`,
  };
}

const nextConfig: NextConfig = {
  images: {
    ...imageLoaderConfig,
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
      ...(cloudinaryCloudName
        ? [
            {
              protocol: "https" as const,
              hostname: "res.cloudinary.com",
              pathname: `/${cloudinaryCloudName}/**`,
            },
          ]
        : []),
      ...(imgixDomain
        ? [
            {
              protocol: "https" as const,
              hostname: imgixDomain,
            },
          ]
        : []),
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
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
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
