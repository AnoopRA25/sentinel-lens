/**
 * Sentinel Lens / Hazard Precaution Advisor v2
 * API Schema TypeScript Interfaces
 * Strictly mirrors backend contracts defined in agent.md §5, §6 and implementation_plan.md §5.
 */

export type PersonCategory = 'baby' | 'child' | 'adult' | 'elderly';
export type Language = 'en' | 'kn' | 'hi';
export type Mode = 'quick' | 'deep';
export type Source = 'photo' | 'frame' | 'video_frame';
export type HazardStatus = 'observed' | 'likely' | 'possible';
export type EvidenceStrength = 'clear' | 'partial' | 'weak';
export type RiskLevel = 'low' | 'medium' | 'high' | 'uncertain';
export type Outcome = 'hazards_found' | 'none_observed' | 'inconclusive' | 'failed';
export type VerifyStatus = 'passed' | 'passed_with_changes' | 'failed_fallback';
export type NotifyStatus = 'sent' | 'skipped_cooldown' | 'skipped_policy' | 'disabled' | 'failed';
export type PrecautionProvenance = 'guideline' | 'generic' | 'ai_general';
export type PersonRelevance = 'high' | 'normal' | 'low';

export interface Precaution {
  text: string;
  provenance: PrecautionProvenance;
  guideline_id?: string | null;
  source_note?: string | null;
  priority: number;
  applies_to?: PersonCategory[];
}

export interface BoundingBox {
  ymin?: number;
  xmin?: number;
  ymax?: number;
  xmax?: number;
  box_2d?: [number, number, number, number] | number[];
  label?: string;
}

export type RegionBox = BoundingBox;


export interface HazardRisk {
  level: RiskLevel;
  potential_level?: RiskLevel | null;
  rule_ids: string[];
  rationale: string;
}

export interface Hazard {
  id: string;
  category_id: string;
  title: string;
  status: HazardStatus;
  evidence_strength: EvidenceStrength;
  evidence: string[];
  trigger?: string | null;
  region?: BoundingBox | null;
  person_relevance?: PersonRelevance;
  risk: HazardRisk;
  precautions: Precaution[];
}

export interface SceneInfo {
  environment: string;
  summary: string;
  quality_flags: string[];
  coverage_gaps: string[];
}

export interface VerificationCheck {
  id: string;
  passed: boolean;
  detail?: string;
}

export interface VerificationResult {
  status: VerifyStatus;
  issues: string[];
  changes: string[];
  retries_used: number;
  checks?: VerificationCheck[];
}

export interface NotificationRecord {
  status: NotifyStatus;
  reason?: string | null;
  attempts?: number;
  telegram_message_id?: string | number | null;
}

export interface TraceEvent {
  node: string;
  status: string;
  duration_ms: number;
  attempt?: number;
  ts?: string;
  summary?: string;
}

export interface ErrorInfo {
  code: string;
  message: string;
}

export interface SafetyReport {
  id: string;
  timestamp: string;
  outcome: Outcome;
  analysis_reliable: boolean;
  person_category: PersonCategory;
  language: Language;
  scene: SceneInfo;
  hazards: Hazard[];
  overall_risk: RiskLevel;
  immediate_action: boolean;
  verification: VerificationResult;
  notification: NotificationRecord;
  errors: (string | ErrorInfo)[];
  translation_error?: string | null;
  trace: TraceEvent[];
  limits: string;
  pipeline_version?: string;
  source?: Source;
  session_id?: string | null;
  view_index?: number | null;
  frame_ts?: number | null;
}

// Aliases for component compatibility across layers
export type AnalysisResult = SafetyReport;

export type CoverageSegmentState = 'empty' | 'captured' | 'analyzed' | 'inconclusive' | 'failed' | 'done';

export interface CoverageSegment {
  id?: string;
  index: number;
  state: CoverageSegmentState;
  maxRisk?: RiskLevel | null;
  frameTs?: number;
  hazardCount?: number;
  viewLabel?: string;
  outcome?: Outcome;
  capturedAt?: string;
}


export interface SessionHazardSighting {
  view_index: number;
  frame_ts?: number;
  risk_level: RiskLevel;
}

export interface SessionHazard {
  id: string;
  category_id: string;
  title: string;
  max_risk: RiskLevel;
  first_seen: string;
  last_seen: string;
  sightings_count: number;
  sightings: SessionHazardSighting[];
  status: HazardStatus;
  evidence: string[];
  precautions: Precaution[];
}

export interface SessionCoverage {
  segments: CoverageSegment[];
  gaps: string[];
  disclaimer: string;
}

export interface SessionChangeEvent {
  ts: string;
  type: string;
  description: string;
}

export interface SessionSummary {
  session_id: string;
  created_at: string;
  updated_at: string;
  mode: string;
  person_category: PersonCategory;
  language: Language;
  views_analyzed: number;
  max_risk: RiskLevel;
  hazards: SessionHazard[];
  coverage: SessionCoverage;
  change_events: SessionChangeEvent[];
}

export type JobEventType =
  | 'node_started'
  | 'node_finished'
  | 'node_failed'
  | 'retry'
  | 'preview'
  | 'result'
  | 'error'
  | 'heartbeat';

export interface JobEvent {
  type: JobEventType;
  job_id?: string;
  node?: string;
  stage?: string;
  attempt?: number;
  ts?: string;
  duration_ms?: number;
  summary?: string;
  preview?: {
    hazards: Hazard[];
    unverified: boolean;
  };
  hazards?: Hazard[];
  result?: SafetyReport;

  error?: ErrorInfo;
  data?: unknown;
}

export type PipelineEvent = JobEvent;

export interface BackendStatus {
  backend_healthy?: boolean;
  gemini_configured: boolean;
  telegram_configured: boolean;
  version: string;
  pipeline_version: string;
  max_upload_mb?: number;
  supported_languages?: Language[];
  model_name?: string;
  uptime_seconds?: number;
}

export interface WorkflowNode {
  id: string;
  name?: string;
  label: string;
  agent?: string;
  description?: string;
  stage?: string;
  type?: string;
}

export interface WorkflowEdge {
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  condition?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entry_point?: string;
}

export type GraphData = WorkflowGraph;
export type GraphDefinition = WorkflowGraph;
export type GraphNode = WorkflowNode;
export type GraphEdge = WorkflowEdge;
export type PipelineEventType = JobEventType;
export type SystemStatus = BackendStatus;

