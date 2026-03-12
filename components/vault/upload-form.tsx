'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/components/toast-notification';

/**
 * VaultUploadForm Component
 *
 * File upload form for school vault documents with:
 * - Drag-drop zone (highlights on drag-over)
 * - File input + preview (shows selected file with icon)
 * - Type validation (pdf, docx, xlsx, jpg, png)
 * - Size validation (max 20MB)
 * - Progress bar (shows upload progress if available)
 * - Error handling (shows error messages with retry)
 * - Success message (shows after upload, closes after delay)
 * - Quota remaining display (after successful upload)
 * - Loading states (disables UI during upload)
 *
 * Props:
 *   - familyId: The family ID for file ownership
 *   - onUploadSuccess?: Called after successful upload
 *
 * API: POST /api/school/vault/upload
 */

interface VaultUploadFormProps {
  familyId: string;
  onUploadSuccess?: () => void;
}

interface UploadedDocument {
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
}

// Allowed file types and their MIME types
const ALLOWED_FILE_TYPES = new Set(['pdf', 'docx', 'xlsx', 'jpg', 'png']);
const MIME_TYPE_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_FILE_SIZE_MB = 20;

/**
 * Get file type icon and color based on file type
 */
function getFileTypeIcon(
  fileType: string
): { icon: string; color: string; label: string } {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return {
        icon: 'picture_as_pdf',
        color: 'text-red-500',
        label: 'PDF',
      };
    case 'docx':
    case 'doc':
      return {
        icon: 'description',
        color: 'text-blue-500',
        label: 'Word',
      };
    case 'xlsx':
    case 'xls':
      return {
        icon: 'table_chart',
        color: 'text-green-500',
        label: 'Excel',
      };
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return {
        icon: 'image',
        color: 'text-purple-500',
        label: 'Image',
      };
    default:
      return {
        icon: 'description',
        color: 'text-slate-500',
        label: 'File',
      };
  }
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}

/**
 * Validate file type from MIME type and filename
 */
function validateFileType(
  mimeType: string,
  filename: string
): { valid: boolean; extension?: string; error?: string } {
  // Get extension from MIME type
  const normalized = mimeType.toLowerCase().trim();
  const mimeExt = MIME_TYPE_MAP[normalized];

  // Get extension from filename
  const fileExt = filename.split('.').pop()?.toLowerCase();

  // Must have both
  if (!mimeExt || !fileExt) {
    return {
      valid: false,
      error: `Unsupported file type. Allowed types: ${Array.from(ALLOWED_FILE_TYPES).join(', ')}`,
    };
  }

  // Extensions should match (prevent MIME type spoofing)
  if (mimeExt !== fileExt) {
    return {
      valid: false,
      error: `File type mismatch: MIME type indicates ${mimeExt} but filename is .${fileExt}`,
    };
  }

  // Check against whitelist
  if (!ALLOWED_FILE_TYPES.has(mimeExt)) {
    return {
      valid: false,
      error: `File type not allowed: .${mimeExt}. Allowed types: ${Array.from(ALLOWED_FILE_TYPES).join(', ')}`,
    };
  }

  return { valid: true, extension: mimeExt };
}

export function VaultUploadForm({
  familyId,
  onUploadSuccess,
}: VaultUploadFormProps) {
  const { add: addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);

  // UI state
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploadedDocument, setUploadedDocument] =
    useState<UploadedDocument | null>(null);

  // Validation state
  const [validationError, setValidationError] = useState<string | null>(null);

  /**
   * Validate file on selection
   */
  function validateFile(file: File): boolean {
    setValidationError(null);

    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const error = `File size exceeds ${MAX_FILE_SIZE_MB}MB limit. Your file is ${formatBytes(file.size)}.`;
      setValidationError(error);
      addToast(error, 'error');
      return false;
    }

    // Check file type
    const { valid, error: typeError } = validateFileType(file.type, file.name);
    if (!valid) {
      setValidationError(typeError || 'Invalid file type');
      addToast(typeError || 'Invalid file type', 'error');
      return false;
    }

    return true;
  }

  /**
   * Handle file selection from file input
   */
  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (validateFile(file)) {
      setSelectedFile(file);
      // Pre-fill title with filename (without extension)
      const nameWithoutExt = file.name.split('.').slice(0, -1).join('.');
      setTitle(nameWithoutExt);
    }
  }

  /**
   * Handle drag over
   */
  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }

  /**
   * Handle drag leave
   */
  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }

  /**
   * Handle drop
   */
  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    if (validateFile(file)) {
      setSelectedFile(file);
      // Pre-fill title with filename (without extension)
      const nameWithoutExt = file.name.split('.').slice(0, -1).join('.');
      setTitle(nameWithoutExt);
    }
  }

  /**
   * Clear selected file and reset form
   */
  function handleClearFile() {
    setSelectedFile(null);
    setTitle('');
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  /**
   * Upload file to server
   */
  async function handleUpload() {
    if (!selectedFile || !title.trim()) {
      setError('Please select a file and enter a title');
      addToast('Please select a file and enter a title', 'error');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);

      // Create form data
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', title.trim());
      formData.append('familyId', familyId);

      // Create XMLHttpRequest to track upload progress
      const xhr = new XMLHttpRequest();

      // Track progress if available
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(percentComplete);
        }
      });

      // Handle completion and errors in a Promise
      const uploadPromise = new Promise<UploadedDocument>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 201) {
            try {
              const response = JSON.parse(xhr.responseText) as UploadedDocument;
              resolve(response);
            } catch {
              reject(
                new Error('Failed to parse upload response')
              );
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(
                new Error(
                  errorData.message || `Upload failed (${xhr.status})`
                )
              );
            } catch {
              reject(
                new Error(`Upload failed (${xhr.status})`)
              );
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'));
        });

        // Send the request
        xhr.open('POST', '/api/school/vault/upload');
        xhr.send(formData);
      });

      const document = await uploadPromise;

      // Success
      setSuccess(true);
      setUploadedDocument(document);
      setUploadProgress(100);
      addToast('Document uploaded successfully!', 'success');

      // Call callback if provided
      onUploadSuccess?.();

      // Reset form after delay
      setTimeout(() => {
        handleClearFile();
        setSuccess(false);
        setUploadedDocument(null);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      addToast(message, 'error');
    } finally {
      setIsUploading(false);
    }
  }

  /**
   * Retry upload after error
   */
  function handleRetry() {
    setError(null);
    setUploadProgress(0);
    handleUpload();
  }

  // Render success state
  if (success && uploadedDocument) {
    const { icon, color } = getFileTypeIcon(uploadedDocument.fileType);

    return (
      <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-start gap-4">
          <span
            className={`material-symbols-outlined text-4xl ${color}`}
          >
            {icon}
          </span>
          <div className="flex-1">
            <h3 className="font-semibold text-green-900 dark:text-green-200">
              Upload Successful
            </h3>
            <p className="mt-2 text-sm text-green-800 dark:text-green-300">
              <strong>{uploadedDocument.title}</strong> has been uploaded and is
              ready to use.
            </p>
            <div className="mt-3 space-y-1 text-sm text-green-700 dark:text-green-400">
              <div>
                File Type: <span className="font-medium">{uploadedDocument.fileType.toUpperCase()}</span>
              </div>
              <div>
                File Size:{' '}
                <span className="font-medium">
                  {formatBytes(uploadedDocument.sizeBytes)}
                </span>
              </div>
              <div>
                Uploaded:{' '}
                <span className="font-medium">
                  {new Date(uploadedDocument.addedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render error state (with retry option)
  if (error) {
    return (
      <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-3xl text-red-500">
            error
          </span>
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 dark:text-red-200">
              Upload Failed
            </h3>
            <p className="mt-2 text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleRetry}
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
              >
                <span className="material-symbols-outlined text-base">
                  retry
                </span>
                Retry Upload
              </button>
              <button
                onClick={() => {
                  setError(null);
                  handleClearFile();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/20"
              >
                <span className="material-symbols-outlined text-base">
                  close
                </span>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render uploading state
  if (isUploading) {
    return (
      <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 dark:text-blue-200">
              Uploading Document
            </h3>
            <p className="mt-2 text-sm text-blue-800 dark:text-blue-300">
              {selectedFile?.name}
            </p>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(uploadProgress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Upload progress: ${Math.round(uploadProgress)}%`}
                />
              </div>
              <div className="mt-2 text-sm font-medium text-blue-800 dark:text-blue-300">
                {Math.round(uploadProgress)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render main form
  const { icon: fileIcon, color: fileColor } = selectedFile
    ? getFileTypeIcon(selectedFile.type)
    : { icon: 'cloud_upload', color: 'text-slate-400' };

  return (
    <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      {/* Title Section */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Upload Document
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Upload school documents to your vault. Supported formats: PDF, Word, Excel, JPG, PNG (max 20MB)
        </p>
      </div>

      {/* Drag-Drop Zone */}
      <div
        ref={dragZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-8 transition-all ${
          isDragOver
            ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
            : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <span className={`material-symbols-outlined text-5xl ${fileColor}`}>
            {selectedFile ? fileIcon : 'cloud_upload'}
          </span>

          {selectedFile ? (
            <>
              <div className="text-center">
                <p className="font-medium text-slate-900 dark:text-white">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {formatBytes(selectedFile.size)}
                </p>
              </div>
              <button
                onClick={handleClearFile}
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Choose a different file
              </button>
            </>
          ) : (
            <>
              <div className="text-center">
                <p className="font-medium text-slate-900 dark:text-white">
                  Drag and drop your document here
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  or{' '}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    click to select
                  </button>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.jpg,.png"
          onChange={handleFileInput}
          className="hidden"
          disabled={isUploading}
        />
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
          <span className="material-symbols-outlined flex-shrink-0 text-red-500">
            error
          </span>
          <p className="text-sm text-red-700 dark:text-red-200">
            {validationError}
          </p>
        </div>
      )}

      {/* Title Input */}
      {selectedFile && (
        <div>
          <label
            htmlFor="doc-title"
            className="block text-sm font-medium text-slate-900 dark:text-white"
          >
            Document Title
          </label>
          <input
            id="doc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a descriptive title for this document"
            disabled={isUploading}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:disabled:bg-slate-700"
          />
        </div>
      )}

      {/* Upload Button */}
      {selectedFile && (
        <div className="flex gap-3">
          <button
            onClick={handleUpload}
            disabled={isUploading || !title.trim()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <span className="material-symbols-outlined">
                {isUploading ? 'hourglass_empty' : 'upload'}
              </span>
              {isUploading ? 'Uploading...' : 'Upload Document'}
            </span>
          </button>
          <button
            onClick={handleClearFile}
            disabled={isUploading}
            className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      )}

      {/* File Type Info */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Supported file types:
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from(ALLOWED_FILE_TYPES).map((type) => (
            <span
              key={type}
              className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-300"
            >
              {type}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
          Maximum file size: {MAX_FILE_SIZE_MB}MB
        </p>
      </div>
    </div>
  );
}
