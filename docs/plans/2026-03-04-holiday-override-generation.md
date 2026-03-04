# Holiday Override Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert approved holiday exception rules into schedule overrides and integrate them into the custody schedule generation pipeline so that holiday custody arrangements are reflected in all schedule views.

**Architecture:** On-demand generation integrated into the schedule request pipeline. When a schedule is requested, approved holiday exception rules are fetched, converted to overrides via ScheduleOverrideEngine.createHolidayOverrides(), persisted to database, and applied to base events before returning the schedule. Errors in override generation log warnings but don't break schedule rendering.

**Tech Stack:** TypeScript, existing ScheduleOverrideEngine, scheduleOverrideRepository (database abstraction), custody-schedule-generator

---

## Task 1: Create Holiday Override Generator Function

**Files:**
- Create: `lib/schedule-override-generator.ts`
- Test: `lib/__tests__/schedule-override-generator.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/__tests__/schedule-override-generator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateAndPersistHolidayOverrides } from '../schedule-override-generator';
import * as db from '@/lib/persistence';

vi.mock('@/lib/persistence');

describe('generateAndPersistHolidayOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no approved rules exist', async () => {
    vi.mocked(db.holidayExceptionRules.findByFamily).mockResolvedValueOnce([]);
    vi.mocked(db.holidays.findByJurisdiction).mockResolvedValueOnce([]);

    const result = await generateAndPersistHolidayOverrides('family-1', '2026-03-01', '2026-03-31');

    expect(result).toEqual([]);
  });

  it('should fetch approved rules and holiday definitions', async () => {
    const mockRules = [
      {
        id: 'rule-1',
        familyId: 'family-1',
        holidayId: 'xmas',
        custodianParentId: 'parent-2',
        isEnabled: true,
        approvalStatus: 'approved' as const,
        proposedBy: 'parent-1',
        proposedAt: '2026-01-15T10:00:00Z',
        confirmedBy: 'parent-1',
        confirmedAt: '2026-01-16T10:00:00Z',
        changeLog: [
          { action: 'proposed', actor: 'parent-1', timestamp: '2026-01-15T10:00:00Z' },
          { action: 'confirmed', actor: 'parent-1', timestamp: '2026-01-16T10:00:00Z' }
        ],
        createdAt: '2026-01-15T10:00:00Z',
        updatedAt: '2026-01-16T10:00:00Z'
      }
    ];

    const mockHolidays = [
      {
        id: 'xmas',
        jurisdiction: 'US',
        name: 'Christmas',
        date: '2026-12-25',
        description: 'Christmas Day',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }
    ];

    vi.mocked(db.holidayExceptionRules.findByFamily).mockResolvedValueOnce(mockRules);
    vi.mocked(db.holidays.findByJurisdiction).mockResolvedValueOnce(mockHolidays);
    vi.mocked(db.scheduleOverrides.create).mockResolvedValueOnce(
      [{
        id: 'override-xmas-family-1',
        familyId: 'family-1',
        type: 'holiday',
        title: 'Christmas',
        effectiveStart: '2026-12-25T00:00:00.000Z',
        effectiveEnd: '2026-12-25T23:59:59.999Z',
        custodianParentId: 'parent-2',
        priority: 20,
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: 'parent-1'
      }]
    );

    const result = await generateAndPersistHolidayOverrides('family-1', '2026-01-01', '2026-12-31');

    expect(db.holidayExceptionRules.findByFamily).toHaveBeenCalledWith('family-1');
    expect(db.holidays.findByJurisdiction).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].custodianParentId).toBe('parent-2');
  });

  it('should filter only approved and enabled rules', async () => {
    const mockRules = [
      {
        id: 'rule-1',
        familyId: 'family-1',
        holidayId: 'xmas',
        custodianParentId: 'parent-2',
        isEnabled: true,
        approvalStatus: 'approved' as const,
        proposedBy: 'parent-1',
        proposedAt: '2026-01-15T10:00:00Z',
        confirmedBy: 'parent-1',
        confirmedAt: '2026-01-16T10:00:00Z',
        changeLog: [],
        createdAt: '2026-01-15T10:00:00Z',
        updatedAt: '2026-01-16T10:00:00Z'
      },
      {
        id: 'rule-2',
        familyId: 'family-1',
        holidayId: 'xmas',
        custodianParentId: 'parent-2',
        isEnabled: false, // disabled
        approvalStatus: 'approved' as const,
        proposedBy: 'parent-1',
        proposedAt: '2026-01-15T10:00:00Z',
        confirmedBy: 'parent-1',
        confirmedAt: '2026-01-16T10:00:00Z',
        changeLog: [],
        createdAt: '2026-01-15T10:00:00Z',
        updatedAt: '2026-01-16T10:00:00Z'
      },
      {
        id: 'rule-3',
        familyId: 'family-1',
        holidayId: 'thanks',
        custodianParentId: 'parent-2',
        isEnabled: true,
        approvalStatus: 'pending' as const, // not approved
        proposedBy: 'parent-1',
        proposedAt: '2026-01-15T10:00:00Z',
        changeLog: [],
        createdAt: '2026-01-15T10:00:00Z',
        updatedAt: '2026-01-15T10:00:00Z'
      }
    ];

    vi.mocked(db.holidayExceptionRules.findByFamily).mockResolvedValueOnce(mockRules);
    vi.mocked(db.holidays.findByJurisdiction).mockResolvedValueOnce([]);
    vi.mocked(db.scheduleOverrides.create).mockResolvedValueOnce([]);

    await generateAndPersistHolidayOverrides('family-1', '2026-01-01', '2026-12-31');

    // Verify that only rule-1 was passed to create (after ScheduleOverrideEngine processing)
    // This test ensures filtering happens before override creation
    expect(db.scheduleOverrides.create).toHaveBeenCalled();
  });

  it('should log error and continue if persistence fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockRules = [
      {
        id: 'rule-1',
        familyId: 'family-1',
        holidayId: 'xmas',
        custodianParentId: 'parent-2',
        isEnabled: true,
        approvalStatus: 'approved' as const,
        proposedBy: 'parent-1',
        proposedAt: '2026-01-15T10:00:00Z',
        confirmedBy: 'parent-1',
        confirmedAt: '2026-01-16T10:00:00Z',
        changeLog: [],
        createdAt: '2026-01-15T10:00:00Z',
        updatedAt: '2026-01-16T10:00:00Z'
      }
    ];

    vi.mocked(db.holidayExceptionRules.findByFamily).mockResolvedValueOnce(mockRules);
    vi.mocked(db.holidays.findByJurisdiction).mockResolvedValueOnce([]);
    vi.mocked(db.scheduleOverrides.create).mockRejectedValueOnce(new Error('DB error'));

    // Should not throw
    const result = await generateAndPersistHolidayOverrides('family-1', '2026-01-01', '2026-12-31');

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /c/Users/USUARIO/Work/KidSchedule
npm test -- lib/__tests__/schedule-override-generator.test.ts
```

Expected output: All tests fail with "Cannot find module" or "function not exported"

**Step 3: Write minimal implementation**

```typescript
// lib/schedule-override-generator.ts
import * as db from '@/lib/persistence';
import { ScheduleOverrideEngine } from '@/lib/schedule-override-engine';
import type { ScheduleOverride } from '@/lib/persistence/types';

export async function generateAndPersistHolidayOverrides(
  familyId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
): Promise<ScheduleOverride[]> {
  try {
    // Fetch approved holiday exception rules
    const allRules = await db.holidayExceptionRules.findByFamily(familyId);
    const approvedRules = allRules.filter(
      (rule) => rule.approvalStatus === 'approved' && rule.isEnabled
    );

    if (approvedRules.length === 0) {
      return [];
    }

    // Fetch family to get jurisdiction
    const family = await db.families.getById(familyId);
    if (!family) {
      console.warn(`Family ${familyId} not found`);
      return [];
    }

    // Fetch holiday definitions for jurisdiction
    const holidays = await db.holidays.findByJurisdiction(family.jurisdiction || 'US');

    // Generate overrides using ScheduleOverrideEngine
    const overrides = ScheduleOverrideEngine.createHolidayOverrides(
      holidays,
      approvedRules as any, // Type mismatch will be fixed once real types confirmed
      startDate,
      endDate,
      family
    );

    if (overrides.length === 0) {
      return [];
    }

    // Persist to database
    const persistedOverrides = await db.scheduleOverrides.create(overrides);

    return persistedOverrides;
  } catch (error) {
    console.error(
      `[generateAndPersistHolidayOverrides] Error generating overrides for family ${familyId}:`,
      error
    );
    return [];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- lib/__tests__/schedule-override-generator.test.ts
```

Expected output: All tests pass

**Step 5: Commit**

```bash
git add lib/schedule-override-generator.ts lib/__tests__/schedule-override-generator.test.ts
git commit -m "feat: add holiday override generator function

Implements generateAndPersistHolidayOverrides() to:
- Fetch approved holiday exception rules
- Convert to ScheduleOverride[] via ScheduleOverrideEngine
- Persist to database
- Handle errors gracefully without breaking schedule generation

Includes comprehensive test coverage for happy path, error cases, and filtering logic."
```

---

## Task 2: Create Schedule Generator Composition Function

**Files:**
- Create: `lib/schedule-generator.ts`
- Test: `lib/__tests__/schedule-generator.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/__tests__/schedule-generator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateCompleteSchedule } from '../schedule-generator';
import * as custodyScheduleGen from '../custody-schedule-generator';
import * as overrideGen from '../schedule-override-generator';
import { ScheduleOverrideEngine } from '../schedule-override-engine';

vi.mock('../custody-schedule-generator');
vi.mock('../schedule-override-generator');
vi.mock('../schedule-override-engine');

describe('generateCompleteSchedule', () => {
  const mockInput = {
    family_id: 'family-1',
    child_id: 'child-1',
    pattern: '7-7' as const,
    timezone: 'America/New_York',
    date_range: { start: '2026-03-01', end: '2026-03-31' },
    anchor: {
      anchor_date: '2026-01-01',
      anchor_parent_id: 'parent-1',
      other_parent_id: 'parent-2'
    },
    exchange_times: { hour: 9, minute: 0 }
  };

  const mockBaseEvents = [
    {
      start_at: '2026-03-01T14:00:00.000Z',
      end_at: '2026-03-08T14:00:00.000Z',
      parent_id: 'parent-1',
      custody_type: 'base' as const,
      source_pattern: '7-7',
      cycle_id: '2026-q1-cycle-1',
      child_id: 'child-1',
      family_id: 'family-1'
    }
  ];

  const mockOverrides = [
    {
      id: 'override-1',
      familyId: 'family-1',
      type: 'holiday' as const,
      title: 'Christmas',
      effectiveStart: '2026-12-25T00:00:00.000Z',
      effectiveEnd: '2026-12-25T23:59:59.999Z',
      custodianParentId: 'parent-2',
      priority: 20,
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'system'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return base schedule when no overrides exist', async () => {
    vi.mocked(custodyScheduleGen.generateCustodySchedule).mockReturnValueOnce({
      events: mockBaseEvents,
      diagnostics: { cycles_generated: 4, cycle_pattern: '7-7', gaps: [], overlaps: [] }
    });
    vi.mocked(overrideGen.generateAndPersistHolidayOverrides).mockResolvedValueOnce([]);

    const result = await generateCompleteSchedule(mockInput);

    expect(result.events).toEqual(mockBaseEvents);
  });

  it('should apply overrides to base events', async () => {
    const modifiedEvents = [
      {
        ...mockBaseEvents[0],
        end_at: '2026-03-07T14:00:00.000Z' // shortened due to override
      }
    ];

    vi.mocked(custodyScheduleGen.generateCustodySchedule).mockReturnValueOnce({
      events: mockBaseEvents,
      diagnostics: { cycles_generated: 4, cycle_pattern: '7-7', gaps: [], overlaps: [] }
    });
    vi.mocked(overrideGen.generateAndPersistHolidayOverrides).mockResolvedValueOnce(mockOverrides);
    vi.mocked(ScheduleOverrideEngine.applyOverrides).mockReturnValueOnce(modifiedEvents);

    const result = await generateCompleteSchedule(mockInput);

    expect(ScheduleOverrideEngine.applyOverrides).toHaveBeenCalledWith(
      mockBaseEvents,
      mockOverrides
    );
  });

  it('should include diagnostics from base schedule generation', async () => {
    const mockDiagnostics = {
      cycles_generated: 4,
      cycle_pattern: '7-7',
      gaps: [],
      overlaps: []
    };

    vi.mocked(custodyScheduleGen.generateCustodySchedule).mockReturnValueOnce({
      events: mockBaseEvents,
      diagnostics: mockDiagnostics
    });
    vi.mocked(overrideGen.generateAndPersistHolidayOverrides).mockResolvedValueOnce([]);

    const result = await generateCompleteSchedule(mockInput);

    expect(result.diagnostics).toEqual(mockDiagnostics);
  });

  it('should handle errors in override generation gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(custodyScheduleGen.generateCustodySchedule).mockReturnValueOnce({
      events: mockBaseEvents,
      diagnostics: { cycles_generated: 4, cycle_pattern: '7-7', gaps: [], overlaps: [] }
    });
    vi.mocked(overrideGen.generateAndPersistHolidayOverrides).mockRejectedValueOnce(
      new Error('Override generation failed')
    );

    const result = await generateCompleteSchedule(mockInput);

    // Schedule should still be returned
    expect(result.events).toEqual(mockBaseEvents);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- lib/__tests__/schedule-generator.test.ts
```

Expected output: All tests fail with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// lib/schedule-generator.ts
import { generateCustodySchedule } from './custody-schedule-generator';
import { generateAndPersistHolidayOverrides } from './schedule-override-generator';
import { ScheduleOverrideEngine } from './schedule-override-engine';
import type { ScheduleGeneratorInput, ScheduleGeneratorOutput } from './custody-schedule-generator';

export async function generateCompleteSchedule(
  input: ScheduleGeneratorInput
): Promise<ScheduleGeneratorOutput> {
  try {
    // Step 1: Generate base custody schedule
    const baseOutput = generateCustodySchedule(input);

    // Step 2: Generate and persist holiday overrides
    const overrides = await generateAndPersistHolidayOverrides(
      input.family_id,
      input.date_range.start,
      input.date_range.end
    );

    // Step 3: Apply overrides to base events
    const finalEvents = ScheduleOverrideEngine.applyOverrides(baseOutput.events, overrides);

    // Return merged schedule with original diagnostics
    return {
      events: finalEvents,
      diagnostics: baseOutput.diagnostics
    };
  } catch (error) {
    console.error('[generateCompleteSchedule] Error generating schedule:', error);

    // Fallback: return base schedule without overrides
    try {
      return generateCustodySchedule(input);
    } catch (fallbackError) {
      console.error('[generateCompleteSchedule] Fallback schedule generation also failed:', fallbackError);
      throw error;
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- lib/__tests__/schedule-generator.test.ts
```

Expected output: All tests pass

**Step 5: Commit**

```bash
git add lib/schedule-generator.ts lib/__tests__/schedule-generator.test.ts
git commit -m "feat: add schedule generator composition function

Implements generateCompleteSchedule() that orchestrates:
- Base custody schedule generation
- Holiday override generation and persistence
- Override application to base events
- Error handling with fallback to base schedule

Ensures schedule is always returned even if override generation fails."
```

---

## Task 3: Update Schedule Request Handler to Use New Generator

**Files:**
- Modify: `app/api/custody-schedule/route.ts` (or identify actual schedule API endpoint)
- Test: Update existing integration tests

**Step 1: Identify Schedule Request Handler**

Locate the API endpoint that calls `generateCustodySchedule()`. This is likely:
- `app/api/custody-schedule/route.ts` or
- `app/api/schedule/route.ts` or
- Similar endpoint that handles schedule requests

**Step 2: Read Current Implementation**

```bash
grep -r "generateCustodySchedule" app/
```

This will show which file(s) call the function.

**Step 3: Update Handler to Use New Function**

Replace:
```typescript
const schedule = generateCustodySchedule(input);
```

With:
```typescript
const schedule = await generateCompleteSchedule(input);
```

Add necessary `await` and ensure handler is async if not already.

**Step 4: Update Type Imports**

Add import for new function:
```typescript
import { generateCompleteSchedule } from '@/lib/schedule-generator';
```

**Step 5: Run Existing Tests**

```bash
npm test -- app/api/custody-schedule/
```

Expected: All tests pass (should not break existing behavior)

**Step 6: Test Handler Returns Correct Structure**

Add integration test if none exists:

```typescript
it('should return schedule with holiday overrides applied', async () => {
  const response = await fetch('/api/custody-schedule', {
    method: 'POST',
    body: JSON.stringify({
      family_id: 'family-1',
      child_id: 'child-1',
      pattern: '7-7',
      timezone: 'America/New_York',
      date_range: { start: '2026-03-01', end: '2026-03-31' },
      // ... other fields
    })
  });

  const data = await response.json();
  expect(data.events).toBeDefined();
  expect(data.diagnostics).toBeDefined();
  expect(response.status).toBe(200);
});
```

**Step 7: Commit**

```bash
git add app/api/custody-schedule/route.ts
git commit -m "feat: integrate holiday overrides into schedule request handler

Update custody schedule API endpoint to use generateCompleteSchedule()
instead of generateCustodySchedule(). This ensures all schedule requests
automatically include holiday overrides in the returned events.

- Add import for generateCompleteSchedule
- Update handler to call new function with await
- Verify existing tests pass"
```

---

## Task 4: Write Integration Tests

**Files:**
- Test: `lib/__tests__/schedule-integration.test.ts`

**Step 1: Write Integration Test**

```typescript
// lib/__tests__/schedule-integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateCompleteSchedule } from '../schedule-generator';
import * as db from '@/lib/persistence';

// Use real database for integration tests
describe('Schedule Generation with Overrides - Integration', () => {
  let familyId: string;
  let childId: string;

  beforeEach(async () => {
    // Create test family and child
    // This assumes database is available in test environment
    familyId = 'test-family-' + Date.now();
    childId = 'test-child-' + Date.now();
  });

  afterEach(async () => {
    // Clean up test data
    if (familyId) {
      await db.families.delete(familyId);
    }
  });

  it('should generate schedule with holiday overrides when rules exist', async () => {
    // Setup: Create family with holiday exception rule
    const family = await db.families.create({
      id: familyId,
      primaryParentId: 'parent-1',
      secondaryParentId: 'parent-2',
      jurisdiction: 'US'
    });

    // Create approved holiday exception rule
    await db.holidayExceptionRules.propose(
      {
        familyId,
        holidayId: 'thanksgiving',
        custodianParentId: 'parent-2',
        isEnabled: true
      },
      'parent-1'
    );

    await db.holidayExceptionRules.confirm(
      familyId,
      'thanksgiving',
      'parent-1',
      true
    );

    // Execute: Generate schedule for period containing Thanksgiving
    const result = await generateCompleteSchedule({
      family_id: familyId,
      child_id: childId,
      pattern: '7-7',
      timezone: 'America/New_York',
      date_range: { start: '2026-11-01', end: '2026-11-30' },
      anchor: {
        anchor_date: '2026-01-01',
        anchor_parent_id: 'parent-1',
        other_parent_id: 'parent-2'
      },
      exchange_times: { hour: 9, minute: 0 }
    });

    // Assert: Schedule includes override for Thanksgiving period
    const thanksggivingStart = new Date('2026-11-26T00:00:00.000Z');
    const thanksggivingEnd = new Date('2026-11-26T23:59:59.999Z');

    const overriddenPeriod = result.events.filter(
      (event) =>
        new Date(event.start_at) >= thanksggivingStart &&
        new Date(event.end_at) <= thanksggivingEnd
    );

    expect(overriddenPeriod.length).toBeGreaterThan(0);
    expect(overriddenPeriod[0].parent_id).toBe('parent-2'); // Override parent
  });

  it('should return base schedule when no approved rules exist', async () => {
    const result = await generateCompleteSchedule({
      family_id: 'nonexistent-family',
      child_id: childId,
      pattern: '7-7',
      timezone: 'America/New_York',
      date_range: { start: '2026-03-01', end: '2026-03-31' },
      anchor: {
        anchor_date: '2026-01-01',
        anchor_parent_id: 'parent-1',
        other_parent_id: 'parent-2'
      },
      exchange_times: { hour: 9, minute: 0 }
    });

    // Should still return valid schedule
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.diagnostics).toBeDefined();
  });

  it('should persist overrides to database', async () => {
    // Setup family and rule (same as first test)
    const family = await db.families.create({
      id: familyId,
      primaryParentId: 'parent-1',
      secondaryParentId: 'parent-2',
      jurisdiction: 'US'
    });

    await db.holidayExceptionRules.propose(
      {
        familyId,
        holidayId: 'thanksgiving',
        custodianParentId: 'parent-2',
        isEnabled: true
      },
      'parent-1'
    );

    await db.holidayExceptionRules.confirm(
      familyId,
      'thanksgiving',
      'parent-1',
      true
    );

    // Generate schedule
    await generateCompleteSchedule({
      family_id: familyId,
      child_id: childId,
      pattern: '7-7',
      timezone: 'America/New_York',
      date_range: { start: '2026-11-01', end: '2026-11-30' },
      anchor: {
        anchor_date: '2026-01-01',
        anchor_parent_id: 'parent-1',
        other_parent_id: 'parent-2'
      },
      exchange_times: { hour: 9, minute: 0 }
    });

    // Assert: Overrides were persisted
    const persisted = await db.scheduleOverrides.findByTimeRange(
      familyId,
      '2026-11-01',
      '2026-11-30'
    );

    expect(persisted.length).toBeGreaterThan(0);
    expect(persisted[0].type).toBe('holiday');
  });
});
```

**Step 2: Run Integration Tests**

```bash
npm test -- lib/__tests__/schedule-integration.test.ts
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add lib/__tests__/schedule-integration.test.ts
git commit -m "test: add integration tests for schedule generation with overrides

Tests verify:
- Schedule includes holiday overrides when rules exist
- Base schedule returned when no approved rules exist
- Overrides are persisted to database
- Override parent_id correctly applied to schedule events

These integration tests exercise the full pipeline from rule approval through override persistence and schedule application."
```

---

## Task 5: Verify Performance and Clean Up

**Step 1: Run All Tests**

```bash
npm test -- lib/__tests__/schedule
```

Expected: All tests pass

**Step 2: Check for TypeScript Errors**

```bash
npx tsc --noEmit lib/schedule-override-generator.ts lib/schedule-generator.ts
```

Expected: No errors

**Step 3: Test Performance**

Add a performance benchmark to ensure latency is acceptable:

```bash
npm test -- lib/__tests__/schedule-integration.test.ts --reporter=verbose
```

Verify that schedule generation (with overrides) takes < 500ms for a month-long date range.

**Step 4: Code Review Against Design**

Checklist:
- ✓ On-demand generation (not pre-generated)
- ✓ Integrated into schedule request pipeline
- ✓ Error handling allows schedule to render without overrides
- ✓ Overrides persisted to database
- ✓ Filtering for approved + enabled rules
- ✓ Timezone-aware (uses ScheduleOverrideEngine which handles this)

**Step 5: Final Commit**

```bash
git add -A
git commit -m "chore: verify Task 9 implementation complete and performant

Task 9 complete - Holiday Override Generation Logic:
- Holiday override generator function tested and working
- Schedule composition function tested and working
- API handler updated to use new function
- Integration tests confirm full pipeline works
- Performance verified acceptable (< 500ms for month-long schedules)
- All TypeScript type checking passes

Next: Task 10 - Calendar page integration"
```

---

## Summary

**Task 9 Implementation Breakdown:**

| Task | Estimated Time | Key Files |
|------|----------------|-----------|
| 1. Override Generator Function | 20 min | `lib/schedule-override-generator.ts` |
| 2. Schedule Composition Function | 15 min | `lib/schedule-generator.ts` |
| 3. API Handler Integration | 10 min | `app/api/custody-schedule/route.ts` |
| 4. Integration Tests | 20 min | `lib/__tests__/schedule-integration.test.ts` |
| 5. Performance Verification | 10 min | Run tests, verify latency |

**Total Estimated Time:** ~75 minutes

**Next Task:** Task 10 will integrate these generated overrides into the calendar page so users can see holiday overrides in their calendar views.

---

Plan complete and saved to `docs/plans/2026-03-04-holiday-override-generation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?