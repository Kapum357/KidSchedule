/**
 * KidSchedule – Article Content Parser
 *
 * Production-grade parsing pipeline for article content:
 * - Accepts HTML or Markdown input
 * - Converts Markdown to HTML
 * - Extracts H2/H3 headings for TOC using DOM traversal (no regex)
 * - Injects stable heading IDs into rendered HTML
 */

import { load } from "cheerio";
import { marked } from "marked";
import type { TableOfContents } from "@/types";

const HEADING_SELECTOR = "h2, h3";

function isLikelyHtml(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;
  return trimmed.includes("<") && trimmed.includes(">");
}

function slugifyHeading(text: string): string {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll("&", " and ");

  let slug = "";
  for (const char of normalized) {
    const isAlphaNumeric = (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
    if (isAlphaNumeric) {
      slug += char;
      continue;
    }

    if (slug.length > 0 && !slug.endsWith("-")) {
      slug += "-";
    }
  }

  slug = slug.replaceAll("--", "-").replaceAll("--", "-");
  if (slug.endsWith("-")) slug = slug.slice(0, -1);
  return slug || "section";
}

function toHtml(content: string): string {
  if (isLikelyHtml(content)) return content;
  const rendered = marked.parse(content, { async: false, gfm: true, breaks: false });
  return typeof rendered === "string" ? rendered : content;
}

export function parseArticleContent(content: string): { html: string; toc: TableOfContents } {
  const html = toHtml(content);
  const $ = load(html, undefined, false);

  const toc: TableOfContents = [];
  const idCounters = new Map<string, number>();

  $(HEADING_SELECTOR).each((_, element) => {
    const tagName = element.tagName.toLowerCase();
    const level = tagName === "h2" ? 2 : 3;
    const text = $(element).text().trim();
    if (!text) return;

    const existingId = $(element).attr("id")?.trim();
    const baseId = existingId && existingId.length > 0 ? existingId : slugifyHeading(text);
    const count = idCounters.get(baseId) ?? 0;
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
    idCounters.set(baseId, count + 1);

    $(element).attr("id", id);
    toc.push({ id, text, level });
  });

  return {
    html: $.html(),
    toc,
  };
}
