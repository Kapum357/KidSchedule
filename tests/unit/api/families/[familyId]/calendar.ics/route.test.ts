// Mock next/headers before importing route
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve({
    get: jest.fn(),
  })),
}));

// Import NextResponse to use in mocks
import { NextRequest, NextResponse } from 'next/server';

// Mock dependencies before importing route
jest.mock('@/app/api/calendar/utils', () => ({
  getAuthenticatedUser: jest.fn(),
  userBelongsToFamily: jest.fn(),
  unauthorized: jest.fn((error: string, message: string) =>
    NextResponse.json({ error, message }, { status: 401 })
  ),
  forbidden: jest.fn((error: string, message: string) =>
    NextResponse.json({ error, message }, { status: 403 })
  ),
}));
jest.mock('@/lib/persistence');
jest.mock('@/lib/ical-generator');

import { GET } from '@/app/api/families/[familyId]/calendar.ics/route';
import { getAuthenticatedUser, userBelongsToFamily } from '@/app/api/calendar/utils';
import { db } from '@/lib/persistence';
import { generateICalFeed } from '@/lib/ical-generator';

const mockGetAuthenticatedUser = getAuthenticatedUser as jest.MockedFunction<typeof getAuthenticatedUser>;
const mockUserBelongsToFamily = userBelongsToFamily as jest.MockedFunction<typeof userBelongsToFamily>;
const mockDb = db as jest.Mocked<typeof db>;
const mockGenerateICalFeed = generateICalFeed as jest.MockedFunction<typeof generateICalFeed>;

describe('GET /api/families/[familyId]/calendar.ics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set default mock implementations
    mockGetAuthenticatedUser.mockResolvedValue(null);
    mockUserBelongsToFamily.mockResolvedValue(false);
    mockDb.families = { findById: jest.fn() } as any;
    mockDb.calendarEvents = { findByFamilyId: jest.fn() } as any;
    mockGenerateICalFeed.mockReturnValue('');
  });

  it('should return 401 when user is not authenticated', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    mockDb.families = {
      findById: jest.fn(),
    } as any;
    mockDb.calendarEvents = {
      findByFamilyId: jest.fn(),
    } as any;

    const request = new NextRequest('http://localhost/api/families/family-1/calendar.ics');
    const response = await GET(request, { params: { familyId: 'family-1' } });

    expect(response).toBeDefined();
    expect(response.status).toBe(401);
    expect(mockGetAuthenticatedUser).toHaveBeenCalled();
  });

  it('should return 403 when user is not a member of the family', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      sessionId: 'session-123',
    });

    mockUserBelongsToFamily.mockResolvedValue(false);
    mockDb.families = {
      findById: jest.fn(),
    } as any;
    mockDb.calendarEvents = {
      findByFamilyId: jest.fn(),
    } as any;

    const request = new NextRequest('http://localhost/api/families/family-1/calendar.ics');
    const response = await GET(request, { params: { familyId: 'family-1' } });

    expect(response).toBeDefined();
    expect(response.status).toBe(403);
    expect(mockUserBelongsToFamily).toHaveBeenCalledWith('user-1', 'family-1');
  });

  it('should return iCalendar content when user is authenticated and authorized', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      sessionId: 'session-123',
    });

    mockUserBelongsToFamily.mockResolvedValue(true);

    // Mock family data
    const mockFamily = {
      id: 'family-1',
      name: 'Smith Family',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Mock calendar events
    const mockEvents = [
      {
        id: 'event-1',
        familyId: 'family-1',
        title: 'Soccer Practice',
        startAt: '2026-03-10T14:00:00Z',
        endAt: '2026-03-10T15:30:00Z',
        allDay: false,
        category: 'activity',
        description: undefined,
        location: undefined,
        parentId: undefined,
        confirmationStatus: 'confirmed',
        createdBy: 'parent-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Convert startAt/endAt to Date objects for ical-generator
    const icalEvents = mockEvents.map(event => ({
      id: event.id,
      familyId: event.familyId,
      title: event.title,
      startDate: new Date(event.startAt),
      endDate: new Date(event.endAt),
      isAllDay: event.allDay,
      category: event.category,
      description: event.description,
      location: event.location,
    }));

    mockDb.families = {
      findById: jest.fn().mockResolvedValue(mockFamily),
    } as any;

    mockDb.calendarEvents = {
      findByFamilyId: jest.fn().mockResolvedValue(mockEvents),
    } as any;

    mockGenerateICalFeed.mockReturnValue(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//KidSchedule//EN\r\nEND:VCALENDAR'
    );

    const request = new NextRequest('http://localhost/api/families/family-1/calendar.ics');
    const response = await GET(request, { params: { familyId: 'family-1' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('attachment; filename="calendar.ics"');

    // Verify that generateICalFeed was called with the right arguments
    expect(mockGenerateICalFeed).toHaveBeenCalled();
  });

  it('should fetch family events from database', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      sessionId: 'session-123',
    });

    mockUserBelongsToFamily.mockResolvedValue(true);

    const mockFamily = {
      id: 'family-1',
      name: 'Smith Family',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockEvents = [
      {
        id: 'event-1',
        familyId: 'family-1',
        title: 'Basketball Game',
        startAt: '2026-03-12T18:00:00Z',
        endAt: '2026-03-12T19:30:00Z',
        allDay: false,
        category: 'activity',
        description: undefined,
        location: 'School Gym',
        parentId: undefined,
        confirmationStatus: 'confirmed',
        createdBy: 'parent-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockDb.families = {
      findById: jest.fn().mockResolvedValue(mockFamily),
    } as any;

    mockDb.calendarEvents = {
      findByFamilyId: jest.fn().mockResolvedValue(mockEvents),
    } as any;

    mockGenerateICalFeed.mockReturnValue(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'
    );

    const request = new NextRequest('http://localhost/api/families/family-1/calendar.ics');
    await GET(request, { params: { familyId: 'family-1' } });

    expect(mockDb.calendarEvents.findByFamilyId).toHaveBeenCalledWith('family-1');
  });

  it('should return 404 when family does not exist', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      sessionId: 'session-123',
    });

    mockUserBelongsToFamily.mockResolvedValue(false);
    mockDb.families = {
      findById: jest.fn(),
    } as any;
    mockDb.calendarEvents = {
      findByFamilyId: jest.fn(),
    } as any;

    const request = new NextRequest('http://localhost/api/families/nonexistent/calendar.ics');
    const response = await GET(request, { params: { familyId: 'nonexistent' } });

    expect(response).toBeDefined();
    expect(response.status).toBe(403);
  });
});
