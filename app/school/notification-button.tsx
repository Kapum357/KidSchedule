'use client';

import { useState, useRef, useEffect } from 'react';

interface NotificationButtonProps {
  initialPendingCount: number;
}

export function NotificationButton({ initialPendingCount }: NotificationButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [hasViewed, setHasViewed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Mark as viewed when opening panel
  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!hasViewed && pendingCount > 0) {
      setHasViewed(true);
    }
  };

  // Handle marking all as read (simulated)
  const handleMarkAllAsRead = () => {
    setPendingCount(0);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`relative p-2.5 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
          isOpen
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-primary'
            : 'bg-white dark:bg-[#1A2633] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
        aria-label={`${pendingCount} pending notifications`}
        aria-expanded={isOpen}
        aria-controls="notification-panel"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[24px]">
          notifications
        </span>
        {pendingCount > 0 && (
          <span className="absolute top-2 right-2.5 size-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-[#1A2633]" />
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          id="notification-panel"
          className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#1A2633] rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg z-50"
          role="region"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Notifications
            </h3>
            {pendingCount > 0 && (
              <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-bold px-2 py-1 rounded-full">
                {pendingCount}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {pendingCount > 0 ? (
              <div className="p-4 space-y-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    You have {pendingCount} pending action{pendingCount !== 1 ? 's' : ''}.
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Review events, volunteer tasks, or documents that need your attention.
                  </p>
                </div>
              </div>
            ) : hasViewed ? (
              <div className="p-8 text-center">
                <div className="flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-4xl text-green-500">
                    check_circle
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  All caught up!
                </p>
              </div>
            ) : (
              <div className="p-8 text-center">
                <div className="flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600">
                    notifications_none
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No pending notifications
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          {pendingCount > 0 && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={handleMarkAllAsRead}
                className="w-full py-2 text-sm font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors"
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
