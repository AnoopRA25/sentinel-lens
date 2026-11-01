import React, { useRef, useImperativeHandle, forwardRef } from 'react';

export interface NativeCaptureProps {
  onFile: (file: File, type: 'photo' | 'video') => void;
  acceptMode?: 'photo' | 'video' | 'both';
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export interface NativeCaptureRef {
  triggerPhotoCamera: () => void;
  triggerPhotoPicker: () => void;
  triggerVideoCamera: () => void;
  triggerVideoPicker: () => void;
}

export const NativeCapture = forwardRef<NativeCaptureRef, NativeCaptureProps>(
  ({ onFile, acceptMode = 'photo', disabled = false, className = '', children }, ref) => {
    const photoCameraInputRef = useRef<HTMLInputElement>(null);
    const photoPickerInputRef = useRef<HTMLInputElement>(null);
    const videoCameraInputRef = useRef<HTMLInputElement>(null);
    const videoPickerInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      triggerPhotoCamera: () => photoCameraInputRef.current?.click(),
      triggerPhotoPicker: () => photoPickerInputRef.current?.click(),
      triggerVideoCamera: () => videoCameraInputRef.current?.click(),
      triggerVideoPicker: () => videoPickerInputRef.current?.click(),
    }));

    const handleFileChange = (
      e: React.ChangeEvent<HTMLInputElement>,
      type: 'photo' | 'video'
    ) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFile(files[0], type);
        // Reset input value so re-selecting same file works
        e.target.value = '';
      }
    };

    return (
      <div className={`relative ${className}`}>
        {/* Hidden native input 1: Photo via rear environment camera */}
        {(acceptMode === 'photo' || acceptMode === 'both') && (
          <>
            <input
              ref={photoCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Take photo with rear camera"
              disabled={disabled}
              onChange={(e) => handleFileChange(e, 'photo')}
              className="sr-only hidden"
              data-testid="native-photo-camera"
            />
            {/* Gallery fallback */}
            <input
              ref={photoPickerInputRef}
              type="file"
              accept="image/*"
              aria-label="Select photo from files or gallery"
              disabled={disabled}
              onChange={(e) => handleFileChange(e, 'photo')}
              className="sr-only hidden"
              data-testid="native-photo-picker"
            />
          </>
        )}

        {/* Hidden native input 2: Video via rear environment camera */}
        {(acceptMode === 'video' || acceptMode === 'both') && (
          <>
            <input
              ref={videoCameraInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              aria-label="Record video with rear camera"
              disabled={disabled}
              onChange={(e) => handleFileChange(e, 'video')}
              className="sr-only hidden"
              data-testid="native-video-camera"
            />
            {/* Gallery video fallback */}
            <input
              ref={videoPickerInputRef}
              type="file"
              accept="video/*"
              aria-label="Select video from files"
              disabled={disabled}
              onChange={(e) => handleFileChange(e, 'video')}
              className="sr-only hidden"
              data-testid="native-video-picker"
            />
          </>
        )}

        {children}
      </div>
    );
  }
);

NativeCapture.displayName = 'NativeCapture';
