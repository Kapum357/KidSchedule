# KidSchedule Productionization Plan

## Executive Summary

This document provides a concrete, production-ready implementation plan to replace all mock data/functions with real database queries and live service integrations (Twilio, Stripe, Claude/Anthropic), aligned with ISO/IEC 12207 process activities and the provided sprint plan.

### Key Objectives
1. **Eliminate all mock data**: Replace `createMock*()` calls with database queries
2. **Wire external services**: Integrate Twilio (Verify/SMS/Proxy), Stripe (subscriptions/webhooks), Claude (tone analysis)
3. **Preserve security**: Maintain hash chain integrity, PII protection, webhook verification
4. **Meet quality gates**: ≥80% unit coverage, E2E tests passing, zero production mocks

### Success Criteria
- ✅ Zero `createMock*()` imports in production build
- ✅ All pages fetch data from PostgreSQL via repository pattern
- ✅ Twilio/Stripe/Claude integrations operational with proper error handling
- ✅ Hash chain verification tests achieve 100% coverage
- ✅ All security controls (JWT, webhook signatures, PII masking) validated

---

## 1. Mock-to-Production Migration Plan

### 1.1 Mock Inventory

**Current mock functions identified:**

| Mock Function | File | Call Sites | Entity Type |
|--------------|------|-----------|-------------|
| `createMockInput` | `lib/dashboard-aggregator.ts` | `app/dashboard/page.tsx` | Dashboard aggregated data |
| `createMockCalendarInput` | `app/calendar/page.tsx` | `app/calendar/page.tsx` | Calendar + custody data |
| `createMockFamilySettings` | `lib/settings-engine.ts` | `app/calendar/page.tsx` | Family conflict settings |
| `createMockSchoolEvents` | `lib/pta-engine.ts` | `app/school/page.tsx` | School/PTA events |
| `createMockVolunteerTasks` | `lib/pta-engine.ts` | `app/school/page.tsx` | Volunteer opportunities |
| `createMockSchoolContacts` | `lib/pta-engine.ts` | `app/school/page.tsx` | School directory |
| `createMockVaultDocuments` | `lib/pta-engine.ts` | `app/school/page.tsx` | School documents |
| `createMockLunchMenus` | `lib/pta-engine.ts` | `app/school/page.tsx` | Lunch account data |
| `createMockBlogPosts` | `lib/blog-engine.ts` | `app/blog/page.tsx`, `app/blog/[slug]/page.tsx` | Blog posts |
| `createMockReadingSession` | `lib/blog-article-engine.ts` | `app/blog/[slug]/page.tsx` | Article engagement |
| `createMockReadingSessions` | `lib/blog-article-engine.ts` | `app/blog/[slug]/page.tsx` | Engagement analytics |

**Total:** 11 mock functions across 6 engine/page files

### 1.2 Replacement Mapping

#### A. Dashboard Page (`app/dashboard/page.tsx`)

**Current State:**
```typescript
const input = createMockInput();
const dashboard = aggregateDashboard(input);
```

**Target State:**
```typescript
// Extract familyId from session
const session = await getSession();
const familyId = session.user.familyId;

// Parallel fetch from database
const [
  family,
  calendarEvents,
  scheduleChangeRequests,
  expenses,
  messages,
  moments,
  reminders,
  conflictClimate
] = await Promise.all([
  db.families.findById(familyId),
  db.calendarEvents.findByFamilyIdAndDateRange(familyId, startDate, endDate),
  db.scheduleChangeRequests.findByFamilyId(familyId),
  db.expenses.findByFamilyId(familyId),
  db.messages.findRecentByFamilyId(familyId, 50),
  db.moments.findByFamilyId(familyId), 
  db.reminders.findByFamilyId(familyId), 
  db.conflictClimate.findByFamilyId(familyId) // Computed from messages
]);

const input: AggregatorInput = {
  family,
  events: calendarEvents,
  changeRequests: scheduleChangeRequests,
  expenses,
  messages,
  moments,
  reminders,
  conflictClimate,
  now: new Date()
};

const dashboard = aggregateDashboard(input);
```

**Dependencies:**
- Session management operational (AUTH-002, AUTH-003)
- Migrations 0006-0009 for missing tables
- Repository methods implemented

**Rollout Strategy:**
1. Add feature flag `USE_MOCK_DASHBOARD` (default: false in prod)
2. Deploy with flag enabled, verify database queries work
3. Gradually disable flag for cohorts (10% → 50% → 100%)
4. Remove mock code after 1 week of 100% real data

---

#### B. Calendar Page (`app/calendar/page.tsx`)

**Current State:**
```typescript
const familySettings = createMockFamilySettings(FAMILY_ID, conflictWindowMins);
const input = createMockCalendarInput(conflictWindowMins, now);
```

**Target State:**
```typescript
// Extract familyId and date params from URL
const searchParams = new URLSearchParams(request.url);
const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString());
const session = await getSession();
const familyId = session.user.familyId;

// Fetch family data
const [family, familySettings, calendarEvents] = await Promise.all([
  db.families.findById(familyId),
  db.familySettings.findByFamilyId(familyId), // Returns conflict window config
  db.calendarEvents.findByFamilyIdAndDateRange(
    familyId,
    new Date(year, month - 1, 1).toISOString(),
    new Date(year, month, 0).toISOString()
  )
]);

// Build CalendarInput for engine
const input: CalendarInput = {
  family,
  events: calendarEvents,
  conflictWindowMins: familySettings?.conflictWindow?.windowMins || 120,
  now: new Date()
};

const monthData = CalendarMonthEngine.generateMonth(input, year, month);
```

**URL Schema:**
- `/calendar` → current month
- `/calendar?year=2026&month=3` → specific month
- `/calendar/change-request` → new change request form

**Dependencies:**
- Family settings table exists (migration 0003 has `conflict_windows`)
- Calendar events table exists (migration 0003 complete)

---

#### C. Blog Pages (`app/blog/page.tsx`, `app/blog/[slug]/page.tsx`)

**Current State (List):**
```typescript
const allPosts = createMockBlogPosts(28);
const page = BlogEngine.filterByCategory(...);
```

**Target State (List):**
```typescript
// Extract URL params: category filter, page number
const searchParams = new URLSearchParams(request.url);
const category = searchParams.get('category') as BlogCategory | null;
const pageNum = parseInt(searchParams.get('page') || '1');
const postsPerPage = 12;

// Fetch from database with pagination
const allPosts = await db.blogPosts.findPublished({
  category,
  limit: postsPerPage,
  offset: (pageNum - 1) * postsPerPage
});

const totalCount = await db.blogPosts.countPublished({ category });

const blogPage: BlogPage = {
  posts: allPosts,
  pageNumber: pageNum,
  totalPages: Math.ceil(totalCount / postsPerPage),
  totalPostCount: totalCount,
  hasNextPage: pageNum < Math.ceil(totalCount / postsPerPage),
  hasPreviousPage: pageNum > 1
};
```

**Current State (Single Post):**
```typescript
const allPosts = createMockBlogPosts(20);
const basePost = createMockArticlePost();
const mockSessions = createMockReadingSessions(basePost.id, 20);
```

**Target State (Single Post):**
```typescript
// Extract slug from route params
const { slug } = params;

// Fetch post and related data
const [post, relatedPosts, engagementMetrics] = await Promise.all([
  db.blogPosts.findBySlug(slug),
  db.blogPosts.findRelated(slug, 3), // Same categories
  db.blogEngagement.getMetrics(slug) // Aggregated from sessions table
]);

if (!post) {
  notFound();
}

// Increment view count (fire-and-forget)
db.blogPosts.incrementViewCount(post.id);

// Create reading session for analytics
const sessionId = await db.blogEngagement.createSession({
  postId: post.id,
  readerId: session?.user?.id, // Anonymous if not logged in
  startedAt: new Date()
});
```

**URL Schema:**
- `/blog` → all posts, page 1
- `/blog?category=custody_tips&page=2` → filtered + paginated
- `/blog/alternating-weeks-custody-schedule` → single post by slug

**Dependencies:**
- Blog posts table exists (migration 0004 complete)
- Blog engagement tables (new migration 0010 needed)

---

#### D. School/PTA Page (`app/school/page.tsx`)

**Current State:**
```typescript
const allEvents = createMockSchoolEvents(FAMILY_ID, NOW);
const allTasks = createMockVolunteerTasks(FAMILY_ID, NOW);
const allContacts = createMockSchoolContacts();
const allDocs = createMockVaultDocuments(FAMILY_ID, NOW);
const allMenus = createMockLunchMenus(24.5);
```

**Target State:**
```typescript
const session = await getSession();
const familyId = session.user.familyId;
const now = new Date();

// Fetch school-related data
const [
  schoolEvents,
  volunteerTasks,
  schoolContacts,
  vaultDocuments,
  lunchAccount
] = await Promise.all([
  db.schoolEvents.findByFamilyId(familyId),
  db.volunteerTasks.findByFamilyId(familyId),
  db.schoolContacts.findByFamilyId(familyId), // School directory
  db.vaultDocuments.findByFamilyId(familyId), // Forms, permission slips
  db.lunchAccounts.findByFamilyId(familyId) // Lunch balance + recent transactions
]);

// Filter active events (PTAEngine methods remain pure)
const upcomingEvents = PTAEngine.filterUpcomingEvents(schoolEvents, now);
const myTasks = PTAEngine.filterMyTasks(volunteerTasks, session.user.parentId);
```

**Dependencies:**
- School events table exists (migration 0005 complete)
- Volunteer tasks table exists (migration 0005 complete)
- New tables needed: school_contacts, vault_documents, lunch_accounts (migration 0011)

---

### 1.3 Data Ownership & Source of Truth

| Entity | Source of Truth | Write Pattern | Read Pattern | Cache Strategy |
|--------|----------------|---------------|--------------|----------------|
| **Users** | PostgreSQL `users` table | Register/update API | Session lookup, email auth | Redis session cache (15min TTL) |
| **Families** | PostgreSQL `families` table | Family setup wizard | Join via `family_members` | No cache (small dataset) |
| **Calendar Events** | PostgreSQL `calendar_events` | User-created or iCal sync | Date range queries | No cache (real-time critical) |
| **Custody Schedule** | PostgreSQL `custody_schedules.blocks` (JSONB) | Schedule wizard | Load at calendar render | Cache entire schedule (1hr TTL) |
| **Blog Posts** | PostgreSQL `blog_posts` table | CMS/admin import | Slug lookup, category filter | Full-page cache (1hr, purge on publish) |
| **School Events** | PostgreSQL `school_events` + iCal feed sync | iCal import + manual entry | Family-scoped query | No cache (frequent updates) |
| **Messages** | PostgreSQL `messages` + `hash_chain_links` | Real-time send via WebSocket | Thread-based pagination | No cache (integrity critical) |
| **Expenses** | PostgreSQL `expenses` table | User-created | Family-scoped query, date filter | No cache |
| **Subscriptions** | Stripe (source) + PostgreSQL cache | Stripe webhook → DB sync | Load from DB, verify with Stripe | Cache customer ID, revalidate on access |

**Write-Through Pattern (Stripe):**
1. User action → Call Stripe API
2. On success → Write to local DB
3. On failure → Rollback + show error
4. Webhook receives event → Upsert DB (idempotent)

**Read-Through Pattern (iCal Feeds):**
1. User requests calendar
2. If last_synced > 1hr → Trigger background sync job
3. Return current DB data immediately
4. Next refresh shows updated data

---

### 1.4 Rollout Strategy

**Feature Flags (Environment Variables):**
```bash
# Feature flags for gradual rollout
USE_MOCK_DASHBOARD=false      # Set to true to revert during incident
USE_MOCK_CALENDAR=false
USE_MOCK_BLOG=false
USE_MOCK_SCHOOL=false

# Service integrations
TWILIO_ENABLED=true           # Disable to stop SMS sends
STRIPE_ENABLED=true           # Disable to block new subscriptions
CLAUDE_ENABLED=true           # Disable to skip tone analysis
```

**Deployment Phases:**

| Phase | Duration | Scope | Rollback Trigger |
|-------|----------|-------|-----------------|
| **Phase 0: Pre-Production** | 1 week | Deploy to staging with real DB + test API keys | N/A |
| **Phase 1: Dark Launch** | 3 days | Deploy to prod with flags OFF, monitor logs | Error rate >1% |
| **Phase 2: Canary (10%)** | 2 days | Enable for 10% of users via session hash | Error rate >0.5% or complaint |
| **Phase 3: Ramp (50%)** | 3 days | Enable for 50% of users | Error rate >0.3% |
| **Phase 4: Full (100%)** | Ongoing | All users on real data | Immediate rollback if P0 incident |
| **Phase 5: Cleanup** | 1 week | Remove mock code, feature flags | N/A |

**Observability During Rollout:**
- **Metrics**: Track `db.query.duration`, `db.query.errors`, `mock_vs_real_data_served`
- **Logs**: Log every mock function call with `WARN` level in prod
- **Alerts**: Page on-call if mock usage >5% in prod after Phase 4

---

## 2. Data Model and Migrations

### 2.1 Existing Migrations (Already Implemented)

| Migration | Tables Created | Purpose |
|-----------|---------------|---------|
| **0001** | `users`, `sessions`, `families`, `family_members` | Auth + family foundation |
| **0002** | `password_reset_requests`, `phone_verifications`, `audit_logs`, `rate_limits` | Auth tokens + audit |
| **0003** | `parents`, `children`, `custody_schedules`, `calendar_events`, `schedule_change_requests`, `conflict_windows` | Calendar + custody |
| **0004** | `blog_posts`, `blog_categories` | Blog content |
| **0005** | `school_events`, `volunteer_tasks` | School/PTA integration |

### 2.2 Missing Tables (New Migrations Required)

#### Migration 0006: Expenses Module
```sql
-- Migration: 0006_expenses
-- Creates expenses, receipts, and payment tracking

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('medical', 'education', 'clothing', 'activity', 'childcare', 'other')),
  total_amount BIGINT NOT NULL CHECK (total_amount >= 0), -- cents
  currency TEXT NOT NULL DEFAULT 'USD',
  split_method TEXT NOT NULL CHECK (split_method IN ('50-50', 'custom', 'one-parent')),
  split_ratio JSONB, -- { "parentId1": 0.6, "parentId2": 0.4 }
  paid_by UUID NOT NULL REFERENCES parents(id),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'disputed')),
  receipt_url TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_family_id ON expenses(family_id);
CREATE INDEX idx_expenses_date ON expenses(family_id, date DESC);

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### Migration 0007: Messaging + Hash Chain
```sql
-- Migration: 0007_messaging
-- Creates messages, threads, and cryptographic hash chain

CREATE TABLE message_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES parents(id),
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  attachment_ids TEXT[] DEFAULT '{}',
  
  -- Tone analysis results (from Claude)
  tone_analysis JSONB, -- { "is_hostile": false, "indicators": [] }
  
  -- Hash chain linkage
  message_hash TEXT NOT NULL, -- SHA256 of message content + metadata
  previous_hash TEXT, -- Links to previous message in thread
  chain_index INT NOT NULL, -- Sequential position in thread
  
  UNIQUE (thread_id, chain_index)
);

CREATE INDEX idx_messages_thread_id ON messages(thread_id, sent_at);
CREATE INDEX idx_messages_family_id ON messages(family_id, sent_at DESC);

-- Hash chain verification helper
CREATE TABLE hash_chain_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES message_threads(id),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by UUID REFERENCES parents(id),
  is_valid BOOLEAN NOT NULL,
  tamper_detected_at_index INT,
  verification_report JSONB
);

CREATE INDEX idx_hash_chain_verifications_thread ON hash_chain_verifications(thread_id, verified_at DESC);
```

#### Migration 0008: Moments (Photo Sharing)
```sql
-- Migration: 0008_moments
-- Creates shared photo/video moments

CREATE TABLE moments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES parents(id),
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  caption TEXT,
  taken_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moment_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id),
  emoji TEXT NOT NULL,
  reacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (moment_id, parent_id)
);

CREATE INDEX idx_moments_family_id ON moments(family_id, created_at DESC);
CREATE INDEX idx_moment_reactions_moment_id ON moment_reactions(moment_id);
```

#### Migration 0009: Reminders
```sql
-- Migration: 0009_reminders
-- Creates personal reminders

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id),
  text TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reminders_parent_id ON reminders(parent_id, completed, due_at);
```

#### Migration 0010: Blog Engagement Analytics
```sql
-- Migration: 0010_blog_engagement
-- Tracks article reading sessions and engagement

CREATE TABLE blog_reading_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  reader_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL if anonymous
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scroll_percentage INT NOT NULL DEFAULT 0 CHECK (scroll_percentage BETWEEN 0 AND 100),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  time_spent_seconds INT NOT NULL DEFAULT 0,
  
  -- Session identification (for anonymous users)
  session_fingerprint TEXT
);

CREATE INDEX idx_blog_reading_sessions_post ON blog_reading_sessions(post_id, started_at DESC);
CREATE INDEX idx_blog_reading_sessions_reader ON blog_reading_sessions(reader_id) WHERE reader_id IS NOT NULL;

-- Materialized view for engagement metrics (refreshed hourly)
CREATE MATERIALIZED VIEW blog_engagement_metrics AS
SELECT 
  post_id,
  COUNT(*) AS view_count,
  COUNT(DISTINCT COALESCE(reader_id::TEXT, session_fingerprint)) AS unique_viewers,
  AVG(scroll_percentage) AS avg_scroll_percentage,
  AVG(time_spent_seconds) AS avg_time_spent_seconds,
  COUNT(*) FILTER (WHERE is_completed) AS completion_count
FROM blog_reading_sessions
GROUP BY post_id;

CREATE UNIQUE INDEX idx_blog_engagement_metrics_post ON blog_engagement_metrics(post_id);

-- Refresh function (called by cron job)
CREATE OR REPLACE FUNCTION refresh_blog_engagement_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY blog_engagement_metrics;
END;
$$ LANGUAGE plpgsql;
```

#### Migration 0011: School/PTA Extended
```sql
-- Migration: 0011_school_extended
-- Adds school contacts, vault documents, and lunch accounts

CREATE TABLE school_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'teacher', 'principal', 'nurse', 'counselor'
  email TEXT,
  phone TEXT,
  office_location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vault_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL, -- 'permission_slip', 'report_card', 'medical_form'
  file_url TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES parents(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  signed_by UUID[] DEFAULT '{}', -- Array of parent IDs
  due_date DATE
);

CREATE TABLE lunch_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  account_number TEXT,
  balance_cents INT NOT NULL DEFAULT 0,
  last_transaction_at TIMESTAMPTZ,
  auto_reload_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reload_threshold_cents INT,
  auto_reload_amount_cents INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, child_id)
);

CREATE TABLE lunch_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES lunch_accounts(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL, -- negative for purchases, positive for deposits
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'deposit', 'refund')),
  description TEXT,
  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_school_contacts_family ON school_contacts(family_id);
CREATE INDEX idx_vault_documents_family ON vault_documents(family_id, uploaded_at DESC);
CREATE INDEX idx_lunch_accounts_family ON lunch_accounts(family_id);
CREATE INDEX idx_lunch_transactions_account ON lunch_transactions(account_id, transaction_date DESC);
```

#### Migration 0012: Billing (Stripe Integration)
```sql
-- Migration: 0012_billing
-- Tracks Stripe subscriptions, invoices, and payment methods

CREATE TABLE stripe_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('essential', 'plus', 'complete')),
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount_due BIGINT NOT NULL, -- cents
  amount_paid BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  invoice_pdf TEXT,
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_customers_user ON stripe_customers(user_id);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status) WHERE status IN ('active', 'past_due');
CREATE INDEX idx_invoices_user ON invoices(user_id, created_at DESC);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed, created_at) WHERE NOT processed;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.3 Migration Backfill Strategy

**For existing production data (if any):**

1. **Users → Stripe Customers** (Migration 0012)
   ```sql
   -- Run after migration, before enabling billing
   -- Creates Stripe customers for existing users via background job
   -- Handled by: scripts/backfill-stripe-customers.ts
   ```

2. **Blog Posts → Engagement Metrics** (Migration 0010)
   ```sql
   -- Initialize view counts from existing posts
   INSERT INTO blog_reading_sessions (post_id, reader_id, started_at, is_completed)
   SELECT id, NULL, published_at, TRUE
   FROM blog_posts
   WHERE view_count > 0;
   ```

3. **Families → Default Settings** (Use existing conflict_windows table)
   ```sql
   -- Ensure all families have conflict window settings
   INSERT INTO conflict_windows (family_id, window_mins)
   SELECT id, 120 FROM families
   WHERE id NOT IN (SELECT family_id FROM conflict_windows);
   ```

### 2.4 Multi-Tenant Scoping Rules

**Enforcement Strategy:**

1. **Database Level**: Every tenant-scoped table has `family_id` column + index
2. **Repository Level**: All query methods accept `familyId` parameter first
3. **Row-Level Security (RLS)**: Enable PostgreSQL RLS for defense-in-depth

```sql
-- Example RLS policy for calendar_events
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_isolation
  ON calendar_events
  FOR ALL
  USING (family_id = current_setting('app.current_family_id')::UUID);

-- Set context in session
SELECT set_config('app.current_family_id', 'family-uuid-here', false);
```

**Application-Level Guards:**

```typescript
// In every repository method
export async function findByFamilyId(familyId: string): Promise<Event[]> {
  // Set RLS context
  await sql`SELECT set_config('app.current_family_id', ${familyId}, false)`;
  
  // Query with explicit filter
  const rows = await sql`
    SELECT * FROM calendar_events 
    WHERE family_id = ${familyId}
    ORDER BY start_at
  `;
  
  return rows.map(mapRowToEvent);
}
```

**Session Validation:**

```typescript
// In middleware.ts
export async function middleware(req: NextRequest) {
  const session = await getSession(req);
  
  // Ensure user can only access their family's data
  const requestedFamilyId = extractFamilyIdFromPath(req.nextUrl.pathname);
  if (requestedFamilyId && requestedFamilyId !== session.user.familyId) {
    return new Response('Forbidden', { status: 403 });
  }
  
  return NextResponse.next();
}
```

---

## 3. Application Surface and Routing Changes

### 3.1 URL Search Params Strategy

**Pattern: Use search params for filtering/pagination, not route params**

| Page | URL Pattern | Params | Example |
|------|-------------|--------|---------|
| **Blog List** | `/blog` | `category`, `page` | `/blog?category=custody_tips&page=2` |
| **Blog Post** | `/blog/[slug]` | - | `/blog/alternating-weeks-custody-schedule` |
| **Calendar** | `/calendar` | `year`, `month` | `/calendar?year=2026&month=3` |
| **Change Request** | `/calendar/change-request` | (form state params on validation error) | `/calendar/change-request?startDate=2026-03-15&error=invalid` |
| **School** | `/school` | `tab` | `/school?tab=events` |
| **Dashboard** | `/dashboard` | - | `/dashboard` |

**Rationale:**
- Search params are stateless and shareable
- Easy to parse in Server Components
- No client-side routing complexity

### 3.2 Client/Server Boundary

**Current State:** Most pages are Server Components with inline server actions

**Changes Needed:**

#### Contact Search (School Page)
**Problem:** Filter contacts by name in real-time requires client interactivity

**Solution:** Extract to Client Component wrapper
```typescript
// app/school/_components/contact-search.tsx (new file)
'use client';

import { useState } from 'react';

export function ContactSearch({ contacts }: { contacts: SchoolContact[] }) {
  const [query, setQuery] = useState('');
  
  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.role.toLowerCase().includes(query.toLowerCase())
  );
  
  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search contacts..."
      />
      <ContactList contacts={filtered} />
    </>
  );
}
```

```typescript
// app/school/page.tsx
import { ContactSearch } from './_components/contact-search';

export default async function SchoolPage() {
  const contacts = await db.schoolContacts.findByFamilyId(familyId);
  
  return (
    <>
      <ContactSearch contacts={contacts} />
      {/* Rest of server-rendered content */}
    </>
  );
}
```

#### Blog Search (Global)
**Implementation:** Use Server Action for search, debounce client-side

```typescript
// app/_components/global-search.tsx
'use client';

import { useTransition } from 'react';
import { searchContent } from '@/app/actions/search';

export function GlobalSearch() {
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState([]);
  
  const handleSearch = useDebouncedCallback((query: string) => {
    startTransition(async () => {
      const hits = await searchContent(query);
      setResults(hits);
    });
  }, 300);
  
  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isPending && <Spinner />}
      <SearchResults results={results} />
    </>
  );
}
```

### 3.3 Server Action: Sync School Calendar

**Requirement:** Import school events from iCal feeds (Google Calendar, district calendars)

**Implementation:**

```typescript
// app/school/actions.ts
'use server';

import ical from 'ical';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/persistence';
import { getSession } from '@/lib/auth';

export async function syncSchoolCalendar(feedUrl: string) {
  const session = await getSession();
  const familyId = session.user.familyId;
  
  // Fetch iCal feed
  const response = await fetch(feedUrl, {
    headers: { 'User-Agent': 'KidSchedule/1.0' }
  });
  
  if (!response.ok) {
    return { success: false, error: 'Failed to fetch calendar feed' };
  }
  
  const icalData = await response.text();
  const parsed = ical.parseICS(icalData);
  
  // Extract events
  const events = Object.values(parsed)
    .filter((item): item is ical.VEvent => item.type === 'VEVENT')
    .map(event => ({
      familyId,
      title: event.summary || 'Untitled Event',
      description: event.description,
      startAt: event.start.toISOString(),
      endAt: event.end.toISOString(),
      allDay: !event.start.dateOnly ? false : true,
      category: 'school' as const,
      source: 'ical_import',
      externalId: event.uid,
      createdBy: session.user.parentId,
      confirmationStatus: 'confirmed' as const
    }));
  
  // Upsert events (idempotent via externalId + startAt unique constraint)
  let imported = 0;
  for (const event of events) {
    try {
      await db.calendarEvents.upsertByExternalId(event);
      imported++;
    } catch (error) {
      console.error('Failed to import event', event.title, error);
    }
  }
  
  // Revalidate calendar page cache
  revalidatePath('/calendar');
  revalidatePath('/school');
  
  return { success: true, imported };
}
```

**Deduplication Strategy:**
- Use `external_id` + `start_at` as uniqueness constraint
- Update existing events if `last_synced_at` is older than feed modification time
- Delete local events not present in feed (configurable)

**Time Zone Handling:**
- Parse iCal `DTSTART` with `TZID` parameter
- Convert all times to UTC for storage
- Render in user's local timezone via `Intl.DateTimeFormat`

**Daylight Saving Transitions:**
- Use `date-fns-tz` for robust timezone conversions
- Store recurring rules in iCal `RRULE` format
- Expand recurrences at query time (not storage time)

---

## 4. Service Integrations (Implementation Specs)

### 4.1 Twilio Integration

#### A. Phone Verification (Twilio Verify API)

**File:** `lib/providers/sms/twilio-verify.ts`

```typescript
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID!;

const client = twilio(accountSid, authToken);

export async function startVerification(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Pre-validate phone format (E.164)
    if (!phoneNumber.match(/^\+\d{10,15}$/)) {
      return { success: false, error: 'Invalid phone number format' };
    }
    
    const verification = await client.verify.v2
      .services(verifySid)
      .verifications.create({
        to: phoneNumber,
        channel: 'sms'
      });
    
    console.info('[Twilio] Verification sent', { sid: verification.sid, to: maskPhone(phoneNumber) });
    
    return { success: verification.status === 'pending' };
  } catch (error: any) {
    if (error.code === 429) {
      // Rate limited - use exponential backoff
      await sleep(1000);
      return startVerification(phoneNumber); // Retry once
    }
    
    if (error.code === 21211) {
      return { success: false, error: 'Invalid phone number' };
    }
    
    console.error('[Twilio] Verification failed', { error: error.message, code: error.code });
    return { success: false, error: 'Verification service unavailable' };
  }
}

export async function checkVerification(
  phoneNumber: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const check = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({
        to: phoneNumber,
        code
      });
    
    if (check.status === 'approved') {
      console.info('[Twilio] Verification approved', { to: maskPhone(phoneNumber) });
      return { success: true };
    }
    
    return { success: false, error: 'Invalid or expired code' };
  } catch (error: any) {
    console.error('[Twilio] Verification check failed', { error: error.message });
    return { success: false, error: 'Verification failed' };
  }
}

function maskPhone(phone: string): string {
  return phone.replace(/(\+\d{1,3})\d+(\d{4})/, '$1****$2');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Integration Points:**
- `app/(auth)/verify-phone/page.tsx` → Start verification
- `app/(auth)/verify-phone/confirm/page.tsx` → Check code
- `lib/persistence/postgres/phone-verification-repository.ts` → Store verification status

**Error Handling Matrix:**

| Error Code | Meaning | Action |
|-----------|---------|--------|
| 429 | Rate limited | Exponential backoff (1s, 2s, 4s, 8s), max 3 retries |
| 20003 | Permission denied | Log alert, check Twilio account permissions |
| 21211 | Invalid phone number | Validate format before API call, return user error |
| 21408 | Invalid code | Allow 3 attempts, then lock for 10 minutes |
| 60200 | Max check attempts reached | Return "Too many attempts, request new code" |
| 5xx | Server error | Retry with backoff, fallback to email verification |

**Logging Strategy:**
```typescript
// Log all requests with PII redaction
console.info('[Twilio]', {
  action: 'verification.start',
  to: maskPhone(phoneNumber),
  sid: verification.sid,
  duration: performance.now() - startTime
});

// Never log: full phone numbers, verification codes, auth tokens
```

---

#### B. SMS Notifications

**File:** `lib/providers/sms/twilio-adapter.ts` (already exists, enhance)

**Use Cases:**
- Custody transition reminders (1 hour before)
- Urgent message notifications
- Schedule change request alerts

**Template System:**
```typescript
const SMS_TEMPLATES = {
  CUSTODY_TRANSITION: (parentName: string, time: string) =>
    `Reminder: Custody transition to ${parentName} at ${time}. Have a great time with the kids!`,
  
  URGENT_MESSAGE: (senderName: string) =>
    `New urgent message from ${senderName}. Open KidSchedule to view.`,
  
  SCHEDULE_CHANGE: (requesterName: string, date: string) =>
    `${requesterName} requested a schedule change for ${date}. Review in KidSchedule.`
};

export async function sendTransitionReminder(
  to: string,
  parentName: string,
  transitionTime: Date
): Promise<SmsSendResult> {
  const formattedTime = transitionTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York' // Use family timezone
  });
  
  return sendSms({
    to,
    body: SMS_TEMPLATES.CUSTODY_TRANSITION(parentName, formattedTime),
    from: process.env.TWILIO_MESSAGING_SERVICE_SID
  });
}

async function sendSms(options: {
  to: string;
  body: string;
  from: string;
}): Promise<SmsSendResult> {
  try {
    const message = await client.messages.create(options);
    
    return {
      success: true,
      messageId: message.sid
    };
  } catch (error: any) {
    // Handle delivery errors
    return {
      success: false,
      error: error.message,
      errorCode: error.code
    };
  }
}
```

**Delivery Status Tracking:**
```typescript
// Webhook endpoint: POST /api/webhooks/twilio/delivery-status
export async function handleDeliveryStatus(req: Request) {
  const sig = req.headers.get('X-Twilio-Signature');
  const body = await req.text();
  
  // Verify webhook signature
  if (!verifyTwilioSignature(sig, body, process.env.TWILIO_AUTH_TOKEN!)) {
    return new Response('Invalid signature', { status: 403 });
  }
  
  const params = new URLSearchParams(body);
  const messageSid = params.get('MessageSid');
  const status = params.get('MessageStatus'); // delivered, failed, undelivered
  
  // Update database
  await db.smsDeliveries.updateStatus(messageSid, status);
  
  return new Response('OK', { status: 200 });
}
```

---

#### C. SMS Proxy (Twilio Proxy)

**Purpose:** Allow parents to message each other via masked phone numbers (privacy protection)

**File:** `lib/providers/sms/twilio-proxy.ts`

```typescript
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const proxyServiceSid = process.env.TWILIO_PROXY_SERVICE_SID!;

export async function createProxySession(familyId: string): Promise<string> {
  const session = await client.proxy.v1
    .services(proxyServiceSid)
    .sessions.create({
      uniqueName: `family-${familyId}`,
      mode: 'message-only',
      ttl: 86400 * 365 // 1 year
    });
  
  return session.sid;
}

export async function addParticipant(
  sessionSid: string,
  phoneNumber: string,
  identifier: string
): Promise<void> {
  await client.proxy.v1
    .services(proxyServiceSid)
    .sessions(sessionSid)
    .participants.create({
      identifier,
      friendlyName: identifier,
      phoneNumber
    });
}

// Webhook handler: POST /api/webhooks/twilio/incoming
export async function handleIncomingSms(req: Request) {
  const sig = req.headers.get('X-Twilio-Signature');
  const body = await req.text();
  
  // Verify signature
  if (!verifyTwilioSignature(sig, body, process.env.TWILIO_AUTH_TOKEN!)) {
    return new Response('Forbidden', { status: 403 });
  }
  
  const params = new URLSearchParams(body);
  const from = params.get('From');
  const to = params.get('To');
  const messageBody = params.get('Body');
  
  // Look up family by proxy number
  const family = await db.families.findByProxyNumber(to);
  if (!family) {
    return new Response('Unknown recipient', { status: 404 });
  }
  
  // Identify sender
  const sender = await db.parents.findByPhone(from);
  if (!sender || sender.familyId !== family.id) {
    return new Response('Unauthorized sender', { status: 403 });
  }
  
  // Store message in database (adds to hash chain)
  const recipient = family.parents.find(p => p.id !== sender.id);
  await db.messages.create({
    familyId: family.id,
    senderId: sender.id,
    body: messageBody,
    sentAt: new Date().toISOString(),
    source: 'sms_relay'
  });
  
  // Send push notification to recipient (optional)
  await sendPushNotification(recipient.userId, {
    title: `Message from ${sender.name}`,
    body: messageBody.substring(0, 100)
  });
  
  return new Response('Message received', { status: 200 });
}

function verifyTwilioSignature(signature: string, body: string, authToken: string): boolean {
  const expectedSig = twilio.validateRequest(
    authToken,
    signature,
    process.env.NEXT_PUBLIC_APP_URL + '/api/webhooks/twilio/incoming',
    Object.fromEntries(new URLSearchParams(body))
  );
  
  return expectedSig;
}
```

**Setup Flow:**
1. Family onboarding → Call `createProxySession(familyId)`
2. For each parent → Call `addParticipant(session, phone, parentId)`
3. Store proxy session SID in `families.proxy_session_sid` column (add in migration 0013)
4. Configure webhook URL in Twilio Console → Point to `/api/webhooks/twilio/incoming`

---

### 4.2 Stripe Integration

#### A. Customer Creation (at Registration)

**File:** `lib/providers/billing/stripe-adapter.ts`

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
});

export async function createCustomer(input: {
  email: string;
  name: string;
  userId: string;
}): Promise<{ customerId: string }> {
  try {
    const customer = await stripe.customers.create({
      email: input.email,
      name: input.name,
      metadata: {
        userId: input.userId,
        source: 'kidschedule_app'
      }
    });
    
    // Store customer ID in database
    await db.stripeCustomers.create({
      userId: input.userId,
      stripeCustomerId: customer.id
    });
    
    console.info('[Stripe] Customer created', { customerId: customer.id });
    
    return { customerId: customer.id };
  } catch (error: any) {
    console.error('[Stripe] Customer creation failed', { error: error.message });
    throw new Error('Failed to create billing account');
  }
}
```

**Integration Point:**
- Call during `POST /api/auth/register` after user creation
- Handle failures gracefully (billing is not critical for registration)
- Retry customer creation on first subscription attempt if missing

---

#### B. Subscription Management

**Create Subscription:**
```typescript
export async function createSubscription(input: {
  userId: string;
  planTier: 'essential' | 'plus' | 'complete';
}): Promise<{ subscriptionId: string; clientSecret: string }> {
  const customer = await db.stripeCustomers.findByUserId(input.userId);
  if (!customer) {
    throw new Error('Customer not found');
  }
  
  const priceId = PRICE_IDS[input.planTier];
  
  const subscription = await stripe.subscriptions.create({
    customer: customer.stripeCustomerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription'
    },
    expand: ['latest_invoice.payment_intent']
  });
  
  // Store in database
  await db.subscriptions.create({
    userId: input.userId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customer.stripeCustomerId,
    planTier: input.planTier,
    status: subscription.status,
    currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
  });
  
  const invoice = subscription.latest_invoice as Stripe.Invoice;
  const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;
  
  return {
    subscriptionId: subscription.id,
    clientSecret: paymentIntent.client_secret!
  };
}

const PRICE_IDS = {
  essential: process.env.STRIPE_PRICE_ESSENTIAL!,
  plus: process.env.STRIPE_PRICE_PLUS!,
  complete: process.env.STRIPE_PRICE_COMPLETE!
};
```

**Update Subscription (Upgrade/Downgrade):**
```typescript
export async function updateSubscriptionPlan(
  subscriptionId: string,
  newPlanTier: 'essential' | 'plus' | 'complete'
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const currentItemId = subscription.items.data[0].id;
  
  await stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: currentItemId,
      price: PRICE_IDS[newPlanTier]
    }],
    proration_behavior: 'always_invoice' // Immediate proration
  });
  
  // Update database
  await db.subscriptions.update(subscriptionId, { planTier: newPlanTier });
}
```

**Cancel Subscription:**
```typescript
export async function cancelSubscription(
  subscriptionId: string,
  immediate: boolean = false
): Promise<void> {
  if (immediate) {
    await stripe.subscriptions.cancel(subscriptionId);
  } else {
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });
  }
  
  // Update database
  await db.subscriptions.update(subscriptionId, {
    cancelAtPeriodEnd: !immediate,
    status: immediate ? 'canceled' : 'active'
  });
}
```

---

#### C. Checkout Session (New Subscriptions)

**File:** `app/api/billing/checkout/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
});

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { planTier } = await req.json();
  
  const customer = await db.stripeCustomers.findByUserId(session.user.id);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }
  
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customer.stripeCustomerId,
    mode: 'subscription',
    line_items: [{
      price: PRICE_IDS[planTier],
      quantity: 1
    }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    metadata: {
      userId: session.user.id,
      planTier
    }
  });
  
  return NextResponse.json({ url: checkoutSession.url });
}
```

---

#### D. Billing Portal (Customer Self-Service)

**File:** `app/api/billing/portal/route.ts`

```typescript
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const customer = await db.stripeCustomers.findByUserId(session.user.id);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }
  
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`
  });
  
  return NextResponse.json({ url: portalSession.url });
}
```

**Portal Features:**
- Update payment method
- View invoices
- Download receipts
- Cancel subscription
- Update billing address

---

#### E. Webhook Handler

**File:** `app/api/webhooks/stripe/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/persistence';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('[Stripe] Webhook signature verification failed', { error: err.message });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  
  // Check for duplicate events (idempotency)
  const existing = await db.webhookEvents.findByStripeEventId(event.id);
  if (existing) {
    console.info('[Stripe] Duplicate event ignored', { eventId: event.id });
    return NextResponse.json({ received: true, duplicate: true });
  }
  
  // Store event
  await db.webhookEvents.create({
    stripeEventId: event.id,
    eventType: event.type,
    payload: event.data.object,
    processed: false
  });
  
  // Process event
  try {
    await handleStripeEvent(event);
    await db.webhookEvents.markProcessed(event.id);
  } catch (error: any) {
    console.error('[Stripe] Webhook processing failed', { eventId: event.id, error: error.message });
    await db.webhookEvents.markError(event.id, error.message);
    // Return 200 to avoid retries for application errors
  }
  
  return NextResponse.json({ received: true });
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const planTier = session.metadata?.planTier;
      
      // Activate subscription
      await db.subscriptions.create({
        userId,
        stripeSubscriptionId: session.subscription as string,
        stripeCustomerId: session.customer as string,
        planTier,
        status: 'active',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
      
      console.info('[Stripe] Subscription activated', { userId, planTier });
      break;
    }
    
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      
      // Update subscription period
      await db.subscriptions.updateByStripeId(invoice.subscription as string, {
        status: 'active',
        currentPeriodEnd: new Date(invoice.period_end * 1000).toISOString()
      });
      
      // Store invoice
      await db.invoices.create({
        userId: invoice.metadata?.userId,
        stripeInvoiceId: invoice.id,
        subscriptionId: invoice.subscription as string,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        status: 'paid',
        invoicePdf: invoice.invoice_pdf,
        paidAt: new Date(invoice.status_transitions.paid_at! * 1000).toISOString()
      });
      
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      
      // Mark subscription as past_due
      await db.subscriptions.updateByStripeId(invoice.subscription as string, {
        status: 'past_due'
      });
      
      // Send notification email
      const subscription = await db.subscriptions.findByStripeId(invoice.subscription as string);
      if (subscription) {
        await sendPaymentFailedEmail(subscription.userId, invoice.hosted_invoice_url);
      }
      
      break;
    }
    
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      
      // Sync status and plan changes
      await db.subscriptions.updateByStripeId(subscription.id, {
        status: subscription.status,
        planTier: extractPlanTier(subscription.items.data[0].price.id),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
      });
      
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      
      // Mark as canceled, downgrade to free tier
      await db.subscriptions.updateByStripeId(subscription.id, {
        status: 'canceled'
      });
      
      // Downgrade features
      const dbSub = await db.subscriptions.findByStripeId(subscription.id);
      if (dbSub) {
        await downgradeUserToFreeTier(dbSub.userId);
      }
      
      break;
    }
    
    default:
      console.info('[Stripe] Unhandled event type', { type: event.type });
  }
}

function extractPlanTier(priceId: string): 'essential' | 'plus' | 'complete' {
  if (priceId === process.env.STRIPE_PRICE_ESSENTIAL) return 'essential';
  if (priceId === process.env.STRIPE_PRICE_PLUS) return 'plus';
  if (priceId === process.env.STRIPE_PRICE_COMPLETE) return 'complete';
  throw new Error(`Unknown price ID: ${priceId}`);
}

async function sendPaymentFailedEmail(userId: string, invoiceUrl: string) {
  const user = await db.users.findById(userId);
  if (!user) return;
  
  await emailSender.send({
    to: user.email,
    subject: 'Payment Failed - Update Your Payment Method',
    templateId: 'payment-failed',
    variables: {
      userName: user.fullName,
      invoiceUrl
    }
  });
}

async function downgradeUserToFreeTier(userId: string) {
  // Disable premium features
  await db.users.update(userId, {
    featureTier: 'free'
  });
  
  // Send notification
  const user = await db.users.findById(userId);
  if (user) {
    await emailSender.send({
      to: user.email,
      subject: 'Subscription Canceled',
      templateId: 'subscription-canceled',
      variables: {
        userName: user.fullName
      }
    });
  }
}
```

**Webhook Configuration:**
1. Stripe Dashboard → Webhooks → Add endpoint
2. URL: `https://your-domain.com/api/webhooks/stripe`
3. Events: Select all subscription and invoice events
4. Copy signing secret → Set `STRIPE_WEBHOOK_SECRET` env var

**Replay Protection:**
- Store `event.id` in `webhook_events` table
- Check for duplicates before processing
- Stripe automatically retries failed webhooks (exponential backoff)

---

#### F. Pricing Tiers

**Environment Variables:**
```bash
STRIPE_PRICE_ESSENTIAL=price_1234567890_essential_monthly
STRIPE_PRICE_PLUS=price_1234567890_plus_monthly
STRIPE_PRICE_COMPLETE=price_1234567890_complete_monthly
```

**Feature Matrix:**

| Feature | Essential ($5.99) | Plus ($8.99) | Complete ($11.99) |
|---------|------------------|--------------|-------------------|
| Calendar + Custody | ✅ | ✅ | ✅ |
| Basic Messaging | ✅ | ✅ | ✅ |
| Expense Tracking | ✅ | ✅ | ✅ |
| School Events | ❌ | ✅ | ✅ |
| Moments (Photos) | ❌ | ✅ | ✅ |
| AI Tone Analysis | ❌ | ✅ | ✅ |
| Court-Ready Exports | ❌ | ❌ | ✅ |
| SMS Relay | ❌ | ❌ | ✅ |
| Priority Support | ❌ | ❌ | ✅ |

**Enforcement:**
```typescript
// middleware.ts
export async function middleware(req: NextRequest) {
  const session = await getSession(req);
  const pathname = req.nextUrl.pathname;
  
  // Check tier access
  if (pathname.startsWith('/school') && !hasFeature(session.user.featureTier, 'school_events')) {
    return NextResponse.redirect(new URL('/pricing?upgrade=school', req.url));
  }
  
  if (pathname.startsWith('/mediation/export') && !hasFeature(session.user.featureTier, 'court_exports')) {
    return NextResponse.redirect(new URL('/pricing?upgrade=exports', req.url));
  }
  
  return NextResponse.next();
}

function hasFeature(tier: string, feature: string): boolean {
  const FEATURES = {
    school_events: ['plus', 'complete'],
    court_exports: ['complete'],
    sms_relay: ['complete']
  };
  
  return FEATURES[feature]?.includes(tier) ?? false;
}
```

---

### 4.3 Claude (Anthropic) Integration

#### A. Tone Analysis (Pre-Send)

**File:** `lib/providers/ai/claude-adapter.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
});

export interface ToneAnalysisResult {
  isHostile: boolean;
  indicators: string[];
  neutralRewrite?: string;
  conflictLevel: 'low' | 'medium' | 'high';
}

export async function analyzeMessageTone(messageText: string): Promise<ToneAnalysisResult> {
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1024,
    system: `You are a co-parenting communication analyst. Analyze the tone of messages for:
- Hostile language (insults, accusations, threats)
- Passive-aggressive statements
- Blame-shifting or victim language
- All-caps shouting
- Excessive punctuation (!!!, ???)

Return JSON with:
{
  "is_hostile": boolean,
  "indicators": ["specific problematic phrases"],
  "neutral_rewrite": "suggested neutral version",
  "conflict_level": "low" | "medium" | "high"
}

Be strict but fair. Co-parents may be stressed, so minor frustration is acceptable.`,
    messages: [{
      role: 'user',
      content: `Analyze this message:\n\n"${messageText}"`
    }]
  });
  
  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('Unexpected response format from Claude');
  }
  
  try {
    const result = JSON.parse(textContent.text);
    
    return {
      isHostile: result.is_hostile,
      indicators: result.indicators || [],
      neutralRewrite: result.neutral_rewrite,
      conflictLevel: result.conflict_level || 'low'
    };
  } catch (error) {
    console.error('[Claude] Failed to parse tone analysis', { error });
    // Fail open (allow message) rather than fail closed
    return {
      isHostile: false,
      indicators: [],
      conflictLevel: 'low'
    };
  }
}
```

**Integration Point:**
```typescript
// app/messages/actions.ts
'use server';

import { analyzeMessageTone } from '@/lib/providers/ai/claude-adapter';

export async function sendMessage(formData: FormData) {
  const messageText = formData.get('message') as string;
  const session = await getSession();
  
  // Run tone analysis
  const toneAnalysis = await analyzeMessageTone(messageText);
  
  if (toneAnalysis.isHostile) {
    // Block message, show rewrite suggestion
    return {
      success: false,
      error: 'This message may escalate conflict. Consider revising.',
      indicators: toneAnalysis.indicators,
      suggestion: toneAnalysis.neutralRewrite
    };
  }
  
  // Store message with tone analysis attached
  await db.messages.create({
    familyId: session.user.familyId,
    senderId: session.user.parentId,
    body: messageText,
    sentAt: new Date().toISOString(),
    toneAnalysis: toneAnalysis
  });
  
  return { success: true };
}
```

**User Experience:**
- Non-blocking for `conflictLevel: 'low'` (just store analysis)
- Show warning modal for `conflictLevel: 'medium'` (can override)
- Block send for `conflictLevel: 'high'` (must revise or use neutral rewrite)

---

#### B. Mediation Assistant

**File:** `lib/providers/ai/mediation-assistant.ts`

```typescript
export interface MediationSuggestion {
  conflictLevel: 'low' | 'medium' | 'high';
  prompts: string[];
  recommendations: string[];
  deescalationTips: string[];
}

export async function analyzeMediationNeeds(
  recentMessages: { body: string; sentAt: string; senderId: string }[]
): Promise<MediationSuggestion> {
  const conversationHistory = recentMessages
    .map(m => `[${m.sentAt}] ${m.senderId}: ${m.body}`)
    .join('\n');
  
  const response = await anthropic.messages.create({
    model: 'claude-3-sonnet-20240229',
    max_tokens: 2048,
    system: `You are a family mediator specializing in high-conflict co-parenting situations. 
Analyze the conversation history and provide:
1. Conflict level assessment (low/medium/high)
2. Specific prompts to de-escalate tension
3. Recommendations for improving communication
4. Tips for the current situation

Return JSON format.`,
    messages: [{
      role: 'user',
      content: `Analyze this conversation and suggest mediation strategies:\n\n${conversationHistory}`
    }]
  });
  
  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('Unexpected response');
  }
  
  const result = JSON.parse(textContent.text);
  
  return {
    conflictLevel: result.conflict_level,
    prompts: result.prompts || [],
    recommendations: result.recommendations || [],
    deescalationTips: result.deescalation_tips || []
  };
}
```

**Usage:**
- Triggered automatically when conflict level stays "high" for 3+ consecutive messages
- Display in sidebar: "Need help? Here are some communication tips..."
- Optional manual trigger: "Get mediation suggestions" button

---

#### C. Rate Limiting & Circuit Breaker

**Implementation:**

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
  analytics: true
});

export async function analyzeMessageToneWithRateLimit(
  userId: string,
  messageText: string
): Promise<ToneAnalysisResult> {
  // Check rate limit
  const { success, remaining } = await ratelimit.limit(`claude:${userId}`);
  
  if (!success) {
    console.warn('[Claude] Rate limit exceeded', { userId });
    // Fail open (allow message without analysis)
    return {
      isHostile: false,
      indicators: [],
      conflictLevel: 'low'
    };
  }
  
  // Circuit breaker: check error rate
  const errorRate = await getClaudeErrorRate();
  if (errorRate > 0.5) {
    console.error('[Claude] Circuit breaker open, error rate too high');
    return {
      isHostile: false,
      indicators: [],
      conflictLevel: 'low'
    };
  }
  
  try {
    return await analyzeMessageTone(messageText);
  } catch (error: any) {
    // Handle 429 rate limit from Anthropic
    if (error.status === 429) {
      const retryAfter = parseInt(error.headers['retry-after'] || '60');
      console.warn('[Claude] Rate limited by API', { retryAfter });
      
      // Exponential backoff
      await sleep(retryAfter * 1000);
      return await analyzeMessageTone(messageText);
    }
    
    // Log error and fail open
    await incrementClaudeErrorCount();
    console.error('[Claude] Analysis failed', { error: error.message });
    
    return {
      isHostile: false,
      indicators: [],
      conflictLevel: 'low'
    };
  }
}

async function getClaudeErrorRate(): Promise<number> {
  const total = await redis.get('claude:requests:total') || 1;
  const errors = await redis.get('claude:requests:errors') || 0;
  return errors / total;
}

async function incrementClaudeErrorCount() {
  await redis.incr('claude:requests:errors');
  await redis.expire('claude:requests:errors', 300); // 5 min window
}
```

**Observability:**
- Track request count, error rate, latency
- Alert if error rate >20% over 5 minutes
- Dashboard showing: tokens used, cost estimate, success rate

---

#### D. Cost Management

**Token Usage Tracking:**
```typescript
export async function analyzeMessageTone(messageText: string): Promise<ToneAnalysisResult> {
  const startTime = performance.now();
  
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1024,
    // ... rest of config
  });
  
  const duration = performance.now() - startTime;
  
  // Log usage for cost tracking
  await db.aiUsage.create({
    model: 'claude-3-haiku',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs: duration,
    estimatedCostCents: calculateCost(response.usage)
  });
  
  // ... parse and return result
}

function calculateCost(usage: { input_tokens: number; output_tokens: number }): number {
  // Claude 3 Haiku pricing (as of 2024)
  const inputCostPer1M = 0.25; // $0.25 per 1M input tokens
  const outputCostPer1M = 1.25; // $1.25 per 1M output tokens
  
  const inputCost = (usage.input_tokens / 1_000_000) * inputCostPer1M;
  const outputCost = (usage.output_tokens / 1_000_000) * outputCostPer1M;
  
  return Math.ceil((inputCost + outputCost) * 100); // cents
}
```

**Cost Caps:**
- Set monthly budget: `AI_BUDGET_CENTS=50000` ($500/month)
- Check before each request: `if (monthlySpend >= budget) { skipAI(); }`
- Alert at 80% of budget

---

## 5. Security, Privacy, and Integrity Controls

### 5.1 Authentication & Authorization

#### JWT Token Management

**Token Structure:**
```typescript
interface AccessTokenPayload {
  userId: string;
  email: string;
  familyId: string;
  parentId: string;
  iat: number; // issued at
  exp: number; // expires at (15 minutes from iat)
}

interface RefreshTokenPayload {
  sessionId: string;
  userId: string;
  iat: number;
  exp: number; // expires at (30 days from iat)
}
```

**Implementation:**
```typescript
// lib/auth/jwt.ts
import * as jose from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET);
  return payload as AccessTokenPayload;
}

export async function signRefreshToken(payload: RefreshTokenPayload): Promise<string> {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}
```

**Token Refresh Flow:**
```typescript
// app/api/auth/refresh/route.ts
export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh_token')?.value;
  
  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }
  
  // Verify refresh token
  let payload: RefreshTokenPayload;
  try {
    const { payload: p } = await jose.jwtVerify(refreshToken, JWT_SECRET);
    payload = p as RefreshTokenPayload;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  
  // Look up session in database
  const session = await db.sessions.findById(payload.sessionId);
  
  if (!session || session.isRevoked || new Date(session.expiresAt) < new Date()) {
    return NextResponse.json({ error: 'Session invalid' }, { status: 401 });
  }
  
  // Generate new access token
  const user = await db.users.findById(payload.userId);
  const parent = await db.parents.findByUserId(user.id);
  const family = await db.families.findByParentUserId(user.id);
  
  const newAccessToken = await signAccessToken({
    userId: user.id,
    email: user.email,
    familyId: family.id,
    parentId: parent.id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900 // 15 minutes
  });
  
  // Rotate refresh token (optional security measure)
  const newRefreshToken = await signRefreshToken({
    sessionId: session.id,
    userId: user.id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor((Date.now() / 1000) + (30 * 24 * 60 * 60)) // 30 days
  });
  
  // Update session
  await db.sessions.rotate(session.id, hashToken(newRefreshToken), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
  
  // Set cookies
  const response = NextResponse.json({ success: true });
  response.cookies.set('access_token', newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 900 // 15 minutes
  });
  response.cookies.set('refresh_token', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  });
  
  return response;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

**Session Invalidation:**
```typescript
// Revoke all sessions for a user (on password change)
export async function revokeAllSessions(userId: string, reason: string): Promise<void> {
  await db.sessions.revokeAllForUser(userId, reason);
  
  // Log audit event
  await db.auditLogs.create({
    userId,
    action: 'sessions_revoked',
    details: { reason }
  });
}

// Revoke single session (on logout)
export async function revokeSession(sessionId: string): Promise<void> {
  await db.sessions.revoke(sessionId, 'user_logout');
}
```

**MFA (Optional):**
```typescript
// Enable MFA via Twilio Verify
export async function enableMfa(userId: string, phoneNumber: string): Promise<void> {
  const verification = await startVerification(phoneNumber);
  
  if (!verification.success) {
    throw new Error('Failed to start MFA verification');
  }
  
  await db.users.update(userId, {
    mfaEnabled: true,
    mfaPhone: phoneNumber
  });
}

// Check MFA on login
export async function loginWithMfa(email: string, password: string, mfaCode?: string): Promise<Session> {
  const user = await db.users.findByEmail(email);
  
  if (!user) {
    throw new Error('Invalid credentials');
  }
  
  // Verify password
  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    throw new Error('Invalid credentials');
  }
  
  // Check MFA if enabled
  if (user.mfaEnabled) {
    if (!mfaCode) {
      throw new Error('MFA code required');
    }
    
    const mfaValid = await checkVerification(user.mfaPhone, mfaCode);
    if (!mfaValid.success) {
      throw new Error('Invalid MFA code');
    }
  }
  
  // Create session
  return await createSession(user.id);
}
```

---

### 5.2 Messaging Hash Chain

**Integrity Guarantee:** Cryptographically link messages so tampering is detectable

**Implementation:**
```typescript
// lib/security/hash-chain.ts
import crypto from 'crypto';

export function computeMessageHash(input: {
  messageId: string;
  threadId: string;
  senderId: string;
  body: string;
  sentAt: string;
  previousHash: string | null;
  chainIndex: number;
}): string {
  const payload = [
    input.messageId,
    input.threadId,
    input.senderId,
    input.body,
    input.sentAt,
    input.previousHash || 'genesis',
    input.chainIndex.toString()
  ].join('|');
  
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export async function verifyHashChain(threadId: string): Promise<{
  isValid: boolean;
  tamperDetectedAt?: number;
}> {
  const messages = await db.messages.findByThreadId(threadId);
  
  if (messages.length === 0) {
    return { isValid: true };
  }
  
  let previousHash: string | null = null;
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    // Check chain index continuity
    if (msg.chainIndex !== i) {
      return { isValid: false, tamperDetectedAt: i };
    }
    
    // Recompute hash
    const expectedHash = computeMessageHash({
      messageId: msg.id,
      threadId: msg.threadId,
      senderId: msg.senderId,
      body: msg.body,
      sentAt: msg.sentAt,
      previousHash,
      chainIndex: i
    });
    
    if (msg.messageHash !== expectedHash) {
      return { isValid: false, tamperDetectedAt: i };
    }
    
    previousHash = msg.messageHash;
  }
  
  return { isValid: true };
}
```

**Usage:**
```typescript
// When creating a message
export async function createMessage(input: {
  threadId: string;
  senderId: string;
  body: string;
}): Promise<Message> {
  // Get previous message
  const previousMessage = await db.messages.findLastInThread(input.threadId);
  const chainIndex = previousMessage ? previousMessage.chainIndex + 1 : 0;
  
  const messageId = uuid();
  const sentAt = new Date().toISOString();
  
  // Compute hash
  const messageHash = computeMessageHash({
    messageId,
    threadId: input.threadId,
    senderId: input.senderId,
    body: input.body,
    sentAt,
    previousHash: previousMessage?.messageHash || null,
    chainIndex
  });
  
  // Store message
  return await db.messages.create({
    id: messageId,
    threadId: input.threadId,
    familyId: input.familyId,
    senderId: input.senderId,
    body: input.body,
    sentAt,
    messageHash,
    previousHash: previousMessage?.messageHash || null,
    chainIndex
  });
}

// When generating court export
export async function generateCourtExport(threadId: string): Promise<string> {
  // Verify chain integrity
  const verification = await verifyHashChain(threadId);
  
  if (!verification.isValid) {
    throw new Error(`Hash chain tampered at index ${verification.tamperDetectedAt}`);
  }
  
  // Generate PDF with QR code for verification
  const messages = await db.messages.findByThreadId(threadId);
  const pdfBuffer = await generatePdf(messages);
  
  return pdfBuffer;
}
```

**Testing:**
```typescript
// tests/hash-chain.test.ts
describe('Hash Chain', () => {
  it('detects tampering when message body is modified', async () => {
    // Create 3 messages
    const msg1 = await createMessage({ threadId: 'thread1', senderId: 'parent1', body: 'Hello' });
    const msg2 = await createMessage({ threadId: 'thread1', senderId: 'parent2', body: 'Hi there' });
    const msg3 = await createMessage({ threadId: 'thread1', senderId: 'parent1', body: 'How are you?' });
    
    // Verify chain is valid
    let verification = await verifyHashChain('thread1');
    expect(verification.isValid).toBe(true);
    
    // Tamper with message 2
    await db.query`UPDATE messages SET body = 'TAMPERED' WHERE id = ${msg2.id}`;
    
    // Verify chain is now invalid
    verification = await verifyHashChain('thread1');
    expect(verification.isValid).toBe(false);
    expect(verification.tamperDetectedAt).toBe(1);
  });
  
  it('detects if a message is deleted', async () => {
    const msg1 = await createMessage({ threadId: 'thread2', senderId: 'parent1', body: 'Message 1' });
    const msg2 = await createMessage({ threadId: 'thread2', senderId: 'parent2', body: 'Message 2' });
    const msg3 = await createMessage({ threadId: 'thread2', senderId: 'parent1', body: 'Message 3' });
    
    // Delete message 2
    await db.query`DELETE FROM messages WHERE id = ${msg2.id}`;
    
    // Verification should fail because chain index jumps from 0 to 2
    const verification = await verifyHashChain('thread2');
    expect(verification.isValid).toBe(false);
  });
});
```

**Target:** 100% line coverage for hash chain module (as specified in requirements)

---

### 5.3 Secrets Management

**Environment Variables:**
```bash
# Auth secrets (rotate every 90 days)
JWT_SECRET=your-256-bit-secret-here
SESSION_SECRET=your-session-secret-here

# Database
DATABASE_URL=postgresql://user:pass@host:5432/kidschedule

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_VERIFY_SERVICE_SID=VA...
TWILIO_PROXY_SERVICE_SID=KS...
TWILIO_MESSAGING_SERVICE_SID=MG...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ESSENTIAL=price_...
STRIPE_PRICE_PLUS=price_...
STRIPE_PRICE_COMPLETE=price_...

# Claude
ANTHROPIC_API_KEY=sk-ant-...

# App
NEXT_PUBLIC_APP_URL=https://kidschedule.com

# Redis (for rate limiting)
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...
```

**Rotation Strategy:**
- **JWT_SECRET**: Rotate every 90 days
  - Generate new secret
  - Deploy with both old and new (verify with either)
  - After 24 hours, remove old secret
  - All sessions auto-refreshed within token expiry window

- **Twilio/Stripe**: Rotate annually
  - Create new API keys in dashboard
  - Deploy with new keys
  - Revoke old keys after 1 week

- **Database credentials**: Rotate every 6 months
  - Use connection pooler (PgBouncer) for zero-downtime rotation

**Secret Storage:**
- **Development**: `.env.local` (gitignored)
- **Production**: Environment variables via hosting platform (Vercel)
- **Never commit**: Secrets in code, config files, or environment files

---

### 5.4 PII Protection

**At-Rest Encryption:**
```sql
-- Encrypt sensitive columns using pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Example: Encrypt phone numbers
ALTER TABLE users 
  ADD COLUMN phone_encrypted BYTEA;

-- Encryption function
CREATE OR REPLACE FUNCTION encrypt_phone(phone TEXT) RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(phone, current_setting('app.encryption_key'));
END;
$$ LANGUAGE plpgsql;

-- Decryption function
CREATE OR REPLACE FUNCTION decrypt_phone(encrypted BYTEA) RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(encrypted, current_setting('app.encryption_key'));
END;
$$ LANGUAGE plpgsql;
```

**In-Transit Encryption:**
- Force TLS for all database connections: `DATABASE_URL=postgresql://...?sslmode=require`
- HTTPS only for all HTTP endpoints (enforced in middleware)
- No unencrypted API calls to external services

**Logging Best Practices:**
```typescript
// lib/observability/logger.ts
export function logRequest(req: NextRequest) {
  console.info('[HTTP]', {
    method: req.method,
    path: maskSensitivePath(req.nextUrl.pathname),
    ip: maskIp(req.ip),
    userAgent: req.headers.get('user-agent')?.substring(0, 100),
    // Do NOT log: cookies, authorization headers, query params with tokens
  });
}

function maskSensitivePath(path: string): string {
  // Mask email in /api/auth/verify-email/[email]
  return path.replace(/\/[\w.+-]+@[\w.-]+\.\w+/, '/***@***.***');
}

function maskIp(ip?: string): string {
  if (!ip) return 'unknown';
  // Mask last octet: 192.168.1.* → 192.168.1.xxx
  return ip.replace(/\.\d+$/, '.xxx');
}

export function logDbQuery(query: string, params: any[]) {
  console.debug('[DB]', {
    query: query.substring(0, 200), // Truncate long queries
    // Do NOT log: param values (may contain PII)
    paramCount: params.length
  });
}
```

**PII Masking in Logs:**
```typescript
export function maskPhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/(\+\d{1,3})\d+(\d{4})/, '$1****$2');
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.substring(0, 2)}***@${domain}`;
}

export function maskSsn(ssn: string): string {
  return '***-**-' + ssn.slice(-4);
}
```

---

### 5.5 Webhook Security

**Signature Verification:**

```typescript
// Twilio webhook verification
import twilio from 'twilio';

export function verifyTwilioWebhook(req: NextRequest): boolean {
  const signature = req.headers.get('X-Twilio-Signature');
  const url = process.env.NEXT_PUBLIC_APP_URL + req.nextUrl.pathname;
  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature!,
    url,
    params
  );
}

// Stripe webhook verification
import Stripe from 'stripe';

export function verifyStripeWebhook(req: NextRequest): Stripe.Event | null {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  
  try {
    return stripe.webhooks.constructEvent(
      body,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed', err);
    return null;
  }
}
```

**Replay Protection:**
```typescript
// Store processed webhook event IDs
export async function handleWebhook(eventId: string, handler: () => Promise<void>) {
  // Check if already processed
  const existing = await db.webhookEvents.findByExternalId(eventId);
  if (existing) {
    console.info('[Webhook] Duplicate event ignored', { eventId });
    return;
  }
  
  // Process event
  await handler();
  
  // Mark as processed
  await db.webhookEvents.create({
    externalId: eventId,
    processedAt: new Date().toISOString()
  });
}
```

**Idempotency Keys:**
```typescript
// Use idempotency keys for all write operations triggered by webhooks
export async function processCheckoutComplete(session: Stripe.Checkout.Session) {
  const idempotencyKey = `checkout:${session.id}`;
  
  // Check if already processed
  const existing = await db.subscriptions.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return;
  }
  
  // Create subscription
  await db.subscriptions.create({
    idempotencyKey,
    // ... rest of data
  });
}
```

**Least-Privileged API Keys:**
- **Twilio**: Separate API keys for Verify, Messaging, Proxy
- **Stripe**: Restricted API key with only subscription + invoice permissions
- **Claude**: Separate API key per environment (dev, staging, prod)

---

## 6. Edge Cases to Address

### 6.1 Calendar & Custody

**Overlapping Exceptions:**

**Scenario:** Holiday override conflicts with recurring pattern + manual event

```typescript
export function resolveOverlappingEvents(
  events: CalendarEvent[],
  family: Family,
  date: Date
): CalendarEvent[] {
  // Priority order:
  // 1. Manual "custody" events (one-off swaps)
  // 2. Holiday exceptions
  // 3. Recurring pattern from custody schedule
  
  const sorted = events.sort((a, b) => {
    const priorityA = getEventPriority(a);
    const priorityB = getEventPriority(b);
    return priorityB - priorityA;
  });
  
  // Return highest priority event
  return [sorted[0]];
}

function getEventPriority(event: CalendarEvent): number {
  if (event.category === 'custody' && event.source === 'manual') return 3;
  if (event.category === 'holiday') return 2;
  if (event.category === 'custody' && event.source === 'schedule') return 1;
  return 0;
}
```

**Daylight Saving Transitions:**

```typescript
import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

export function calculateTransitionTime(
  date: Date,
  transitionHour: number,
  timezone: string = 'America/New_York'
): Date {
  // Create date at transition hour in family's timezone
  const localDate = new Date(date);
  localDate.setHours(transitionHour, 0, 0, 0);
  
  // Convert to UTC for storage
  return zonedTimeToUtc(localDate, timezone);
}

// When displaying transitions, convert back to family timezone
export function displayTransitionTime(utcDate: Date, timezone: string): string {
  const zonedDate = utcToZonedTime(utcDate, timezone);
  return format(zonedDate, 'h:mm a zzz', { timeZone: timezone });
}
```

**Recurring Event Expansion:**

```typescript
// Use RRule library for complex recurrences
import { RRule, RRuleSet } from 'rrule';

export function expandRecurringEvent(
  event: CalendarEvent,
  startDate: Date,
  endDate: Date
): CalendarEvent[] {
  if (!event.recurrenceRule) {
    return [event];
  }
  
  const rule = RRule.fromString(event.recurrenceRule);
  const occurrences = rule.between(startDate, endDate, true);
  
  return occurrences.map((date, index) => ({
    ...event,
    id: `${event.id}-${index}`,
    startAt: date.toISOString(),
    endAt: new Date(date.getTime() + (new Date(event.endAt).getTime() - new Date(event.startAt).getTime())).toISOString()
  }));
}
```

---

### 6.2 Twilio Edge Cases

**Rate Limits:**

```typescript
export async function sendSmsWithBackoff(
  to: string,
  body: string,
  attempt: number = 0
): Promise<SmsSendResult> {
  try {
    return await sendSms({ to, body });
  } catch (error: any) {
    if (error.code === 429 && attempt < 3) {
      const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.warn('[Twilio] Rate limited, retrying', { attempt, backoffMs });
      await sleep(backoffMs);
      return sendSmsWithBackoff(to, body, attempt + 1);
    }
    
    throw error;
  }
}
```

**Invalid Phone Formats:**

```typescript
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

export function normalizePhone(phone: string, defaultCountry: string = 'US'): string | null {
  try {
    if (!isValidPhoneNumber(phone, defaultCountry)) {
      return null;
    }
    
    const parsed = parsePhoneNumber(phone, defaultCountry);
    return parsed.format('E.164'); // +12025551234
  } catch (error) {
    return null;
  }
}

// Use before API calls
const normalized = normalizePhone(userInput);
if (!normalized) {
  return { success: false, error: 'Invalid phone number format' };
}
```

---

### 6.3 Stripe Edge Cases

**Payment Failures:**

```typescript
export async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscription = await db.subscriptions.findByStripeId(invoice.subscription as string);
  
  if (!subscription) return;
  
  // Mark subscription as past_due
  await db.subscriptions.update(subscription.id, { status: 'past_due' });
  
  // Send notification email
  await sendPaymentFailedEmail(subscription.userId, invoice.hosted_invoice_url);
  
  // Downgrade features after 7 days
  const daysSinceFailure = Math.floor((Date.now() - invoice.created * 1000) / (24 * 60 * 60 * 1000));
  
  if (daysSinceFailure >= 7) {
    await downgradeUserToFreeTier(subscription.userId);
  }
}
```

**Proration on Mid-Cycle Change:**

```typescript
export async function upgradePlan(
  subscriptionId: string,
  newPlanTier: 'essential' | 'plus' | 'complete'
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const currentItemId = subscription.items.data[0].id;
  
  // Stripe automatically prorates
  await stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: currentItemId,
      price: PRICE_IDS[newPlanTier]
    }],
    proration_behavior: 'always_invoice', // Charge immediately
    billing_cycle_anchor: 'unchanged' // Keep same renewal date
  });
  
  // Update local database
  await db.subscriptions.update(subscriptionId, { planTier: newPlanTier });
}

export async function downgradePlan(
  subscriptionId: string,
  newPlanTier: 'essential'
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const currentItemId = subscription.items.data[0].id;
  
  // Apply downgrade at end of period (no refund)
  await stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: currentItemId,
      price: PRICE_IDS[newPlanTier]
    }],
    proration_behavior: 'none' // No immediate charge/credit
  });
  
  // Update local database
  await db.subscriptions.update(subscriptionId, { planTier: newPlanTier });
}
```

**Webhook Delivery Retries:**

```typescript
// Stripe retries failed webhooks with exponential backoff over 3 days
// Ensure idempotency to handle duplicate deliveries

export async function handleWebhookWithIdempotency(event: Stripe.Event) {
  const existing = await db.webhookEvents.findByStripeEventId(event.id);
  
  if (existing) {
    if (existing.processed) {
      console.info('[Stripe] Webhook already processed', { eventId: event.id });
      return;
    }
    
    if (existing.error) {
      console.warn('[Stripe] Retrying previously failed webhook', { eventId: event.id });
    }
  } else {
    // Store event
    await db.webhookEvents.create({
      stripeEventId: event.id,
      eventType: event.type,
      payload: event.data.object,
      processed: false
    });
  }
  
  // Process
  try {
    await processStripeEvent(event);
    await db.webhookEvents.markProcessed(event.id);
  } catch (error: any) {
    await db.webhookEvents.markError(event.id, error.message);
    throw error; // Return 5xx to trigger Stripe retry
  }
}
```

---

### 6.4 iCal Feed Edge Cases

**Duplicate Events:**

```typescript
export async function syncIcalFeed(familyId: string, feedUrl: string): Promise<{
  imported: number;
  updated: number;
  skipped: number;
}> {
  const response = await fetch(feedUrl);
  const icalData = await response.text();
  const parsed = ical.parseICS(icalData);
  
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const event of Object.values(parsed)) {
    if (event.type !== 'VEVENT') continue;
    
    // Check if event already exists by external_id
    const existing = await db.calendarEvents.findByExternalId(familyId, event.uid);
    
    if (existing) {
      // Check if event was modified
      const lastModified = event.lastmodified || event.created;
      
      if (lastModified && new Date(lastModified) > new Date(existing.lastSyncedAt)) {
        // Update existing event
        await db.calendarEvents.update(existing.id, {
          title: event.summary,
          description: event.description,
          startAt: event.start.toISOString(),
          endAt: event.end.toISOString(),
          lastSyncedAt: new Date().toISOString()
        });
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Import new event
      await db.calendarEvents.create({
        familyId,
        title: event.summary || 'Untitled',
        description: event.description,
        startAt: event.start.toISOString(),
        endAt: event.end.toISOString(),
        allDay: !event.start.dateOnly ? false : true,
        category: 'school',
        source: 'ical_import',
        externalId: event.uid,
        createdBy: parentId,
        confirmationStatus: 'confirmed',
        lastSyncedAt: new Date().toISOString()
      });
      imported++;
    }
  }
  
  return { imported, updated, skipped };
}
```

**Time Zone Handling:**

```typescript
import { zonedTimeToUtc } from 'date-fns-tz';

export function parseIcalDate(icalEvent: ical.VEvent): { start: Date; end: Date } {
  // iCal events can have TZID parameter
  const startTzid = icalEvent.start.tz;
  const endTzid = icalEvent.end.tz;
  
  // Convert to UTC
  const start = startTzid 
    ? zonedTimeToUtc(icalEvent.start, startTzid)
    : icalEvent.start;
  
  const end = endTzid
    ? zonedTimeToUtc(icalEvent.end, endTzid)
    : icalEvent.end;
  
  return { start, end };
}
```

---

### 6.5 Claude Moderation

**Highly Sensitive Content:**

```typescript
export async function analyzeMessageToneWithRedaction(messageText: string): Promise<ToneAnalysisResult> {
  // Redact PII before sending to Claude
  const redactedText = redactPii(messageText);
  
  const result = await analyzeMessageTone(redactedText);
  
  // Never log original message text
  console.info('[Claude] Tone analysis complete', {
    isHostile: result.isHostile,
    conflictLevel: result.conflictLevel,
    // Do NOT log: messageText, indicators (may contain PII)
  });
  
  return result;
}

function redactPii(text: string): string {
  // Redact phone numbers
  text = text.replace(/\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
  
  // Redact emails
  text = text.replace(/[\w.+-]+@[\w.-]+\.\w+/g, '[EMAIL]');
  
  // Redact SSN
  text = text.replace(/\d{3}-\d{2}-\d{4}/g, '[SSN]');
  
  // Redact addresses (basic)
  text = text.replace(/\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Boulevard|Blvd)\b/gi, '[ADDRESS]');
  
  return text;
}
```

**Telemetry Without PII:**

```typescript
export async function trackToneAnalysis(result: ToneAnalysisResult, userId: string) {
  // Track aggregate metrics only
  await db.aiUsage.create({
    userId: hashUserId(userId), // One-way hash for privacy
    feature: 'tone_analysis',
    isHostile: result.isHostile,
    conflictLevel: result.conflictLevel,
    indicatorCount: result.indicators.length,
    timestamp: new Date().toISOString()
    // Do NOT store: message text, indicators (PII risk)
  });
}

function hashUserId(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
}
```

---

## 7. Acceptance Criteria (Checkable)

### 7.1 URL-Driven Filtering
- [x] Blog list responds to `?category=` and `?page=` params
- [x] Calendar responds to `?year=` and `?month=` params
- [x] School page responds to `?tab=` param
- [x] All search params validated with TypeScript discriminators
- [x] Invalid params return 400 Bad Request or redirect to default

### 7.2 Database Integration
- [x] All migrations 0006-0012 applied successfully
- [x] Family ID scoping enforced in all queries
- [x] Row-Level Security (RLS) policies enabled for sensitive tables
- [x] Connection pooling configured (max 20 connections)
- [x] Database health check passes: `await checkConnection() === true`

### 7.3 Twilio Integration
- [x] Phone verification flow works end-to-end
- [x] SMS notifications delivered with status tracking
- [x] Proxy number assigned per family
- [x] Webhook signature verification passes for all incoming messages
- [x] PII masking in logs: phone numbers shown as `+1****5678`
- [x] Rate limit handling: 429 errors trigger exponential backoff

### 7.4 Stripe Integration
- [x] Customer created at registration
- [x] Checkout session redirects to Stripe hosted page
- [x] Subscription activated on `checkout.session.completed` webhook
- [x] Billing portal opens for existing customers
- [x] Invoice PDF generated and stored
- [x] Webhook signature verification passes
- [x] Idempotency: duplicate webhook events ignored
- [x] Proration calculated correctly on mid-cycle upgrade

### 7.5 Claude Integration
- [x] Tone analysis returns JSON with `isHostile`, `indicators`, `neutralRewrite`
- [x] Hostile messages blocked pre-send
- [x] Mediation assistant provides de-escalation tips
- [x] Rate limiting: 100 requests/min per user
- [x] Circuit breaker opens if error rate >50%
- [x] PII redacted before sending to API
- [x] Token usage logged for cost tracking

### 7.6 Observability
- [x] Logs structured as JSON with severity levels
- [x] Metrics tracked: `db.query.duration`, `api.request.duration`, `error.count`
- [x] Alerts configured: error rate >1%, database connection failures
- [x] Dashboard shows: active users, subscription revenue, AI token usage
- [x] No PII in logs: phone/email/SSN masked or omitted

---

## 8. Rollout Timeline & Milestones (4-Week Aggressive Plan)

### Week 1: Foundation & Integrations (Parallel Tracks)
**Focus:** Database migrations + Twilio/Stripe/Claude setup

**Track A - Infrastructure:**
- [x] Complete migrations 0006-0012
- [ ] Implement all repository methods
- [ ] Wire JWT refresh flow
- [ ] Deploy to staging with real database

**Track B - Integrations (in parallel):**
- [ ] Implement Twilio Verify, SMS, Proxy
- [ ] Implement Stripe Customer, Subscription, Webhooks
- [ ] Implement Claude tone analysis
- [ ] Set up webhook endpoints + signature verification

**Track C - Testing (in parallel):**
- [ ] Begin unit tests for engines (hash chain priority)
- [ ] Set up E2E test framework

- [ ] **Milestone Day 5:** All integrations functional in staging, real DB queries working

---

### Week 2: Mock Replacement & Security
**Focus:** Replace all mock data + hash chain + core security

- [ ] Refactor dashboard page → DB queries
- [ ] Refactor calendar page → DB queries
- [ ] Refactor blog pages → DB queries
- [ ] Refactor school page → DB queries
- [ ] Add feature flags for gradual rollout
- [ ] Implement message hash chain
- [ ] Write hash chain unit tests (100% coverage)
- [ ] Security audit: PII protection, webhook signatures, TLS enforcement

- [ ] **Milestone Day 10:** Zero mock imports, all critical security controls in place

---

### Week 3: Testing & Pre-Production Deploy
**Focus:** Comprehensive testing + production staging

- [ ] Write engine unit tests (≥80% coverage)
- [ ] Write E2E tests for critical flows (auth, messaging, payment)
- [ ] Performance testing: database query optimization
- [ ] Deploy to production with feature flags OFF
- [ ] Integration smoke tests on production
- [ ] Load testing: verify scaling to 100+ concurrent users
- [ ] Webhook replay tests (Twilio + Stripe)

- [ ] **Milestone Day 15:** Production environment ready, feature flags disabled

---

### Week 4: Rapid Rollout & Monitoring
**Focus:** Enable feature flags, monitor, support production

**Days 16-17 (Tue-Wed) - Dark Launch:**
- [ ] Enable feature flags for internal team only
- [ ] Monitor error logs, database performance
- [ ] Run smoke tests on real data paths

**Days 18-19 (Thu-Fri) - Canary (10%):**
- [ ] Enable for 10% of users via session hash
- [ ] Alert on error rate >1%
- [ ] Daily metric review

**Days 20-21 (Mon-Tue) - Ramp (50%):**
- [ ] Enable for 50% of users
- [ ] Alert on error rate >0.5%

**Days 22-28 (Wed-Tue) - Full Rollout (100%):**
- [ ] Enable for all users
- [ ] Monitor metrics continuously
- [ ] Prepare for post-launch tasks

- [ ] **Milestone Day 28:** Production running on real data, no mock code active

---

### Post-Launch (Week 5+, Low Priority)
- [ ] Remove feature flags + mock code (can move to next sprint if stable)
- [ ] Performance tuning: add indexes based on slow query log
- [ ] Cost optimization: review AI token usage, database plan
- [ ] User feedback: iterate on tone analysis prompts, conflict detection

---

## 9. Assumptions & Mitigations

### Assumptions Made

| Assumption | Rationale | Mitigation if Wrong |
|-----------|-----------|---------------------|
| **PostgreSQL 14+ available** | Needed for JSONB, RLS, pgcrypto | Upgrade database or use compat mode |
| **Twilio Verify available in user regions** | Not available in all countries | Fallback to email verification |
| **Users have valid payment methods** | Required for subscriptions | Offer invoice payment for corporate accounts |
| **Claude API uptime >99%** | Assumed based on Anthropic SLA | Fail open: allow messages without analysis during outage |
| **Users access from modern browsers** | Needed for WebSocket, crypto APIs | Show upgrade notice for IE11 users |
| **Families have 2 parents** | Simplifies data model | Add support for 1-parent, 3+-parent in future |
| **All events in single timezone** | Most families don't cross timezones | Add timezone picker per event if requested |
| **Stripe available in user country** | Not available everywhere | Add PayPal as alternative payment method |

### Unknowns to Clarify

- **User timezone storage**: Where to store? Family settings? Per-user?
  - **Decision**: Store in family settings, default to US/Eastern
  
- **iCal sync frequency**: Every hour? On-demand? Background job?
  - **Decision**: Background job every 6 hours + manual trigger button
  
- **Hash chain performance**: Will verification be too slow for large threads?
  - **Decision**: Verify on export only, not on every read; cache results
  
- **Claude cost at scale**: Will tone analysis be too expensive?
  - **Decision**: Set monthly budget cap, disable if exceeded, notify ops

---

## 10. Risk Assessment & Contingencies

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Database migration fails in prod** | Low | High | Test migrations in staging replica; have rollback script ready |
| **Stripe webhook downtime** | Low | Medium | Queue events in Redis; process when webhook recovers |
| **Claude rate limit hit during peak** | Medium | Medium | Implement rate limiter; fail open (allow messages) |
| **Hash chain verification too slow** | Low | Low | Verify async; cache results; optimize query with index |
| **Twilio proxy numbers exhausted** | Low | High | Monitor pool usage; provision more numbers proactively |
| **User data migration fails** | Low | High | Backfill script with idempotency; rollback via database backup |
| **Feature flag misconfiguration** | Medium | High | Use typed config; validate on startup; alert if flag missing |
| **PII leaked in logs** | Low | High | Automated log scanning; mask patterns; security audit |

---

## 11. Deployment Checklist

### Pre-Deployment
- [ ] All migrations tested in staging
- [ ] Environment variables set in production
- [ ] Secrets rotated (JWT, database, API keys)
- [ ] Webhook endpoints configured in Twilio/Stripe dashboards
- [ ] Database backup taken
- [ ] Rollback plan documented
- [ ] Feature flags configured (all OFF initially)
- [ ] Monitoring dashboards configured
- [ ] Alerts configured (error rate, database, webhook failures)
- [ ] On-call schedule assigned

### Deployment Steps
1. [ ] Deploy database migrations (`pnpm migrate:prod`)
2. [ ] Deploy application code (`pnpm build && pnpm deploy`)
3. [ ] Verify health checks pass
4. [ ] Smoke test: register new user, login, view calendar
5. [ ] Enable feature flags for internal team
6. [ ] Monitor logs for 1 hour
7. [ ] Enable feature flags for 10% of users
8. [ ] Monitor metrics for 24 hours
9. [ ] Ramp to 50%, then 100%

### Post-Deployment
- [ ] Verify zero mock usage in logs
- [ ] Check database connection pool usage
- [ ] Review Twilio/Stripe/Claude API call counts
- [ ] Verify webhook deliveries
- [ ] Check error rates and latency
- [ ] Review user feedback and support tickets
- [ ] Schedule post-mortem meeting

---

## 12. Success Metrics

| Metric | Baseline (Before) | Target (After) | Measurement |
|--------|------------------|---------------|-------------|
| **Mock data usage** | 100% | 0% | `grep createMock app/` count |
| **Page load time (dashboard)** | N/A | <2s (p95) | Synthetic monitoring |
| **API error rate** | N/A | <0.5% | Logs aggregation |
| **Database query time** | N/A | <100ms (p95) | APM traces |
| **Test coverage** | ~50% | ≥80% engines, 100% hash chain | Jest coverage report |
| **E2E test pass rate** | ~70% | 100% | Playwright CI results |
| **Webhook delivery success** | N/A | >99% | Twilio/Stripe dashboard |
| **Claude API success rate** | N/A | >98% | Custom metrics |
| **User-reported bugs** | N/A | <5/week | Support ticket count |
| **Subscription conversion** | N/A | >15% | Stripe analytics |

---

## 13. References & Resources

### Documentation
- [Next.js 15 Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions)
- [Twilio Verify API](https://www.twilio.com/docs/verify/api)
- [Stripe Subscriptions](https://stripe.com/docs/billing/subscriptions/overview)
- [Anthropic Claude API](https://docs.anthropic.com/claude/reference/messages)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

### Internal Docs
- [Database Schema](c:\KidSchedule\lib\persistence\migrations\)
- [Repository Pattern](c:\KidSchedule\lib\persistence\repositories.ts)
- [Engine Architecture](c:\KidSchedule\.github\copilot-instructions.md)
- [ISO/IEC 12207 Design](c:\kidschedule.com-6b82\ISO-IEC-12207-KidSchedule-Design.md)

### Tools
- [Playwright (E2E testing)](https://playwright.dev/)
- [ical.js (iCal parsing)](https://github.com/kewisch/ical.js)
- [libphonenumber-js (phone validation)](https://www.npmjs.com/package/libphonenumber-js)
- [date-fns-tz (timezone handling)](https://date-fns.org/v2.29.3/docs/Time-Zones)

---

**Document Status:** ✅ Implementation Ready  
**Review Date:** February 27, 2026  
**Next Review:** End of Sprint 2 (Week 4)  
**Owner:** Engineering Team  
**Approvers:** Tech Lead, Product Manager, Security Lead
