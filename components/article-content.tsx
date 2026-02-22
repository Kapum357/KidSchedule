import parse, { type DOMNode, Element, type HTMLReactParserOptions } from "html-react-parser";
import { OptimizedImage } from "@/components/optimized-image";

const DEFAULT_IMAGE_WIDTH = 768;
const DEFAULT_IMAGE_HEIGHT = 432;

function toInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

interface ArticleContentProps {
  html: string;
  className?: string;
}

const ARTICLE_CONTENT_PARSE_OPTIONS: HTMLReactParserOptions = {
  replace(domNode: DOMNode) {
    if (!(domNode instanceof Element)) return undefined;
    if (domNode.name !== "img") return undefined;

    const src = domNode.attribs?.src;
    if (!src) return null;

    if (src.startsWith("data:")) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={domNode.attribs?.alt ?? ""} src={src} />
      );
    }

    const alt = domNode.attribs?.alt ?? "";
    const width = toInt(domNode.attribs?.width) ?? DEFAULT_IMAGE_WIDTH;
    const height = toInt(domNode.attribs?.height) ?? DEFAULT_IMAGE_HEIGHT;

    return (
      <OptimizedImage
        alt={alt}
        className="h-auto w-full rounded-xl"
        decoding="async"
        height={height}
        loading="lazy"
        sizes="(max-width: 768px) 100vw, 768px"
        src={src}
        width={width}
      />
    );
  },
};

/**
 * Safe HTML-to-React renderer for article content.
 * Converts inline <img> tags to next/image for optimization.
 */
export function ArticleContent({ html, className }: Readonly<ArticleContentProps>) {
  return <div className={className}>{parse(html, ARTICLE_CONTENT_PARSE_OPTIONS)}</div>;
}

export const ARTICLE_CONTENT_CLASSNAMES =
  "prose max-w-none text-lg text-slate-600 prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl";
