/**
 * Feature Flags & Environment Configuration
 *
 * Controls which data sources (mock vs. real database) are used for each domain.
 * Set to `false` in production for real database access.
 *
 * Environment Variables:
 * - USE_MOCK_DASHBOARD=true|false (enables mock aggregator data in dashboard)
 * - USE_MOCK_BLOG=true|false (enables mock blog posts)
 * - USE_MOCK_CALENDAR=true|false (enables mock calendar events)
 * - USE_MOCK_SCHOOL=true|false (enables mock PTA/school data)
 * - USE_MOCK_MOMENTS=true|false (enables mock moments/photos)
 *
 * Default: Development uses mocks (true), Production uses real data (false)
 */

// Parse boolean env var with safe default
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
}

// Feature flags for gradual rollout
export const features = {
  // Dashboard aggregator (family info, custody calendar, messaging, expenses, moments)
  useMockDashboard: parseBool(
    process.env.USE_MOCK_DASHBOARD,
    process.env.NODE_ENV === "development"
  ),

  // Blog (featured post, post listings, article detail page)
  useMockBlog: parseBool(
    process.env.USE_MOCK_BLOG,
    process.env.NODE_ENV === "development"
  ),

  // Calendar (custody schedule, events, transitions)
  useMockCalendar: parseBool(
    process.env.USE_MOCK_CALENDAR,
    process.env.NODE_ENV === "development"
  ),

  // School/PTA (events, volunteer tasks, contacts, vault documents, lunch menus)
  useMockSchool: parseBool(
    process.env.USE_MOCK_SCHOOL,
    process.env.NODE_ENV === "development"
  ),

  // Moments (photo/video sharing with reactions)
  useMockMoments: parseBool(
    process.env.USE_MOCK_MOMENTS,
    process.env.NODE_ENV === "development"
  ),

  // Expenses (expense tracking, splitting, settlements)
  useMockExpenses: parseBool(
    process.env.USE_MOCK_EXPENSES,
    process.env.NODE_ENV === "development"
  ),

  // Reports (analytics, custody reports, expense summaries)
  useMockReports: parseBool(
    process.env.USE_MOCK_REPORTS,
    process.env.NODE_ENV === "development"
  ),
} as const;

/**
 * Database Fallback Behavior
 *
 * When a feature flag is set to `false` (use real database):
 * 1. Attempts to fetch from database via db.* repository
 * 2. On database error, returns empty data structure (safe default)
 * 3. Logs warning to console but doesn't crash page
 * 4. Frontend gracefully handles missing data
 *
 * Example:
 * ```
 * try {
 *   const posts = await db.blogPosts.findPublished({ limit: 10, offset: 0 });
 *   return posts;
 * } catch (err) {
 *   console.warn("Failed to fetch blog posts:", err);
 *   return []; // Returns empty array instead of crashing
 * }
 * ```
 */

/**
 * Verification of Feature Flag Status
 *
 * Run in development to check current flag values:
 * ```
 * NODE_ENV=development node -e "console.log(require('./lib/config/features').features)"
 * ```
 *
 * Example output (development defaults):
 * ```
 * {
 *   useMockDashboard: true,
 *   useMockBlog: true,
 *   useMockCalendar: true,
 *   useMockSchool: true,
 *   useMockMoments: true,
 *   useMockExpenses: true,
 *   useMockReports: true,
 * }
 * ```
 *
 * Example production configuration (.env.production):
 * ```
 * USE_MOCK_DASHBOARD=false
 * USE_MOCK_BLOG=false
 * USE_MOCK_CALENDAR=false
 * USE_MOCK_SCHOOL=false
 * USE_MOCK_MOMENTS=false
 * USE_MOCK_EXPENSES=false
 * USE_MOCK_REPORTS=false
 * ```
 */
