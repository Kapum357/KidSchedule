import { createHoliday, updateHoliday, deleteHoliday, listHolidaysForFamily } from '@/app/actions/holidays'
import { requireAuth } from '@/lib'
import { db } from '@/lib/persistence'
import { revalidatePath } from 'next/cache'
import type { DbScheduleOverride } from '@/lib/persistence/types'
import type { SessionUser } from '@/lib'

// Mock next/cache for revalidatePath
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib')
jest.mock('@/lib/persistence', () => ({
  db: {
    families: {
      findById: jest.fn(),
    },
    scheduleOverrides: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByFamilyId: jest.fn(),
    },
  },
}))

describe('Holiday Server Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create a holiday for a family', async () => {
    const mockSession: SessionUser = { userId: 'user-1', email: 'user@example.com', sessionId: 'session-1' }
    const mockFamily = { id: 'family-1', parentIds: ['user-1'] }
    const holidayData = {
      title: 'Christmas',
      description: 'Christmas Holiday',
      effectiveStart: '2024-12-25T00:00:00Z',
      effectiveEnd: '2024-12-26T00:00:00Z',
      type: 'holiday' as const,
      familyId: 'family-1',
      custodianParentId: 'user-1',
      priority: 10,
      status: 'active' as const,
    }

    ;(requireAuth as jest.Mock).mockResolvedValueOnce(mockSession)
    ;(db.families.findById as jest.Mock).mockResolvedValueOnce(mockFamily)
    ;(db.scheduleOverrides.create as jest.Mock).mockResolvedValueOnce({
      id: 'holiday-1',
      ...holidayData,
      createdBy: 'user-1',
      createdAt: '2024-01-01T00:00:00Z',
    })

    const result = await createHoliday(holidayData)

    expect(result).toEqual({ success: true, data: expect.objectContaining({ id: 'holiday-1' }) })
    expect(revalidatePath).toHaveBeenCalledWith('/holidays')
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
  })

  it('should list holidays for a family', async () => {
    const mockSession: SessionUser = { userId: 'user-1', email: 'user@example.com', sessionId: 'session-1' }
    const mockFamily = { id: 'family-1', parentIds: ['user-1'] }
    const mockHolidays = [
      {
        id: 'holiday-1',
        title: 'Christmas',
        effectiveStart: '2024-12-25T00:00:00Z',
        effectiveEnd: '2024-12-26T00:00:00Z',
        type: 'holiday',
        familyId: 'family-1',
        custodianParentId: 'user-1',
        priority: 10,
        status: 'active',
        createdBy: 'user-1',
        createdAt: '2024-01-01T00:00:00Z',
      } as DbScheduleOverride,
    ]

    ;(requireAuth as jest.Mock).mockResolvedValueOnce(mockSession)
    ;(db.families.findById as jest.Mock).mockResolvedValueOnce(mockFamily)
    ;(db.scheduleOverrides.findByFamilyId as jest.Mock).mockResolvedValueOnce(mockHolidays)

    const result = await listHolidaysForFamily('family-1')

    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'holiday-1' })]))
  })

  it('should delete a holiday', async () => {
    const mockSession: SessionUser = { userId: 'user-1', email: 'user@example.com', sessionId: 'session-1' }
    const mockFamily = { id: 'family-1', parentIds: ['user-1'] }

    ;(requireAuth as jest.Mock).mockResolvedValueOnce(mockSession)
    ;(db.families.findById as jest.Mock).mockResolvedValueOnce(mockFamily)
    ;(db.scheduleOverrides.delete as jest.Mock).mockResolvedValueOnce(true)

    const result = await deleteHoliday('family-1', 'holiday-1')

    expect(result).toEqual({ success: true })
    expect(revalidatePath).toHaveBeenCalledWith('/holidays')
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
  })

  it('should prevent non-parent users from creating holidays', async () => {
    const mockSession: SessionUser = { userId: 'user-1', email: 'user@example.com', sessionId: 'session-1' }
    const mockFamily = { id: 'family-1', parentIds: ['user-2'] } // Different parent
    const holidayData = {
      title: 'Christmas',
      description: 'Christmas Holiday',
      effectiveStart: '2024-12-25T00:00:00Z',
      effectiveEnd: '2024-12-26T00:00:00Z',
      type: 'holiday' as const,
      familyId: 'family-1',
      custodianParentId: 'user-1',
      priority: 10,
      status: 'active' as const,
    }

    ;(requireAuth as jest.Mock).mockResolvedValueOnce(mockSession)
    ;(db.families.findById as jest.Mock).mockResolvedValueOnce(mockFamily)

    const result = await createHoliday(holidayData)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should prevent unauthenticated users from creating holidays', async () => {
    const holidayData = {
      title: 'Christmas',
      description: 'Christmas Holiday',
      effectiveStart: '2024-12-25T00:00:00Z',
      effectiveEnd: '2024-12-26T00:00:00Z',
      type: 'holiday' as const,
      familyId: 'family-1',
      custodianParentId: 'user-1',
      priority: 10,
      status: 'active' as const,
    }

    ;(requireAuth as jest.Mock).mockRejectedValueOnce(new Error('Not authenticated'))

    const result = await createHoliday(holidayData)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should prevent non-parent users from updating holidays', async () => {
    const mockSession: SessionUser = { userId: 'user-1', email: 'user@example.com', sessionId: 'session-1' }
    const mockFamily = { id: 'family-1', parentIds: ['user-2'] } // Different parent
    const updateData = {
      title: 'Updated Christmas',
    }

    ;(requireAuth as jest.Mock).mockResolvedValueOnce(mockSession)
    ;(db.families.findById as jest.Mock).mockResolvedValueOnce(mockFamily)

    const result = await updateHoliday('family-1', 'holiday-1', updateData)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should prevent unauthenticated users from updating holidays', async () => {
    const updateData = {
      title: 'Updated Christmas',
    }

    ;(requireAuth as jest.Mock).mockRejectedValueOnce(new Error('Not authenticated'))

    const result = await updateHoliday('family-1', 'holiday-1', updateData)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should prevent non-parent users from deleting holidays', async () => {
    const mockSession: SessionUser = { userId: 'user-1', email: 'user@example.com', sessionId: 'session-1' }
    const mockFamily = { id: 'family-1', parentIds: ['user-2'] } // Different parent

    ;(requireAuth as jest.Mock).mockResolvedValueOnce(mockSession)
    ;(db.families.findById as jest.Mock).mockResolvedValueOnce(mockFamily)

    const result = await deleteHoliday('family-1', 'holiday-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should prevent unauthenticated users from deleting holidays', async () => {
    ;(requireAuth as jest.Mock).mockRejectedValueOnce(new Error('Not authenticated'))

    const result = await deleteHoliday('family-1', 'holiday-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should validate that end date is on or after start date', async () => {
    const mockSession: SessionUser = { userId: 'user-1', email: 'user@example.com', sessionId: 'session-1' }
    const mockFamily = { id: 'family-1', parentIds: ['user-1'] }
    const holidayData = {
      title: 'Christmas',
      description: 'Christmas Holiday',
      effectiveStart: '2024-12-26T00:00:00Z',
      effectiveEnd: '2024-12-25T00:00:00Z', // End date is before start date
      type: 'holiday' as const,
      familyId: 'family-1',
      custodianParentId: 'user-1',
      priority: 10,
      status: 'active' as const,
    }

    ;(requireAuth as jest.Mock).mockResolvedValueOnce(mockSession)
    ;(db.families.findById as jest.Mock).mockResolvedValueOnce(mockFamily)

    const result = await createHoliday(holidayData)

    expect(result.success).toBe(false)
    expect(result.error).toContain('End date must be after start date')
  })

  it('should allow end date equal to start date (same day holidays)', async () => {
    const mockSession: SessionUser = { userId: 'user-1', email: 'user@example.com', sessionId: 'session-1' }
    const mockFamily = { id: 'family-1', parentIds: ['user-1'] }
    const holidayData = {
      title: 'Single Day Holiday',
      description: 'A holiday that lasts one day',
      effectiveStart: '2024-12-25T00:00:00Z',
      effectiveEnd: '2024-12-25T23:59:59Z', // End is later same day
      type: 'holiday' as const,
      familyId: 'family-1',
      custodianParentId: 'user-1',
      priority: 10,
      status: 'active' as const,
    }

    ;(requireAuth as jest.Mock).mockResolvedValueOnce(mockSession)
    ;(db.families.findById as jest.Mock).mockResolvedValueOnce(mockFamily)
    ;(db.scheduleOverrides.create as jest.Mock).mockResolvedValueOnce({
      id: 'holiday-1',
      ...holidayData,
      createdBy: 'user-1',
      createdAt: '2024-01-01T00:00:00Z',
    })

    const result = await createHoliday(holidayData)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(expect.objectContaining({ id: 'holiday-1' }))
    expect(revalidatePath).toHaveBeenCalledWith('/holidays')
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
  })
})
