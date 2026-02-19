import { NextRequest, NextResponse } from 'next/server';

/**
 * Sign-up API Route
 *
 * Handles user signup and trial initialization.
 *
 * Endpoint: POST /api/auth/signup
 *
 * Request Body:
 * {
 *   action: 'start_trial' | 'cta_click',
 *   email?: string (optional for landing page CTAs)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   trialId?: string,
 *   expiresAt?: string
 * }
 *
 * Logic:
 * - Generates a unique trial session ID
 * - Records the signup action and timestamp
 * - Sets 60-day trial expiration
 * - Returns session data for frontend redirect
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, email } = body;

    // Validate action
    if (!['start_trial', 'cta_click'].includes(action)) {
      return NextResponse.json(
        { success: false, message: 'Invalid action' },
        { status: 400 }
      );
    }

    // Generate trial session ID using timestamp + random string
    const trialId = generateTrialId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days

    // Log signup action (in production, save to database)
    console.log('Signup Action:', {
      action,
      trialId,
      email: email || 'not_provided',
      timestamp: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    // Return success response
    return NextResponse.json(
      {
        success: true,
        message: 'Trial started successfully',
        trialId,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to process signup' },
      { status: 500 }
    );
  }
}

/**
 * Generates a unique trial ID
 * Format: TRIAL_[timestamp]_[random]
 * Example: TRIAL_1708371200000_a3c5b2e1
 */
function generateTrialId(): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(16).substring(2, 10);
  return `TRIAL_${timestamp}_${randomSuffix}`;
}
