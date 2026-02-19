import { NextRequest, NextResponse } from 'next/server';

/**
 * Demo Request API Route
 *
 * Handles demo video request tracking and scheduling.
 *
 * Endpoint: POST /api/demo/request
 *
 * Request Body:
 * {
 *   name?: string,
 *   email?: string,
 *   userType?: 'family' | 'organization' | 'enterprise'
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   demoId?: string,
 *   availableSlots?: Array<{date: string, time: string}>
 * }
 *
 * Logic:
 * - Validates demo request data
 * - Generates unique demo request ID
 * - Returns available demo time slots
 * - Logs request for follow-up
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, userType = 'family' } = body;

    // Validate user type
    if (!['family', 'organization', 'enterprise'].includes(userType)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user type' },
        { status: 400 }
      );
    }

    // Generate demo request ID
    const demoId = generateDemoId();
    const now = new Date();

    // Generate available demo slots (next 7 days, business hours)
    const availableSlots = generateAvailableSlots();

    // Log demo request (in production, save to database/CRM)
    console.log('Demo Request:', {
      demoId,
      name: name || 'Guest',
      email: email || 'not_provided',
      userType,
      timestamp: now.toISOString(),
      availableSlots,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Demo request received. Available slots sent.',
        demoId,
        availableSlots,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Demo request error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to process demo request' },
      { status: 500 }
    );
  }
}

/**
 * Generates a unique demo request ID
 * Format: DEMO_[timestamp]_[random]
 */
function generateDemoId(): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(16).substring(2, 10);
  return `DEMO_${timestamp}_${randomSuffix}`;
}

/**
 * Generates available demo time slots for the next 7 days
 * Returns slots during business hours (9 AM - 5 PM, Monday-Friday)
 */
function generateAvailableSlots(): Array<{ date: string; time: string }> {
  const slots: Array<{ date: string; time: string }> = [];
  const now = new Date();

  for (let day = 1; day <= 7; day++) {
    const slotDate = new Date(now);
    slotDate.setDate(slotDate.getDate() + day);

    // Skip weekends
    if (slotDate.getDay() === 0 || slotDate.getDay() === 6) continue;

    // Add 3 time slots per business day: 9 AM, 12 PM, 3 PM
    const times = ['09:00', '12:00', '15:00'];
    times.forEach((time) => {
      slots.push({
        date: slotDate.toISOString().split('T')[0],
        time,
      });
    });

    if (slots.length >= 6) break; // Return 6 available slots
  }

  return slots.slice(0, 6);
}
