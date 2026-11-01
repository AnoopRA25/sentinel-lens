import { useState, useRef, useEffect, useCallback } from 'react';

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'paused'
  | 'denied'
  | 'unavailable'
  | 'insecure'
  | 'error';

export type CameraState = CameraStatus;

export interface UseCameraOptions {
  idealWidth?: number;
  idealHeight?: number;
  facingMode?: 'environment' | 'user';
  onStateChange?: (state: CameraState) => void;
}

export function useCamera(options: UseCameraOptions = {}) {
  const {
    idealWidth = 1280,
    idealHeight = 720,
    facingMode = 'environment',
    onStateChange,
  } = options;

  const [status, setStatus] = useState<CameraStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const updateStatus = useCallback(
    (newStatus: CameraStatus) => {
      setStatus(newStatus);
      onStateChange?.(newStatus);
    },
    [onStateChange]
  );

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    updateStatus('idle');
    setErrorMessage(null);
  }, [updateStatus]);

  const pauseCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
      if (videoRef.current) {
        videoRef.current.pause();
      }
      updateStatus('paused');
    }
  }, [updateStatus]);

  const resumeCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
      if (videoRef.current) {
        videoRef.current.play().catch((err) => {
          console.warn('Could not resume video:', err);
        });
      }
      updateStatus('active');
    }
  }, [updateStatus]);

  const startCamera = useCallback(async (): Promise<MediaStream | null> => {
    if (typeof window === 'undefined') return null;

    // S-02 rule: check secure context first
    if (!window.isSecureContext) {
      const msg = 'Live mode needs a secure (HTTPS) connection. Photo and Video modes still work. See Settings, Phone access.';
      updateStatus('insecure');
      setErrorMessage(msg);
      return null;
    }


    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Camera access is not supported by this browser.';
      updateStatus('unavailable');
      setErrorMessage(msg);
      return null;
    }

    // Stop existing stream if any
    stopCamera();

    updateStatus('requesting');
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: idealWidth },
          height: { ideal: idealHeight },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => {
          console.warn('Video play interrupted:', err);
        });
      }
      updateStatus('active');
      return stream;
    } catch (err: any) {
      console.error('Camera acquisition error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        updateStatus('denied');
        setErrorMessage('Camera access was denied. Please grant permission in browser site settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        updateStatus('unavailable');
        setErrorMessage('No camera found on this device.');
      } else {
        updateStatus('error');
        setErrorMessage(err.message || 'Could not start camera feed.');
      }
      return null;
    }
  }, [facingMode, idealHeight, idealWidth, stopCamera, updateStatus]);

  // Clean up on unmount or tab hidden (S-02)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && streamRef.current) {
        stopCamera();
      }
    };

    const handlePageHide = () => {
      stopCamera();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      stopCamera();
    };
  }, [stopCamera]);

  return {
    status,
    state: status,
    errorMessage,
    error: errorMessage,
    videoRef,
    stream: streamRef.current,
    isLive: status === 'active',
    startCamera,
    stopCamera,
    pauseCamera,
    resumeCamera,
  };
}
