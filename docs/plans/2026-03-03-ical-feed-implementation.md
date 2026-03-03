# CAL-005: iCalendar Feed Generator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement an RFC 5545-compliant iCalendar feed endpoint that allows families to subscribe to their shared calendar events via `GET /api/calendar/feed/{familyId}.ics`.

**Architecture:** Session-based authentication feeds events to an ICS generator that converts calendar events to RFC 5545 format with proper field formatting (UID, DTSTAMP, DTSTART/DTEND, SUMMARY, etc.). API route validates family membership, fetches events, generates ICS, and returns with appropriate headers and 1-hour cache TTL. UI provides copy-to-clipboard feed URL.

**Tech Stack:**
- TypeScript/Next.js (App Router)
- Jest (unit tests)
- Playwright (E2E tests)
- RFC 5545 iCalendar format
- Session authentication (existing middleware)

---

## Task 1: ICS Generator Function (Core Logic)

**Files:**
- Create: `lib/ical-generator.ts`
- Test: `tests/unit/ical-generator.test.ts`

**Step 1: Write failing test for empty events array**

Create `tests/unit/ical-generator.test.ts`:

```typescript
import { generateICalFeed } from '@/lib/ical-generator';

describe('generateICalFeed', () => {
  it('should return valid VCALENDAR wrapper for empty events array', () => {
    const result = generateICalFeed([], { id: 'family-1', name: 'Smith Family' });

    expect(result).toContain('BEGIN:VCALENDAR');
    expect(result).toContain('VERSION:2.0');
    expect(result).toContain('PRODID:-//KidSchedule//EN');
    expect(result).toContain('CALSCALE:GREGORIAN');
    expect(result).toContain('METHOD:PUBLISH');
    expect(result).toContain('END:VCALENDAR');
    expect(result).not.toContain('BEGIN:VEVENT');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/ical-generator.test.ts
```

Expected output: `FAIL - generateICalFeed is not defined`

**Step 3: Create ICS generator with empty implementation**

Create `lib/ical-generator.ts`:

```typescript
interface FamilyMetadata {
  id: string;
  name: string;
}

interface DbCalendarEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  isAllDay: boolean;
  category: string;
}

export function generateICalFeed(
  events: DbCalendarEvent[],
  family: FamilyMetadata
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KidSchedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/ical-generator.test.ts
```

Expected output: `PASS - 1 passed`

**Step 5: Commit**

```bash
git add tests/unit/ical-generator.test.ts lib/ical-generator.ts
git commit -m "feat: add ICS generator with empty calendar wrapper"
```

---

## Task 2: ICS Generator - All-Day Event Handling

**Files:**
- Modify: `lib/ical-generator.ts`
- Test: `tests/unit/ical-generator.test.ts`

**Step 1: Write failing test for all-day event**

Add to `tests/unit/ical-generator.test.ts`:

```typescript
  it('should format all-day events with DATE value type', () => {
    const allDayEvent: DbCalendarEvent = {
      id: 'event-1',
      familyId: 'family-1',
      title: 'Birthday Party',
      startDate: new Date('2026-03-15'),
      endDate: new Date('2026-03-16'),
      isAllDay: true,
      category: 'activity',
    };

    const result = generateICalFeed([allDayEvent], { id: 'family-1', name: 'Smith' });

    expect(result).toContain('BEGIN:VEVENT');
    expect(result).toContain('UID:event-event-1@family-1.kidschedule.app');
    expect(result).toContain('SUMMARY:Birthday Party');
    expect(result).toContain('DTSTART;VALUE=DATE:20260315');
    expect(result).toContain('DTEND;VALUE=DATE:20260316');
    expect(result).toContain('CATEGORIES:activity');
    expect(result).toContain('END:VEVENT');
  });
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/ical-generator.test.ts
```

Expected output: `FAIL - Expected to contain "BEGIN:VEVENT"`

**Step 3: Implement all-day event handling with sanitization**

Replace `generateICalFeed` in `lib/ical-generator.ts`:

```typescript
function sanitizeICalValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatDateTimeUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

export function generateICalFeed(
  events: DbCalendarEvent[],
  family: FamilyMetadata
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KidSchedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  const dtstamp = formatDateTimeUTC(new Date());

  for (const event of events) {
    const uid = `event-${event.id}@${family.id}.kidschedule.app`;
    const summary = sanitizeICalValue(event.title);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);

    if (event.isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(event.endDate)}`);
    } else {
      lines.push(`DTSTART:${formatDateTimeUTC(event.startDate)}`);
      lines.push(`DTEND:${formatDateTimeUTC(event.endDate)}`);
    }

    lines.push(`SUMMARY:${summary}`);

    if (event.description) {
      const description = sanitizeICalValue(event.description);
      lines.push(`DESCRIPTION:${description}`);
    }

    if (event.location) {
      const location = sanitizeICalValue(event.location);
      lines.push(`LOCATION:${location}`);
    }

    lines.push(`CATEGORIES:${event.category}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/ical-generator.test.ts
```

Expected output: `PASS - 2 passed`

**Step 5: Commit**

```bash
git add lib/ical-generator.ts tests/unit/ical-generator.test.ts
git commit -m "feat: add ICS generator with all-day event support and sanitization"
```

---

## Task 3: ICS Generator - Timed Event Handling

**Files:**
- Test: `tests/unit/ical-generator.test.ts`

**Step 1: Write failing test for timed event**

Add to `tests/unit/ical-generator.test.ts`:

```typescript
  it('should format timed events with UTC DATETIME format', () => {
    const timedEvent: DbCalendarEvent = {
      id: 'event-2',
      familyId: 'family-1',
      title: 'School Pickup',
      startDate: new Date('2026-03-15T14:30:00Z'),
      endDate: new Date('2026-03-15T15:00:00Z'),
      isAllDay: false,
      category: 'school',
    };

    const result = generateICalFeed([timedEvent], { id: 'family-1', name: 'Smith' });

    expect(result).toContain('DTSTART:20260315T143000Z');
    expect(result).toContain('DTEND:20260315T150000Z');
  });
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/ical-generator.test.ts -- --testNamePattern="timed events"
```

Expected output: `FAIL - Expected to contain "DTSTART:20260315T143000Z"`

**Step 3: Verify timed event handling works in existing code**

The implementation from Task 2 already handles timed events with the `else` branch. Run test again.

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/ical-generator.test.ts
```

Expected output: `PASS - 3 passed`

**Step 5: Commit**

```bash
git add tests/unit/ical-generator.test.ts
git commit -m "test: add test for timed event UTC formatting"
```

---

## Task 4: ICS Generator - Special Character Escaping

**Files:**
- Test: `tests/unit/ical-generator.test.ts`

**Step 1: Write failing test for special characters**

Add to `tests/unit/ical-generator.test.ts`:

```typescript
  it('should escape special characters in title and description', () => {
    const event: DbCalendarEvent = {
      id: 'event-3',
      familyId: 'family-1',
      title: 'Mom\'s; Birthday (Celebration, etc.)',
      description: 'Bring cake\\nSet up decorations',
      startDate: new Date('2026-03-20'),
      endDate: new Date('2026-03-21'),
      isAllDay: true,
      category: 'holiday',
    };

    const result = generateICalFeed([event], { id: 'family-1', name: 'Smith' });

    expect(result).toContain('SUMMARY:Mom\'s\\; Birthday (Celebration\\, etc.)');
    expect(result).toContain('DESCRIPTION:Bring cake\\nSet up decorations');
  });
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/ical-generator.test.ts -- --testNamePattern="special characters"
```

Expected output: `FAIL - Expected to contain "SUMMARY:Mom\'s\\; Birthday (Celebration\\, etc.)"`

**Step 3: Verify sanitization function works**

The sanitization implementation from Task 2 already handles these cases. Run test again.

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/ical-generator.test.ts
```

Expected output: `PASS - 4 passed`

**Step 5: Commit**

```bash
git add tests/unit/ical-generator.test.ts
git commit -m "test: add test for special character escaping"
```

---

## Task 5: ICS Generator - Multiple Events and Optional Fields

**Files:**
- Test: `tests/unit/ical-generator.test.ts`

**Step 1: Write failing test for multiple events and optional fields**

Add to `tests/unit/ical-generator.test.ts`:

```typescript
  it('should include multiple events and omit optional fields when missing', () => {
    const events: DbCalendarEvent[] = [
      {
        id: 'event-1',
        familyId: 'family-1',
        title: 'Event 1',
        // No description or location
        startDate: new Date('2026-03-10'),
        endDate: new Date('2026-03-11'),
        isAllDay: true,
        category: 'activity',
      },
      {
        id: 'event-2',
        familyId: 'family-1',
        title: 'Event 2',
        description: 'With description',
        location: 'At home',
        startDate: new Date('2026-03-15'),
        endDate: new Date('2026-03-16'),
        isAllDay: true,
        category: 'medical',
      },
    ];

    const result = generateICalFeed(events, { id: 'family-1', name: 'Smith' });

    // Both events present
    expect(result.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(result).toContain('UID:event-event-1@family-1.kidschedule.app');
    expect(result).toContain('UID:event-event-2@family-1.kidschedule.app');

    // Optional fields only in Event 2
    const event1Index = result.indexOf('UID:event-event-1@family-1.kidschedule.app');
    const event2Index = result.indexOf('UID:event-event-2@family-1.kidschedule.app');
    const event1Section = result.substring(event1Index, event2Index);
    const event2Section = result.substring(event2Index);

    expect(event1Section).not.toContain('DESCRIPTION:');
    expect(event1Section).not.toContain('LOCATION:');
    expect(event2Section).toContain('DESCRIPTION:With description');
    expect(event2Section).toContain('LOCATION:At home');
  });
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/ical-generator.test.ts -- --testNamePattern="multiple events"
```

Expected output: `FAIL` or check specific assertion

**Step 3: Verify implementation handles multiple events**

The implementation from Task 2 already loops through events and conditionally includes optional fields. Run test again.

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/ical-generator.test.ts
```

Expected output: `PASS - 5 passed`

**Step 5: Commit**

```bash
git add tests/unit/ical-generator.test.ts
git commit -m "test: add test for multiple events and optional field handling"
```

---

## Task 6: API Route - Authentication and Authorization

**Files:**
- Create: `app/api/calendar/feed/[familyId]/route.ts`
- Test: `tests/e2e/calendar/feed.test.ts`

**Step 1: Write E2E test for unauthenticated access**

Create `tests/e2e/calendar/feed.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

test.describe('Calendar Feed API', () => {
  test('should return 401 for unauthenticated request', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/calendar/feed/family-1.ics`);

    expect(response.status()).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm run test:e2e -- tests/e2e/calendar/feed.test.ts
```

Expected output: `FAIL - expected 401 but got 404 (or 500)`

**Step 3: Create API route with session check**

Create `app/api/calendar/feed/[familyId]/route.ts`:

```typescript
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateICalFeed } from '@/lib/ical-generator';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { familyId: string } }
) {
  try {
    // Step 1: Authenticate via session
    const session = await getSession();
    if (!session || !session.userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Step 2: Validate family ID format
    const familyId = params.familyId.replace('.ics', '');
    if (!familyId || typeof familyId !== 'string') {
      return new NextResponse('Bad Request', { status: 400 });
    }

    // Step 3: Authorize - check user is member of family
    const isMember = await db.families.isMember(familyId, session.userId);
    if (!isMember) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Step 4: Fetch family and events
    const family = await db.families.findById(familyId);
    if (!family) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const events = await db.calendarEvents.findByFamilyId(familyId);

    // Step 5: Generate ICS feed
    const icsContent = generateICalFeed(events, {
      id: family.id,
      name: family.name,
    });

    // Step 6: Return response with appropriate headers
    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="family-schedule.ics"',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Calendar feed error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:e2e -- tests/e2e/calendar/feed.test.ts
```

Expected output: `PASS - 1 passed`

**Step 5: Commit**

```bash
git add app/api/calendar/feed/[familyId]/route.ts tests/e2e/calendar/feed.test.ts
git commit -m "feat: add calendar feed API route with authentication"
```

---

## Task 7: API Route - Authorization Checks

**Files:**
- Test: `tests/e2e/calendar/feed.test.ts`

**Step 1: Write test for unauthorized family access**

Add to `tests/e2e/calendar/feed.test.ts`:

```typescript
  test('should return 403 when user is not member of family', async ({
    request,
    context,
  }) => {
    // First, authenticate a user (use your test auth setup)
    // Assuming you have a helper to create authenticated requests
    const authenticatedRequest = await authenticateAs(context, 'user@example.com');

    // Try to access a different family they're not member of
    const response = await authenticatedRequest.get(
      `${API_URL}/api/calendar/feed/other-family-id.ics`
    );

    expect(response.status()).toBe(403);
  });
```

(Note: Adjust based on your test authentication setup)

**Step 2: Run test to verify it fails**

```bash
npm run test:e2e -- tests/e2e/calendar/feed.test.ts -- --testNamePattern="not member"
```

Expected output: `FAIL` (if test auth helper exists)

**Step 3: Verify implementation already handles this**

The `db.families.isMember()` check in Step 3 of Task 6 already handles this case.

**Step 4: Run test to verify it passes**

```bash
npm run test:e2e -- tests/e2e/calendar/feed.test.ts
```

**Step 5: Commit**

```bash
git add tests/e2e/calendar/feed.test.ts
git commit -m "test: add authorization check for family membership"
```

---

## Task 8: API Route - Response Headers and Content Validation

**Files:**
- Test: `tests/e2e/calendar/feed.test.ts`

**Step 1: Write test for response headers and content**

Add to `tests/e2e/calendar/feed.test.ts`:

```typescript
  test('should return correct headers and valid ICS content', async ({
    request,
    context,
  }) => {
    const authenticatedRequest = await authenticateAs(context, 'owner@example.com');

    const response = await authenticatedRequest.get(
      `${API_URL}/api/calendar/feed/family-1.ics`
    );

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/calendar');
    expect(response.headers()['content-type']).toContain('charset=utf-8');
    expect(response.headers()['cache-control']).toBe('public, max-age=3600');
    expect(response.headers()['content-disposition']).toContain('attachment');
    expect(response.headers()['content-disposition']).toContain('family-schedule.ics');

    const content = await response.text();
    expect(content).toContain('BEGIN:VCALENDAR');
    expect(content).toContain('END:VCALENDAR');
    expect(content).toContain('VERSION:2.0');
    expect(content).toContain('PRODID:-//KidSchedule//EN');
  });
```

**Step 2: Run test to verify it fails**

```bash
npm run test:e2e -- tests/e2e/calendar/feed.test.ts -- --testNamePattern="correct headers"
```

Expected output: `FAIL` (if test data setup needs work)

**Step 3: Ensure test family exists with events**

Update test setup to create test family and events if needed.

**Step 4: Run test to verify it passes**

```bash
npm run test:e2e -- tests/e2e/calendar/feed.test.ts
```

Expected output: `PASS - 2+ passed`

**Step 5: Commit**

```bash
git add tests/e2e/calendar/feed.test.ts
git commit -m "test: add response header and content validation"
```

---

## Task 9: API Route - 404 and 400 Error Cases

**Files:**
- Test: `tests/e2e/calendar/feed.test.ts`

**Step 1: Write tests for error cases**

Add to `tests/e2e/calendar/feed.test.ts`:

```typescript
  test('should return 404 for non-existent family', async ({
    request,
    context,
  }) => {
    const authenticatedRequest = await authenticateAs(context, 'owner@example.com');

    const response = await authenticatedRequest.get(
      `${API_URL}/api/calendar/feed/non-existent-family.ics`
    );

    expect(response.status()).toBe(404);
  });

  test('should return 400 for invalid family ID format', async ({
    request,
    context,
  }) => {
    const authenticatedRequest = await authenticateAs(context, 'owner@example.com');

    const response = await authenticatedRequest.get(
      `${API_URL}/api/calendar/feed/.ics`
    );

    expect(response.status()).toBe(400);
  });
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:e2e -- tests/e2e/calendar/feed.test.ts
```

Expected output: `FAIL` (some tests may fail due to family not found logic)

**Step 3: Verify implementation handles cases**

The implementation in Task 6 already returns 404 for missing family and 400 for invalid ID. Check logic is correct.

**Step 4: Run tests to verify they pass**

```bash
npm run test:e2e -- tests/e2e/calendar/feed.test.ts
```

Expected output: `PASS - all passed`

**Step 5: Commit**

```bash
git add tests/e2e/calendar/feed.test.ts
git commit -m "test: add error case tests for invalid family and format"
```

---

## Task 10: UI - Calendar Page Feed URL Display

**Files:**
- Modify: `app/calendar/page.tsx`

**Step 1: Read existing calendar page**

Read the current calendar page to understand structure and styling patterns.

```bash
# In Claude Code - read the file
```

**Step 2: Add feed subscription section to calendar page**

Modify `app/calendar/page.tsx` (find the main JSX return statement):

Add this component before/after the calendar month view:

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useState } from 'react';

function CalendarFeedSubscription({ familyId }: { familyId: string }) {
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);

  const feedUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/feed/${familyId}.ics`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  }, [feedUrl]);

  if (!session?.user) return null;

  return (
    <div className="border rounded-lg p-4 mb-6 bg-gray-50">
      <h3 className="text-lg font-semibold mb-2">Subscribe to Calendar</h3>
      <p className="text-sm text-gray-600 mb-3">
        Use this URL in Apple Calendar, Google Calendar, Outlook, or any calendar app that supports iCal feeds.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={feedUrl}
          readOnly
          className="flex-1 px-3 py-2 border rounded bg-white text-sm"
        />
        <button
          onClick={handleCopy}
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
```

Then add the component in the page JSX (after session/family checks):

```typescript
export default function CalendarPage() {
  const { data: session } = useSession();
  const familyId = /* get from params or context */;

  if (!session) {
    return <div>Please sign in</div>;
  }

  return (
    <div>
      <h1>Family Calendar</h1>

      <CalendarFeedSubscription familyId={familyId} />

      {/* Existing calendar month view */}
      {/* ... */}
    </div>
  );
}
```

**Step 3: Verify component renders**

```bash
# Start dev server
npm run dev

# Navigate to /calendar and verify the feed URL section appears
```

**Step 4: Test copy functionality manually**

- Click Copy button
- Verify "Copied!" message appears
- Verify URL in clipboard matches expected format
- Wait 2 seconds and verify button text returns to "Copy"

**Step 5: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add calendar feed subscription UI with copy-to-clipboard"
```

---

## Task 11: Manual Testing and Verification

**Files:**
- Test with external calendar apps

**Step 1: Export the ICS file**

```bash
# Get feed URL from app
# Download the .ics file from the feed endpoint
curl -b "sessionid=YOUR_SESSION" \
  "http://localhost:3000/api/calendar/feed/family-1.ics" \
  -o family-schedule.ics
```

**Step 2: Import to Apple Calendar**

- Open Apple Calendar
- File → Import → Select `family-schedule.ics`
- Verify events appear with correct dates, times, titles
- Verify all-day events show as all-day events
- Verify timed events show at correct times

**Step 3: Import to Google Calendar**

- Open Google Calendar
- Settings → Import & Export → Select Import
- Upload `family-schedule.ics`
- Verify events appear correctly with same checks as Step 2

**Step 4: Verify cache behavior**

```bash
# Make two requests within 1 hour
curl -I "http://localhost:3000/api/calendar/feed/family-1.ics" \
  -b "sessionid=YOUR_SESSION"

# Verify Cache-Control header shows: public, max-age=3600
```

**Step 5: Test subscribe workflow**

- Copy feed URL from calendar page
- In calendar app, use "Subscribe to Calendar" or "Add by URL" feature
- Paste the URL
- Verify calendar subscribes and shows events

**Step 6: Commit test results**

```bash
git add docs/testing/
git commit -m "test: manual verification of ICS export and calendar integration"
```

---

## Task 12: Final Verification and Cleanup

**Files:**
- Test: All test files

**Step 1: Run all unit tests**

```bash
npm test -- tests/unit/ical-generator.test.ts
```

Expected output: `PASS - all tests pass`

**Step 2: Run all E2E tests**

```bash
npm run test:e2e -- tests/e2e/calendar/feed.test.ts
```

Expected output: `PASS - all tests pass`

**Step 3: Check type errors**

```bash
npx tsc --noEmit
```

Expected output: No TypeScript errors

**Step 4: Lint the code**

```bash
npm run lint
```

Expected output: No linting errors

**Step 5: Final commit**

```bash
git status
# Verify all changes are committed
```

---

## Summary

**Total Tasks:** 12
**Implementation Order:**
1. ICS Generator (Tasks 1-5)
2. API Route (Tasks 6-9)
3. UI (Task 10)
4. Testing & Verification (Tasks 11-12)

**Key Implementation Details:**
- RFC 5545 compliance with VCALENDAR/VEVENT structure
- Special character escaping (`;`, `,`, `\`, newlines)
- DATE format for all-day events, DATETIME UTC for timed events
- Session-based authentication with family authorization
- HTTP caching with 1-hour TTL
- Copy-to-clipboard feed URL in calendar page UI

**Testing Approach:**
- Unit tests: ICS generator logic (empty, all-day, timed, special chars, multiple)
- E2E tests: API authentication, authorization, headers, content, error cases
- Manual testing: Calendar app integration (Apple, Google, Outlook)

---

## Plan complete and saved to `docs/plans/2026-03-03-ical-feed-implementation.md`

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach would you prefer?**