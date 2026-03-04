'use client';

import { useState } from 'react';
import { ScheduleOverride } from '@/types';
import { DeleteConfirmDialog } from './delete-confirm-dialog';

export interface HolidayListProps {
  holidays: ScheduleOverride[];
  onEdit: (holiday: ScheduleOverride) => void;
  onDelete: (holidayId: string) => Promise<void>;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  holiday: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  swap: {
    bg: 'bg-purple-50 dark:bg-purple-950',
    text: 'text-purple-700 dark:text-purple-300',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
  mediation: {
    bg: 'bg-amber-50 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
};

const STATUS_DISPLAY: Record<string, string> = {
  active: 'Active',
  pending: 'Pending',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export function HolidayList({ holidays, onEdit, onDelete }: HolidayListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;

    setIsDeleting(true);
    try {
      await onDelete(deleteId);
      setDeleteId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const getTypeColor = (type: string) => TYPE_COLORS[type] || TYPE_COLORS.holiday;
  const formatDateRange = (effectiveStart: string, effectiveEnd: string) => {
    const start = new Date(effectiveStart).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const end = new Date(effectiveEnd).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${start} – ${end}`;
  };

  if (holidays.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900">
        <span className="material-symbols-outlined mb-3 block text-4xl text-gray-400 dark:text-gray-600">
          calendar_today
        </span>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          No holidays scheduled
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Add your first holiday or schedule override to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Name
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Type
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Date Range
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Status
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday) => {
              const colors = getTypeColor(holiday.type);
              return (
                <tr
                  key={holiday.id}
                  className="border-b border-gray-200 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {holiday.title}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${colors.badge}`}
                    >
                      {holiday.type.charAt(0).toUpperCase() + holiday.type.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {formatDateRange(holiday.effectiveStart, holiday.effectiveEnd)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${colors.text}`}
                    >
                      {STATUS_DISPLAY[holiday.status] || holiday.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onEdit(holiday)}
                        className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                        aria-label={`Edit ${holiday.title}`}
                      >
                        <span className="material-symbols-outlined text-base">edit</span>
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        onClick={() => setDeleteId(holiday.id)}
                        className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                        aria-label={`Delete ${holiday.title}`}
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DeleteConfirmDialog
        isOpen={deleteId !== null}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        title="Delete holiday?"
        description="This holiday schedule override will be permanently deleted. This action cannot be undone."
      />
    </>
  );
}
