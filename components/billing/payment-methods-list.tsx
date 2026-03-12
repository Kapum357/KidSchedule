'use client';

import { useState } from 'react';

export interface PaymentMethodsListProps {
  methods: Array<{
    id: string;
    brand: string;
    last4: string;
    expiry: string;
    isDefault: boolean;
  }>;
  onSetDefault: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PaymentMethodsList({ methods, onSetDefault, onDelete }: PaymentMethodsListProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSetDefault(id: string) {
    setLoading(id);
    setError(null);
    try {
      await onSetDefault(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default payment method');
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this payment method?')) {
      return;
    }

    setLoading(id);
    setError(null);
    try {
      await onDelete(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payment method');
    } finally {
      setLoading(null);
    }
  }

  if (methods.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800">
        <p className="text-slate-600 dark:text-slate-300">No payment methods added yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {methods.map(method => (
        <div
          key={method.id}
          className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-700"
        >
          <div className="flex-1">
            <div className="font-medium text-slate-900 dark:text-white">
              {method.brand} •••• {method.last4}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Expires {method.expiry}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {method.isDefault && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                Default
              </span>
            )}

            {!method.isDefault && (
              <button
                onClick={() => handleSetDefault(method.id)}
                disabled={loading === method.id}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {loading === method.id ? 'Setting...' : 'Set Default'}
              </button>
            )}

            <button
              onClick={() => handleDelete(method.id)}
              disabled={loading === method.id || methods.length === 1}
              className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
            >
              {loading === method.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
