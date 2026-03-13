'use client';

import { useState } from 'react';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  familyId: string;
  upcomingEventIds: string[];
}

export function AddTaskModal({
  isOpen,
  onClose,
  familyId,
  upcomingEventIds,
}: AddTaskModalProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('2');
  const [eventId, setEventId] = useState(upcomingEventIds[0] ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/school/volunteer-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyId,
          eventId,
          title,
          estimatedHours: parseFloat(hours),
          status: 'open',
          scheduledFor: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        setTitle('');
        setHours('2');
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white shadow-lg dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Add Volunteer Task
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Task Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Set up chairs"
                className="w-full px-3 py-2 border border-slate-200 rounded-md dark:border-slate-600 dark:bg-slate-800 text-slate-900 dark:text-white"
                required
              />
            </div>

            {upcomingEventIds.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Event
                </label>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md dark:border-slate-600 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {upcomingEventIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Estimated Hours
              </label>
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                min="0.5"
                step="0.5"
                className="w-full px-3 py-2 border border-slate-200 rounded-md dark:border-slate-600 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
