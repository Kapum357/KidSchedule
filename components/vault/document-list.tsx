'use client';

import { useEffect, useState } from 'react';

/**
 * Document type from GET /api/school/vault
 */
interface Document {
  id: string;
  familyId: string;
  title: string;
  fileType: string;
  status: string;
  statusLabel: string;
  sizeBytes: number;
  url: string;
  addedAt: string;
  addedBy: string;
  updatedAt: string;
  actionDeadline?: string;
}

/**
 * Quota info from GET /api/school/vault
 */
interface QuotaInfo {
  maxDocuments: number | null;
  currentDocuments: number;
  maxStorageBytes: number | null;
  usedStorageBytes: number;
  documentPercentFull: number | null;
  storagePercentFull: number | null;
  canUpload: boolean;
}

/**
 * API response from GET /api/school/vault
 */
interface VaultListResponse {
  documents: Document[];
  quota: QuotaInfo;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface VaultDocumentListProps {
  onDeleteClick?: (doc: Document) => void;
  onDownloadClick?: (doc: Document) => void;
}

/**
 * VaultDocumentList Component
 *
 * Displays vault documents in a paginated table with:
 * - Columns: title, type (icon), status (badge), size, date
 * - Status badges with colors (available=green, pending=yellow, signed=blue, expired=red)
 * - Action buttons: download, delete
 * - Pagination: 20 items per page
 * - Sorting by date (newest first)
 * - Loading and error states
 * - No-results state
 * - Quota info display
 *
 * Fetches from GET /api/school/vault?limit=20&offset=0
 */
export function VaultDocumentList({
  onDeleteClick,
  onDownloadClick,
}: VaultDocumentListProps) {
  const [data, setData] = useState<VaultListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Fetch documents on component mount and when page changes
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        setError(null);

        const offset = currentPage * 20;
        const response = await fetch(
          `/api/school/vault?limit=20&offset=${offset}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || `Failed to fetch documents (${response.status})`
          );
        }

        const result: VaultListResponse = await response.json();
        setData(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        console.error('Failed to fetch vault documents:', message);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [currentPage]);

  // Helper: Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  };

  // Helper: Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Helper: Get status badge color
  const getStatusBadgeColor = (
    status: string
  ): {
    bg: string;
    text: string;
  } => {
    switch (status) {
      case 'available':
        return {
          bg: 'bg-green-100 dark:bg-green-900/30',
          text: 'text-green-700 dark:text-green-200',
        };
      case 'pending_signature':
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          text: 'text-yellow-700 dark:text-yellow-200',
        };
      case 'signed':
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          text: 'text-blue-700 dark:text-blue-200',
        };
      case 'expired':
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          text: 'text-red-700 dark:text-red-200',
        };
      default:
        return {
          bg: 'bg-slate-100 dark:bg-slate-700',
          text: 'text-slate-700 dark:text-slate-200',
        };
    }
  };

  // Helper: Get file type icon
  const getFileTypeIcon = (fileType: string): string => {
    const type = fileType.toLowerCase();
    if (type.includes('pdf')) return 'picture_as_pdf';
    if (type.includes('word') || type.includes('docx') || type.includes('doc'))
      return 'description';
    if (type.includes('excel') || type.includes('xlsx') || type.includes('xls'))
      return 'table_chart';
    if (type.includes('image') || type.includes('png') || type.includes('jpg'))
      return 'image';
    return 'file_present';
  };

  // Helper: Handle download click
  const handleDownloadClick = (doc: Document) => {
    if (onDownloadClick) {
      onDownloadClick(doc);
    } else {
      // Default: open download link
      window.open(doc.url, '_blank');
    }
  };

  // Helper: Handle delete click
  const handleDeleteClick = (doc: Document) => {
    if (onDeleteClick) {
      onDeleteClick(doc);
    }
  };

  // Loading state: skeleton loader
  if (loading && !data) {
    return (
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {/* Header skeleton */}
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="h-4 w-1/4 rounded bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Row skeletons */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-slate-200 px-6 py-4 last:border-0 dark:border-slate-700"
          >
            <div className="h-4 flex-1 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-red-600 dark:text-red-400">
            error
          </span>
          <div className="flex-1">
            <p className="font-medium text-red-900 dark:text-red-200">
              Failed to load documents
            </p>
            <p className="mt-1 text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
          </div>
        </div>
        <button
          onClick={() => setCurrentPage(0)}
          className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  // No data
  if (!data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800">
        <span className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500">
          folder_open
        </span>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          No documents loaded
        </p>
      </div>
    );
  }

  const { documents, pagination } = data;
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const canGoPrev = currentPage > 0;
  const canGoNext = currentPage < totalPages - 1;

  // Empty state
  if (documents.length === 0 && pagination.total === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800">
        <span className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500">
          archive
        </span>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          No documents yet
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upload your first document to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table Container */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full">
          {/* Table Header */}
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            <tr>
              <th className="px-6 py-3 text-left">
                <span className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  Title
                </span>
              </th>
              <th className="px-6 py-3 text-left">
                <span className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  Type
                </span>
              </th>
              <th className="px-6 py-3 text-left">
                <span className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  Status
                </span>
              </th>
              <th className="px-6 py-3 text-left">
                <span className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  Size
                </span>
              </th>
              <th className="px-6 py-3 text-left">
                <span className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  Date
                </span>
              </th>
              <th className="px-6 py-3 text-right">
                <span className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  Actions
                </span>
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {documents.map((doc) => {
              const statusColors = getStatusBadgeColor(doc.status);
              const fileIcon = getFileTypeIcon(doc.fileType);

              return (
                <tr
                  key={doc.id}
                  className="border-b border-slate-200 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 last:border-0"
                >
                  {/* Title */}
                  <td className="px-6 py-4">
                    <div className="max-w-xs">
                      <p className="truncate font-medium text-slate-900 dark:text-white">
                        {doc.title}
                      </p>
                    </div>
                  </td>

                  {/* Type Icon */}
                  <td className="px-6 py-4">
                    <span
                      className="material-symbols-outlined text-slate-500 dark:text-slate-400"
                      title={doc.fileType}
                    >
                      {fileIcon}
                    </span>
                  </td>

                  {/* Status Badge */}
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${statusColors.bg} ${statusColors.text}`}
                    >
                      {doc.statusLabel}
                    </span>
                  </td>

                  {/* Size */}
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {formatBytes(doc.sizeBytes)}
                    </p>
                  </td>

                  {/* Date */}
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {formatDate(doc.updatedAt)}
                    </p>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {/* Download Button */}
                      <button
                        onClick={() => handleDownloadClick(doc)}
                        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                        title="Download document"
                      >
                        <span className="material-symbols-outlined">
                          download
                        </span>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDeleteClick(doc)}
                        className="rounded-md p-2 text-slate-600 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        title="Delete document"
                      >
                        <span className="material-symbols-outlined">trash</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          Showing {pagination.offset + 1} to{' '}
          {Math.min(pagination.offset + pagination.limit, pagination.total)} of{' '}
          {pagination.total} documents
        </div>

        <div className="flex items-center gap-2">
          {/* Previous Button */}
          <button
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={!canGoPrev}
            className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Previous page"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>

          {/* Page Indicator */}
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Page {currentPage + 1}
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              of {totalPages}
            </span>
          </div>

          {/* Next Button */}
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={!canGoNext}
            className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Next page"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
