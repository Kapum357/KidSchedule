/**
 * KidSchedule – Blog Article Detail Page
 *
 * Server Component rendering individual blog post with:
 * - Reading progress bar
 * - Article content with TOC
 * - Related articles recommendations
 * - Author bio
 * - Newsletter signup CTA
 * - Engagement tracking (views, shares)
 *
 * Client-side actions:
 * - Scroll progress tracking (throttled)
 * - Share button integration
 * - Newsletter signup (form)
 */

import type { BlogPost } from "@/types";
import { BlogArticleEngine, createMockReadingSession, createMockReadingSessions } from "@/lib/blog-article-engine";
import { createMockBlogPosts } from "@/lib/blog-engine";
import Link from "next/link";
import { OptimizedImage } from "@/components/optimized-image";
import { ArticleContent, ARTICLE_CONTENT_CLASSNAMES } from "@/components/article-content";

// ─── Mock Data (outside component to avoid re-renders) ──────────────────────────

const MOCK_PUBLISH_DATE = new Date(
  new Date().getTime() - 30 * 24 * 60 * 60 * 1000
).toISOString();

const createMockArticlePost = (): BlogPost => ({
  id: "post-holiday",
  slug: "stress-free-holiday-custody",
  title: "5 Strategies for Stress-Free Holiday Custody Swaps",
  preview: "The holiday season can be stressful for co-parents. Here are 5 proven strategies...",
  content: `<h2>1. Plan Early and Communicate Clearly</h2><p><strong>Leaving holiday plans to the last minute</strong> is a recipe for disaster. Try to finalize the schedule by October.</p><ul><li><strong>Confirm dates</strong> and times well in advance.</li><li><strong>Discuss gift budgets</strong> to avoid competition.</li></ul><h2>2. Keep Transitions Brief and Neutral</h2><p>Long goodbyes can heighten anxiety for children.</p><h3>Practical Tips</h3><p>Aim for quick, positive handoffs.</p>`,
  categories: ["custody_tips"],
  author: {
    name: "Dr. Sarah Jenkins",
    title: "Family Therapist & Mediator",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAzvK2dzcvQK7JeokQFDoZTeP9xAVgPNZEzQYmJByjBWHqas7pD9BefyLvOR5bubdAVqDpmu8HfSxPJFDcnJVypNhYaqaV6tPcg-QfucPdeyWPqamr-9x10pqZ1lKpuH8QB0JVqgoukdk47GsW1B8YjUexFLX4X70KTkWiw5QlCTV6kxaE3N9C7aw4YDaX1HIxp2UXGU6bQ4sAoLAN8fZmgamWVb9eI3NG9sE3DraBobmKVD0Mefzr1gtf_p3bbODCx5COlLiWYABk",
  },
  featuredImageUrl:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDy9NZAO1UV_N3K_8VbfSQzqzMyDXAnrjkbvCa7fuAwa6WU4ecxy5TVHOAQUmbxIBjqdrC85nRGr5VuTdmip5GTlrlSkfs3QiWDtHsAM38-CJnZdOqKb6Jcj-2JS88le8O_7L4yc2e9VChrPlI1edTh84WXtDa4nmbbjBnGuyJTYlDn2R-Seohnf3kFcolvEtsBLSVtkzf5OAFWV4bqwjL59lff2Tnj0C2w3ju-q0DzB2QXIwOh5YLHd54pcl_z8JyaU7z080_uLrQ",
  publishedAt: MOCK_PUBLISH_DATE,
  readTimeMinutes: 8,
  viewCount: 4200,
  shareCount: 156,
  commentCount: 38,
});

// ─── Article Stats ────────────────────────────────────────────────────────────

function ArticleStats({
  viewCount,
  avgTimeSpent,
  completionRate,
}: Readonly<{
  viewCount: number;
  avgTimeSpent: number;
  completionRate: number;
}>) {
  return (
    <div className="flex flex-wrap gap-6 text-sm text-slate-500 mb-6">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base">visibility</span>
        <span>{viewCount.toLocaleString()} views</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base">schedule</span>
        <span>{Math.round(avgTimeSpent / 60)} min avg read time</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base">check_circle</span>
        <span>{completionRate}% completion rate</span>
      </div>
    </div>
  );
}

// ─── Key Takeaways Box ────────────────────────────────────────────────────────

function KeyTakeawaysBox({ takeaways }: Readonly<{ takeaways?: string[] }>) {
  if (!takeaways || takeaways.length === 0) return null;

  return (
    <div className="bg-indigo-50/50 border border-indigo-100 p-8 rounded-2xl mb-12 shadow-sm">
      <h3 className="flex items-center gap-2 text-lg font-bold text-indigo-900 mb-4">
        <span className="material-symbols-outlined text-indigo-600">lightbulb</span>
        Key Takeaways
      </h3>
      <ul className="space-y-3">
        {takeaways.map((takeaway, idx) => (
          <li key={idx} className="flex items-start gap-3 text-indigo-900/80">
            <span className="material-symbols-outlined text-indigo-500 text-xl shrink-0 mt-0.5">
              check_circle
            </span>
            <span dangerouslySetInnerHTML={{ __html: takeaway }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Table of Contents ────────────────────────────────────────────────────────

function TableOfContents({
  toc,
}: Readonly<{
  toc: Array<{ id: string; text: string; level: number }>;
}>) {
  if (toc.length === 0) return null;

  return (
    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 mb-12 hidden md:block sticky top-24">
      <h3 className="font-bold text-slate-900 text-lg mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">list</span>
        In this article
      </h3>
      <ul className="space-y-2">
        {toc.map((item) => (
          <li key={item.id} style={{ marginLeft: `${(item.level - 2) * 16}px` }}>
            <a
              className={`text-sm hover:text-primary transition-colors ${
                item.level === 2 ? "font-medium text-slate-900" : "text-slate-600"
              }`}
              href={`#${item.id}`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Author Bio ───────────────────────────────────────────────────────────────

function AuthorBio({
  author,
  publishedAt,
}: Readonly<{
  author: { name: string; title: string; avatarUrl?: string };
  publishedAt: string;
}>) {
  const date = new Date(publishedAt);
  const formatted = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mt-12 p-8 bg-slate-50 rounded-2xl flex flex-col sm:flex-row gap-6 items-center sm:items-start text-center sm:text-left shadow-sm border border-slate-100">
      <div className="shrink-0 relative">
        {author.avatarUrl && (
          <OptimizedImage
            alt={author.name}
            className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-sm"
            height={80}
            sizes="80px"
            src={author.avatarUrl}
            width={80}
          />
        )}
        <div className="absolute bottom-0 right-0 bg-primary text-white p-1 rounded-full border-2 border-white">
          <span className="material-symbols-outlined text-[14px] block">verified</span>
        </div>
      </div>

      <div>
        <h4 className="text-lg font-bold text-slate-900 mb-1">{`About ${author.name.split(" ")[0]}`}</h4>
        <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">{author.title}</p>
        <p className="text-slate-600 text-sm leading-relaxed mb-4">
          {author.name} is a regular contributor to KidSchedule. Published {formatted}.
        </p>
        <a
          className="text-slate-900 font-semibold text-sm hover:text-primary inline-flex items-center gap-1 transition-colors group"
          href="#"
        >
          View all articles
          <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">
            arrow_forward
          </span>
        </a>
      </div>
    </div>
  );
}

// ─── Related Articles Sidebar ──────────────────────────────────────────────────

function RelatedArticleCard({
  post,
}: Readonly<{
  post: BlogPost;
}>) {
  return (
    <a className="group flex gap-4 items-start" href={`/blog/${post.slug}`}>
      <div className="w-20 h-20 rounded-xl bg-slate-200 shrink-0 overflow-hidden relative">
        <OptimizedImage
          alt={post.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          height={80}
          sizes="80px"
          src={post.featuredImageUrl}
          width={80}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors"></div>
      </div>

      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
          {post.categories[0]?.replace(/_/g, " ")}
        </span>
        <h4 className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors leading-snug mb-2 line-clamp-2">
          {post.title}
        </h4>
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">schedule</span>
          {post.readTimeMinutes} min read
        </p>
      </div>
    </a>
  );
}

// ─── Newsletter Subscription ───────────────────────────────────────────────────

function NewsletterSignup() {
  return (
    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
      <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">mail</span>
        Join Our Newsletter
      </h3>
      <p className="text-slate-500 text-sm mb-5 leading-relaxed">
        Get the latest co-parenting tips, guides, and resources delivered weekly.
      </p>

      <form className="space-y-3">
        <div>
          <label className="sr-only" htmlFor="subscribe-email">
            Email address
          </label>
          <input
            className="w-full rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm py-3 px-4 shadow-sm"
            id="subscribe-email"
            placeholder="Enter your email"
            type="email"
          />
        </div>
        <button
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors shadow-sm"
          type="button"
        >
          Subscribe
        </button>
        <p className="text-xs text-center text-slate-400">
          We respect your privacy. Unsubscribe anytime.
        </p>
      </form>
    </div>
  );
}

// ─── CTA Section ──────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <div className="mt-16 bg-slate-900 rounded-3xl p-8 sm:p-12 text-center text-white shadow-2xl relative overflow-hidden isolate">
      <div className="relative z-10 max-w-2xl mx-auto">
        <span className="inline-block py-1 px-3 rounded-full bg-white/10 text-white/80 text-xs font-semibold tracking-wider mb-6 border border-white/10">
          TRY IT FREE TODAY
        </span>
        <h2 className="text-3xl sm:text-4xl font-bold mb-6 tracking-tight">
          Make Co-Parenting Easier
        </h2>
        <p className="text-slate-300 mb-10 text-lg leading-relaxed">
          Stop the chaos. Organize schedules, track expenses, and communicate without conflict
          using the #1 rated co-parenting app.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="bg-primary hover:bg-primary-dark text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-primary/25 transform transition hover:-translate-y-1 text-lg w-full sm:w-auto">
            Start Free Trial
          </button>
        </div>

        <p className="mt-6 text-sm text-slate-400 flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-sm">credit_card_off</span>
          No credit card required • Cancel anytime
        </p>
      </div>

      {/* Background decorations */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-primary/30 rounded-full blur-[100px] -z-10"></div>
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-blue-600/20 rounded-full blur-[100px] -z-10"></div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * Individual blog post detail page with full content, related articles, and engagement tracking.
 *
 * Uses BlogArticleEngine to:
 * - Enrich article with TOC, key takeaways, recommendations
 * - Calculate engagement metrics from mock sessions
 * - Format reading statistics
 *
 * In production, replace createMockBlogPosts() with database query and
 * use URL slug to fetch the specific post.
 */
export default function BlogArticlePage() {
  // Data assembly (in real app, fetch from database by slug)
  const engine = new BlogArticleEngine();
  const allPosts = createMockBlogPosts(20);

  // Simulate fetching a specific post (in real app, use URL slug)
  const basePost = createMockArticlePost();

  // Enrich article with metadata
  const article = engine.enrichArticle(basePost, allPosts);

  // Simulate reading sessions for metrics
  const mockSessions = createMockReadingSessions(basePost.id, 20);
  const metrics = engine.calculateEngagementMetrics(basePost.id, mockSessions);

  // Simulate user's current reading session
  const currentSession = createMockReadingSession(basePost.id);
  const progressPercent = engine.calculateProgressPercentage(currentSession, article.estimatedReadTime);

  return (
    <>
      <div className="bg-white text-slate-900 antialiased selection:bg-primary/20">
        {/* Reading Progress Bar */}
        <div className="fixed top-0 left-0 w-full h-1 bg-slate-100 z-50">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>

      {/* Sticky Navigation */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="bg-primary flex items-center justify-center rounded-lg size-8 text-white shadow-sm">
                <span className="material-symbols-outlined text-xl">family_restroom</span>
              </div>
              <span className="font-bold text-xl tracking-tight text-slate-900">KidSchedule</span>
              <span className="hidden sm:inline-block text-slate-300 mx-2 h-5 w-px bg-slate-200"></span>
              <Link
                className="hidden sm:inline-block text-slate-500 hover:text-primary font-medium text-sm transition-colors"
                href="/blog"
              >
                Blog
              </Link>
            </div>

            <div className="hidden md:flex items-center space-x-8">
              <a
                className="text-slate-500 hover:text-slate-900 text-sm font-medium transition-colors"
                href="#"
              >
                Features
              </a>
              <a
                className="text-slate-500 hover:text-slate-900 text-sm font-medium transition-colors"
                href="#"
              >
                Pricing
              </a>
              <a
                className="text-slate-500 hover:text-slate-900 text-sm font-medium transition-colors"
                href="#"
              >
                Support
              </a>
              <a
                className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all hover:shadow-lg"
                href="#"
              >
                Sign Up Free
              </a>
            </div>

            <div className="md:hidden">
              <button className="text-slate-500 hover:text-slate-900 p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <span className="material-symbols-outlined">menu</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <main id="main-content" className="lg:col-span-8">
            {/* Article Header */}
            <header className="mb-10">
              <div className="flex items-center gap-3 text-sm font-medium mb-5">
                <span className="bg-blue-50 text-primary px-3 py-1 rounded-full border border-blue-100">
                  {article.categories[0]?.replace(/_/g, " ")}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-base">schedule</span>
                  {article.readTimeMinutes} min read
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 leading-[1.15] mb-8 tracking-tight">
                {article.title}
              </h1>

              <div className="flex items-center justify-between border-y border-slate-100 py-6">
                <div className="flex items-center gap-4">
                  {article.author.avatarUrl && (
                    <OptimizedImage
                      alt={article.author.name}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-white shadow-sm"
                      height={48}
                      sizes="48px"
                      src={article.author.avatarUrl}
                      width={48}
                    />
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-900">{article.author.name}</p>
                    <p className="text-xs text-slate-500">
                      {article.author.title} • {new Date(article.publishedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="p-2 text-slate-400 hover:text-primary hover:bg-blue-50 transition-all rounded-full"
                    title="Share"
                  >
                    <span className="material-symbols-outlined text-[20px]">share</span>
                  </button>
                  <button
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all rounded-full"
                    title="Save"
                  >
                    <span className="material-symbols-outlined text-[20px]">bookmark</span>
                  </button>
                </div>
              </div>
            </header>

            {/* Featured Image */}
            <div className="rounded-2xl overflow-hidden mb-12 shadow-md relative h-[400px] group">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url('${article.featuredImageUrl}')` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
            </div>

            {/* Engagement Stats */}
            <ArticleStats
              avgTimeSpent={metrics.avgTimeSpentSeconds}
              completionRate={metrics.completionRate}
              viewCount={metrics.viewCount}
            />

            {/* Key Takeaways */}
            <KeyTakeawaysBox takeaways={article.keyTakeaways} />

            {/* Article Content */}
            <article>
              <ArticleContent className={ARTICLE_CONTENT_CLASSNAMES} html={article.content} />
            </article>

            <div className="mt-12 pt-8 border-t border-slate-100">
              <div className="flex flex-wrap gap-2">
                {["#CoParenting", "#Holidays", "#CustodyTips", "#MentalHealth"].map((tag) => (
                  <a
                    key={tag}
                    className="px-4 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-primary rounded-full text-sm font-medium transition-colors border border-slate-100"
                    href={`/blog?q=${tag.substring(1)}`}
                  >
                    {tag}
                  </a>
                ))}
              </div>
            </div>

            {/* Author Bio */}
            <AuthorBio author={article.author} publishedAt={article.publishedAt} />

            {/* CTA Section */}
            <CTASection />
          </main>

          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-8">
            {/* Table of Contents (Desktop) */}
            <TableOfContents toc={article.toc} />

            {/* Related Articles */}
            <div>
              <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-200">
                <h3 className="font-bold text-slate-900 text-lg">Related Articles</h3>
                <Link className="text-xs font-semibold text-primary hover:text-primary-dark" href="/blog">
                  View all
                </Link>
              </div>

              <div className="space-y-6">
                {article.relatedPosts.slice(0, 3).map((rec) => (
                  <RelatedArticleCard key={rec.post.id} post={rec.post} />
                ))}
              </div>
            </div>

            {/* Newsletter Signup */}
            <NewsletterSignup />
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 pt-16 pb-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-primary flex items-center justify-center rounded-lg size-8 text-white">
                  <span className="material-symbols-outlined text-xl">family_restroom</span>
                </div>
                <span className="font-bold text-slate-900 text-lg">KidSchedule</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Helping separated parents raise happy children together through better organization
                and communication.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Features
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Pricing
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Download App
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Blog
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Help Center
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Legal Professionals
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    About Us
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Careers
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-400">&copy; 2024 KidSchedule Inc. All rights reserved.</p>
            <div className="flex gap-6 text-sm text-slate-500">
              <a className="hover:text-slate-900 transition-colors" href="#">
                Privacy Policy
              </a>
              <a className="hover:text-slate-900 transition-colors" href="#">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
      </div>
    </>
  );
}
