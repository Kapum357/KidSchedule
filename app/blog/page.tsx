/**
 * KidSchedule – Blog Page
 *
 * Server Component rendering the blog home with:
 * - Featured post hero section
 * - Category filters
 * - Post grid with pagination
 * - Newsletter signup CTA
 *
 * Fetches live blog posts from the database using the BlogEngine
 * to calculate featured post, filters, and pagination.
 */

import { Suspense } from "react";
import { BlogEngine } from "@/lib/blog-engine";
import { db } from "@/lib/persistence";
import type { BlogCategory, BlogPost } from "@/types";
import { PaginationControls } from "./pagination-controls";
import { OptimizedImage } from "@/components/optimized-image";
import Link from "next/link";

const NOW_MS = Date.now();

// ─── Featured Post Section ────────────────────────────────────────────────────

function FeaturedPostSection({ post }: Readonly<{ post: BlogPost }>) {
  return (
    <section className="w-full bg-secondary border-b border-slate-100 py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row gap-10 items-center">
          <div className="w-full md:w-1/2 flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              Featured Post
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 leading-tight">
              {post.title}
            </h1>

            <p className="text-lg text-slate-600 leading-relaxed">{post.preview}</p>

            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-3">
                {post.author.avatarUrl && (
                  <OptimizedImage
                    alt={post.author.name}
                    className="size-10 rounded-full object-cover bg-slate-200"
                    height={40}
                    sizes="40px"
                    src={post.author.avatarUrl}
                    width={40}
                  />
                )}
                <div>
                  <p className="text-sm font-bold text-slate-900">{post.author.name}</p>
                  <p className="text-xs text-slate-500">{post.author.title}</p>
                </div>
              </div>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span className="text-sm text-slate-500 font-medium">{post.readTimeMinutes} min read</span>
            </div>

            <div className="mt-4">
              <a
                className="inline-flex items-center gap-2 text-primary font-bold hover:gap-3 transition-all"
                href={`/blog/${post.slug}`}
              >
                Read Full Article <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </a>
            </div>
          </div>

          <div className="w-full md:w-1/2">
            <a 
              href={`/blog/${post.slug}`}
              className="block relative rounded-2xl overflow-hidden shadow-2xl shadow-primary/10 aspect-[4/3] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label={`View featured article: ${post.title}`}
            >
              <OptimizedImage
                alt={post.title}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                fill
                preload
                sizes="(max-width: 768px) 100vw, 50vw"
                src={post.featuredImageUrl}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Category Filter Buttons ───────────────────────────────────────────────────

interface CategoryFilterProps {
  readonly selectedCategories: Set<BlogCategory>;
}

function CategoryFilter({ selectedCategories }: CategoryFilterProps) {
  const categoryLabels: Record<BlogCategory, string> = {
    custody_tips: "Custody Tips",
    legal_advice: "Legal Advice",
    emotional_wellness: "Emotional Wellness",
    communication: "Communication",
    financial_planning: "Financial Planning",
    featured: "Featured",
  };

  const baseCategories: BlogCategory[] = [
    "custody_tips",
    "legal_advice",
    "emotional_wellness",
    "communication",
    "financial_planning",
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-6">
        <button
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            selectedCategories.size === 0
              ? "bg-slate-900 text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:border-primary hover:text-primary"
          }`}
        >
          All Posts
        </button>

        {baseCategories.map((cat) => (
          <button
            key={cat}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              selectedCategories.has(cat)
                ? "bg-primary text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:border-primary hover:text-primary"
            }`}
          >
            {categoryLabels[cat]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post }: Readonly<{ post: BlogPost }>) {
  const daysAgo = Math.floor((NOW_MS - new Date(post.publishedAt).getTime()) / (24 * 60 * 60 * 1000));
  const categoryLabels: Record<BlogCategory, string> = {
    custody_tips: "Custody Tips",
    legal_advice: "Legal Advice",
    emotional_wellness: "Emotional Wellness",
    communication: "Communication",
    financial_planning: "Financial Planning",
    featured: "Featured",
  };
  const categoryColors: Record<BlogCategory, string> = {
    custody_tips: "text-teal-700",
    legal_advice: "text-blue-700",
    emotional_wellness: "text-purple-700",
    communication: "text-teal-700",
    financial_planning: "text-indigo-700",
    featured: "text-amber-700",
  };

  const category = post.categories[0] || "featured";
  const color = categoryColors[category];

  return (
    <article className="group flex flex-col gap-4">
      <div className="aspect-[3/2] rounded-xl overflow-hidden bg-slate-100 relative">
        <div className="absolute top-4 left-4 z-10">
          <span className={`px-3 py-1 rounded-md bg-white/90 backdrop-blur text-xs font-bold ${color} shadow-sm uppercase tracking-wide`}>
            {categoryLabels[category]}
          </span>
        </div>
        <OptimizedImage
          alt={post.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          height={450}
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          src={post.featuredImageUrl}
          width={800}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span>{daysAgo === 0 ? "Today" : `${daysAgo} days ago`}</span>
          <span>•</span>
          <span>{post.readTimeMinutes} min read</span>
        </div>

        <h3 className="text-xl font-bold text-slate-900 group-hover:text-primary transition-colors leading-snug">
          <a href={`/blog/${post.slug}`}>{post.title}</a>
        </h3>

        <p className="text-slate-600 text-sm line-clamp-3 leading-relaxed">{post.preview}</p>
      </div>
    </article>
  );
}

// ─── Newsletter Section ────────────────────────────────────────────────────────

function NewsletterCTA() {
  return (
    <div className="bg-primary rounded-2xl p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
      <div className="absolute top-0 right-0 -mr-10 -mt-10 size-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 -ml-10 -mb-10 size-64 bg-black/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 max-w-xl">
        <div className="inline-block p-3 rounded-xl bg-white/10 text-white mb-4">
          <span className="material-symbols-outlined text-3xl">mail</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Join 20,000+ Co-Parents</h2>
        <p className="text-cyan-100 text-lg">
          Get weekly tips on scheduling, legal updates, and emotional wellness delivered straight to your inbox.
        </p>
      </div>

      <div className="relative z-10 w-full max-w-md bg-white p-2 rounded-xl shadow-lg flex flex-col sm:flex-row gap-2">
        <input
          className="flex-1 border-none focus:ring-0 text-slate-700 placeholder:text-slate-400 px-4 py-3 bg-transparent rounded-lg"
          placeholder="Enter your email address"
          type="email"
        />
        <button className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-lg transition-colors whitespace-nowrap">
          Subscribe Free
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * Blog home page with featured post, category filters, post grid, and pagination.
 *
 * Uses BlogEngine for:
 * - Featured post selection (highest ranking)
 * - Category filtering and pagination
 * - Read time calculation
 *
 */
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  // ── Get search params ──────────────────────────────────────────────────
  const params = await searchParams;
  const activeCategory = (params.category as BlogCategory | undefined) ?? undefined;
  const pageNumber = parseInt(params.page ?? "1");

  // ── Fetch blog posts from database ────────────────────────────────────
  const postsPerPage = 12;
  const { posts: dbPosts } = await db.blogPosts.findPublished({
    limit: postsPerPage * 5, // Fetch enough for featured + grid
    offset: 0,
    categories: activeCategory ? [activeCategory] : undefined,
  });

  // Transform DbBlogPost to BlogPost by parsing categories and reconstructing author
  const allPosts: BlogPost[] = dbPosts.map((post) => ({
    ...post,
    categories: JSON.parse(post.categories) as BlogCategory[],
    author: {
      name: post.authorName,
      title: post.authorTitle,
      avatarUrl: post.authorAvatarUrl,
    },
  }));

  // ── Compose data using BlogEngine ─────────────────────────────────────
  const engine = new BlogEngine();
  const featured = engine.getFeaturedPost(allPosts);
  const filtered = activeCategory
    ? allPosts.filter((p) => p.categories.includes(activeCategory))
    : allPosts;

  const activeFilters = new Set<BlogCategory>();

  // Get paginated results
  const pageData = engine.getPage(filtered, {
    pageNumber,
    pageSize: 6,
    categories: Array.from(activeFilters),
    sort: "recent",
  });

  return (
    <div className="w-full min-h-screen bg-background-light">
        {/* Header */}
        <header className="w-full bg-white border-b border-slate-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 flex items-center justify-center rounded-lg size-10 text-primary">
              <span className="material-symbols-outlined text-2xl">family_restroom</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">KidSchedule</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <Link className="text-sm font-medium text-slate-600 hover:text-primary transition-colors" href="/">
              Features
            </Link>
            <Link className="text-sm font-medium text-slate-600 hover:text-primary transition-colors" href="/">
              Pricing
            </Link>
            <Link className="text-sm font-medium text-primary hover:text-primary-hover transition-colors" href="/blog">
              Blog
            </Link>
            <Link className="text-sm font-medium text-slate-600 hover:text-primary transition-colors" href="/">
              Support
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link className="hidden md:block text-sm font-semibold text-slate-700 hover:text-primary transition-colors" href="/login">
              Log in
            </Link>
            <Link className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors shadow-sm shadow-primary/20" href="/signup">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Featured Post */}
      {featured && <FeaturedPostSection post={featured} />}

      {/* Main Content */}
      <main id="main-content" className="w-full pb-20">
        {/* Category Filters */}
        <CategoryFilter selectedCategories={activeFilters} />

        {/* Posts Grid */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {pageData.posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}

            {/* Newsletter CTA (mid-grid) */}
            {pageData.totalPostCount > 6 && pageNumber === 1 && (
              <div className="col-span-1 md:col-span-2 lg:col-span-3 my-8">
                <NewsletterCTA />
              </div>
            )}
          </div>

          {/* Pagination */}
          {pageData.totalPages > 1 && (
            <Suspense fallback={<div /> }>
              <PaginationControls
                pageNumber={pageData.pageNumber}
                totalPages={pageData.totalPages}
              />
            </Suspense>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-4 text-white">
                <span className="material-symbols-outlined text-2xl">family_restroom</span>
                <span className="text-lg font-bold">KidSchedule</span>
              </div>
              <p className="text-sm text-slate-400">
                Empowering co-parents to raise happy, healthy kids together.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">Platform</h4>
              <ul className="space-y-2 text-sm">
                <li><a className="hover:text-white transition-colors" href="#">Features</a></li>
                <li><a className="hover:text-white transition-colors" href="#">Pricing</a></li>
                <li><a className="hover:text-white transition-colors" href="#">Download App</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><a className="hover:text-white transition-colors" href="#">Blog</a></li>
                <li><a className="hover:text-white transition-colors" href="#">Help Center</a></li>
                <li><a className="hover:text-white transition-colors" href="#">Legal Guide</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a className="hover:text-white transition-colors" href="#">About Us</a></li>
                <li><a className="hover:text-white transition-colors" href="#">Careers</a></li>
                <li><a className="hover:text-white transition-colors" href="#">Contact</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
            <p>&copy; 2024 KidSchedule Inc. All rights reserved.</p>
            <div className="flex gap-6">
              <a className="hover:text-white transition-colors" href="#">
                Privacy Policy
              </a>
              <a className="hover:text-white transition-colors" href="#">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
      </div>
  );
}
