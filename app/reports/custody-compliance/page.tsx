/**
 * Custody Compliance Reports Page
 *
 * Displays custody compliance reports showing actual vs. scheduled time,
 * compliance percentages, and audit trails for legal proceedings.
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type CustodyPeriod = {
  startTime: string;
  endTime: string;
  scheduledParentId: string;
  actualParentId?: string;
  eventId?: string;
  compliance: boolean;
  notes?: string;
};

type ComplianceMetrics = {
  parentId: string;
  scheduledHours: number;
  actualHours: number;
  compliancePercentage: number;
  deviationHours: number;
  overrideCount: number;
};

type CustodyComplianceReport = {
  familyId: string;
  reportPeriod: {
    startDate: string;
    endDate: string;
  };
  parents: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    phone?: string;
  }>;
  summary: {
    totalScheduledTime: number;
    totalActualTime: number;
    compliancePercentage: number;
    totalDeviations: number;
    totalOverrides: number;
  };
  periods: CustodyPeriod[];
  overrides: any[];
  changeRequests: any[];
  generatedAt: string;
};

export default function CustodyCompliancePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [report, setReport] = useState<CustodyComplianceReport | null>(null);
  const [parentMetrics, setParentMetrics] = useState<ComplianceMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [familyId, setFamilyId] = useState(searchParams.get('familyId') || '');
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || '');

  // Generate report when parameters change
  useEffect(() => {
    if (familyId && startDate && endDate) {
      generateReport();
    }
  }, [familyId, startDate, endDate]);

  const generateReport = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        familyId,
        startDate,
        endDate,
      });

      const response = await fetch(`/api/reports/custody-compliance?${params}`);
      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      const reportData: CustodyComplianceReport = await response.json();
      setReport(reportData);

      // Calculate parent-specific metrics
      const metrics = calculateParentMetrics(reportData);
      setParentMetrics(metrics);

      // Update URL
      router.replace(`/reports/custody-compliance?familyId=${familyId}&startDate=${startDate}&endDate=${endDate}`);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const calculateParentMetrics = (report: CustodyComplianceReport): ComplianceMetrics[] => {
    const parentMetrics = new Map<string, ComplianceMetrics>();

    // Initialize metrics for each parent
    for (const parent of report.parents) {
      parentMetrics.set(parent.id, {
        parentId: parent.id,
        scheduledHours: 0,
        actualHours: 0,
        compliancePercentage: 0,
        deviationHours: 0,
        overrideCount: 0,
      });
    }

    // Calculate metrics from periods
    for (const period of report.periods) {
      const duration = (new Date(period.endTime).getTime() - new Date(period.startTime).getTime()) / (1000 * 60 * 60);

      const scheduledMetrics = parentMetrics.get(period.scheduledParentId);
      if (scheduledMetrics) {
        scheduledMetrics.scheduledHours += duration;
      }

      if (period.actualParentId) {
        const actualMetrics = parentMetrics.get(period.actualParentId);
        if (actualMetrics) {
          actualMetrics.actualHours += duration;
        }
      }
    }

    // Calculate percentages and deviations
    for (const metrics of parentMetrics.values()) {
      if (metrics.scheduledHours > 0) {
        metrics.compliancePercentage = (metrics.actualHours / metrics.scheduledHours) * 100;
        metrics.deviationHours = metrics.scheduledHours - metrics.actualHours;
      }
    }

    return Array.from(parentMetrics.values());
  };

  const exportReport = async (format: 'json' | 'pdf') => {
    if (!report) return;

    try {
      const response = await fetch('/api/reports/custody-compliance/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report,
          format,
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `custody-compliance-${report.familyId}-${report.reportPeriod.startDate}-to-${report.reportPeriod.endDate}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Custody Compliance Reports</h1>

        {/* Report Parameters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Report Parameters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Family ID
              </label>
              <input
                type="text"
                value={familyId}
                onChange={(e) => setFamilyId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter family ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={generateReport}
              disabled={loading || !familyId || !startDate || !endDate}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-8">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {report && (
          <>
            {/* Summary Statistics */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Compliance Summary</h2>
                <div className="space-x-2">
                  <button
                    onClick={() => exportReport('json')}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => exportReport('pdf')}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                  >
                    Export PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {report.summary.compliancePercentage.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Overall Compliance</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {report.summary.totalActualTime.toFixed(1)}h
                  </div>
                  <div className="text-sm text-gray-600">Actual Time</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">
                    {report.summary.totalDeviations}
                  </div>
                  <div className="text-sm text-gray-600">Deviations</div>
                </div>
              </div>

              {/* Parent-specific metrics */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Parent Metrics</h3>
                {parentMetrics.map((metrics) => {
                  const parent = report.parents.find(p => p.id === metrics.parentId);
                  return (
                    <div key={metrics.parentId} className="bg-gray-50 rounded p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{parent?.name || 'Unknown Parent'}</span>
                        <span className={`px-2 py-1 rounded text-sm ${
                          metrics.compliancePercentage >= 90 ? 'bg-green-100 text-green-800' :
                          metrics.compliancePercentage >= 70 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {metrics.compliancePercentage.toFixed(1)}% Compliant
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Scheduled:</span> {metrics.scheduledHours.toFixed(1)}h
                        </div>
                        <div>
                          <span className="text-gray-600">Actual:</span> {metrics.actualHours.toFixed(1)}h
                        </div>
                        <div>
                          <span className="text-gray-600">Deviation:</span> {metrics.deviationHours.toFixed(1)}h
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detailed Periods */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Detailed Periods</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scheduled Parent</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actual Parent</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Compliance</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {report.periods.slice(0, 100).map((period, index) => {
                      const scheduledParent = report.parents.find(p => p.id === period.scheduledParentId);
                      const actualParent = period.actualParentId ? report.parents.find(p => p.id === period.actualParentId) : null;

                      return (
                        <tr key={index}>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {new Date(period.startTime).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {scheduledParent?.name || 'Unknown'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {actualParent?.name || 'None'}
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              period.compliance ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {period.compliance ? 'Compliant' : 'Non-compliant'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {period.notes || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {report.periods.length > 100 && (
                  <p className="text-sm text-gray-600 mt-2">
                    Showing first 100 periods. Export for complete data.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}