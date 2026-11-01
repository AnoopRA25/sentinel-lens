# Hazard Precaution Advisor v2 — Evaluation Report (S-35)

**Date:** 2026-11-01 14:52:05Z  
**Mode:** offline_benchmark  
**Dataset Size:** 17 labelled scene fixtures  
> *Note:* Measured on this small dataset only.

---

## 1. Executive Summary & Critical Rule R1 Metrics

| Metric | Value | Target / Requirement | Description |
|---|:---:|:---:|---|
| **False-Safe Rate** | **0.0%** | **0.0% (R1 Critical)** | Images with known hazards classified as `none_observed` |
| **Overall Recall** | **100.0%** | ≥ 90% | Proportion of ground-truth hazards detected |
| **Overall Precision** | **100.0%** | ≥ 85% | Proportion of detected hazards that are true hazards |
| **Failure Rate** | **0.0%** | < 5% | Requests that failed or errored |
| **Outcome Accuracy** | **100.0%** | ≥ 95% | Concordance with expected outcome tier |

---

## 2. Latency Benchmarks (per image)

| Percentile | Latency (ms) |
|---|:---:|
| Mean | 28.3 ms |
| Median (p50) | 28.0 ms |
| 95th Percentile (p95) | 39.8 ms |
| Min / Max | 24.7 ms / 39.8 ms |

---

## 3. Per-Category Breakdown

| Category | Name | TP | FP | FN | Recall | Precision |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `H01` | Slip & Wet Floor | 2 | 0 | 0 | 100.0% | 100.0% |
| `H02` | Trip & Walkway Clutter | 1 | 0 | 0 | 100.0% | 100.0% |
| `H03` | Electrical Hazard | 1 | 0 | 0 | 100.0% | 100.0% |
| `H04` | Fire & Heat Hazard | 1 | 0 | 0 | 100.0% | 100.0% |
| `H06` | Fall from Height | 2 | 0 | 0 | 100.0% | 100.0% |
| `H07` | Unstable & Falling Objects | 1 | 0 | 0 | 100.0% | 100.0% |
| `H09` | Choking & Small Objects | 1 | 0 | 0 | 100.0% | 100.0% |
| `H11` | Strangulation & Entrapment | 1 | 0 | 0 | 100.0% | 100.0% |
| `H13` | Poor Visibility & Glare | 1 | 0 | 0 | 100.0% | 100.0% |
| `H14` | Outdoor Traffic & Terrain | 1 | 0 | 0 | 100.0% | 100.0% |

---

## 4. Fixture Results Details

| Fixture ID | Environment | Expected | Detected | Outcome | Latency | Status |
|---|---|---|---|:---:|:---:|:---:|
| `kitchen_01_spill` | kitchen | H01 | H01 | `hazards_found` | 39.8ms | ✅ Pass |
| `kitchen_02_power_strip` | kitchen | H03 | H03 | `hazards_found` | 29.8ms | ✅ Pass |
| `kitchen_03_flame_towel` | kitchen | H04 | H04 | `hazards_found` | 27.0ms | ✅ Pass |
| `kitchen_04_clean` | kitchen | None | None | `none_observed` | 26.5ms | ✅ Pass |
| `bathroom_01_wet_floor` | bathroom | H01 | H01 | `hazards_found` | 26.6ms | ✅ Pass |
| `bathroom_02_clean` | bathroom | None | None | `none_observed` | 27.2ms | ✅ Pass |
| `stairs_01_clutter_cables` | stairs | H02, H06 | H02, H06 | `hazards_found` | 28.3ms | ✅ Pass |
| `stairs_02_dark` | stairs | H06, H13 | H06, H13 | `hazards_found` | 28.2ms | ✅ Pass |
| `stairs_03_clear` | stairs | None | None | `none_observed` | 29.2ms | ✅ Pass |
| `bedroom_01_cord_crib` | bedroom | H11 | H11 | `hazards_found` | 27.0ms | ✅ Pass |
| `bedroom_02_tall_bookcase` | bedroom | H07 | H07 | `hazards_found` | 28.2ms | ✅ Pass |
| `bedroom_03_clean` | bedroom | None | None | `none_observed` | 26.8ms | ✅ Pass |
| `baby_01_coins_magnets` | baby_corner | H09 | H09 | `hazards_found` | 28.0ms | ✅ Pass |
| `baby_02_clean` | baby_corner | None | None | `none_observed` | 27.9ms | ✅ Pass |
| `outdoor_01_pothole_traffic` | outdoor | H14 | H14 | `hazards_found` | 28.3ms | ✅ Pass |
| `outdoor_02_clean` | outdoor | None | None | `none_observed` | 28.1ms | ✅ Pass |
| `corrupt_blurry_01` | unknown | None | None | `inconclusive` | 24.7ms | ✅ Pass |