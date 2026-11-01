/**
 * S-09: Local History Store
 * Conforms to skills.md S-09, design.md §14, §16.
 *
 * Responsibilities:
 * 1. Store completed SafetyReports in localStorage with schema versioning.
 * 2. Enforce hard entry cap (default 200 entries, FIFO truncation).
 * 3. Store structured results only, never raw image bytes or base64.
 * 4. Storage quota guard (handles QuotaExceededError by pruning oldest entries).
 * 5. Search and filter helpers across risks, persons, text, dates.
 */

import { SafetyReport } from '../types/api';
import { HistoryItem, HistoryFilterOptions, HistoryStorageMeta } from '../types/ui';

export const STORAGE_VERSION = 'v2';
export const STORAGE_KEY = `hpa_reports_${STORAGE_VERSION}`;
export const MAX_HISTORY_ENTRIES = 200;

/**
 * Checks if localStorage is available in the current environment.
 */
function isStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    const testKey = '__hpa_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads all stored history items from localStorage.
 */
export function getStoredReports(): HistoryItem[] {
  if (!isStorageAvailable()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Failed to parse history reports from localStorage:', err);
    return [];
  }
}

/**
 * Internal helper to write items to localStorage with QuotaExceeded fallback pruning.
 */
function writeReportsToStorage(items: HistoryItem[]): void {
  if (!isStorageAvailable()) return;

  const bounded = items.slice(0, MAX_HISTORY_ENTRIES);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch (err) {
    // QuotaExceededError recovery: prune oldest 20% and retry
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      console.warn('LocalStorage quota exceeded. Pruning oldest reports.');
      if (bounded.length > 10) {
        const pruned = bounded.slice(0, Math.floor(bounded.length * 0.8));
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
          return;
        } catch {
          // Fallback: try smaller batch
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned.slice(0, 10)));
        }
      }
    } else {
      console.error('Error writing reports to localStorage:', err);
    }
  }
}

/**
 * Saves or updates a safety report in local history.
 * Ensures the entry cap (200) is respected.
 */
export function saveReport(report: SafetyReport, notes?: string): HistoryItem {
  const current = getStoredReports();
  const existingIndex = current.findIndex((item) => item.id === report.id);

  const historyItem: HistoryItem = {
    ...report,
    localId: report.id,
    savedAt: new Date().toISOString(),
    notes: notes ?? (existingIndex >= 0 ? current[existingIndex].notes : undefined),
  };

  let updated: HistoryItem[];

  if (existingIndex >= 0) {
    // Update existing in-place
    updated = [...current];
    updated[existingIndex] = historyItem;
  } else {
    // New item prepended to top (newest first)
    updated = [historyItem, ...current];
  }

  writeReportsToStorage(updated);
  return historyItem;
}

/**
 * Retrieves a single report by its ID.
 */
export function getReportById(id: string): HistoryItem | null {
  const current = getStoredReports();
  return current.find((item) => item.id === id || item.localId === id) ?? null;
}

/**
 * Deletes a single report by ID. Returns true if removed.
 */
export function deleteReport(id: string): boolean {
  const current = getStoredReports();
  const filtered = current.filter((item) => item.id !== id && item.localId !== id);

  if (filtered.length === current.length) {
    return false;
  }

  writeReportsToStorage(filtered);
  return true;
}

/**
 * Clears all locally saved reports.
 */
export function clearAllReports(): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear reports from localStorage:', err);
  }
}

/**
 * Filters a list of history reports according to user criteria.
 */
export function filterReports(
  reports: HistoryItem[],
  filters: HistoryFilterOptions
): HistoryItem[] {
  return reports.filter((item) => {
    // Risk level filter
    if (filters.riskLevel && filters.riskLevel !== 'all') {
      if (item.overall_risk !== filters.riskLevel) {
        return false;
      }
    }

    // Person category filter
    if (filters.personCategory && filters.personCategory !== 'all') {
      if (item.person_category !== filters.personCategory) {
        return false;
      }
    }

    // Outcome filter
    if (filters.outcome && filters.outcome !== 'all') {
      if (item.outcome !== filters.outcome) {
        return false;
      }
    }

    // Language filter
    if (filters.language && filters.language !== 'all') {
      if (item.language !== filters.language) {
        return false;
      }
    }

    // Date range filter
    if (filters.startDate) {
      const itemTime = new Date(item.timestamp).getTime();
      const startTime = new Date(filters.startDate).getTime();
      if (!isNaN(startTime) && itemTime < startTime) {
        return false;
      }
    }

    if (filters.endDate) {
      const itemTime = new Date(item.timestamp).getTime();
      const endTime = new Date(filters.endDate).getTime();
      if (!isNaN(endTime) && itemTime > endTime) {
        return false;
      }
    }

    // Text search query across hazard titles, evidence, scene summary
    if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
      const query = filters.searchQuery.toLowerCase().trim();
      const matchScene =
        (item.scene?.summary || '').toLowerCase().includes(query) ||
        (item.scene?.environment || '').toLowerCase().includes(query);

      const matchHazards = (item.hazards || []).some((h) => {
        const titleMatch = h.title.toLowerCase().includes(query);
        const catMatch = h.category_id.toLowerCase().includes(query);
        const evidenceMatch = (h.evidence || []).some((e) => e.toLowerCase().includes(query));
        const precautionMatch = (h.precautions || []).some((p) => p.text.toLowerCase().includes(query));
        return titleMatch || catMatch || evidenceMatch || precautionMatch;
      });

      const matchNotes = (item.notes || '').toLowerCase().includes(query);

      if (!matchScene && !matchHazards && !matchNotes) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Returns metadata about the storage usage.
 */
export function getStorageUsage(): HistoryStorageMeta {
  if (!isStorageAvailable()) {
    return {
      version: STORAGE_VERSION,
      count: 0,
      maxEntries: MAX_HISTORY_ENTRIES,
      estimatedBytes: 0,
    };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY) || '[]';
  const count = getStoredReports().length;
  // Estimate byte size in UTF-16
  const estimatedBytes = raw.length * 2;

  return {
    version: STORAGE_VERSION,
    count,
    maxEntries: MAX_HISTORY_ENTRIES,
    estimatedBytes,
  };
}

// Aliases for hook & component compatibility
export const loadHistory = getStoredReports;
export const saveResultToHistory = (report: SafetyReport, notes?: string): HistoryItem =>
  saveReport(report, notes);
export const clearHistory = clearAllReports;

export const HistoryStore = {
  getStoredReports,
  saveReport,
  getReportById,
  deleteReport,
  clearAllReports,
  filterReports,
  getStorageUsage,
  loadHistory,
  saveResultToHistory,
  clearHistory,
};

