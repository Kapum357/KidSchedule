/**
 * KidSchedule – Parent Setup Engine
 *
 * Ensures a user has a parent record and associated family.
 * Creates them automatically if missing (e.g., first login scenario).
 *
 * This resolves the issue where authenticated users lack parent records,
 * which causes dashboard and other pages to fail.
 */

import { db } from "@/lib/persistence";
import type { DbParent } from "@/lib/persistence/types";

export interface ParentSetupResult {
  parent: DbParent;
  isNewlyCreated: boolean;
}

/**
 * Ensures a user has a parent record, creating one if missing.
 *
 * - If parent exists, returns it immediately
 * - If missing, creates a default family and parent record
 * - Uses the user's full name from the users table
 *
 * @param userId - The user's ID
 * @returns Parent record and flag indicating if it was created
 * @throws If user doesn't exist or creation fails
 */
export async function ensureParentExists(userId: string): Promise<ParentSetupResult> {
  // ── Check if parent already exists
  const existingParent = await db.parents.findByUserId(userId);
  if (existingParent) {
    return { parent: existingParent, isNewlyCreated: false };
  }

  // ── User has no parent record; get user details for family/parent creation
  const user = await db.users.findById(userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // ── Create a default family for this user
  // Use today's date as the custody anchor (flexible starting point)
  const today = new Date().toISOString().slice(0, 10);
  const familyName = `${user.fullName}'s Family`;

  const newFamily = await db.families.create({
    name: familyName,
    custodyAnchorDate: today,
    scheduleId: "",
  });

  // ── Create parent record linking user to family
  const newParent = await db.parents.create({
    userId,
    familyId: newFamily.id,
    name: user.fullName,
    email: user.email,
    phone: user.phone,
    avatarUrl: undefined,
    role: "primary",
  });

  return { parent: newParent, isNewlyCreated: true };
}
