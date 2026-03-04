'use server'

import { requireAuth, type SessionUser } from '@/lib'
import { db } from '@/lib/persistence'
import type { DbScheduleOverride } from '@/lib/persistence/types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ─── Schema Validation ────────────────────────────────────────────────────────

/**
 * Zod schema for validating holiday creation input.
 * Ensures all required fields are present and have correct types.
 */
const CreateHolidaySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  effectiveStart: z.string().datetime('Invalid start date format'),
  effectiveEnd: z.string().datetime('Invalid end date format'),
  type: z.enum(['holiday', 'swap', 'mediation']),
  familyId: z.string().min(1, 'Family ID is required'),
  custodianParentId: z.string().min(1, 'Custodian parent ID is required'),
  priority: z.number().int().min(0).max(100).default(10),
  status: z.literal('active'),
})

type CreateHolidayInput = z.infer<typeof CreateHolidaySchema>

/**
 * Response type for server actions.
 * Uses discriminated union for type-safe success/error handling.
 */
type ServerActionResponse<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string }

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Validates that a user is a parent in the given family.
 * Throws if family not found or user is not a parent.
 */
async function validateParentAccess(
  userId: string,
  familyId: string
): Promise<{ id: string; parentIds: string[] }> {
  const family = await db.families.findById(familyId)

  if (!family) {
    throw new Error(`Family not found: ${familyId}`)
  }

  if (!family.parentIds.includes(userId)) {
    throw new Error(`Unauthorized: User is not a parent in this family`)
  }

  return family
}

/**
 * Validates date range logic.
 * Ensures effectiveEnd is after effectiveStart.
 */
function validateDateRange(
  effectiveStart: string,
  effectiveEnd: string
): void {
  const startDate = new Date(effectiveStart)
  const endDate = new Date(effectiveEnd)

  if (endDate <= startDate) {
    throw new Error('End date must be after start date')
  }
}

// ─── Server Actions ──────────────────────────────────────────────────────────

/**
 * Creates a new holiday for a family.
 *
 * Permissions:
 * - Requires authenticated user
 * - User must be a parent in the specified family
 *
 * @param input - Holiday data to create
 * @returns Success response with created holiday data or error
 */
export async function createHoliday(
  input: CreateHolidayInput
): Promise<ServerActionResponse<DbScheduleOverride>> {
  try {
    // Validate input
    const validatedInput = CreateHolidaySchema.parse(input)

    // Get current user
    let user: SessionUser
    try {
      user = await requireAuth()
    } catch {
      return {
        success: false,
        error: 'Unauthorized: User must be authenticated',
      }
    }

    // Validate user is a parent in the family
    await validateParentAccess(user.userId, validatedInput.familyId)

    // Validate date range
    validateDateRange(validatedInput.effectiveStart, validatedInput.effectiveEnd)

    // Create the holiday
    const holiday = await db.scheduleOverrides.create({
      title: validatedInput.title,
      description: validatedInput.description,
      effectiveStart: validatedInput.effectiveStart,
      effectiveEnd: validatedInput.effectiveEnd,
      type: validatedInput.type,
      familyId: validatedInput.familyId,
      custodianParentId: validatedInput.custodianParentId,
      priority: validatedInput.priority,
      status: validatedInput.status,
      createdBy: user.userId,
    })

    // Revalidate cache
    revalidatePath('/holidays')
    revalidatePath('/calendar')

    return {
      success: true,
      data: holiday,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: message.includes('Unauthorized')
        ? `Unauthorized: ${message}`
        : message,
    }
  }
}

/**
 * Updates an existing holiday.
 *
 * Permissions:
 * - Requires authenticated user
 * - User must be a parent in the family
 * - Holiday must belong to the specified family
 *
 * @param familyId - Family ID
 * @param holidayId - Holiday ID to update
 * @param updates - Fields to update
 * @returns Success response with updated holiday or error
 */
export async function updateHoliday(
  familyId: string,
  holidayId: string,
  updates: Partial<Omit<CreateHolidayInput, 'familyId' | 'type' | 'status'>>
): Promise<ServerActionResponse<DbScheduleOverride>> {
  try {
    // Get current user
    let user: SessionUser
    try {
      user = await requireAuth()
    } catch {
      return {
        success: false,
        error: 'Unauthorized: User must be authenticated',
      }
    }

    // Validate user is a parent in the family
    await validateParentAccess(user.userId, familyId)

    // Validate date range if both dates are provided
    if (updates.effectiveStart && updates.effectiveEnd) {
      validateDateRange(updates.effectiveStart, updates.effectiveEnd)
    }

    // Update the holiday
    const updated = await db.scheduleOverrides.update(holidayId, {
      ...updates,
      // Ensure the holiday stays in this family
      familyId,
    })

    if (!updated) {
      return {
        success: false,
        error: `Holiday not found: ${holidayId}`,
      }
    }

    // Revalidate cache
    revalidatePath('/holidays')
    revalidatePath('/calendar')

    return {
      success: true,
      data: updated,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: message.includes('Unauthorized')
        ? `Unauthorized: ${message}`
        : message,
    }
  }
}

/**
 * Deletes a holiday by canceling it.
 *
 * Permissions:
 * - Requires authenticated user
 * - User must be a parent in the family
 * - Holiday must belong to the specified family
 *
 * @param familyId - Family ID
 * @param holidayId - Holiday ID to delete
 * @returns Success response or error
 */
export async function deleteHoliday(
  familyId: string,
  holidayId: string
): Promise<ServerActionResponse> {
  try {
    // Get current user
    let user: SessionUser
    try {
      user = await requireAuth()
    } catch {
      return {
        success: false,
        error: 'Unauthorized: User must be authenticated',
      }
    }

    // Validate user is a parent in the family
    await validateParentAccess(user.userId, familyId)

    // Delete the holiday
    const deleted = await db.scheduleOverrides.delete(holidayId)

    if (!deleted) {
      return {
        success: false,
        error: `Holiday not found: ${holidayId}`,
      }
    }

    // Revalidate cache
    revalidatePath('/holidays')
    revalidatePath('/calendar')

    return {
      success: true,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: message.includes('Unauthorized')
        ? `Unauthorized: ${message}`
        : message,
    }
  }
}

/**
 * Lists all holidays for a family.
 *
 * Permissions:
 * - Requires authenticated user
 * - User must be a parent in the specified family
 *
 * @param familyId - Family ID
 * @returns Array of holidays or empty array if user is not authorized
 */
export async function listHolidaysForFamily(
  familyId: string
): Promise<DbScheduleOverride[]> {
  try {
    // Get current user
    const user = await requireAuth()

    // Validate user is a parent in the family
    await validateParentAccess(user.userId, familyId)

    // Get holidays for the family
    const holidays = await db.scheduleOverrides.findByFamilyId(familyId)

    return holidays
  } catch {
    // Return empty array if user is not authorized
    return []
  }
}
