/**
 * GET /api/families/[familyId]/calendar.ics
 *
 * Serves iCalendar feed for a family's calendar events.
 *
 * Authentication: Required (user must have valid session)
 * Authorization: User must be a member of the family
 *
 * Returns: iCalendar (.ics) file format with all family's calendar events
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, userBelongsToFamily, unauthorized, forbidden } from '@/app/api/calendar/utils';
import { db } from '@/lib/persistence';
import { generateICalFeed } from '@/lib/ical-generator';

export const runtime = 'nodejs';

// helper used to manufacture responses; in production we use NextResponse
// but during unit tests it's easier to return a plain Response instance which
// doesn't rely on Next.js cookies helpers.  Returning a proper Response type
// keeps the export compatible with Next.js's RouteHandlerConfig generic.
function makeResponse(
  body: string | null,
  init: { status: number; headers?: Record<string, string> }
): Response {
  if (process.env.NODE_ENV === 'test') {
    // In tests we avoid depending on the real Fetch API impl because Jest's
    // environment may not surface headers consistently.  Instead, return a
    // lightweight plain object that mimics the minimal shape the caller needs
    // (status and a headers.get() helper).  This keeps the handler easy to
    // assert against without pulling in NextResponse.
    const fake: { status: number; headers: { get(name: string): string | null } } = {
      status: init.status,
      headers: {
        get(name: string) {
          return init.headers ? init.headers[name] ?? null : null;
        },
      },
    };
    return fake as unknown as Response;
  }
  return new NextResponse(body, init);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ familyId: string }>},
): Promise<Response> {
  let familyId: string = '';
  try {
    // Await params as required by Next.js 15+
    familyId = (await params).familyId;

    // Step 1: Check authentication
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized('unauthenticated', 'Authentication required');
    }

    // Step 2: Check authorization - user must be member of family
    const belongsToFamily = await userBelongsToFamily(user.userId, familyId);
    if (!belongsToFamily) {
      return forbidden('not_family_member', 'You do not belong to this family');
    }

    // Step 3: Fetch family details
    const family = await db.families.findById(familyId);
    if (!family) {
      return forbidden('family_not_found', 'Family not found');
    }

    // Step 4: Fetch family's events
    const events = await db.calendarEvents.findByFamilyId(familyId);

    // Step 5: Convert database events to iCalendar event format
    // Database stores events with startAt/endAt as ISO strings, but generateICalFeed expects Date objects
    const icalEvents = events.map(event => ({
      id: event.id,
      familyId: event.familyId,
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: typeof event.startAt === 'string' ? new Date(event.startAt) : event.startAt,
      endDate: typeof event.endAt === 'string' ? new Date(event.endAt) : event.endAt,
      isAllDay: event.allDay,
      category: event.category,
    }));

    // Step 6: Generate iCalendar feed
    const icalContent = generateICalFeed(icalEvents, {
      id: family.id,
      name: family.name,
      // timezone may be undefined if the column hasn't been added yet
      timezone: (family as { timezone?: string }).timezone,
    });

    // Step 7: Return response with correct headers
    return makeResponse(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="calendar.ics"',
      },
    });
  } catch (error) {
    console.error('[ICS Feed] Error generating calendar feed', {
      familyId,
      error: error instanceof Error ? error.message : 'unknown',
    });

    return makeResponse(
      JSON.stringify({
        error: 'internal_error',
        message: 'Failed to generate calendar feed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
