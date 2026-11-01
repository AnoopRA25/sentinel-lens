/**
 * Sentinel Lens v2 — 9-Agent Pipeline Metadata
 * Defines canonical metadata, roles, descriptions, and visual badges for each agent.
 */

export interface AgentInfo {
  step: number;
  id: string;
  badge: string;
  title: string;
  role: string;
  description: string;
  color: string;
}

export const AGENT_PIPELINE: AgentInfo[] = [
  {
    step: 1,
    id: 'ingest',
    badge: 'AGENT 01/09',
    title: 'Ingestion & EXIF Sanitizer Agent',
    role: 'Privacy & Ingestion Integrity',
    description: 'Validates frame boundaries, decodes JPEG buffers, and strips EXIF/GPS telemetry for strict privacy.',
    color: '#FF6542',
  },
  {
    step: 2,
    id: 'perceive',
    badge: 'AGENT 02/09',
    title: 'Multimodal Scene Perception Agent',
    role: 'Visual Environmental Understanding',
    description: 'Evaluates room illumination, motion blur sharpness, floor coverage arcs, and camera occlusions.',
    color: '#FF7D5E',
  },
  {
    step: 3,
    id: 'classify',
    badge: 'AGENT 03/09',
    title: 'Hazard Taxonomy Routing Agent',
    role: '15-Category Safety Taxonomy',
    description: 'Evaluates visual cues across 15 codified hazard categories (H01 to H15) against auditable criteria.',
    color: '#F5A524',
  },
  {
    step: 4,
    id: 'person_context',
    badge: 'AGENT 04/09',
    title: 'Demographic Reachability Agent',
    role: 'Vulnerability Profiler',
    description: 'Calculates physical reachability heights and vulnerability weighting for target demographic (Baby, Child, Adult, Elderly).',
    color: '#F5B842',
  },
  {
    step: 5,
    id: 'assess_risk',
    badge: 'AGENT 05/09',
    title: 'Deterministic Risk Prioritization Agent',
    role: 'Auditable Rule Evaluation',
    description: 'Applies codified clearance rules (R-BASE-H03, water-elec matrix, fall heights) without generative hallucinations.',
    color: '#FF6542',
  },
  {
    step: 6,
    id: 'retrieve_guidelines',
    badge: 'AGENT 06/09',
    title: 'Guideline Provenance & Citations Agent',
    role: 'Safety Guideline Matcher',
    description: 'Matches validated safety guidelines, provenance codes, and actionable mitigation steps from vetted databases.',
    color: '#7FA7D6',
  },
  {
    step: 7,
    id: 'verify',
    badge: 'AGENT 07/09',
    title: 'Verification & Guardrail Agent',
    role: 'Rule R1 Fail-Closed Auditor',
    description: 'Audits findings against fail-closed contracts, eliminates hallucinations, and enforces Rule R1 safety guarantees.',
    color: '#FF6542',
  },
  {
    step: 8,
    id: 'report',
    badge: 'AGENT 08/09',
    title: 'Safety Report Synthesis Agent',
    role: 'Multilingual Report Synthesis',
    description: 'Synthesizes formal diagnostic report with verified citations across English, Kannada, and Hindi.',
    color: '#34D399',
  },
  {
    step: 9,
    id: 'notify',
    badge: 'AGENT 09/09',
    title: 'Caregiver Notification & Dispatch Agent',
    role: 'Telegram Alert Coordinator',
    description: 'Evaluates emergency thresholds and coordinates immediate caregiver dispatch notifications with cooldown policy.',
    color: '#FF6542',
  },
];

export function getAgentByNode(nodeId?: string | null): AgentInfo | undefined {
  if (!nodeId) return undefined;
  const normalized = nodeId.toLowerCase();
  return AGENT_PIPELINE.find(
    (a) =>
      a.id === normalized ||
      (a.id === 'person_context' && (normalized === 'person' || normalized === 'person_context')) ||
      (a.id === 'assess_risk' && (normalized === 'risk' || normalized === 'assess_risk')) ||
      (a.id === 'retrieve_guidelines' && (normalized === 'guidelines' || normalized === 'retrieve_guidelines'))
  );
}
