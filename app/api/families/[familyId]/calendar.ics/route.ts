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

export async function GET(
  request: NextRequest,
  { params }: { params: { familyId: string } }
) {
  try {
    // Step 1: Check authentication
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized('unauthenticated', 'Authentication required');
    }

    // Step 2: Check authorization - user must be member of family
    const belongsToFamily = await userBelongsToFamily(user.userId, params.familyId);
    if (!belongsToFamily) {
      return forbidden('not_family_member', 'You do not belong to this family');
    }

    // Step 3: Fetch family details
    const family = await db.families.findById(params.familyId);
    if (!family) {
      return forbidden('family_not_found', 'Family not found');
    }

    // Step 4: Fetch family's events
    const events = await db.calendarEvents.findByFamilyId(params.familyId);

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
    });

    // Step 7: Return response with correct headers
    return new NextResponse(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="calendar.ics"',
      },
    });
  } catch (error) {
    console.error('[ICS Feed] Error generating calendar feed', {
      familyId: params.familyId,
      error: error instanceof Error ? error.message : 'unknown',
    });

    return new NextResponse(
      JSON.stringify({
        error: 'internal_error',
        message: 'Failed to generate calendar feed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
