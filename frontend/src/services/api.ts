/**
 * Sentinel Lens / Hazard Precaution Advisor v2
 * Typed API Client
 * Conforms to agent.md §4, §5, implementation_plan.md §5, and skills.md S-28, S-30.
 *
 * Responsibilities:
 * 1. Synchronous analysis: POST /api/analyze (+ /analyze fallback).
 * 2. Asynchronous job creation: POST /api/jobs.
 * 3. SSE event subscription: GET /api/jobs/{id}/events.
 * 4. Job result fetching: GET /api/jobs/{id}.
 * 5. System status & Graph: GET /api/status, GET /api/graph.
 * 6. Session aggregator endpoints: /api/sessions.
 * 7. Typed error wrapping without leaking sensitive info.
 */

import {
  SafetyReport,
  JobEvent,
  BackendStatus,
  WorkflowGraph,
  SessionSummary,
  PersonCategory,
  Language,
  Mode,
  Source,
} from '../types/api';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Parses API error response cleanly according to the contract:
 * { error: { code: string, message: string } }
 */
async function handleResponseError(res: Response): Promise<never> {
  let code = `HTTP_${res.status}`;
  let message = `Request failed with status ${res.status}`;
  let details: unknown = undefined;

  try {
    const data = await res.json();
    if (data && typeof data === 'object') {
      if (data.error && typeof data.error === 'object') {
        code = data.error.code || code;
        message = data.error.message || message;
        details = data.error;
      } else if (data.detail) {
        message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
    }
  } catch {
    // Non-JSON error body (e.g. gateway 502/504)
    message = res.statusText || message;
  }

  throw new ApiError(res.status, code, message, details);
}

export interface AnalyzeRequestOptions {
  image: Blob | File;
  personCategory: PersonCategory;
  language: Language;
  mode?: Mode;
  source?: Source;
  sessionId?: string;
  frameTs?: number;
  signal?: AbortSignal;
}

function normalizeAnalyzeOptions(
  imageOrOptions: Blob | File | AnalyzeRequestOptions,
  personCategory?: PersonCategory,
  language?: Language,
  mode?: Mode,
  source?: Source,
  sessionId?: string,
  frameTs?: number | string,
  signal?: AbortSignal
): AnalyzeRequestOptions {
  if ('image' in imageOrOptions && 'personCategory' in imageOrOptions) {
    return imageOrOptions as AnalyzeRequestOptions;
  }
  const parsedTs = typeof frameTs === 'string' ? parseFloat(frameTs) : frameTs;
  return {
    image: imageOrOptions as Blob | File,
    personCategory: personCategory || 'adult',
    language: language || 'en',
    mode: mode || 'quick',
    source: source || 'photo',
    sessionId,
    frameTs: isNaN(parsedTs as number) ? undefined : parsedTs,
    signal,
  };
}

/**
 * Builds FormData from analysis parameters.
 */
function buildAnalyzeFormData(options: AnalyzeRequestOptions): FormData {
  const formData = new FormData();
  formData.append('image', options.image, 'frame.jpg');
  formData.append('person_category', options.personCategory);
  formData.append('language', options.language);

  if (options.mode) {
    formData.append('mode', options.mode);
  }
  if (options.source) {
    formData.append('source', options.source);
  }
  if (options.sessionId) {
    formData.append('session_id', options.sessionId);
  }
  if (typeof options.frameTs === 'number') {
    formData.append('frame_ts', options.frameTs.toString());
  }

  return formData;
}

/**
 * POST /api/analyze - Synchronous single-image hazard analysis.
 * Supports both options object and positional arguments.
 */
export async function analyzeImage(
  imageOrOptions: Blob | File | AnalyzeRequestOptions,
  personCategory?: PersonCategory,
  language?: Language,
  mode?: Mode,
  source?: Source,
  sessionId?: string,
  frameTs?: number | string,
  signal?: AbortSignal
): Promise<SafetyReport> {
  const options = normalizeAnalyzeOptions(
    imageOrOptions,
    personCategory,
    language,
    mode,
    source,
    sessionId,
    frameTs,
    signal
  );
  const formData = buildAnalyzeFormData(options);

  const res = await fetch('/api/analyze', {
    method: 'POST',
    body: formData,
    signal: options.signal,
  });

  if (!res.ok) {
    await handleResponseError(res);
  }

  return (await res.json()) as SafetyReport;
}

/**
 * POST /api/jobs - Asynchronous hazard analysis returning a job ID (202 Accepted).
 * Supports both options object and positional arguments.
 */
export async function createAnalysisJob(
  imageOrOptions: Blob | File | AnalyzeRequestOptions,
  personCategory?: PersonCategory,
  language?: Language,
  mode?: Mode,
  source?: Source,
  signal?: AbortSignal
): Promise<{ job_id: string }> {
  const options = normalizeAnalyzeOptions(
    imageOrOptions,
    personCategory,
    language,
    mode,
    source,
    undefined,
    undefined,
    signal
  );
  const formData = buildAnalyzeFormData(options);

  const res = await fetch('/api/jobs', {
    method: 'POST',
    body: formData,
    signal: options.signal,
  });

  if (!res.ok) {
    await handleResponseError(res);
  }

  return (await res.json()) as { job_id: string };
}

/**
 * GET /api/jobs/{id} - Fetches final result of an asynchronous job.
 */
export async function getJobResult(
  jobId: string,
  signal?: AbortSignal
): Promise<SafetyReport> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    signal,
  });

  if (!res.ok) {
    await handleResponseError(res);
  }

  return (await res.json()) as SafetyReport;
}

/**
 * GET /api/jobs/{id}/events - Subscribes to real-time Server-Sent Events (SSE).
 * Returns an unsubscribe callback function.
 */
export function subscribeJobEvents(
  jobId: string,
  onEvent: (event: JobEvent) => void,
  onError?: (error: Error) => void
): () => void {
  const eventSource = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);

  eventSource.onmessage = (messageEvent) => {
    try {
      const data: JobEvent = JSON.parse(messageEvent.data);
      onEvent(data);

      // Auto-close on terminal event
      if (data.type === 'result' || data.type === 'error') {
        eventSource.close();
      }
    } catch (err) {
      if (onError) {
        onError(new Error(`Failed to parse job SSE event: ${err}`));
      }
    }
  };

  eventSource.onerror = () => {
    if (onError) {
      onError(new Error(`Job event stream encountered an error or closed.`));
    }
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}

/**
 * Convenience wrapper for streamJobEvents with separate onResult callback.
 */
export function streamJobEvents(
  jobId: string,
  onEvent: (event: JobEvent) => void,
  onResult?: (result: SafetyReport) => void,
  onError?: (error: Error) => void
): () => void {
  return subscribeJobEvents(
    jobId,
    (event) => {
      onEvent(event);
      if (event.type === 'result' && event.result && onResult) {
        onResult(event.result);
      }
    },
    onError
  );
}

/**
 * GET /api/status - Returns configuration flags, model status, and versions (no secrets).
 */
export async function getBackendStatus(signal?: AbortSignal): Promise<BackendStatus> {
  const res = await fetch('/api/status', {
    method: 'GET',
    signal,
  });

  if (!res.ok) {
    await handleResponseError(res);
  }

  return (await res.json()) as BackendStatus;
}

/**
 * GET /api/graph - Returns compiled LangGraph workflow nodes and edges for the UI.
 */
export async function getWorkflowGraph(signal?: AbortSignal): Promise<WorkflowGraph> {
  const res = await fetch('/api/graph', {
    method: 'GET',
    signal,
  });

  if (!res.ok) {
    await handleResponseError(res);
  }

  return (await res.json()) as WorkflowGraph;
}

export const fetchAgentGraph = getWorkflowGraph;
export const fetchSystemStatus = getBackendStatus;

/**
 * POST /api/settings/gemini-key - Saves Gemini API key to backend .env and reloads settings.
 */
export async function saveGeminiApiKey(apiKey: string): Promise<{ status: string; gemini_configured: boolean }> {
  const res = await fetch('/api/settings/gemini-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  });

  if (!res.ok) {
    await handleResponseError(res);
  }

  return await res.json();
}

export interface StartSessionOptions {
  mode: string;
  personCategory: PersonCategory;
  language: Language;
  signal?: AbortSignal;
}

/**
 * POST /api/sessions - Starts a room sweep, video, or live multi-frame session.
 */
export async function startSession(
  options: StartSessionOptions
): Promise<{ session_id: string }> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: options.mode,
      person_category: options.personCategory,
      language: options.language,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    await handleResponseError(res);
  }

  return (await res.json()) as { session_id: string };
}

/**
 * POST /api/sessions/{id}/frames - Submits a single frame to an active session.
 */
export async function addSessionFrame(
  sessionId: string,
  options: Omit<AnalyzeRequestOptions, 'sessionId'>
): Promise<SafetyReport> {
  return analyzeImage({ ...options, sessionId });
}

/**
 * GET /api/sessions/{id}/summary - Retrieves merged multi-view session summary.
 */
export async function getSessionSummary(
  sessionId: string,
  signal?: AbortSignal
): Promise<SessionSummary> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/summary`, {
    method: 'GET',
    signal,
  });

  if (!res.ok) {
    await handleResponseError(res);
  }

  return (await res.json()) as SessionSummary;
}
