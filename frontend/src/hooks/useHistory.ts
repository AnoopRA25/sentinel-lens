import { useState, useEffect, useCallback } from 'react';
import { AnalysisResult, SafetyReport } from '../types/api';
import { HistoryItem } from '../types/ui';
import {
  getStoredReports,
  saveReport,
  deleteReport,
  clearAllReports,
} from '../lib/historyStore';
import { generateReportsCSV } from '../lib/exporters';

export function useHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sessionEntries, setSessionEntries] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setIsLoading(true);
    const data = getStoredReports();
    setHistory(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveResult = useCallback(
    (res: SafetyReport | AnalysisResult, notes?: string): HistoryItem => {
      const saved = saveReport(res, notes);
      setSessionEntries((prev) => [saved, ...prev.filter((e) => e.id !== saved.id)]);
      refresh();
      return saved;
    },
    [refresh]
  );

  const deleteEntry = useCallback(
    (id: string) => {
      deleteReport(id);
      setSessionEntries((prev) => prev.filter((e) => e.id !== id));
      refresh();
    },
    [refresh]
  );

  const removeAll = useCallback(() => {
    clearAllReports();
    setHistory([]);
    setSessionEntries([]);
  }, []);

  const exportCsv = useCallback((): string => {
    return generateReportsCSV(history);
  }, [history]);

  const downloadCsv = useCallback(
    (filename = `hazard-report-${new Date().toISOString().slice(0, 10)}.csv`) => {
      const csv = exportCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [exportCsv]
  );

  return {
    history,
    entries: history,
    savedEntries: history,
    sessionEntries,
    isLoading,
    refresh,
    saveResult,
    addResult: saveResult,
    deleteEntry,
    deleteReport: deleteEntry,
    clearAll: removeAll,
    clearHistory: removeAll,
    exportCsv,
    downloadCsv,
  };
}
