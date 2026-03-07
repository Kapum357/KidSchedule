"use client";

import { useState, useRef, useCallback } from "react";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "video/mp4"];
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileUploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setValidationError("Unsupported file type. Please upload a PNG, JPG, or MP4 file.");
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setValidationError(`File too large (${formatBytes(file.size)}). Maximum size is 50 MB.`);
      setSelectedFile(null);
      return;
    }
    setValidationError("");
    setSelectedFile(file);

    // Sync to the real file input so the server action receives the file
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputRef.current.files = dt.files;
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSetFile(file);
    },
    [validateAndSetFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setValidationError("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const fileIsVideo = selectedFile?.type.startsWith("video/");
  const hasError = !!validationError;

  const zoneClasses = `mt-2 flex justify-center rounded-xl border border-dashed px-6 py-10 cursor-pointer transition-all ${
    isDragging
      ? "border-primary bg-primary/10 scale-[1.01]"
      : hasError
      ? "border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-900/10"
      : selectedFile
      ? "border-primary bg-primary/5"
      : "border-slate-300 dark:border-slate-600 hover:border-primary hover:bg-primary/5"
  }`;

  return (
    <div className="group relative">
      <label className="block text-sm font-semibold leading-6 text-slate-900 dark:text-white mb-2">
        Upload Photos or Video
      </label>

      <div
        className={zoneClasses}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="File upload zone"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        {selectedFile ? (
          <div className="text-center">
            <span className="material-symbols-outlined mx-auto text-5xl text-primary">
              {fileIsVideo ? "movie" : "image"}
            </span>
            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200 max-w-[200px] truncate mx-auto">
              {selectedFile.name}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{formatBytes(selectedFile.size)}</p>
            <button
              type="button"
              onClick={handleClear}
              className="mt-3 text-xs font-medium text-primary hover:underline"
            >
              Change file
            </button>
          </div>
        ) : (
          <div className="text-center">
            <span
              className={`material-symbols-outlined mx-auto text-5xl transition-colors ${
                isDragging ? "text-primary" : "text-slate-300 dark:text-slate-500"
              }`}
            >
              cloud_upload
            </span>
            <div className="mt-4 flex text-sm leading-6 text-slate-600 dark:text-slate-400 justify-center">
              <span className="font-semibold text-primary hover:text-primary-hover cursor-pointer">
                {isDragging ? "Drop to upload" : "Upload a file"}
              </span>
              {!isDragging && <p className="pl-1">or drag and drop</p>}
            </div>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-500 mt-1">
              PNG, JPG, MP4 up to 50 MB
            </p>
          </div>
        )}

        {/* Hidden file input — name="media" matches the server action */}
        <input
          ref={inputRef}
          className="sr-only"
          id="file-upload"
          name="media"
          type="file"
          accept="image/png,image/jpeg,video/mp4"
          onChange={handleChange}
          required
        />
      </div>

      {validationError && (
        <p className="mt-2 flex items-center gap-1 text-sm font-medium text-red-600 dark:text-red-400">
          <span className="material-symbols-outlined text-base">error</span>
          {validationError}
        </p>
      )}
    </div>
  );
}
