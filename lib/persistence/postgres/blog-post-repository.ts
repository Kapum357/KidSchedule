/**
 * KidSchedule – PostgreSQL Blog Post Repository
 */

import type { BlogPostRepository } from "../repositories";
import type { DbBlogPost } from "../types";
import { sql, type SqlClient } from "./client";

type BlogRow = {
  id: string;
  slug: string;
  title: string;
  preview: string;
  content: string;
  categories: string[];
  authorName: string;
  authorTitle: string | null;
  authorAvatarUrl: string | null;
  featuredImageUrl: string;
  publishedAt: Date | null;
  updatedAt: Date | null;
  readTimeMinutes: number;
  viewCount: number;
  shareCount: number;
  commentCount: number;
  isFeatured: boolean;
  isPublished: boolean;
};

function rowToDb(row: BlogRow): DbBlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    preview: row.preview,
    content: row.content,
    categories: JSON.stringify(row.categories),
    authorName: row.authorName,
    authorTitle: row.authorTitle ?? "",
    authorAvatarUrl: row.authorAvatarUrl ?? undefined,
    featuredImageUrl: row.featuredImageUrl,
    publishedAt: row.publishedAt?.toISOString() ?? "",
    updatedAt: row.updatedAt?.toISOString(),
    readTimeMinutes: row.readTimeMinutes,
    viewCount: row.viewCount,
    shareCount: row.shareCount,
    commentCount: row.commentCount,
    isFeatured: row.isFeatured,
    isPublished: row.isPublished,
  };
}

export function createBlogPostRepository(tx?: SqlClient): BlogPostRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbBlogPost | null> {
      const rows = await query<BlogRow[]>`SELECT * FROM blog_posts WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findBySlug(slug: string): Promise<DbBlogPost | null> {
      const rows = await query<BlogRow[]>`SELECT * FROM blog_posts WHERE slug = ${slug}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findPublished(options: {
      limit: number;
      offset: number;
      categories?: string[];
      sort?: "recent" | "popular";
    }): Promise<{ posts: DbBlogPost[]; total: number }> {
      const { limit, offset, categories, sort = "recent" } = options;
      const orderBy = sort === "popular" ? "view_count DESC" : "published_at DESC";

      let posts: BlogRow[];
      let total: number;

      if (categories && categories.length > 0) {
        posts = await query<BlogRow[]>`
          SELECT * FROM blog_posts 
          WHERE is_published = TRUE AND categories ?| ${categories}
          ORDER BY ${sql.unsafe(orderBy)}
          LIMIT ${limit} OFFSET ${offset}
        `;
        const countRows = await query<[{ count: string }]>`
          SELECT COUNT(*) as count FROM blog_posts 
          WHERE is_published = TRUE AND categories ?| ${categories}
        `;
        total = Number.parseInt(countRows[0].count, 10);
      } else {
        posts = await query<BlogRow[]>`
          SELECT * FROM blog_posts 
          WHERE is_published = TRUE
          ORDER BY ${sql.unsafe(orderBy)}
          LIMIT ${limit} OFFSET ${offset}
        `;
        const countRows = await query<[{ count: string }]>`
          SELECT COUNT(*) as count FROM blog_posts WHERE is_published = TRUE
        `;
        total = Number.parseInt(countRows[0].count, 10);
      }

      return { posts: posts.map(rowToDb), total };
    },

    async findFeatured(): Promise<DbBlogPost | null> {
      const rows = await query<BlogRow[]>`
        SELECT * FROM blog_posts 
        WHERE is_featured = TRUE AND is_published = TRUE
        ORDER BY published_at DESC LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async incrementViewCount(id: string): Promise<void> {
      await query`UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ${id}`;
    },

    async incrementShareCount(id: string): Promise<void> {
      await query`UPDATE blog_posts SET share_count = share_count + 1 WHERE id = ${id}`;
    },
  };
}
