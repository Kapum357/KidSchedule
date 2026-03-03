# CAL-005: iCalendar Feed Generator Design

**Date**: 2026-03-03
**Status**: Approved
**Feature**: Add iCal feed support for family calendar subscription in external apps

---

## Overview

Implement an iCalendar (RFC 5545) feed endpoint that allows families to subscribe to their shared calendar events in external calendar applications. The feed is accessed via session authentication and returns events as a valid `.ics` file.

**Endpoint**: `GET /api/calendar/feed/{familyId}.ics`

---

## Design Decisions

### 1. Authentication Model
**Decision**: Session-only (cookie-based)
- Leverage existing session middleware (`getSession()`)
- No additional database tables or token management needed
- Simpler MVP approach
- **Trade-off**: External calendar apps cannot subscribe (they require persistent authentication). This can be addressed in a future iteration with revocable feed tokens.

### 2. Caching Strategy
**Decision**: HTTP Cache-Control headers only
- Return `Cache-Control: public, max-age=3600` (1-hour TTL)
- Let clients and proxies handle caching
- No server-side cache (Redis) needed for MVP
- **Benefit**: Keeps implementation simple; aligns with typical calendar refresh rates (hourly checks)

### 3. Feed Scope
**Decision**: All family events
- Include all events where `event.familyId === requestedFamilyId`
- No filtering by event category, visibility, or ownership
- **Benefit**: Simpler logic; families can manage privacy by controlling who's added to the family
- **Future**: If per-event privacy is needed, add `visibility` filter (e.g., category="custody" OR visibility="shared")

---

## Architecture

### ICS Generator Function
**File**: `lib/ical-generator.ts`

Converts `DbCalendarEvent[]` + family metadata to RFC 5545 iCalendar format.

**Key Fields**:
- `UID`: `event-{eventId}@{familyId}.kidschedule.app` (unique identifier)
- `DTSTAMP`: Current UTC timestamp (e.g., `20260303T120000Z`)
- `DTSTART` / `DTEND`:
  - All-day events: DATE format (`20260303`)
  - Timed events: DATETIME format (`20260303T140000Z`)
- `SUMMARY`: Event title (sanitized)
- `DESCRIPTION`: Optional event description
- `LOCATION`: Optional event location
- `CATEGORIES`: Event category (custody, school, medical, activity, holiday, other)

**Sanitization**:
- Escape special characters: `;` → `\;`, `,` → `\,`, `\` → `\\`
- Replace newlines with `\n`

**Output Structure**:
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//KidSchedule//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
[VEVENT blocks for each event]
END:VCALENDAR
```

### API Route Handler
**File**: `app/api/calendar/feed/[familyId]/route.ts`

Handles GET requests for family calendar feeds.

**Request Flow**:
1. Validate family ID from URL params
2. Authenticate via `getSession()` (existing middleware)
3. Authorize: Check user is member of family via `db.families.isMember(familyId, userId)`
4. Fetch events: `db.calendarEvents.findByFamilyId(familyId)`
5. Generate ICS: Call `generateICalFeed(events, family)`
6. Return response with headers:
   ```
   Status: 200
   Content-Type: text/calendar; charset=utf-8
   Content-Disposition: attachment; filename="family-schedule.ics"
   Cache-Control: public, max-age=3600
   ```

**Error Handling**:
- `401`: No active session
- `403`: User not member of requested family
- `404`: Family not found
- `500`: Database or ICS generation failure

---

## Testing Strategy

### Unit Tests
**File**: `tests/unit/ical-generator.test.ts`

Test the `generateICalFeed()` function in isolation:
- Empty events array → valid VCALENDAR wrapper (no VEVENT blocks)
- All-day event → DATE format (e.g., `DTSTART;VALUE=DATE:20260303`)
- Timed event → DATETIME UTC format (e.g., `DTSTART:20260303T140000Z`)
- Special characters in title/description → properly escaped
- Multiple events → all included in correct order
- Missing optional fields (description, location) → graceful omission

### E2E Tests
**File**: `tests/e2e/calendar/feed.test.ts`

Test the full API endpoint:
- **Auth**: Authenticated user → fetch own family's feed (200 status, valid ICS content)
- **Auth**: Unauthenticated request → 401
- **Auth**: User not in family → 403
- **Not Found**: Non-existent family ID → 404
- **Headers**: Response includes correct Content-Type, Cache-Control, Content-Disposition
- **Content**: Feed contains all events from test family
- **Persistence**: Multiple requests → consistent content (idempotent)

---

## UI Changes

### Calendar Page Update
**File**: `app/calendar/page.tsx`

Add a "Subscribe to Calendar" section above or below the calendar month view.

**Display**:
- Show feed URL: `${NEXT_PUBLIC_APP_URL}/api/calendar/feed/{familyId}.ics`
- "Copy" button that copies URL to clipboard (`navigator.clipboard.writeText()`)
- Simple card component, no complex styling
- Only visible to authenticated users viewing their own family calendar

**No backend changes needed** — the feed URL is public (user owns their session) and safe to display.

---

## Implementation Order

1. Create `lib/ical-generator.ts` with `generateICalFeed()` function
2. Write unit tests for ICS generator
3. Create API route `app/api/calendar/feed/[familyId]/route.ts`
4. Write E2E tests for feed endpoint
5. Update calendar page with copy-URL UI
6. Manual testing: verify ICS file opens in calendar apps (Apple Calendar, Google Calendar, etc.)

---

## Future Enhancements

- **Revocable Feed Tokens**: Store persistent tokens in `user_feed_tokens` table for non-session calendar subscriptions
- **Per-Event Privacy**: Add `visibility` filtering to exclude personal events from shared feeds
- **Rate Limiting**: Add 'fetchFeed' action type to rate-limit high-volume requests
- **Feed Versioning**: Include change indicator (e.g., `DTSTAMP` in VCALENDAR) to help clients detect updates
- **Webhook Support**: Notify calendar apps of event changes (advanced, calendar-app dependent)

---

## References

- RFC 5545: Internet Calendaring and Scheduling Core Object Specification
- [iCalendar Format Guide](https://en.wikipedia.org/wiki/ICalendar)
- Project: `lib/calendar-engine.ts`, `lib/calendar/event-service.ts`
- Existing: `app/(auth)/`, API route patterns in project
