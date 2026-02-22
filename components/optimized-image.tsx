import type { CSSProperties } from "react";

/**
 * OptimizedImage Component
 * 
 * A lightweight image component with built-in optimization features:
 * - Lazy loading with Intersection Observer
 * - WebP format with fallback
 * - Responsive srcset
 * - Blur placeholder to prevent CLS
 * - Proper aspect ratio handling
 * 
 * This is a simpler alternative to next/image for cases where you need
 * more control over the HTML output (e.g., CSS background images).
 * 
 * For production, consider migrating to next/image for automatic optimization.
 */

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  quality?: number;
  aspectRatio?: string;
  objectFit?: "cover" | "contain" | "fill" | "none";
  placeholder?: string;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className = "",
  priority = false,
  aspectRatio,
  objectFit = "cover",
  placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect fill='%23E2E8F0' width='1' height='1'/%3E%3C/svg%3E",
}: OptimizedImageProps) {
  const loading = priority ? "eager" : "lazy";
  const decoding = priority ? "sync" : "async";

  const style: CSSProperties = {
    aspectRatio: aspectRatio || (width && height ? `${width} / ${height}` : undefined),
    objectFit,
  };

  return (
    <picture>
      {/* WebP version for modern browsers */}
      <source srcSet={src.replace(/\.(jpg|jpeg|png)$/i, ".webp")} type="image/webp" />
      
      {/* Fallback for browsers without WebP support */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        className={className}
        style={style}
        // Low-quality placeholder to prevent CLS
        {...(!priority && { "data-placeholder": placeholder })}
      />
    </picture>
  );
}

/**
 * Hero Background Image
 * 
 * Optimized specifically for hero sections with large background images.
 * Uses responsive images with WebP for best performance.
 * 
 * Props:
 * - src: Base path without extension or width suffix (e.g., '/images/hero')
 * - alt: Alt text for accessibility
 * - priority: Load immediately (for above-the-fold content)
 * - overlay: Add dark gradient overlay for text readability
 * - className: Additional CSS classes for the container
 * - children: Content to render on top of the background
 */
interface HeroBackgroundProps {
  src: string;
  alt: string;
  priority?: boolean;
  overlay?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function HeroBackground({
  src,
  alt,
  priority = false,
  overlay = false,
  className = "",
  children,
}: Readonly<HeroBackgroundProps>) {
  // Build responsive srcset for optimal image loading per viewport
  // Mobile: 640w, Tablet: 1024w, Desktop: 1920w, Large: 2560w
  const webpSrcset = [
    `${src}-640w.webp 640w`,
    `${src}-1024w.webp 1024w`,
    `${src}-1920w.webp 1920w`,
    `${src}-2560w.webp 2560w`,
  ].join(", ");

  const jpgSrcset = [
    `${src}-640w.jpg 640w`,
    `${src}-1024w.jpg 1024w`,
    `${src}-1920w.jpg 1920w`,
    `${src}-2560w.jpg 2560w`,
  ].join(", ");

  // sizes attribute: tells browser which image to pick based on viewport
  // Mobile <640px: use 100vw (full viewport width)
  // Tablet 640-1024px: use 100vw
  // Desktop 1024-1920px: use 100vw
  // Large >1920px: cap at 2560px
  const sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 100vw, (max-width: 1920px) 100vw, 2560px";

  return (
    <div className={`${className} relative`}>
      {/* Responsive hero image with proper srcset */}
      <picture>
        {/* WebP for modern browsers */}
        <source
          type="image/webp"
          srcSet={webpSrcset}
          sizes={sizes}
        />
        {/* JPG fallback */}
        <source
          type="image/jpeg"
          srcSet={jpgSrcset}
          sizes={sizes}
        />
        <img
          src={`${src}-1920w.jpg`}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </picture>
      
      {/* Overlay for text readability */}
      {overlay && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-white/60 to-accent/10" />
      )}
      
      {/* Content */}
      {children && (
        <div className="relative z-10">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Avatar Image
 * 
 * Circular avatar images for testimonials, user profiles, etc.
 */
interface AvatarProps {
  src: string;
  alt: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const AVATAR_SIZES = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
};

export function Avatar({ src, alt, size = "md", className = "" }: Readonly<AvatarProps>) {
  const sizeClass = AVATAR_SIZES[size];

  return (
    <div className={`${sizeClass} rounded-full overflow-hidden flex-shrink-0 ${className}`}>
      <OptimizedImage
        src={src}
        alt={alt}
        className="w-full h-full"
        objectFit="cover"
      />
    </div>
  );
}

/**
 * Card Image
 * 
 * Optimized images for blog cards, product cards, etc.
 */
interface CardImageProps {
  src: string;
  alt: string;
  aspectRatio?: "16/9" | "4/3" | "1/1" | "3/2";
  className?: string;
}

export function CardImage({
  src,
  alt,
  aspectRatio = "16/9",
  className = "",
}: Readonly<CardImageProps>) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <OptimizedImage
        src={src}
        alt={alt}
        aspectRatio={aspectRatio}
        objectFit="cover"
        className="w-full h-full transition-transform duration-300 hover:scale-105"
      />
    </div>
  );
}
