/**
 * SMS Relay Enrollment API
 *
 * POST   /api/messages/relay – enroll in SMS relay
 * DELETE /api/messages/relay – unenroll from SMS relay
 * GET    /api/messages/relay – check enrollment status
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/calendar/utils";
import { getDb } from "@/lib/persistence";
import { getProxyNumberForFamily } from "@/lib/providers/sms/proxy-number";
import { isValidE164Phone } from "@/lib/providers/sms/twilio-verify";

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  const body = await request.json();
  const { phone } = body as { phone?: string };

  if (!phone || typeof phone !== "string") {
    return NextResponse.json(
      { error: "Phone number is required" },
      { status: 400 }
    );
  }

  // 2. Validate E.164 format
  if (!isValidE164Phone(phone)) {
    return NextResponse.json(
      { error: "Invalid phone number format. Use E.164 (e.g., +14155552671)" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Get parent record
  const parent = await db.parents.findByUserId(user.userId);
  if (!parent) {
    return NextResponse.json({ error: "Parent profile not found" }, { status: 404 });
  }

  // Get family
  const family = await db.families.findByParentUserId(user.userId);
  if (!family) {
    return NextResponse.json(
      { error: "Family not found" },
      { status: 404 }
    );
  }

  // 3. Check for existing active enrollment
  const existing = await db.smsRelayParticipants.findByParentId(parent.id);
  if (existing && existing.isActive) {
    return NextResponse.json(
      {
        error: "Already enrolled in SMS relay",
        currentPhone: existing.phone,
        currentProxyNumber: existing.proxyNumber,
      },
      { status: 409 }
    );
  }

  // 4. Assign proxy number
  const proxyNumber = getProxyNumberForFamily(family.id);
  if (!proxyNumber) {
    return NextResponse.json(
      { error: "No available proxy numbers. Contact support." },
      { status: 503 }
    );
  }

  // 5. Create enrollment
  const enrollment = await db.smsRelayParticipants.create({
    familyId: family.id,
    parentId: parent.id,
    phone,
    proxyNumber,
  });

  // 6. Return result
  return NextResponse.json(
    {
      id: enrollment.id,
      phone: enrollment.phone,
      proxyNumber: enrollment.proxyNumber,
      enrolledAt: enrollment.enrolledAt,
    },
    { status: 201 }
  );
}

export async function DELETE(request: NextRequest) {
  // 1. Authenticate
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const parent = await db.parents.findByUserId(user.userId);
  if (!parent) {
    return NextResponse.json({ error: "Parent profile not found" }, { status: 404 });
  }

  // 2. Deactivate enrollment
  await db.smsRelayParticipants.deactivate(parent.id);

  // 3. Return success
  return NextResponse.json(
    { message: "SMS relay disabled" },
    { status: 200 }
  );
}

export async function GET(request: NextRequest) {
  // 1. Authenticate
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const parent = await db.parents.findByUserId(user.userId);
  if (!parent) {
    return NextResponse.json({ error: "Parent profile not found" }, { status: 404 });
  }

  // 2. Get enrollment status
  const enrollment = await db.smsRelayParticipants.findByParentId(parent.id);

  if (!enrollment || !enrollment.isActive) {
    return NextResponse.json(
      {
        enrolled: false,
        phone: null,
        proxyNumber: null,
      },
      { status: 200 }
    );
  }

  // 3. Return status
  return NextResponse.json(
    {
      enrolled: true,
      phone: enrollment.phone,
      proxyNumber: enrollment.proxyNumber,
      enrolledAt: enrollment.enrolledAt,
    },
    { status: 200 }
  );
}
