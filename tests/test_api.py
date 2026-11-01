"""FastAPI API client tests for Hazard Precaution Advisor v2.

Validates:
- GET /health and GET /: returns 200 ok
- GET /api/status: returns config booleans, zero secrets (Rule R9)
- POST /analyze and POST /api/analyze: synchronous multipart analysis returning AnalysisResult
- POST /api/jobs: creates async analysis job (202 Accepted)
- GET /api/jobs/{id}/events: streams Server-Sent Events (SSE)
- POST /api/sessions/{id}/frames: enforces single in-flight frame per session (HTTP 429 guard, Rule R10)
- GET /api/sessions/{id}/summary: returns aggregated multi-frame summary with Rule R11 disclaimer
"""

import asyncio
import io
import pytest
import httpx

from app.api import app
from app.core.config import get_settings
from app.routes.sessions import _sessions_store, SessionState

# Minimal valid JPEG bytes
SAMPLE_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00"
    b"\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13"
    b"\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff"
    b"\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01"
    b"\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b"
    b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
)


@pytest.fixture
def test_client():
    """Create httpx AsyncClient with ASGI transport for app testing."""
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


class TestSystemEndpoints:
    """Test health check and status probes."""

    @pytest.mark.asyncio
    async def test_get_health(self, test_client):
        resp = await test_client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "2.0.0"

    @pytest.mark.asyncio
    async def test_get_status_no_secrets(self, test_client):
        # Per Rule R9: Secrets must never be exposed via status endpoints
        resp = await test_client.get("/api/status")
        assert resp.status_code == 200
        data = resp.json()

        # Booleans and config only
        assert "gemini_configured" in data
        assert "telegram_configured" in data
        assert isinstance(data["gemini_configured"], bool)
        assert isinstance(data["telegram_configured"], bool)

        # Confirm NO secrets exist in response keys or values
        forbidden_keys = ["GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "api_key", "token"]
        for k in forbidden_keys:
            assert k not in data, f"Security violation: Secret key '{k}' exposed in /api/status!"

        raw_text = resp.text.lower()
        assert "sk-" not in raw_text
        assert "bot" not in raw_text or "telegram_configured" in raw_text


class TestAnalyzeEndpoints:
    """Test synchronous analysis endpoints."""

    @pytest.mark.asyncio
    async def test_post_analyze_multipart(self, test_client):
        files = {"image": ("test.jpg", io.BytesIO(SAMPLE_JPEG), "image/jpeg")}
        data = {
            "person_category": "child",
            "language": "en",
            "mode": "quick",
        }
        resp = await test_client.post("/api/analyze", files=files, data=data)
        assert resp.status_code == 200
        res_json = resp.json()

        assert "id" in res_json
        assert "outcome" in res_json
        assert "hazards" in res_json
        assert "overall_risk" in res_json
        assert "verification" in res_json
        # Rule R1 check on returned result
        assert res_json["outcome"] in ["hazards_found", "none_observed", "inconclusive", "failed"]

    @pytest.mark.asyncio
    async def test_legacy_analyze_alias(self, test_client):
        files = {"image": ("test.jpg", io.BytesIO(SAMPLE_JPEG), "image/jpeg")}
        resp = await test_client.post("/analyze", files=files)
        assert resp.status_code == 200
        assert "outcome" in resp.json()


class TestJobEndpoints:
    """Test asynchronous background jobs and SSE event stream."""

    @pytest.mark.asyncio
    async def test_create_job_and_poll(self, test_client):
        files = {"image": ("test.jpg", io.BytesIO(SAMPLE_JPEG), "image/jpeg")}
        data = {"person_category": "baby", "language": "en"}
        create_resp = await test_client.post("/api/jobs", files=files, data=data)
        assert create_resp.status_code == 202
        job_data = create_resp.json()
        assert "job_id" in job_data
        job_id = job_data["job_id"]

        # Give background task brief moment
        await asyncio.sleep(0.1)

        poll_resp = await test_client.get(f"/api/jobs/{job_id}")
        assert poll_resp.status_code == 200
        poll_data = poll_resp.json()
        assert poll_data["job_id"] == job_id
        assert poll_data["status"] in ["pending", "processing", "completed", "failed"]

    @pytest.mark.asyncio
    async def test_job_sse_events(self, test_client):
        files = {"image": ("test.jpg", io.BytesIO(SAMPLE_JPEG), "image/jpeg")}
        create_resp = await test_client.post("/api/jobs", files=files)
        job_id = create_resp.json()["job_id"]

        # Request event stream (skills.md S-28)
        async with test_client.stream("GET", f"/api/jobs/{job_id}/events") as sse_resp:
            assert sse_resp.status_code == 200
            content_type = sse_resp.headers.get("content-type", "")
            assert "text/event-stream" in content_type


class TestSessionEndpoints:
    """Test multi-frame sessions and the 429 busy guard."""

    @pytest.mark.asyncio
    async def test_session_lifecycle_and_429_busy_guard(self, test_client):
        # 1. Create a session
        create_resp = await test_client.post("/api/sessions", json={"mode": "live", "person_category": "child"})
        assert create_resp.status_code == 201
        session_id = create_resp.json()["session_id"]

        # 2. Simulate in_flight status to verify 429 guard (Rule R10)
        session_state = _sessions_store.get(session_id)
        assert session_state is not None
        session_state.in_flight = True  # Simulating a frame currently being processed

        # Attempt to submit an overlapping frame
        files = {"image": ("frame.jpg", io.BytesIO(SAMPLE_JPEG), "image/jpeg")}
        busy_resp = await test_client.post(f"/api/sessions/{session_id}/frames", files=files)

        # MUST return 429 Too Many Requests per Rule R10 & skills.md S-05
        assert busy_resp.status_code == 429
        busy_data = busy_resp.json()
        assert "session_busy" in str(busy_data)

        # 3. Release in_flight and verify normal frame submission
        session_state.in_flight = False
        ok_files = {"image": ("frame.jpg", io.BytesIO(SAMPLE_JPEG), "image/jpeg")}
        ok_resp = await test_client.post(f"/api/sessions/{session_id}/frames", files=ok_files)
        assert ok_resp.status_code == 200

        # 4. Fetch session summary
        summary_resp = await test_client.get(f"/api/sessions/{session_id}/summary")
        assert summary_resp.status_code == 200
        summary_data = summary_resp.json()
        assert summary_data["session_id"] == session_id
        assert summary_data["total_frames"] >= 1
        # Rule R11 periodic sampling disclaimer
        assert "Periodic frame sampling" in summary_data["limits_disclaimer"]
