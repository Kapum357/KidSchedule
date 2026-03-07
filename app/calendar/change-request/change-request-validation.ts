/**
 * Validation utilities for schedule change requests
 * Shared between server and client for consistent validation
 */

export type ChangeType = "swap" | "cancel" | "extra";

export type ChangeReason =
  | "work"
  | "family"
  | "travel"
  | "medical"
  | "other";

export interface ChangeRequestInput {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  changeType: ChangeType;
  reason: ChangeReason;
  notes: string;
}

export interface ValidationError {
  field?: keyof ChangeRequestInput;
  message: string;
}

export const MAX_NOTES_LENGTH = 500;

export function isIsoDate(value: string | undefined): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isTimeValue(value: string | undefined): value is string {
  if (!value) return false;
  return /^\d{2}:\d{2}$/.test(value);
}

export function isChangeType(value: string | undefined): value is ChangeType {
  return value === "swap" || value === "cancel" || value === "extra";
}

export function isChangeReason(value: string | undefined): value is ChangeReason {
  return value === "work" || value === "family" || value === "travel" || value === "medical" || value === "other";
}

export function dateAtLocalMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

export function isValidDateRange(startDate: string, endDate: string): boolean {
  const start = dateAtLocalMidnight(startDate).getTime();
  const end = dateAtLocalMidnight(endDate).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= end;
}

export function isDateInPast(isoDate: string): boolean {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  return isoDate < todayStr;
}

/**
 * Validate all fields and return the first error found
 * Returns undefined if all fields are valid
 */
export function validateChangeRequestInput(input: ChangeRequestInput): string | undefined {
  // Validate dates and times exist and are formatted correctly
  const hasValidDateTimes =
    isIsoDate(input.startDate) &&
    isIsoDate(input.endDate) &&
    isTimeValue(input.startTime) &&
    isTimeValue(input.endTime);

  if (!hasValidDateTimes) {
    return "Please enter valid dates and times.";
  }

  // Validate date range
  if (!isValidDateRange(input.startDate, input.endDate)) {
    return "End date must be the same day or after the start date.";
  }

  // Validate dates are not in the past
  if (isDateInPast(input.startDate)) {
    return "Start date cannot be in the past.";
  }

  // Validate notes length
  if (input.notes.length > MAX_NOTES_LENGTH) {
    return `Please keep notes under ${MAX_NOTES_LENGTH} characters.`;
  }

  return undefined;
}

/**
 * Validate a single field and return error message if invalid
 * Used for real-time validation as user types
 */
export function validateField(field: keyof ChangeRequestInput, value: string, allInput: ChangeRequestInput): string | undefined {
  switch (field) {
    case "startDate":
      if (!isIsoDate(value)) {
        return "Please enter a valid start date.";
      }
      if (isDateInPast(value)) {
        return "Start date cannot be in the past.";
      }
      if (allInput.endDate && !isValidDateRange(value, allInput.endDate)) {
        return "Start date must be before or equal to end date.";
      }
      return undefined;

    case "endDate":
      if (!isIsoDate(value)) {
        return "Please enter a valid end date.";
      }
      if (allInput.startDate && !isValidDateRange(allInput.startDate, value)) {
        return "End date must be same day or after start date.";
      }
      return undefined;

    case "startTime":
      if (!isTimeValue(value)) {
        return "Please enter a valid start time.";
      }
      return undefined;

    case "endTime":
      if (!isTimeValue(value)) {
        return "Please enter a valid end time.";
      }
      return undefined;

    case "notes":
      if (value.length > MAX_NOTES_LENGTH) {
        return `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`;
      }
      return undefined;

    default:
      return undefined;
  }
}
