"""Workflow graph topology endpoints for the Agent Workflow UI (skills.md S-39).

Extracts and returns the compiled LangGraph workflow nodes, edges, and Mermaid diagram
directly from the active pipeline definition.
"""

from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, HTTPException, status

from app.pipeline.workflow import get_workflow_graph

logger = logging.getLogger(__name__)

router = APIRouter(tags=["graph"])

# Canonical metadata mapping for workflow visualizer
AGENT_METADATA = {
    "ingest": {"label": "Image Ingest", "type": "plumbing", "description": "Validates format, normalizes orientation, strips EXIF"},
    "perceive": {"label": "Scene Perception", "type": "agent", "agent_id": "agent_1", "description": "Agent 1: Open observation and checklist sweep"},
    "classify": {"label": "Hazard Classification", "type": "agent", "agent_id": "agent_2", "description": "Agent 2: Taxonomy mapping and deduplication"},
    "person_context": {"label": "Person Context", "type": "agent", "agent_id": "agent_3", "description": "Agent 3: Evaluates reach, mobility, and recognition vulnerabilities"},
    "assess_risk": {"label": "Risk Assessment", "type": "agent", "agent_id": "agent_4", "description": "Agent 4: Evaluates auditable ordinal risk rules"},
    "retrieve_guidelines": {"label": "Safety Knowledge", "type": "agent", "agent_id": "agent_5", "description": "Agent 5: Matches hazards to verified precautions"},
    "verify": {"label": "Verification Critic", "type": "agent", "agent_id": "agent_6", "description": "Agent 6: Enforces consistency checks V1-V8"},
    "report": {"label": "Safety Report", "type": "agent", "agent_id": "agent_7", "description": "Agent 7: Synthesizes final verified user report"},
    "notify": {"label": "Caregiver Notification", "type": "agent", "agent_id": "agent_8", "description": "Agent 8: Sends alerts based on policy and cooldown"},
    "finalize": {"label": "Finalize", "type": "plumbing", "description": "Persists state and produces output"},
    "finalize_failed": {"label": "Finalize Failed", "type": "plumbing", "description": "Produces typed failure report (Rule R1)"},
    "finalize_inconclusive": {"label": "Finalize Inconclusive", "type": "plumbing", "description": "Produces inconclusive report with retake guidance"},
}


@router.get(
    "/api/graph",
    response_model=dict[str, Any],
    summary="Get compiled LangGraph agent workflow definition",
)
@router.get(
    "/graph",
    response_model=dict[str, Any],
    summary="Get compiled LangGraph agent workflow definition (alias)",
)
async def get_graph_definition() -> dict[str, Any]:
    """Return nodes, edges, and Mermaid flowchart of the compiled LangGraph workflow."""
    try:
        compiled_workflow = get_workflow_graph()
        inner_graph = compiled_workflow.get_graph()

        nodes: list[dict[str, Any]] = []
        for n in inner_graph.nodes.values():
            meta = AGENT_METADATA.get(n.id, {})
            nodes.append({
                "id": n.id,
                "name": n.name or n.id,
                "label": meta.get("label", n.name or n.id),
                "type": meta.get("type", "plumbing" if n.id.startswith("__") else "node"),
                "agent_id": meta.get("agent_id"),
                "description": meta.get("description", ""),
            })

        edges: list[dict[str, Any]] = []
        for e in inner_graph.edges:
            edges.append({
                "source": e.source,
                "target": e.target,
                "conditional": bool(e.conditional),
            })

        mermaid_diagram = inner_graph.draw_mermaid()

        return {
            "version": "2.0.0",
            "nodes": nodes,
            "edges": edges,
            "mermaid": mermaid_diagram,
        }
    except Exception as exc:
        logger.exception("Failed to extract workflow graph: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "graph_extraction_error", "message": f"Failed to inspect workflow graph: {str(exc)}"},
        )
