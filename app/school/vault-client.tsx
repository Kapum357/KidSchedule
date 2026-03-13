'use client';

import { useState, useCallback } from 'react';
import type { SchoolVaultDocument } from '@/lib';
import { VaultUploadForm } from '@/components/vault/upload-form';
import { PTAEngine } from '@/lib/pta-engine';

interface VaultClientProps {
  familyId: string;
  docs: SchoolVaultDocument[];
}

export function VaultClient({ familyId, docs }: VaultClientProps) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const engine = new PTAEngine();
  const sortedDocs = engine.getVaultDocuments(docs);

  const handleUploadSuccess = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
    setShowUploadModal(false);
  }, []);

  const handleViewAll = () => {
    // Navigate to vault tab
    window.location.href = '/school?tab=vault';
  };

  return (
    <>
      <div className="bg-gradient-to-br from-primary-light/50 to-white dark:from-primary/10 dark:to-[#1A2633] p-6 rounded-xl border border-primary-light dark:border-primary/20 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-primary">
              folder_open
            </span>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">
              School Vault
            </h3>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-white dark:bg-slate-800 p-2.5 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Upload document"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">
              upload
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {sortedDocs.slice(0, 3).map((doc) => (
            <div key={doc.id} className="group flex items-center p-3 bg-white dark:bg-[#101922] rounded-lg border border-slate-100 dark:border-slate-800 hover:border-primary/30 shadow-sm transition-all cursor-pointer">
              <div className="p-2 rounded mr-3 bg-slate-50 text-slate-500">
                <span aria-hidden="true" className="material-symbols-outlined text-xl">
                  {engine.getDocumentIcon(doc.fileType)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {doc.title}
                </h4>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                  {doc.statusLabel}
                </p>
              </div>
              {doc.status === 'pending_signature' ? (
                <span className="size-2 rounded-full bg-orange-400 animate-pulse" />
              ) : (
                <span aria-hidden="true" className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">
                  download
                </span>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleViewAll}
          className="w-full mt-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-primary hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 rounded transition-all"
        >
          View All Documents
        </button>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-lg shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Upload Document
              </h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6">
              <VaultUploadForm
                familyId={familyId}
                onUploadSuccess={handleUploadSuccess}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
