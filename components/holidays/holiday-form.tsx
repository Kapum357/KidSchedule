'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { DbScheduleOverride } from '@/lib/persistence/types';
import { createHoliday, updateHoliday } from '@/app/actions/holidays';

// ─── Type Definitions ────────────────────────────────────────────────────────

export type HolidayFormMode = 'create' | 'edit';

export type HolidayType = 'holiday' | 'swap' | 'mediation';

export interface HolidayFormData {
  title: string;
  description?: string;
  startDate: string; // ISO date format YYYY-MM-DD
  endDate: string; // ISO date format YYYY-MM-DD
  type: HolidayType;
}

export interface HolidayFormProps {
  mode: HolidayFormMode;
  familyId: string;
  custodianParentId: string;
  initialData?: Partial<HolidayFormData & { id: string }>;
  onSuccess?: (holiday: DbScheduleOverride) => void;
  onCancel?: () => void;
}

// ─── Validation ──────────────────────────────────────────────────────────────

type ValidationError = {
  field: keyof HolidayFormData;
  message: string;
};

function validateHolidayForm(data: HolidayFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Title validation
  if (!data.title || data.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required' });
  } else if (data.title.trim().length > 200) {
    errors.push({ field: 'title', message: 'Title must be 200 characters or less' });
  }

  // Description validation
  if (data.description && data.description.length > 1000) {
    errors.push({ field: 'description', message: 'Description must be 1000 characters or less' });
  }

  // Start date validation
  if (!data.startDate) {
    errors.push({ field: 'startDate', message: 'Start date is required' });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) {
    errors.push({ field: 'startDate', message: 'Start date must be in YYYY-MM-DD format' });
  }

  // End date validation
  if (!data.endDate) {
    errors.push({ field: 'endDate', message: 'End date is required' });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
    errors.push({ field: 'endDate', message: 'End date must be in YYYY-MM-DD format' });
  }

  // Date range validation (only if both dates are valid)
  if (data.startDate && data.endDate && /^\d{4}-\d{2}-\d{2}$/.test(data.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
    const startTime = new Date(data.startDate).getTime();
    const endTime = new Date(data.endDate).getTime();

    if (endTime < startTime) {
      errors.push({ field: 'endDate', message: 'End date must be on or after the start date' });
    }
  }

  // Type validation
  if (!data.type || !['holiday', 'swap', 'mediation'].includes(data.type)) {
    errors.push({ field: 'type', message: 'Holiday type is required' });
  }

  return errors;
}

function getFieldError(field: keyof HolidayFormData, errors: ValidationError[]): string | null {
  return errors.find((e) => e.field === field)?.message || null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HolidayForm({
  mode,
  familyId,
  custodianParentId,
  initialData,
  onSuccess,
  onCancel,
}: HolidayFormProps) {
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState<HolidayFormData>({
    title: initialData?.title ?? '',
    description: initialData?.description ?? '',
    startDate: initialData?.startDate ?? getTodayIsoDate(),
    endDate: initialData?.endDate ?? getTodayIsoDate(),
    type: (initialData?.type as HolidayType) ?? 'holiday',
  });

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Event handlers
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
      // Clear validation error for this field when user starts typing
      setValidationErrors((prev) => prev.filter((err) => err.field !== name));
      setServerError(null);
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setServerError(null);
    setSuccessMessage(null);

    // Validate
    const errors = validateHolidayForm(formData);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setIsLoading(false);
      return;
    }

    try {
      let result;

      if (mode === 'create') {
        // Convert ISO dates to ISO datetime format for server action
        result = await createHoliday({
          title: formData.title.trim(),
          description: formData.description?.trim() || undefined,
          effectiveStart: `${formData.startDate}T00:00:00Z`,
          effectiveEnd: `${formData.endDate}T23:59:59Z`,
          type: formData.type,
          familyId,
          custodianParentId,
          priority: 10,
          status: 'active',
        });
      } else {
        // Edit mode
        const holidayId = initialData?.id;
        if (!holidayId) {
          throw new Error('Holiday ID is required for edit mode');
        }

        result = await updateHoliday(familyId, holidayId, {
          title: formData.title.trim(),
          description: formData.description?.trim() || undefined,
          effectiveStart: `${formData.startDate}T00:00:00Z`,
          effectiveEnd: `${formData.endDate}T23:59:59Z`,
        });
      }

      if (result.success) {
        if (result.data) {
          setSuccessMessage(
            mode === 'create'
              ? 'Holiday created successfully!'
              : 'Holiday updated successfully!'
          );

          // Call callback if provided
          if (onSuccess) {
            onSuccess(result.data);
          }

          // Auto-redirect after brief delay to show success message
          setTimeout(() => {
            router.push('/holidays');
          }, 1500);
        } else {
          // success case but no data (should not happen) – treat as generic
          setServerError('Operation succeeded but no data returned');
        }
      } else {
        // `success === false` narrows type to the error variant so `error` exists
        setServerError(result.error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      setServerError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Server Error Alert */}
      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/10 dark:text-red-300">
          {serverError}
        </div>
      )}

      {/* Success Alert */}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800/40 dark:bg-green-900/10 dark:text-green-300 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          {successMessage}
        </div>
      )}

      {/* Title Field */}
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          value={formData.title}
          onChange={handleInputChange}
          placeholder="e.g. Spring Break, Christmas Holiday"
          maxLength={200}
          className={`block w-full rounded-lg border ${
            getFieldError('title', validationErrors)
              ? 'border-red-300 dark:border-red-700'
              : 'border-slate-200 dark:border-slate-700'
          } bg-white dark:bg-background-dark py-2.5 px-4 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 shadow-sm focus:border-primary focus:ring-primary sm:text-sm transition-colors`}
          disabled={isLoading}
        />
        {getFieldError('title', validationErrors) && (
          <p className="text-sm text-red-600 dark:text-red-400">{getFieldError('title', validationErrors)}</p>
        )}
      </div>

      {/* Description Field */}
      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Description <span className="text-slate-400 font-normal">(Optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          placeholder="Add any additional details about this holiday"
          maxLength={1000}
          rows={3}
          className={`block w-full rounded-lg border ${
            getFieldError('description', validationErrors)
              ? 'border-red-300 dark:border-red-700'
              : 'border-slate-200 dark:border-slate-700'
          } bg-white dark:bg-background-dark py-2.5 px-4 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 shadow-sm focus:border-primary focus:ring-primary sm:text-sm transition-colors resize-none`}
          disabled={isLoading}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formData.description?.length || 0}/1000 characters
        </p>
        {getFieldError('description', validationErrors) && (
          <p className="text-sm text-red-600 dark:text-red-400">{getFieldError('description', validationErrors)}</p>
        )}
      </div>

      {/* Date Range Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Start Date */}
        <div className="space-y-2">
          <label htmlFor="startDate" className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Start Date <span className="text-red-500">*</span>
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            value={formData.startDate}
            onChange={handleInputChange}
            className={`block w-full rounded-lg border ${
              getFieldError('startDate', validationErrors)
                ? 'border-red-300 dark:border-red-700'
                : 'border-slate-200 dark:border-slate-700'
            } bg-white dark:bg-background-dark py-2.5 px-4 text-slate-900 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm transition-colors`}
            disabled={isLoading}
          />
          {getFieldError('startDate', validationErrors) && (
            <p className="text-sm text-red-600 dark:text-red-400">{getFieldError('startDate', validationErrors)}</p>
          )}
        </div>

        {/* End Date */}
        <div className="space-y-2">
          <label htmlFor="endDate" className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            End Date <span className="text-red-500">*</span>
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            value={formData.endDate}
            onChange={handleInputChange}
            className={`block w-full rounded-lg border ${
              getFieldError('endDate', validationErrors)
                ? 'border-red-300 dark:border-red-700'
                : 'border-slate-200 dark:border-slate-700'
            } bg-white dark:bg-background-dark py-2.5 px-4 text-slate-900 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm transition-colors`}
            disabled={isLoading}
          />
          {getFieldError('endDate', validationErrors) && (
            <p className="text-sm text-red-600 dark:text-red-400">{getFieldError('endDate', validationErrors)}</p>
          )}
        </div>
      </div>

      {/* Type Field */}
      <div className="space-y-2">
        <label htmlFor="type" className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Holiday Type <span className="text-red-500">*</span>
        </label>
        <select
          id="type"
          name="type"
          value={formData.type}
          onChange={handleInputChange}
          className={`block w-full rounded-lg border ${
            getFieldError('type', validationErrors)
              ? 'border-red-300 dark:border-red-700'
              : 'border-slate-200 dark:border-slate-700'
          } bg-white dark:bg-background-dark py-2.5 px-4 text-slate-900 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm transition-colors appearance-none`}
          disabled={isLoading}
        >
          <option value="holiday">Holiday</option>
          <option value="swap">Swap</option>
          <option value="mediation">Mediation</option>
        </select>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formData.type === 'holiday' && 'Statutory or special holiday with schedule override'}
          {formData.type === 'swap' && 'Time exchange between parents'}
          {formData.type === 'mediation' && 'Mediation session or special arrangement'}
        </p>
        {getFieldError('type', validationErrors) && (
          <p className="text-sm text-red-600 dark:text-red-400">{getFieldError('type', validationErrors)}</p>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center justify-center gap-2 flex-1 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <>
              <span className="inline-block animate-spin">
                <span className="material-symbols-outlined text-lg">hourglass_empty</span>
              </span>
              {mode === 'create' ? 'Creating...' : 'Saving...'}
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-lg">
                {mode === 'create' ? 'add' : 'save'}
              </span>
              {mode === 'create' ? 'Create Holiday' : 'Update Holiday'}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleCancel}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-6 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className="material-symbols-outlined text-lg">close</span>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Get today's date in ISO format (YYYY-MM-DD).
 */
function getTodayIsoDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
