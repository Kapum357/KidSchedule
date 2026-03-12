'use client';

import { useState, useCallback } from 'react';
import { VaultUploadForm } from '@/components/vault/upload-form';
import { QuotaBar } from '@/components/vault/quota-bar';
import { VaultDocumentList } from '@/components/vault/document-list';
import DeleteConfirmationModal from '@/components/vault/delete-confirmation-modal';

/**
 * Document type for deletion modal
 */
interface VaultDocument {
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

interface VaultPageClientProps {
  familyId: string;
}

/**
 * Vault Page Client Component
 *
 * Handles all interactive state for the vault page:
 * - Quota bar display
 * - File upload with refresh
 * - Document list with pagination
 * - Delete modal state management
 *
 * Features:
 * - Refresh document list after uploads
 * - Delete confirmation modal
 * - State management for modal lifecycle
 * - Responsive layout with sections
 */
export function VaultPageClient({ familyId }: VaultPageClientProps) {
  // Document list refresh trigger - increment to force re-fetch
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    document: VaultDocument | null;
  }>({
    isOpen: false,
    document: null,
  });

  /**
   * Handle successful upload - refresh document list
   */
  const handleUploadSuccess = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  /**
   * Handle delete click - open confirmation modal
   */
  const handleDeleteClick = useCallback((doc: VaultDocument) => {
    setDeleteModal({
      isOpen: true,
      document: doc,
    });
  }, []);

  /**
   * Handle delete confirmation - refresh list and close modal
   */
  const handleDeleteConfirm = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
    setDeleteModal({
      isOpen: false,
      document: null,
    });
  }, []);

  /**
   * Handle modal close/cancel
   */
  const handleDeleteCancel = useCallback(() => {
    setDeleteModal({
      isOpen: false,
      document: null,
    });
  }, []);

  return (
    <>
      {/* Main Content Sections */}
      <div className="space-y-6">
        {/* Quota Bar */}
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            Storage Quota
          </h2>
          <QuotaBar />
        </div>

        {/* Upload Form */}
        <div>
          <VaultUploadForm
            familyId={familyId}
            onUploadSuccess={handleUploadSuccess}
          />
        </div>

        {/* Document List */}
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Documents
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              View and manage all documents in your vault
            </p>
          </div>
          <VaultDocumentList
            onDeleteClick={handleDeleteClick}
            key={refreshTrigger}
          />
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal.document && (
        <DeleteConfirmationModal
          isOpen={deleteModal.isOpen}
          documentId={deleteModal.document.id}
          documentTitle={deleteModal.document.title}
          onClose={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
        />
      )}
    </>
  );
}
