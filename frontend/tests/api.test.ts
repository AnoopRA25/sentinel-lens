import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, getBackendStatus, getJobResult } from '../src/services/api';

describe('API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('instantiates ApiError with status, code, and message', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Job does not exist');
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Job does not exist');
  });

  it('getBackendStatus makes GET request and parses response', async () => {
    const mockStatus = {
      gemini_configured: true,
      telegram_configured: false,
      version: '2.0.0',
      pipeline_version: 'v2',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    const status = await getBackendStatus();
    expect(status).toEqual(mockStatus);
    expect(global.fetch).toHaveBeenCalledWith('/api/status', expect.objectContaining({ method: 'GET' }));
  });

  it('throws structured ApiError on 429 rate limit response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({
        error: {
          code: 'RATE_LIMITED',
          message: 'Analysis is rate-limited. Slowing down.',
        },
      }),
    } as Response);

    await expect(getJobResult('job_429')).rejects.toThrow(ApiError);
    await expect(getJobResult('job_429')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Analysis is rate-limited. Slowing down.',
    });
  });
});
