# Task 9: Holiday Override Generation Logic - Design Document

**Date**: 2026-03-04
**Feature**: CAL-008 Holiday Override Support
**Phase**: Design
**Status**: Approved

---

## Overview

This document specifies the design for Task 9: implementing holiday override generation logic that converts approved holiday exception rules into schedule overrides and integrates them into the custody schedule generation pipeline.

---

## Problem Statement

The custody schedule generation currently produces base events only. When families set up holiday exception rules (where a specific parent takes the child for a holiday), those rules must be transformed into schedule overrides and applied to the base schedule so that calendar views reflect the actual custody arrangement for holiday periods.

Task 9 is responsible for:
1. Converting approved `DbHolidayExceptionRule[]` into `ScheduleOverride[]`
2. Persisting overrides to the database
3. Integrating override generation into the schedule request pipeline
4. Applying overrides to base events before returning the schedule

---

## Approach: On-Demand Generation with Caching

**Rationale**:
- Always in sync with rule/holiday changes
- Minimal database bloat (only requested date ranges)
- Single clear integration point
- Latency impact negligible for schedule requests

**Alternative approaches considered**:
- Pre-generated batch processing (faster responses but requires cron infrastructure and risks stale data)
- Lazy generation with manual triggers (minimal latency but high user friction and stale data risk)

---

## Architecture

### Data Flow

```
Schedule Request (dateRange, familyId)
    ↓
generateCustodySchedule() → baseEvents[]
    ↓
[NEW] fetchApprovedRules(familyId) → DbHolidayExceptionRule[]
[NEW] fetchHolidayDefinitions(familyId) → DbHolidayDefinition[]
    ↓
[NEW] createHolidayOverrides() → ScheduleOverride[]
    ↓
[NEW] scheduleOverrideRepository.create(overrides)
    ↓
applyOverrides(baseEvents, overrides) → finalEvents[]
    ↓
Return finalEvents[] to client
```

### Component Structure

**1. Holiday Override Generator (`lib/schedule-override-generator.ts`)**

```typescript
async function generateAndPersistHolidayOverrides(
  familyId: string,
  startDate: string,      // YYYY-MM-DD
  endDate: string,        // YYYY-MM-DD
): Promise<ScheduleOverride[]>
```

**Responsibilities**:
- Fetch approved holiday exception rules where `approvalStatus === "approved"` and `isEnabled === true`
- Fetch holiday definitions for family's jurisdiction
- Call `ScheduleOverrideEngine.createHolidayOverrides()` with fetched data
- Persist generated overrides via `scheduleOverrideRepository.create()`
- Return generated overrides
- Handle errors gracefully without blocking schedule generation

**2. Schedule Generation Pipeline (`lib/schedule-generator.ts`)**

New composition function that orchestrates the complete flow:

```typescript
async function generateCompleteSchedule(
  input: ScheduleGeneratorInput
): Promise<ScheduleGeneratorOutput>
```

**Steps**:
1. Call `generateCustodySchedule(input)` for base events
2. Call `generateAndPersistHolidayOverrides()` to generate and persist overrides
3. Call `ScheduleOverrideEngine.applyOverrides()` to merge overrides into base events
4. Return merged schedule with diagnostics

**3. Error Handling Strategy**

| Failure Point | Handling | Outcome |
|---------------|----------|---------|
| Approved rules fetch fails | Log warning, continue with empty rules | Schedule renders with base events only |
| Holiday definitions fetch fails | Log warning, continue with empty definitions | Schedule renders with base events only |
| Override generation fails | Log error, continue without overrides | Schedule renders with base events only |
| Persistence fails | Log error, continue with in-memory overrides | Overrides applied this request, not persisted |

**Principle**: Schedule is always returned, even if override generation encounters issues. Observability via logging enables debugging without user impact.

---

## Integration Points

### Schedule Request Handler

Update the custody schedule API handler (wherever `generateCustodySchedule()` is called):

```typescript
// Before: return generateCustodySchedule(input)
// After:
return generateCompleteSchedule(input)
```

### Database Layer

Reuses existing:
- `scheduleOverrideRepository.create(overrides)` - for persistence
- `findByTimeRange(familyId, startDate, endDate)` - for Task 10 calendar rendering

No new database migrations required. Table `schedule_overrides` already exists with proper schema.

---

## Success Criteria

✓ Approved holiday exception rules generate corresponding schedule overrides
✓ Overrides span full holiday dates (00:00:00Z to 23:59:59Z with timezone awareness)
✓ Overrides are persisted to database
✓ Overrides are applied to base schedule events before returning
✓ Schedule request latency increase is <100ms
✓ Error in override generation doesn't break schedule rendering
✓ Logging captures all error paths for observability

---

## Implementation Sequence (Task 9)

1. Create `lib/schedule-override-generator.ts` with `generateAndPersistHolidayOverrides()`
2. Create `lib/schedule-generator.ts` with `generateCompleteSchedule()`
3. Update schedule request handler to call `generateCompleteSchedule()` instead of `generateCustodySchedule()`
4. Write tests for override generation, error handling, and integration
5. Verify latency impact

---

## Testing Strategy

- Unit tests for `generateAndPersistHolidayOverrides()` with mocked repositories
- Integration tests for `generateCompleteSchedule()` with real database
- Error case tests: verify schedule still renders when override generation fails
- Latency benchmarks: schedule request with/without override generation
- End-to-end: create rule → approve rule → request schedule → verify override applied

---

## Related Tasks

- **Task 7-8**: Holiday Exception Rules API with dual-confirmation workflow (completed)
- **Task 10**: Calendar page integration to display holiday overrides
- **Task 11**: UI for custom holiday management
- **Task 12**: UI for holiday rule approval workflow

---

## Dependencies

- Existing: `ScheduleOverrideEngine.createHolidayOverrides()`
- Existing: `ScheduleOverrideEngine.applyOverrides()`
- Existing: `scheduleOverrideRepository` with `create()` method
- Existing: Database schema for `schedule_overrides` and `holiday_exception_rules`

---

## Open Questions / Deferred Decisions

None at this stage. Implementation plan will specify exact API endpoints, error logging format, and performance monitoring.
