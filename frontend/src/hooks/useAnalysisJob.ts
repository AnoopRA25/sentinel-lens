import { useState, useRef, useCallback, useEffect } from 'react';
import { AnalysisResult, PipelineEvent, Hazard } from '../types/api';

export interface UseAnalysisJobReturn {
  jobId: string | null;
  activeNode: string | null;
  completedNodes: string[];
  failedNodes: string[];
  retriedNodes: string[];
  events: PipelineEvent[];
  previewHazards: Hazard[];
  result: AnalysisResult | null;
  error: string | null;
  isLoading: boolean;
  startJob: (formData: FormData) => Promise<AnalysisResult | null>;
  cancelJob: () => void;
  reset: () => void;
}

export function useAnalysisJob(): UseAnalysisJobReturn {
  const [jobId, setJobId] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [completedNodes, setCompletedNodes] = useState<string[]>([]);
  const [failedNodes, setFailedNodes] = useState<string[]>([]);
  const [retriedNodes, setRetriedNodes] = useState<string[]>([]);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [previewHazards, setPreviewHazards] = useState<Hazard[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setJobId(null);
    setActiveNode(null);
    setCompletedNodes([]);
    setFailedNodes([]);
    setRetriedNodes([]);
    setEvents([]);
    setPreviewHazards([]);
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, [cleanup]);

  const cancelJob = useCallback(() => {
    cleanup();
    setIsLoading(false);
    setActiveNode(null);
  }, [cleanup]);

  const handlePipelineEvent = useCallback((event: PipelineEvent) => {
    setEvents((prev) => [event, ...prev]);

    switch (event.type) {
      case 'node_started':
        if (event.node) {
          setActiveNode(event.node);
        }
        break;
      case 'node_finished':
        if (event.node) {
          setCompletedNodes((prev) => (prev.includes(event.node!) ? prev : [...prev, event.node!]));
        }
        break;
      case 'node_failed':
        if (event.node) {
          setFailedNodes((prev) => (prev.includes(event.node!) ? prev : [...prev, event.node!]));
        }
        break;
      case 'retry':
        if (event.node) {
          setRetriedNodes((prev) => [...prev, event.node!]);
        }
        break;
      case 'preview': {
        const previewHazardsList = event.preview?.hazards || event.hazards;
        if (previewHazardsList) {
          setPreviewHazards(previewHazardsList);
        }
        break;
      }

      case 'result':
        if (event.result) {
          setResult(event.result);
          setIsLoading(false);
          setActiveNode(null);
          cleanup();
        }
        break;
      case 'error':
        setError(event.error?.message || 'Pipeline encountered an error');
        setIsLoading(false);
        setActiveNode(null);
        cleanup();
        break;
    }
  }, [cleanup]);

  const startJob = useCallback(
    async (formData: FormData): Promise<AnalysisResult | null> => {
      reset();
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Step 1: Submit job to backend POST /api/jobs
        const response = await fetch('/api/jobs', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          // If /api/jobs returns 404 or fails, try synchronous fallback /api/analyze
          if (response.status === 404) {
            const syncRes = await fetch('/api/analyze', {
              method: 'POST',
              body: formData,
              signal: controller.signal,
            });
            if (!syncRes.ok) {
              const errBody = await syncRes.json().catch(() => ({}));
              throw new Error(errBody?.error?.message || `Analysis request failed with status ${syncRes.status}`);
            }
            const syncData: AnalysisResult = await syncRes.json();
            setResult(syncData);
            setIsLoading(false);
            return syncData;
          }

          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody?.error?.message || `Failed to submit analysis job: ${response.statusText}`);
        }

        const data = await response.json();
        const createdJobId = data.job_id || data.id;

        if (!createdJobId) {
          // Sync response format directly returned
          if (data.outcome) {
            setResult(data as AnalysisResult);
            setIsLoading(false);
            return data as AnalysisResult;
          }
          throw new Error('Server returned invalid job response format.');
        }

        setJobId(createdJobId);

        // Step 2: Connect to SSE stream /api/jobs/{id}/events
        return new Promise<AnalysisResult | null>((resolve, reject) => {
          const sseUrl = `/api/jobs/${createdJobId}/events`;
          const es = new EventSource(sseUrl);
          eventSourceRef.current = es;

          es.onmessage = (e) => {
            try {
              const eventPayload: PipelineEvent = JSON.parse(e.data);
              handlePipelineEvent(eventPayload);

              if (eventPayload.type === 'result' && eventPayload.result) {
                resolve(eventPayload.result);
              } else if (eventPayload.type === 'error') {
                reject(new Error(eventPayload.error?.message || 'Pipeline failed'));
              }
            } catch (err) {
              console.warn('Malformed SSE event payload:', e.data, err);
            }
          };

          es.onerror = async () => {
            // Check if final job result is already available via GET /api/jobs/{id}
            try {
              const checkRes = await fetch(`/api/jobs/${createdJobId}`, {
                signal: controller.signal,
              });
              if (checkRes.ok) {
                const finalData = await checkRes.json();
                if (finalData && finalData.outcome) {
                  setResult(finalData);
                  setIsLoading(false);
                  setActiveNode(null);
                  cleanup();
                  resolve(finalData);
                  return;
                }
              }
            } catch {
              // ignore
            }

            es.close();
            const errMsg = 'Connection to analysis job event stream lost.';
            setError(errMsg);
            setIsLoading(false);
            setActiveNode(null);
            reject(new Error(errMsg));
          };
        });
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'AbortError') {
          return null;
        }
        const errorMsg = (err as Error).message || 'Analysis could not be started.';
        setError(errorMsg);
        setIsLoading(false);
        setActiveNode(null);
        return null;
      }
    },
    [cleanup, handlePipelineEvent, reset]
  );

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    jobId,
    activeNode,
    completedNodes,
    failedNodes,
    retriedNodes,
    events,
    previewHazards,
    result,
    error,
    isLoading,
    startJob,
    cancelJob,
    reset,
  };
}
