/**
 * Sentinel Lens / Hazard Precaution Advisor v2
 * UI Component & Frontend State Types
 * Conforms to design.md §6, §7, §9 and skills.md.
 */

import {
  SafetyReport,
  RiskLevel,
  PersonCategory,
  Outcome,
  Language,
  CoverageSegment,
} from './api';

export type { CoverageSegment };

export type AppMode =
  | 'overview'
  | 'photo'
  | 'video'
  | 'live'
  | 'workflow'
  | 'reports'
  | 'history'
  | 'settings';

export type SheetSnapPoint = 'peek' | 'half' | 'full';

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

export interface QualityAssessment {
  isAcceptable: boolean;
  issue?: 'dark' | 'blurry' | 'glare' | 'framing' | null;
  message?: string;
  brightness?: number;
  blurVariance?: number;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  source?: string;
  personCategory: PersonCategory;
  language: Language;
  overallRisk: RiskLevel;
  hazardCount: number;
  outcome: Outcome;
  result: SafetyReport;
  thumbnail?: string;
}


export interface QualityCheckResult {
  isTooDark: boolean;
  isBlurry: boolean;
  isGlare: boolean;
  isAcceptable?: boolean;
  message?: string;
  darknessScore: number;
  blurScore: number;
  glareScore: number;
  hint: string | null;
}

export interface CapturedFrame {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: string;
}

export interface FrameCaptureOptions {
  maxSide?: number;
  quality?: number;
  mimeType?: string;
}

export interface HistoryItem extends SafetyReport {
  localId: string;
  savedAt: string;
  notes?: string;
}

export interface HistoryFilterOptions {
  searchQuery?: string;
  riskLevel?: RiskLevel | 'all';
  personCategory?: PersonCategory | 'all';
  outcome?: Outcome | 'all';
  language?: Language | 'all';
  startDate?: string;
  endDate?: string;
}

export interface HistoryStorageMeta {
  version: string;
  count: number;
  maxEntries: number;
  estimatedBytes: number;
}

export interface VideoExtractionProgress {
  currentFrame: number;
  totalFrames: number;
  timestamp: number;
  percent: number;
}

export interface VideoExtractionOptions {
  intervalSeconds?: number;
  maxFrames?: number;
  maxDurationSeconds?: number;
  onProgress?: (progress: VideoExtractionProgress) => void;
  signal?: AbortSignal;
}

export interface VideoFrameResult {
  frame: CapturedFrame;
  timestamp: number;
  index: number;
}

export interface CSVExportColumn<T> {
  header: string;
  accessor: (item: T) => string | number | boolean | null | undefined;
}
