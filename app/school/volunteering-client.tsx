'use client';

import { useState, useCallback } from 'react';
import type { VolunteerTask, VolunteerBalance } from '@/lib';
import { AddTaskModal } from './add-task-modal';

interface VolunteeringClientProps {
  familyId: string;
  tasks: VolunteerTask[];
  balances: VolunteerBalance[];
  currentParentId: string;
  parentNames: Record<string, string>;
  upcomingEventIds: string[];
}

function VolunteerBalanceBar({
  balances,
  currentParentId,
  parentNames,
}: Readonly<{
  balances: VolunteerBalance[];
  currentParentId: string;
  parentNames: Record<string, string>;
}>) {
  if (balances.length < 2) return null;

  const total = balances.reduce((s, b) => s + b.totalHoursCommitted, 0);
  if (total === 0) return null;

  const pct = (b: VolunteerBalance) =>
    Math.round((b.totalHoursCommitted / total) * 100);

  return (
    <div className="mb-5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
        Volunteer Balance
      </p>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {balances.map((b) => (
          <div
            key={b.parentId}
            className={`h-full rounded-full transition-all ${
              b.parentId === currentParentId ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"
            }`}
            style={{ width: `${pct(b)}%` }}
            title={`${parentNames[b.parentId] ?? b.parentId}: ${b.totalHoursCommitted}h`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        {balances.map((b) => (
          <span key={b.parentId} className="text-[10px] text-slate-500">
            {parentNames[b.parentId] ?? b.parentId}: {b.totalHoursCommitted}h
          </span>
        ))}
      </div>
    </div>
  );
}

function VolunteerTaskRow({
  task,
  parentNames,
}: Readonly<{
  task: VolunteerTask;
  parentNames: Record<string, string>;
}>) {
  const isOpen = task.status === 'open';
  const assigneeName = task.assignedParentId
    ? parentNames[task.assignedParentId] ?? task.assignedParentId
    : 'Unassigned';

  const iconBgMap: Record<string, string> = {
    teal: 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400',
    blue: 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400',
    purple: 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400',
    amber: 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400',
  };
  const iconCls = iconBgMap[task.iconColor ?? ''] ?? 'bg-white dark:bg-slate-700 text-slate-600';

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded shadow-sm ${iconCls}`}>
          <span aria-hidden="true" className="material-symbols-outlined text-xl">
            {task.icon ?? 'volunteer_activism'}
          </span>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            {task.title}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {task.estimatedHours}h · {new Date(task.scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isOpen ? (
          <button className="text-xs font-bold text-primary hover:text-primary-hover uppercase tracking-wide transition-colors">
            Sign Up
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
              <div className="size-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                {(parentNames[task.assignedParentId ?? ''] ?? '?')[0]}
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {assigneeName}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function VolunteeringClient({
  familyId,
  tasks,
  balances,
  currentParentId,
  parentNames,
  upcomingEventIds,
}: VolunteeringClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="bg-white dark:bg-[#1A2633] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-lg">
            Volunteering Sync
          </h3>
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-sm text-primary font-medium hover:underline flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">
              add_circle
            </span>
            Add Task
          </button>
        </div>

        <VolunteerBalanceBar
          balances={balances}
          currentParentId={currentParentId}
          parentNames={parentNames}
        />

        <div className="space-y-3">
          {tasks.map((task) => (
            <VolunteerTaskRow
              key={task.id}
              task={task}
              parentNames={parentNames}
            />
          ))}
        </div>
      </div>

      <AddTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        familyId={familyId}
        upcomingEventIds={upcomingEventIds}
      />
    </>
  );
}
