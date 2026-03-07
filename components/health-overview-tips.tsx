'use client';

import { useState, useEffect } from 'react';
import { getDeescalationTips } from '@/app/mediation/page-actions';

export function HealthOverviewTips() {
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTips = async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedTips = await getDeescalationTips();
        setTips(fetchedTips);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tips');
        console.error('Error fetching tips:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTips();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-slate-500">
        Could not load tips at this time
      </div>
    );
  }

  if (tips.length === 0) {
    return (
      <div className="text-xs text-slate-500">
        No tips available yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tips.map((tip, idx) => (
        <div key={idx} className="flex gap-2 text-sm">
          <span className="text-primary font-bold flex-shrink-0">•</span>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            {tip}
          </p>
        </div>
      ))}
    </div>
  );
}
