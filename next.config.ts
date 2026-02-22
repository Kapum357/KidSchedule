import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
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

const cspDirectives = [
  "default-src 'self'",
  [
    "script-src",
    "'self'",
    ...(isDevelopment ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
    "https://accounts.google.com",
    "https://apis.google.com",
    "https://appleid.cdn-apple.com",
  ].join(" "),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com",
  "font-src 'self' https://fonts.gstatic.com",
  [
    "connect-src",
    "'self'",
    ...(isDevelopment ? ["ws://localhost:*", "http://localhost:*", "ws://127.0.0.1:*", "http://127.0.0.1:*"] : []),
    "https://accounts.google.com",
    "https://appleid.apple.com",
  ].join(" "),
  "frame-src https://accounts.google.com https://appleid.apple.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
];

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
        // CSP - adjust script-src for OAuth providers
        {
          key: "Content-Security-Policy",
          value: cspDirectives.join("; "),
        },
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
