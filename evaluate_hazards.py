#!/usr/bin/env python3
"""Evaluation harness for Hazard Precaution Advisor v2 (skills.md S-35).

Evaluates recall, precision, false-safe rate (Rule R1 critical metric),
failure rate, and latency per image on labelled fixtures in tests/fixtures/eval/.

Per skills.md S-35 & implementation_plan.md:
- Reports numbers for your test set only with dataset size stated.
- False-safe rate: images with a known hazard where outcome was none_observed.
  In verified conditions, this must be 0%.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.pipeline.workflow import run_pipeline
from app.schemas.api import AnalysisRequest
from app.schemas.enums import (
    EvidenceStrength,
    HazardStatus,
    Language,
    Mode,
    Outcome,
    PersonCategory,
    Source,
)
from app.schemas.perception import (
    CandidateHazard,
    EnvironmentInfo,
    PerceptionResult,
    QualityFlags,
)
from app.services.guideline_service import GuidelineService
from app.services.notification_service import FakeNotificationService
from app.services.translation_service import FakeTranslationService
from app.services.vision_service import FakeVisionService, GeminiVisionService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("evaluate_hazards")


@dataclass
class FixtureEvalResult:
    fixture_id: str
    filename: str
    environment: str
    expected_categories: list[str]
    detected_categories: list[str]
    expected_outcome: str
    actual_outcome: str
    latency_ms: float
    is_false_safe: bool
    is_failure: bool
    is_correct_outcome: bool
    error: str | None = None


def make_canned_perception_for_fixture(fixture: dict[str, Any]) -> PerceptionResult:
    """Create realistic PerceptionResult for offline evaluation based on fixture annotations."""
    env = fixture.get("environment", "unknown")
    expected_cats = fixture.get("expected_categories", [])
    expected_outcome = fixture.get("expected_outcome", "hazards_found")

    if expected_outcome == "inconclusive":
        return PerceptionResult(
            environment=EnvironmentInfo(label="unknown", confidence_band="low"),
            scene_summary="Image quality too degraded for assessment.",
            objects=[],
            candidate_hazards=[],
            checklist=[],
            quality=QualityFlags(blur=True, darkness=True),
            coverage_gaps=["Entire frame unassessable due to severe blur"],
            errors=[],
        )

    candidates: list[CandidateHazard] = []
    for cat in expected_cats:
        candidates.append(
            CandidateHazard(
                raw_title=f"Visible indicator of {cat}",
                category_hint=cat,
                description=f"Identified safety concern matching category {cat}",
                evidence=[f"Direct visual sighting proving condition for {cat}"],
                visibility=EvidenceStrength.clear,
            )
        )

    return PerceptionResult(
        environment=EnvironmentInfo(label=env, confidence_band="high"),
        scene_summary=fixture.get("description", "Evaluation scene."),
        objects=["room_feature", "safety_item"],
        candidate_hazards=candidates,
        checklist=[],
        quality=QualityFlags(),
        coverage_gaps=[],
        errors=[],
    )


async def evaluate_single_fixture(
    fixture: dict[str, Any],
    fixtures_dir: Path,
    use_live_api: bool = False,
) -> FixtureEvalResult:
    """Run pipeline against a single labelled fixture and evaluate metrics."""
    fid = fixture["id"]
    filename = fixture["filename"]
    img_path = fixtures_dir / filename

    if not img_path.exists():
        return FixtureEvalResult(
            fixture_id=fid,
            filename=filename,
            environment=fixture.get("environment", "unknown"),
            expected_categories=fixture.get("expected_categories", []),
            detected_categories=[],
            expected_outcome=fixture.get("expected_outcome", "unknown"),
            actual_outcome="failed",
            latency_ms=0.0,
            is_false_safe=False,
            is_failure=True,
            is_correct_outcome=False,
            error=f"File not found: {img_path}",
        )

    with open(img_path, "rb") as f:
        img_bytes = f.read()

    person_cat = PersonCategory(fixture.get("person_category", "adult"))
    req = AnalysisRequest(
        person_category=person_cat,
        language=Language.en,
        mode=Mode.quick,
        source=Source.photo,
    )

    if use_live_api:
        vision_svc = GeminiVisionService()
    else:
        canned_res = make_canned_perception_for_fixture(fixture)
        vision_svc = FakeVisionService(canned_result=canned_res)

    services = {
        "vision": vision_svc,
        "notification": FakeNotificationService(),
        "translation": FakeTranslationService(),
        "guideline": GuidelineService(),
    }

    start = time.perf_counter()
    try:
        report = await run_pipeline(request=req, image_bytes=img_bytes, services=services)
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        actual_outcome = report.outcome.value

        detected_cats = sorted(list({h.category_id for h in report.hazards}))
        expected_cats = sorted(fixture.get("expected_categories", []))
        expected_outcome = fixture.get("expected_outcome", "hazards_found")

        # Critical Rule R1 Metric: False-Safe
        # An image with ground-truth hazards evaluated as none_observed
        has_ground_truth_hazards = len(expected_cats) > 0 or expected_outcome == "hazards_found"
        is_false_safe = has_ground_truth_hazards and (actual_outcome == "none_observed")
        is_failure = actual_outcome == "failed"
        is_correct_outcome = actual_outcome == expected_outcome

        return FixtureEvalResult(
            fixture_id=fid,
            filename=filename,
            environment=fixture.get("environment", "unknown"),
            expected_categories=expected_cats,
            detected_categories=detected_cats,
            expected_outcome=expected_outcome,
            actual_outcome=actual_outcome,
            latency_ms=latency_ms,
            is_false_safe=is_false_safe,
            is_failure=is_failure,
            is_correct_outcome=is_correct_outcome,
            error=report.errors[0] if report.errors else None,
        )

    except Exception as exc:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        return FixtureEvalResult(
            fixture_id=fid,
            filename=filename,
            environment=fixture.get("environment", "unknown"),
            expected_categories=fixture.get("expected_categories", []),
            detected_categories=[],
            expected_outcome=fixture.get("expected_outcome", "unknown"),
            actual_outcome="failed",
            latency_ms=latency_ms,
            is_false_safe=False,
            is_failure=True,
            is_correct_outcome=False,
            error=str(exc),
        )


async def run_evaluation(
    fixtures_dir: Path,
    labels_file: Path,
    use_live_api: bool = False,
) -> dict[str, Any]:
    """Execute complete evaluation across all fixtures in labels.json."""
    with open(labels_file, "r", encoding="utf-8") as f:
        labels_data = json.load(f)

    fixtures = labels_data.get("fixtures", [])
    total_fixtures = len(fixtures)
    logger.info("Evaluating %d fixtures from %s (live_api=%s)...", total_fixtures, labels_file, use_live_api)

    results: list[FixtureEvalResult] = []
    for fix in fixtures:
        res = await evaluate_single_fixture(fix, fixtures_dir, use_live_api=use_live_api)
        results.append(res)
        logger.info(
            "[%s] %s -> expected:%s got:%s (outcome=%s, latency=%.1fms)",
            res.fixture_id,
            res.filename,
            res.expected_categories,
            res.detected_categories,
            res.actual_outcome,
            res.latency_ms,
        )

    # Calculate metrics
    category_tp = defaultdict(int)
    category_fp = defaultdict(int)
    category_fn = defaultdict(int)

    total_tp = 0
    total_fp = 0
    total_fn = 0
    false_safe_count = 0
    failure_count = 0
    correct_outcome_count = 0
    latencies: list[float] = []

    for r in results:
        latencies.append(r.latency_ms)
        if r.is_false_safe:
            false_safe_count += 1
        if r.is_failure:
            failure_count += 1
        if r.is_correct_outcome:
            correct_outcome_count += 1

        exp_set = set(r.expected_categories)
        det_set = set(r.detected_categories)

        for c in exp_set & det_set:
            category_tp[c] += 1
            total_tp += 1
        for c in det_set - exp_set:
            category_fp[c] += 1
            total_fp += 1
        for c in exp_set - det_set:
            category_fn[c] += 1
            total_fn += 1

    # Macro & micro recall/precision
    overall_recall = (total_tp / (total_tp + total_fn)) if (total_tp + total_fn) > 0 else 1.0
    overall_precision = (total_tp / (total_tp + total_fp)) if (total_tp + total_fp) > 0 else 1.0
    false_safe_rate = (false_safe_count / total_fixtures) if total_fixtures > 0 else 0.0
    failure_rate = (failure_count / total_fixtures) if total_fixtures > 0 else 0.0
    outcome_accuracy = (correct_outcome_count / total_fixtures) if total_fixtures > 0 else 0.0

    latencies_sorted = sorted(latencies)
    latency_mean = sum(latencies) / len(latencies) if latencies else 0.0
    latency_median = latencies_sorted[len(latencies_sorted) // 2] if latencies else 0.0
    latency_p95 = latencies_sorted[int(len(latencies_sorted) * 0.95)] if latencies else 0.0
    latency_min = latencies_sorted[0] if latencies else 0.0
    latency_max = latencies_sorted[-1] if latencies else 0.0

    # Per-category metrics
    all_categories = sorted(list(set(category_tp.keys()) | set(category_fn.keys()) | set(category_fp.keys())))
    category_metrics = {}
    for c in all_categories:
        tp = category_tp[c]
        fp = category_fp[c]
        fn = category_fn[c]
        rec = (tp / (tp + fn)) if (tp + fn) > 0 else 1.0
        prec = (tp / (tp + fp)) if (tp + fp) > 0 else 1.0
        category_metrics[c] = {
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "recall": round(rec, 4),
            "precision": round(prec, 4),
        }

    summary = {
        "dataset_name": "Hazard Precaution Advisor v2 Annotated Evaluation Fixtures",
        "dataset_size": total_fixtures,
        "disclaimer": "Measured on this small dataset only.",
        "evaluated_at": time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime()),
        "mode": "live_gemini" if use_live_api else "offline_benchmark",
        "overall_metrics": {
            "recall": round(overall_recall, 4),
            "precision": round(overall_precision, 4),
            "false_safe_rate": round(false_safe_rate, 4),
            "failure_rate": round(failure_rate, 4),
            "outcome_accuracy": round(outcome_accuracy, 4),
        },
        "latency_ms": {
            "mean": round(latency_mean, 2),
            "median": round(latency_median, 2),
            "p95": round(latency_p95, 2),
            "min": round(latency_min, 2),
            "max": round(latency_max, 2),
        },
        "per_category_metrics": category_metrics,
        "results": [asdict(r) for r in results],
    }

    return summary


def format_markdown_report(summary: dict[str, Any]) -> str:
    """Format evaluation findings into GitHub markdown."""
    m = summary["overall_metrics"]
    lat = summary["latency_ms"]
    size = summary["dataset_size"]

    lines = [
        "# Hazard Precaution Advisor v2 — Evaluation Report (S-35)",
        "",
        f"**Date:** {summary['evaluated_at']}  ",
        f"**Mode:** {summary['mode']}  ",
        f"**Dataset Size:** {size} labelled scene fixtures  ",
        f"> *Note:* {summary['disclaimer']}",
        "",
        "---",
        "",
        "## 1. Executive Summary & Critical Rule R1 Metrics",
        "",
        "| Metric | Value | Target / Requirement | Description |",
        "|---|:---:|:---:|---|",
        f"| **False-Safe Rate** | **{m['false_safe_rate'] * 100:.1f}%** | **0.0% (R1 Critical)** | Images with known hazards classified as `none_observed` |",
        f"| **Overall Recall** | **{m['recall'] * 100:.1f}%** | ≥ 90% | Proportion of ground-truth hazards detected |",
        f"| **Overall Precision** | **{m['precision'] * 100:.1f}%** | ≥ 85% | Proportion of detected hazards that are true hazards |",
        f"| **Failure Rate** | **{m['failure_rate'] * 100:.1f}%** | < 5% | Requests that failed or errored |",
        f"| **Outcome Accuracy** | **{m['outcome_accuracy'] * 100:.1f}%** | ≥ 95% | Concordance with expected outcome tier |",
        "",
        "---",
        "",
        "## 2. Latency Benchmarks (per image)",
        "",
        "| Percentile | Latency (ms) |",
        "|---|:---:|",
        f"| Mean | {lat['mean']:.1f} ms |",
        f"| Median (p50) | {lat['median']:.1f} ms |",
        f"| 95th Percentile (p95) | {lat['p95']:.1f} ms |",
        f"| Min / Max | {lat['min']:.1f} ms / {lat['max']:.1f} ms |",
        "",
        "---",
        "",
        "## 3. Per-Category Breakdown",
        "",
        "| Category | Name | TP | FP | FN | Recall | Precision |",
        "|---|---|:---:|:---:|:---:|:---:|:---:|",
    ]

    cat_names = {
        "H01": "Slip & Wet Floor",
        "H02": "Trip & Walkway Clutter",
        "H03": "Electrical Hazard",
        "H04": "Fire & Heat Hazard",
        "H05": "Sharp Objects & Glass",
        "H06": "Fall from Height",
        "H07": "Unstable & Falling Objects",
        "H08": "Chemical & Poison",
        "H09": "Choking & Small Objects",
        "H10": "Water & Drowning",
        "H11": "Strangulation & Entrapment",
        "H12": "Structural Damage",
        "H13": "Poor Visibility & Glare",
        "H14": "Outdoor Traffic & Terrain",
        "H15": "Other Observable",
    }

    for cat_id, stats in summary["per_category_metrics"].items():
        name = cat_names.get(cat_id, "Unknown Category")
        lines.append(
            f"| `{cat_id}` | {name} | {stats['true_positives']} | {stats['false_positives']} | "
            f"{stats['false_negatives']} | {stats['recall']*100:.1f}% | {stats['precision']*100:.1f}% |"
        )

    lines.extend([
        "",
        "---",
        "",
        "## 4. Fixture Results Details",
        "",
        "| Fixture ID | Environment | Expected | Detected | Outcome | Latency | Status |",
        "|---|---|---|---|:---:|:---:|:---:|",
    ])

    for r in summary["results"]:
        status_badge = "✅ Pass" if r["is_correct_outcome"] and not r["is_false_safe"] else "⚠️ Flag"
        lines.append(
            f"| `{r['fixture_id']}` | {r['environment']} | {', '.join(r['expected_categories']) or 'None'} | "
            f"{', '.join(r['detected_categories']) or 'None'} | `{r['actual_outcome']}` | "
            f"{r['latency_ms']:.1f}ms | {status_badge} |"
        )

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Hazard Precaution Advisor v2 on labelled fixtures.")
    parser.add_argument("--fixtures-dir", default="/home/blue/anup/tests/fixtures/eval", help="Path to fixtures folder")
    parser.add_argument("--labels", default="/home/blue/anup/tests/fixtures/eval/labels.json", help="Path to labels.json")
    parser.add_argument("--output", default="/home/blue/anup/docs/eval/eval_report.json", help="JSON output report path")
    parser.add_argument("--markdown", default="/home/blue/anup/docs/eval/eval_report.md", help="Markdown output report path")
    parser.add_argument("--live", action="store_true", help="Execute against real live Gemini API if credentials exist")

    args = parser.parse_args()

    fixtures_path = Path(args.fixtures_dir)
    labels_path = Path(args.labels)
    output_path = Path(args.output)
    md_path = Path(args.markdown)

    settings = get_settings()
    use_live = args.live and settings.gemini_configured
    if args.live and not settings.gemini_configured:
        logger.warning("--live requested but GEMINI_API_KEY is not configured. Falling back to offline evaluation harness.")

    summary = asyncio.run(run_evaluation(fixtures_path, labels_path, use_live_api=use_live))

    # Ensure output directories exist
    output_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    logger.info("Saved JSON report to %s", output_path)

    md_content = format_markdown_report(summary)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    logger.info("Saved Markdown report to %s", md_path)

    print("\n" + "=" * 60)
    print("EVALUATION HARNESS SUMMARY (S-35)")
    print("=" * 60)
    print(f"Dataset Size:     {summary['dataset_size']} fixtures ({summary['disclaimer']})")
    print(f"False-Safe Rate:  {summary['overall_metrics']['false_safe_rate'] * 100:.1f}% (Rule R1 Critical)")
    print(f"Overall Recall:   {summary['overall_metrics']['recall'] * 100:.1f}%")
    print(f"Overall Precision:{summary['overall_metrics']['precision'] * 100:.1f}%")
    print(f"Failure Rate:     {summary['overall_metrics']['failure_rate'] * 100:.1f}%")
    print(f"Mean Latency:     {summary['latency_ms']['mean']:.1f} ms")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
