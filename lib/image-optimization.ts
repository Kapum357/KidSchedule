/**
 * Image Optimization Utilities
 * 
 * Provides utilities for responsive images, lazy loading, and
 * optimal image formats (WebP with fallbacks).
 * 
 * In production, integrate with:
 * - Next.js Image component for automatic optimization
 * - Cloudinary or Imgix for dynamic transformations
 * - WebP/AVIF generation with fallbacks
 */

export interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  quality?: number;
}

/**
 * Responsive Image Sizes
 * 
 * Standard breakpoints for srcset generation
 */
export const IMAGE_SIZES = {
  thumbnail: 150,
  small: 320,
  medium: 640,
  large: 1024,
  xlarge: 1920,
  hero: 2560,
} as const;

/**
 * Generate srcset for responsive images
 * 
 * @param baseSrc - Base image path (without extension)
 * @param sizes - Array of widths to generate
 * @returns srcset string for <img> or <source>
 * 
 * @example
 * const srcset = generateSrcSet("/images/hero", [640, 1024, 1920]);
 * // Returns: "/images/hero-640w.webp 640w, /images/hero-1024w.webp 1024w, ..."
 */
export function generateSrcSet(baseSrc: string, sizes: number[]): string {
  return sizes
    .map((size) => `${baseSrc}-${size}w.webp ${size}w`)
    .join(", ");
}

/**
 * Generate sizes attribute for responsive images
 * 
 * @param breakpoints - Object mapping media queries to sizes
 * @returns sizes string for <img>
 * 
 * @example
 * const sizes = generateSizes({
 *   "(max-width: 640px)": "100vw",
 *   "(max-width: 1024px)": "50vw",
 *   default: "33vw"
 * });
 */
export function generateSizes(breakpoints: Record<string, string>): string {
  const entries = Object.entries(breakpoints);
  const mediaQueries = entries
    .filter(([key]) => key !== "default")
    .map(([query, size]) => `${query} ${size}`);
  
  const defaultSize = breakpoints.default || "100vw";
  return [...mediaQueries, defaultSize].join(", ");
}

/**
 * Preload critical images
 * 
 * Generates <link rel="preload"> tags for above-the-fold images
 * to improve LCP (Largest Contentful Paint).
 * 
 * @param images - Array of image configurations
 * @returns Array of preload link props
 * 
 * @example
 * const preloadLinks = getImagePreloads([
 *   { href: "/hero.webp", as: "image", type: "image/webp" }
 * ]);
 */
export function getImagePreloads(
  images: Array<{ href: string; as: string; type?: string; imageSrcSet?: string }>
) {
  return images.map((img) => ({
    rel: "preload" as const,
    href: img.href,
    as: img.as,
    type: img.type,
    imageSrcSet: img.imageSrcSet,
  }));
}

/**
 * Hero Background Image Configuration
 * 
 * Optimized settings for the landing page hero section
 * to minimize CLS (Cumulative Layout Shift) and improve LCP.
 */
export const HERO_IMAGE_CONFIG = {
  src: "/images/hero-bg",
  alt: "Happy family using KidSchedule calendar",
  srcSet: generateSrcSet("/images/hero-bg", [640, 1024, 1920, 2560]),
  sizes: generateSizes({
    "(max-width: 640px)": "100vw",
    "(max-width: 1024px)": "100vw",
    default: "100vw",
  }),
  width: 2560,
  height: 1440,
  priority: true,
  quality: 85,
  formats: ["webp", "jpg"] as const,
};

/**
 * Testimonial Avatar Configuration
 * 
 * Small circular avatars optimized for testimonials section
 */
export const TESTIMONIAL_AVATAR_CONFIG = {
  width: 80,
  height: 80,
  quality: 90,
  formats: ["webp", "jpg"] as const,
};

/**
 * Blog Featured Image Configuration
 * 
 * Medium-sized images for blog post cards
 */
export const BLOG_IMAGE_CONFIG = {
  width: 800,
  height: 450,
  quality: 80,
  formats: ["webp", "jpg"] as const,
};

/**
 * Lazy load configuration
 * 
 * Settings for images below the fold
 */
export const LAZY_LOAD_CONFIG = {
  loading: "lazy" as const,
  decoding: "async" as const,
  // Intersection Observer threshold for triggering load
  rootMargin: "50px 0px",
};

/**
 * Check if WebP is supported
 * 
 * Client-side check for WebP support.
 * Use this to conditionally load WebP or fallback formats.
 * 
 * @returns Promise<boolean> indicating WebP support
 */
export async function supportsWebP(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2);
    };
    webP.src =
      "data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA";
  });
}

/**
 * Placeholder image data URIs
 * 
 * Tiny blurred placeholders to prevent CLS during image loading
 */
export const PLACEHOLDERS = {
  hero: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect fill='%236BCABD' opacity='0.1' width='16' height='9'/%3E%3C/svg%3E",
  avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Ccircle fill='%23E2E8F0' cx='0.5' cy='0.5' r='0.5'/%3E%3C/svg%3E",
  card: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect fill='%23F8FAFC' width='16' height='9'/%3E%3C/svg%3E",
};
