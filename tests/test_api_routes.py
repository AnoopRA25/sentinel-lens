"""Comprehensive tests for Hazard Precaution Advisor v2 FastAPI routes and server entry point.

Tests cover:
- Health and status endpoints (Rule R9: zero secret leaks)
- Synchronous analysis routes /analyze and /api/analyze (Rule R1: no false safe assertions)
- Asynchronous job execution and SSE event streaming (skills.md S-28, Rule R14)
- Multi-frame session management, single in-flight enforcement (429), and session aggregation (skills.md S-23)
- Safety guidelines and taxonomy read-only database (skills.md S-20)
- Compiled LangGraph workflow topology endpoint /api/graph (skills.md S-39)
- Authentication middleware and access token validation (skills.md S-31)
- Typed error body envelopes {error: {code, message}} on all failures
"""

import io
import json
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.api import app
from app.core.config import get_settings
from app.routes.sessions import _sessions_store


@pytest.fixture
def client() -> TestClient:
    """FastAPI TestClient fixture."""
    return TestClient(app)


@pytest.fixture
def valid_jpeg_bytes() -> bytes:
    """Generate a clean 100x100 JPEG payload."""
    buf = io.BytesIO()
    img = Image.new("RGB", (100, 100), color=(100, 150, 200))
    img.save(buf, format="JPEG")
    return buf.getvalue()


class TestHealthAndStatusRoutes:
    """Tests for GET /, GET /health, and GET /api/status."""

    def test_health_check_endpoints(self, client: TestClient):
        for path in ("/", "/health"):
            res = client.get(path)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "ok"
            assert data["version"] == "2.0.0"

    def test_api_status_non_secret_booleans(self, client: TestClient):
        res = client.get("/api/status")
        assert res.status_code == 200
        data = res.json()

        # Rule R9: Secrets must never be present
        forbidden_keys = [
            "GEMINI_API_KEY",
            "TELEGRAM_BOT_TOKEN",
            "TELEGRAM_CHAT_ID",
            "ACCESS_TOKEN",
            "gemini_api_key",
            "telegram_bot_token",
            "telegram_chat_id",
            "access_token",
        ]
        for key in forbidden_keys:
            assert key not in data, f"Secret key '{key}' leaked in /api/status!"

        # Required public config fields
        assert "gemini_configured" in data
        assert isinstance(data["gemini_configured"], bool)
        assert "telegram_configured" in data
        assert isinstance(data["telegram_configured"], bool)
        assert "pipeline_version" in data
        assert "max_upload_mb" in data
        assert "allowed_origins" in data
        assert isinstance(data["allowed_origins"], list)


class TestAnalyzeRoutes:
    """Tests for POST /analyze and POST /api/analyze."""

    def test_analyze_success(self, client: TestClient, valid_jpeg_bytes: bytes):
        for endpoint in ("/analyze", "/api/analyze"):
            res = client.post(
                endpoint,
                files={"image": ("scene.jpg", valid_jpeg_bytes, "image/jpeg")},
                data={
                    "person_category": "child",
                    "language": "en",
                    "mode": "quick",
                    "source": "photo",
                },
            )
            assert res.status_code == 200, res.text
            data = res.json()
            assert "id" in data
            assert data["outcome"] in ("hazards_found", "none_observed", "inconclusive", "failed")
            assert "scene" in data
            assert "overall_risk" in data
            assert "verification" in data

            # Rule R1 Check: Never claims 'safe', 'no danger', 'all clear'
            headline = data.get("headline", "")
            for forbidden in ("safe", "no danger", "all clear"):
                assert forbidden not in headline.lower()

    def test_analyze_invalid_person_category(self, client: TestClient, valid_jpeg_bytes: bytes):
        res = client.post(
            "/api/analyze",
            files={"image": ("scene.jpg", valid_jpeg_bytes, "image/jpeg")},
            data={"person_category": "unknown_human"},
        )
        assert res.status_code == 400
        data = res.json()
        assert "error" in data
        assert data["error"]["code"] == "invalid_parameters"

    def test_analyze_unsupported_media_type(self, client: TestClient):
        res = client.post(
            "/api/analyze",
            files={"image": ("file.txt", b"not an image", "text/plain")},
            data={"person_category": "child"},
        )
        assert res.status_code == 415
        data = res.json()
        assert "error" in data
        assert data["error"]["code"] == "unsupported_media_type"

    def test_analyze_empty_file(self, client: TestClient):
        res = client.post(
            "/api/analyze",
            files={"image": ("empty.jpg", b"", "image/jpeg")},
            data={"person_category": "child"},
        )
        assert res.status_code == 400
        data = res.json()
        assert "error" in data
        assert data["error"]["code"] == "empty_file"


class TestJobsRoutes:
    """Tests for POST /api/jobs, GET /api/jobs/{id}, and SSE events."""

    def test_job_lifecycle(self, client: TestClient, valid_jpeg_bytes: bytes):
        # 1. Create job
        res = client.post(
            "/api/jobs",
            files={"image": ("scan.jpg", valid_jpeg_bytes, "image/jpeg")},
            data={"person_category": "child", "mode": "quick"},
        )
        assert res.status_code == 202, res.text
        job_data = res.json()
        assert "job_id" in job_data
        job_id = job_data["job_id"]
        assert job_data["status"] == "pending"

        # 2. Poll job status
        status_res = client.get(f"/api/jobs/{job_id}")
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["job_id"] == job_id
        assert status_data["status"] in ("pending", "processing", "completed")

    def test_job_not_found(self, client: TestClient):
        res = client.get("/api/jobs/job_does_not_exist_9999")
        assert res.status_code == 404
        data = res.json()
        assert "error" in data
        assert data["error"]["code"] == "job_not_found"

    def test_job_events_not_found(self, client: TestClient):
        res = client.get("/api/jobs/job_does_not_exist_9999/events")
        assert res.status_code == 404
        data = res.json()
        assert "error" in data
        assert data["error"]["code"] == "job_not_found"


class TestSessionsRoutes:
    """Tests for multi-frame sessions, single in-flight 429 guard, and summary."""

    def test_create_session(self, client: TestClient):
        res = client.post("/api/sessions", json={"mode": "live", "person_category": "child"})
        assert res.status_code == 201
        data = res.json()
        assert "session_id" in data
        assert data["mode"] == "live"
        assert data["status"] == "active"

    def test_session_frame_ingest_and_summary(self, client: TestClient, valid_jpeg_bytes: bytes):
        # 1. Create session
        sess_res = client.post("/api/sessions", json={"mode": "room_sweep"})
        session_id = sess_res.json()["session_id"]

        # 2. Ingest first frame
        frame_res = client.post(
            f"/api/sessions/{session_id}/frames",
            files={"image": ("f1.jpg", valid_jpeg_bytes, "image/jpeg")},
            data={"frame_ts": 0.5, "view_index": 1},
        )
        assert frame_res.status_code == 200, frame_res.text
        frame_data = frame_res.json()
        assert frame_data["view_index"] == 1
        assert "frame_result" in frame_data
        assert "session_summary" in frame_data

        # 3. Fetch session summary
        summary_res = client.get(f"/api/sessions/{session_id}/summary")
        assert summary_res.status_code == 200
        summary = summary_res.json()
        assert summary["session_id"] == session_id
        assert summary["views_analyzed"] == 1
        # Rule R11 Check: Periodic sampling disclaimer present
        assert "Periodic frame sampling" in summary["limits_disclaimer"]

    def test_session_busy_429_guard(self, client: TestClient, valid_jpeg_bytes: bytes):
        # Create session
        sess_res = client.post("/api/sessions", json={"mode": "live"})
        session_id = sess_res.json()["session_id"]

        # Simulate active in-flight frame
        _sessions_store[session_id].in_flight = True

        # Next overlapping frame must be rejected with 429
        busy_res = client.post(
            f"/api/sessions/{session_id}/frames",
            files={"image": ("f2.jpg", valid_jpeg_bytes, "image/jpeg")},
        )
        assert busy_res.status_code == 429
        data = busy_res.json()
        assert "error" in data
        assert data["error"]["code"] == "session_busy"

        # Reset flag
        _sessions_store[session_id].in_flight = False

    def test_session_not_found(self, client: TestClient):
        res = client.get("/api/sessions/sess_nonexistent_xyz/summary")
        assert res.status_code == 404
        data = res.json()
        assert "error" in data
        assert data["error"]["code"] == "session_not_found"


class TestGuidelinesAndGraphRoutes:
    """Tests for GET /api/guidelines and GET /api/graph."""

    def test_get_guidelines(self, client: TestClient):
        for path in ("/api/guidelines", "/guidelines"):
            res = client.get(path)
            assert res.status_code == 200
            data = res.json()
            assert "taxonomy" in data
            assert len(data["taxonomy"]) == 15
            assert "guidelines" in data
            assert data["version"] == "2.0.0"

    def test_get_graph(self, client: TestClient):
        for path in ("/api/graph", "/graph"):
            res = client.get(path)
            assert res.status_code == 200
            data = res.json()
            assert "nodes" in data
            assert "edges" in data
            assert "mermaid" in data
            # Check key nodes exist
            node_ids = {n["id"] for n in data["nodes"]}
            for expected in ("ingest", "perceive", "classify", "verify", "report", "notify"):
                assert expected in node_ids


class TestAccessTokenMiddleware:
    """Tests for ACCESS_TOKEN authentication middleware (skills.md S-31)."""

    def test_auth_enforcement_when_enabled(self, client: TestClient, valid_jpeg_bytes: bytes, monkeypatch):
        settings = get_settings()
        monkeypatch.setattr(settings, "ACCESS_TOKEN", "secret-test-token")

        # Public paths remain accessible without token
        for public_path in ("/", "/health", "/api/status"):
            res = client.get(public_path)
            assert res.status_code == 200

        # Protected API path rejects missing token with 401
        res = client.get("/api/guidelines")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "unauthorized"

        # Protected API path rejects invalid token with 401
        res = client.get("/api/guidelines", headers={"Authorization": "Bearer wrong-token"})
        assert res.status_code == 401

        # Protected API path succeeds with valid Authorization Bearer
        res = client.get("/api/guidelines", headers={"Authorization": "Bearer secret-test-token"})
        assert res.status_code == 200

        # Protected API path succeeds with valid X-Access-Token header
        res = client.get("/api/guidelines", headers={"X-Access-Token": "secret-test-token"})
        assert res.status_code == 200
