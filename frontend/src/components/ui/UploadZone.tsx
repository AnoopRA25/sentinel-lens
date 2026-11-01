import React, { useState, useRef, useCallback } from 'react';

export interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  selectedFile?: File | null;
  onClear?: () => void;
  maxSizeMb?: number;
  className?: string;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFileSelected,
  selectedFile = null,
  onClear,
  maxSizeMb = 10,
  className = '',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback(
    (file: File) => {
      setErrorMessage(null);

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        setErrorMessage('Unsupported file format. Please upload JPEG, PNG, or WebP.');
        return;
      }

      const maxBytes = maxSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        setErrorMessage(`File exceeds the ${maxSizeMb} MB limit.`);
        return;
      }

      onFileSelected(file);
    },
    [maxSizeMb, onFileSelected]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        aria-label="Upload photo for hazard analysis"
        className={`relative p-6 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer text-center flex flex-col items-center justify-center focus:outline-none focus:ring-2 focus:ring-signal-cyan ${
          isDragOver
            ? 'border-signal-cyan bg-signal-cyan/10'
            : selectedFile
            ? 'border-ink-600 bg-ink-800'
            : 'border-ink-700 bg-ink-900 hover:border-mist-400 hover:bg-ink-800'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              validateAndSelect(e.target.files[0]);
              e.target.value = '';
            }
          }}
        />

        {selectedFile ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center space-x-2 text-mist-100">
              <svg className="w-5 h-5 text-signal-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-semibold text-sm truncate max-w-xs">{selectedFile.name}</span>
            </div>
            <p className="text-xs text-mist-400 font-condensed">
              {formatFileSize(selectedFile.size)} · Click or drop to replace
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-mist-400">
            <svg
              className="w-8 h-8 mx-auto text-ink-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm font-medium text-mist-100">
              Drop scene photo here, or browse
            </p>
            <p className="text-xs text-mist-400">
              JPEG, PNG, WebP up to {maxSizeMb} MB (EXIF removed)
            </p>
          </div>
        )}
      </div>

      {/* Inline error notice */}
      {errorMessage && (
        <div role="alert" className="text-xs text-risk-high flex items-center space-x-1.5">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {selectedFile && onClear && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-mist-400 hover:text-mist-100"
          >
            Remove file
          </button>
        </div>
      )}
    </div>
  );
};
