/**
 * E2E Tests for Calendar Feed (iCalendar) API
 *
 * Tests the iCalendar feed endpoint including authentication,
 * authorization, response headers, and content validation.
 *
 * Run with: pnpm e2e -- calendar/feed
 */

import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { sql } from "@/lib/persistence/postgres/client";

// Test configuration
const TEST_FAMILY_ID = "22222222-2222-2222-2222-222222222222";
const TEST_EMAIL = "feed-test@example.com";
const TEST_PASSWORD = "securepassword123";

// If tests are run without a database, skip the suite
if (!process.env.DATABASE_URL) {
  test.describe.skip("Calendar Feed (iCalendar) API", () => {
    test("skipped because DATABASE_URL not configured", async () => {
      // no-op
    });
  });
} else {
  test.describe("Calendar Feed (iCalendar) API", () => {
    let accessToken: string;
    let currentUserId: string;
    let currentParentId: string;
    let otherUserId: string;
    let otherAccessToken: string;
    let otherParentId: string;

    // Helper to generate a simple valid JWT token
    function makeAuthToken(userId: string = randomUUID()) {
      const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" })
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          sub: userId,
          email: userId === currentUserId ? TEST_EMAIL : "other@example.com",
          sid: "sess",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1h
        })
      ).toString("base64url");
      const signature = Buffer.from("sig").toString("base64url");
      return `${header}.${payload}.${signature}`;
    }

    // Helper to create auth options with token
    function authOpts(token: string) {
      return { headers: { Cookie: `access_token=${token}` } };
    }

    test.beforeAll(async () => {
      // Create primary user and family
      currentUserId = randomUUID();
      accessToken = makeAuthToken(currentUserId);

      // Create secondary user (for authorization tests)
      otherUserId = randomUUID();
      otherAccessToken = makeAuthToken(otherUserId);

      // Drop FK constraints for synthetic data
      await sql`ALTER TABLE parents DROP CONSTRAINT IF EXISTS parents_user_id_fkey;`;
      await sql`ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_created_by_fkey;`;

      // Create family
      await sql`
        INSERT INTO families (id, name, custody_anchor_date, schedule_id)
        VALUES (${TEST_FAMILY_ID}, 'Test Feed Family', ${new Date()
        .toISOString()
        .slice(0, 10)}, null)
        ON CONFLICT (id) DO NOTHING;
      `;

      // add timezone column if missing and assign value so ICS feed can experiment with it
      await sql`ALTER TABLE families ADD COLUMN IF NOT EXISTS timezone TEXT;`;
      await sql`UPDATE families SET timezone = 'America/New_York' WHERE id = ${TEST_FAMILY_ID};`;

      // Create primary user
      await sql`
        INSERT INTO users (id, email, password_hash, full_name)
        VALUES (${currentUserId}, ${TEST_EMAIL}, ${"fakehash"}, "Feed Test User")
        ON CONFLICT (email) DO UPDATE SET id = users.id;
      `;

      // Create secondary user
      await sql`
        INSERT INTO users (id, email, password_hash, full_name)
        VALUES (${otherUserId}, 'other@example.com', ${"fakehash"}, "Other User")
        ON CONFLICT (email) DO UPDATE SET id = users.id;
      `;

      // Create parent record for primary user (member of TEST_FAMILY_ID)
      currentParentId = randomUUID();
      await sql`
        DELETE FROM parents WHERE user_id = ${currentUserId};
      `;
      await sql`
        INSERT INTO parents (id, user_id, family_id, name, email, role)
        VALUES (
          ${currentParentId},
          ${currentUserId},
          ${TEST_FAMILY_ID},
          'Test Feed User',
          ${TEST_EMAIL},
          'primary'
        );
      `;

      // Create parent record for secondary user (NOT member of TEST_FAMILY_ID)
      // We create them for a different family
      const OTHER_FAMILY_ID = randomUUID();
      otherParentId = randomUUID();

      await sql`
        INSERT INTO families (id, name, custody_anchor_date, schedule_id)
        VALUES (${OTHER_FAMILY_ID}, 'Other Family', ${new Date()
        .toISOString()
        .slice(0, 10)}, null)
        ON CONFLICT (id) DO NOTHING;
      `;

      await sql`
        INSERT INTO parents (id, user_id, family_id, name, email, role)
        VALUES (
          ${otherParentId},
          ${otherUserId},
          ${OTHER_FAMILY_ID},
          'Other User',
          'other@example.com',
          'primary'
        );
      `;
    });

    test("GET /api/families/[familyId]/calendar.ics - returns 401 when not authenticated", async ({
      request,
    }) => {
      // Request without auth token
      const response = await request.get(
        `/api/families/${TEST_FAMILY_ID}/calendar.ics`
      );

      expect(response.status()).toBe(401);
      const error = await response.json();
      expect(error.error).toBe("unauthenticated");
    });

    test("GET /api/families/[familyId]/calendar.ics - returns 403 when user not member of family", async ({
      request,
    }) => {
      // Use other user token (not member of TEST_FAMILY_ID)
      const response = await request.get(
        `/api/families/${TEST_FAMILY_ID}/calendar.ics`,
        authOpts(otherAccessToken)
      );

      expect(response.status()).toBe(403);
      const error = await response.json();
      expect(error.error).toBe("not_family_member");
    });

    test("GET /api/families/[familyId]/calendar.ics - returns 403 when family does not exist", async ({
      request,
    }) => {
      const nonexistentFamilyId = randomUUID();

      const response = await request.get(
        `/api/families/${nonexistentFamilyId}/calendar.ics`,
        authOpts(accessToken)
      );

      expect(response.status()).toBe(403);
      const error = await response.json();
      expect(error.error).toBe("family_not_found");
    });

    test("GET /api/families/[familyId]/calendar.ics - returns 200 with iCalendar content for authorized user", async ({
      request,
    }) => {
      const response = await request.get(
        `/api/families/${TEST_FAMILY_ID}/calendar.ics`,
        authOpts(accessToken)
      );

      expect(response.status()).toBe(200);

      // Verify Content-Type header
      expect(response.headers()["content-type"]).toBe(
        "text/calendar; charset=utf-8"
      );

      // Verify Content-Disposition header
      expect(response.headers()["content-disposition"]).toContain(
        'attachment; filename="calendar.ics"'
      );

      // Verify iCalendar structure
      const content = await response.text();
      expect(content).toContain("BEGIN:VCALENDAR");
      expect(content).toContain("VERSION:2.0");
      expect(content).toContain("PRODID:-//KidSchedule//EN");
      expect(content).toContain("CALSCALE:GREGORIAN");
      expect(content).toContain("METHOD:PUBLISH");
      expect(content).toContain("END:VCALENDAR");
      // since we added timezone column in setup, feed should include it
      expect(content).toContain("X-WR-TIMEZONE:America/New_York");
    });

    test("GET /api/families/[familyId]/calendar.ics - returns valid empty iCalendar when no events", async ({
      request,
    }) => {
      // Create a new family with no events
      const newFamilyId = randomUUID();
      const newUserId = randomUUID();
      const newAccessToken = makeAuthToken(newUserId);
      const newParentId = randomUUID();

      // Setup new family and user
      await sql`
        INSERT INTO families (id, name, custody_anchor_date, schedule_id)
        VALUES (${newFamilyId}, 'Empty Family', ${new Date()
        .toISOString()
        .slice(0, 10)}, null)
        ON CONFLICT (id) DO NOTHING;
      `;

      await sql`
        INSERT INTO users (id, email, password_hash, full_name)
        VALUES (${newUserId}, ${"empty-user-" + Date.now() + "@example.com"}, ${"fakehash"}, "Empty User")
        ON CONFLICT (email) DO UPDATE SET id = users.id;
      `;

      await sql`
        INSERT INTO parents (id, user_id, family_id, name, email, role)
        VALUES (${newParentId}, ${newUserId}, ${newFamilyId}, 'Empty User', ${"empty-user-" + Date.now() + "@example.com"}, 'primary');
      `;

      const response = await request.get(
        `/api/families/${newFamilyId}/calendar.ics`,
        authOpts(newAccessToken)
      );

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe(
        "text/calendar; charset=utf-8"
      );

      const content = await response.text();
      expect(content).toContain("BEGIN:VCALENDAR");
      expect(content).toContain("END:VCALENDAR");
      // Should not contain any VEVENT blocks when no events
      expect(content).not.toContain("BEGIN:VEVENT");
    });

    test("GET /api/families/[familyId]/calendar.ics - includes events in iCalendar when they exist", async ({
      request,
    }) => {
      // Create test events
      const eventId1 = randomUUID();
      const eventId2 = randomUUID();

      await sql`
        INSERT INTO calendar_events (id, family_id, title, description, location, start_at, end_at, all_day, category, created_by, confirmation_status, created_at, updated_at)
        VALUES (
          ${eventId1},
          ${TEST_FAMILY_ID},
          'Soccer Practice',
          'Weekly practice session',
          'Field A',
          '2026-03-10T14:00:00Z',
          '2026-03-10T15:30:00Z',
          false,
          'activity',
          ${currentParentId},
          'confirmed',
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      await sql`
        INSERT INTO calendar_events (id, family_id, title, description, location, start_at, end_at, all_day, category, created_by, confirmation_status, created_at, updated_at)
        VALUES (
          ${eventId2},
          ${TEST_FAMILY_ID},
          'School Holiday',
          'No school',
          'Home',
          '2026-03-15T00:00:00Z',
          '2026-03-16T00:00:00Z',
          true,
          'holiday',
          ${currentParentId},
          'confirmed',
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      const response = await request.get(
        `/api/families/${TEST_FAMILY_ID}/calendar.ics`,
        authOpts(accessToken)
      );

      expect(response.status()).toBe(200);
      const content = await response.text();

      // Verify both events are present
      expect(content).toContain("SUMMARY:Soccer Practice");
      expect(content).toContain("SUMMARY:School Holiday");
      expect(content).toContain("DESCRIPTION:Weekly practice session");
      expect(content).toContain("DESCRIPTION:No school");
      expect(content).toContain("LOCATION:Field A");
      expect(content).toContain("LOCATION:Home");
      expect(content).toContain("CATEGORIES:activity");
      expect(content).toContain("CATEGORIES:holiday");

      // Verify VEVENT blocks
      const eventMatches = content.match(/BEGIN:VEVENT/g);
      expect(eventMatches?.length).toBe(2);
    });

    test("GET /api/families/[familyId]/calendar.ics - properly formats all-day events as DATE", async ({
      request,
    }) => {
      const eventId = randomUUID();

      // Insert all-day event
      await sql`
        INSERT INTO calendar_events (id, family_id, title, start_at, end_at, all_day, category, created_by, confirmation_status, created_at, updated_at)
        VALUES (
          ${eventId},
          ${TEST_FAMILY_ID},
          'Birthday',
          '2026-04-20T00:00:00Z',
          '2026-04-21T00:00:00Z',
          true,
          'birthday',
          ${currentParentId},
          'confirmed',
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      const response = await request.get(
        `/api/families/${TEST_FAMILY_ID}/calendar.ics`,
        authOpts(accessToken)
      );

      expect(response.status()).toBe(200);
      const content = await response.text();

      // All-day events should use VALUE=DATE format: DTSTART;VALUE=DATE:YYYYMMDD
      expect(content).toContain("DTSTART;VALUE=DATE:20260420");
      // Should NOT use datetime format
      expect(content).not.toContain("DTSTART:202604");
    });

    test("GET /api/families/[familyId]/calendar.ics - properly formats timed events as UTC datetime", async ({
      request,
    }) => {
      const eventId = randomUUID();

      // Insert timed event
      await sql`
        INSERT INTO calendar_events (id, family_id, title, start_at, end_at, all_day, category, created_by, confirmation_status, created_at, updated_at)
        VALUES (
          ${eventId},
          ${TEST_FAMILY_ID},
          'Basketball Game',
          '2026-03-12T18:00:00Z',
          '2026-03-12T19:30:00Z',
          false,
          'activity',
          ${currentParentId},
          'confirmed',
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      const response = await request.get(
        `/api/families/${TEST_FAMILY_ID}/calendar.ics`,
        authOpts(accessToken)
      );

      expect(response.status()).toBe(200);
      const content = await response.text();

      // Timed events should use UTC datetime format: DTSTART:YYYYMMDDTHHmmssZ
      expect(content).toContain("DTSTART:20260312T180000Z");
      expect(content).toContain("DTEND:20260312T193000Z");
      // Should NOT use VALUE=DATE
      expect(content).not.toContain("VALUE=DATE");
    });

    test("GET /api/families/[familyId]/calendar.ics - properly escapes special characters", async ({
      request,
    }) => {
      const eventId = randomUUID();

      // Insert event with special characters
      await sql`
        INSERT INTO calendar_events (id, family_id, title, description, location, start_at, end_at, all_day, category, created_by, confirmation_status, created_at, updated_at)
        VALUES (
          ${eventId},
          ${TEST_FAMILY_ID},
          'Meeting; Important\\Item,Test',
          'Event\\nwith\\nmultiple\\nlines',
          'Room #5; Building A',
          '2026-05-10T10:00:00Z',
          '2026-05-10T11:00:00Z',
          false,
          'work;meeting',
          ${currentParentId},
          'confirmed',
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      const response = await request.get(
        `/api/families/${TEST_FAMILY_ID}/calendar.ics`,
        authOpts(accessToken)
      );

      expect(response.status()).toBe(200);
      const content = await response.text();

      // Verify special characters are properly escaped
      // Semicolons should be escaped: ; -> \;
      expect(content).toContain("SUMMARY:Meeting\\; Important\\\\Item\\,Test");
      expect(content).toContain("LOCATION:Room #5\\; Building A");
      // Newlines should be escaped: \n -> \\n
      expect(content).toContain("DESCRIPTION:Event\\nwith\\nmultiple\\nlines");
      // Commas should be escaped: , -> \,
      expect(content).toContain("CATEGORIES:work\\;meeting");
    });

    test("GET /api/families/[familyId]/calendar.ics - includes UID and DTSTAMP in events", async ({
      request,
    }) => {
      const eventId = randomUUID();

      await sql`
        INSERT INTO calendar_events (id, family_id, title, start_at, end_at, all_day, category, created_by, confirmation_status, created_at, updated_at)
        VALUES (
          ${eventId},
          ${TEST_FAMILY_ID},
          'Test Event for UID',
          '2026-05-20T10:00:00Z',
          '2026-05-20T11:00:00Z',
          false,
          'activity',
          ${currentParentId},
          'confirmed',
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      const response = await request.get(
        `/api/families/${TEST_FAMILY_ID}/calendar.ics`,
        authOpts(accessToken)
      );

      expect(response.status()).toBe(200);
      const content = await response.text();

      // Verify UID format: event-{id}@{familyId}.kidschedule.app
      expect(content).toContain(
        `UID:event-${eventId}@${TEST_FAMILY_ID}.kidschedule.app`
      );

      // Verify DTSTAMP format: YYYYMMDDTHHmmssZ
      expect(content).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    });

    test("GET /api/families/[familyId]/calendar.ics - includes SUMMARY, CATEGORIES, and optional fields", async ({
      request,
    }) => {
      const eventId1 = randomUUID();
      const eventId2 = randomUUID();

      // Event with optional fields
      await sql`
        INSERT INTO calendar_events (id, family_id, title, description, location, start_at, end_at, all_day, category, created_by, confirmation_status, created_at, updated_at)
        VALUES (
          ${eventId1},
          ${TEST_FAMILY_ID},
          'Full Event',
          'With all optional fields',
          'School',
          '2026-06-01T09:00:00Z',
          '2026-06-01T10:00:00Z',
          false,
          'school',
          ${currentParentId},
          'confirmed',
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      // Event without optional fields
      await sql`
        INSERT INTO calendar_events (id, family_id, title, start_at, end_at, all_day, category, created_by, confirmation_status, created_at, updated_at)
        VALUES (
          ${eventId2},
          ${TEST_FAMILY_ID},
          'Minimal Event',
          '2026-06-02T14:00:00Z',
          '2026-06-02T15:00:00Z',
          false,
          'other',
          ${currentParentId},
          'confirmed',
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      const response = await request.get(
        `/api/families/${TEST_FAMILY_ID}/calendar.ics`,
        authOpts(accessToken)
      );

      expect(response.status()).toBe(200);
      const content = await response.text();

      // Full event should have all fields
      const fullEventIndex = content.indexOf("SUMMARY:Full Event");
      const minimalEventIndex = content.indexOf("SUMMARY:Minimal Event");

      expect(fullEventIndex).toBeGreaterThan(-1);
      expect(minimalEventIndex).toBeGreaterThan(-1);

      // Find sections for each event
      const fullEventSection = content.substring(
        fullEventIndex - 200,
        minimalEventIndex
      );
      const minimalEventSection = content.substring(minimalEventIndex);

      // Full event should have description and location
      expect(fullEventSection).toContain("DESCRIPTION:With all optional fields");
      expect(fullEventSection).toContain("LOCATION:School");

      // Minimal event should not have optional fields
      expect(minimalEventSection).toContain("SUMMARY:Minimal Event");
      // Both should have CATEGORIES
      expect(fullEventSection).toContain("CATEGORIES:school");
      expect(minimalEventSection).toContain("CATEGORIES:other");
    });
  });
}
