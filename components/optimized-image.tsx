import Image, { type ImageLoaderProps, type ImageProps } from "next/image";

const DEFAULT_QUALITY = 75;

function extractCloudinaryCloudName(): string | null {
  const explicit = process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (explicit && explicit.trim().length > 0) return explicit.trim();

  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudinaryUrl) return null;

  try {
    const parsed = new URL(cloudinaryUrl);
    return parsed.host || parsed.username || null;
  } catch {
    return null;
  }
}

function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  const cloudName = extractCloudinaryCloudName();
  if (!cloudName) return src;

  const normalizedSrc = src.startsWith("/") ? src : `/${src}`;
  const q = quality ?? DEFAULT_QUALITY;
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_${q},c_limit,w_${width}${normalizedSrc}`;
}

function imgixLoader({ src, width, quality }: ImageLoaderProps): string {
  const domain = process.env.IMGIX_DOMAIN ?? process.env.NEXT_PUBLIC_IMGIX_DOMAIN;
  if (!domain) return src;

  const normalizedSrc = src.startsWith("/") ? src : `/${src}`;
  const q = quality ?? DEFAULT_QUALITY;
  return `https://${domain}${normalizedSrc}?auto=format,compress&fit=max&w=${width}&q=${q}`;
}

function resolveLoader(): ((props: ImageLoaderProps) => string) | undefined {
  if (extractCloudinaryCloudName()) return cloudinaryLoader;
  if (process.env.IMGIX_DOMAIN || process.env.NEXT_PUBLIC_IMGIX_DOMAIN) return imgixLoader;
  return undefined;
}

export type OptimizedImageProps = Omit<ImageProps, "loader">;

export function OptimizedImage(props: Readonly<OptimizedImageProps>) {
  const loader = resolveLoader();
  return <Image {...props} loader={loader} />;
}

interface HeroBackgroundProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  overlay?: boolean;
}

/**
 * Keeps hero backgrounds in CSS for layout reliability while preserving
 * responsive image-set with WebP/JPG fallback.
 */
export function HeroBackground({
  src,
  alt,
  className,
  priority = false,
  overlay = false,
}: Readonly<HeroBackgroundProps>) {
  const imageSet = `image-set(url('${src}-1024w.webp') type('image/webp') 1x, url('${src}-1920w.webp') type('image/webp') 2x, url('${src}-1024w.jpg') type('image/jpeg') 1x, url('${src}-1920w.jpg') type('image/jpeg') 2x)`;
  const preloadedClassName = priority ? `${className ?? ""} bg-no-repeat bg-cover bg-center` : className;

  return (
    <div
      aria-hidden="true"
      className={preloadedClassName}
      data-alt={alt}
      style={{ backgroundImage: imageSet }}
    >
      {overlay ? <div className="absolute inset-0 bg-black/25" /> : null}
    </div>
  );
}
