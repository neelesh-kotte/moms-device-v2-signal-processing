#!/usr/bin/env python3
"""Risk-aware, abstention-aware evaluation for MOM acoustic research.

This module audits predictions from an EXISTING model; it does not train a model,
diagnose a condition, or establish clinical safety. It makes the trade-off between
prediction coverage and error visible and reports errors by recording so that
many windows from one recording are not mistaken for many independent people.

CSV input columns (header names are case-insensitive):
  y_true, y_pred, confidence, quality, recording_id

Labels must be 0/1. confidence and quality must be in [0, 1].
Rows below either threshold are abstentions, not silently discarded.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


REQUIRED_COLUMNS = {"y_true", "y_pred", "confidence", "quality", "recording_id"}


def _number(value: str, field: str, row_number: int) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Row {row_number}: {field} must be numeric.") from exc
    if not math.isfinite(result):
        raise ValueError(f"Row {row_number}: {field} must be finite.")
    return result


def load_rows(path: str | Path) -> list[dict[str, Any]]:
    """Read and validate prediction-level audit data from a CSV."""
    with open(path, newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("CSV needs a header row.")
        original = {name.strip().lower(): name for name in reader.fieldnames if name}
        missing = REQUIRED_COLUMNS - set(original)
        if missing:
            raise ValueError("Missing required CSV columns: " + ", ".join(sorted(missing)))

        rows: list[dict[str, Any]] = []
        for row_number, raw in enumerate(reader, start=2):
            truth = _number(raw[original["y_true"]], "y_true", row_number)
            pred = _number(raw[original["y_pred"]], "y_pred", row_number)
            confidence = _number(raw[original["confidence"]], "confidence", row_number)
            quality = _number(raw[original["quality"]], "quality", row_number)
            recording_id = (raw[original["recording_id"]] or "").strip()
            if truth not in (0, 1) or pred not in (0, 1):
                raise ValueError(f"Row {row_number}: y_true and y_pred must be 0 or 1.")
            if not 0 <= confidence <= 1 or not 0 <= quality <= 1:
                raise ValueError(f"Row {row_number}: confidence and quality must be in [0, 1].")
            if not recording_id:
                raise ValueError(f"Row {row_number}: recording_id cannot be blank.")
            rows.append({
                "y_true": int(truth), "y_pred": int(pred),
                "confidence": confidence, "quality": quality,
                "recording_id": recording_id,
            })
    if not rows:
        raise ValueError("CSV contains no prediction rows.")
    return rows


def _confusion(rows: list[dict[str, Any]]) -> dict[str, int | float | None]:
    tp = sum(r["y_true"] == 1 and r["y_pred"] == 1 for r in rows)
    tn = sum(r["y_true"] == 0 and r["y_pred"] == 0 for r in rows)
    fp = sum(r["y_true"] == 0 and r["y_pred"] == 1 for r in rows)
    fn = sum(r["y_true"] == 1 and r["y_pred"] == 0 for r in rows)
    n = len(rows)

    def ratio(num: int, den: int) -> float | None:
        return num / den if den else None

    return {
        "n": n, "tp": tp, "tn": tn, "fp": fp, "fn": fn,
        "sensitivity": ratio(tp, tp + fn),
        "specificity": ratio(tn, tn + fp),
        "precision": ratio(tp, tp + fp),
        "false_negative_rate": ratio(fn, tp + fn),
        "false_positive_rate": ratio(fp, fp + tn),
        "balanced_accuracy": (
            (ratio(tp, tp + fn) + ratio(tn, tn + fp)) / 2
            if (tp + fn) and (tn + fp) else None
        ),
    }


def audit_predictions(
    rows: list[dict[str, Any]],
    confidence_threshold: float = 0.70,
    quality_threshold: float = 0.60,
    false_negative_cost: float = 2.0,
    false_positive_cost: float = 1.0,
) -> dict[str, Any]:
    """Compare ordinary metrics with a selective, quality-gated evaluation.

    Cost weights are analyst-defined research priorities, not clinical risk
    estimates. Always report them and run sensitivity analyses over alternatives.
    """
    for name, value in (
        ("confidence_threshold", confidence_threshold),
        ("quality_threshold", quality_threshold),
    ):
        if not 0 <= value <= 1:
            raise ValueError(f"{name} must be in [0, 1].")
    if false_negative_cost < 0 or false_positive_cost < 0:
        raise ValueError("Error costs must be non-negative.")
    if false_negative_cost == 0 and false_positive_cost == 0:
        raise ValueError("At least one error cost must be positive.")

    eligible = [
        r for r in rows
        if r["confidence"] >= confidence_threshold
        and r["quality"] >= quality_threshold
    ]
    abstained = [r for r in rows if r not in eligible]
    all_metrics = _confusion(rows)
    selected_metrics = _confusion(eligible)
    n = len(rows)
    error_cost = (
        false_negative_cost * selected_metrics["fn"]
        + false_positive_cost * selected_metrics["fp"]
    )
    per_recording: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        per_recording[row["recording_id"]].append(row)

    recording_summary = []
    for recording_id, group in sorted(per_recording.items()):
        kept = [
            r for r in group
            if r["confidence"] >= confidence_threshold
            and r["quality"] >= quality_threshold
        ]
        recording_summary.append({
            "recording_id": recording_id,
            "n_total": len(group),
            "n_accepted": len(kept),
            "coverage": len(kept) / len(group),
            "accepted_metrics": _confusion(kept),
        })

    return {
        "notice": (
            "Research evaluation only. Not a diagnostic, medical device validation, "
            "or estimate of patient harm."
        ),
        "thresholds": {
            "confidence": confidence_threshold,
            "quality": quality_threshold,
        },
        "analyst_defined_error_costs": {
            "false_negative": false_negative_cost,
            "false_positive": false_positive_cost,
            "weighted_errors_on_accepted_rows": error_cost,
            "warning": "Illustrative weights only; not clinical harm probabilities.",
        },
        "overall_without_abstention": all_metrics,
        "selective_evaluation": {
            "n_total": n,
            "n_accepted": len(eligible),
            "n_abstained": len(abstained),
            "coverage": len(eligible) / n,
            "abstention_rate": len(abstained) / n,
            "accepted_metrics": selected_metrics,
        },
        "recording_level_summary": recording_summary,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Audit MOM model predictions with quality/confidence abstention."
    )
    parser.add_argument("csv_path", help="CSV containing the required prediction columns")
    parser.add_argument("--confidence-threshold", type=float, default=0.70)
    parser.add_argument("--quality-threshold", type=float, default=0.60)
    parser.add_argument("--false-negative-cost", type=float, default=2.0)
    parser.add_argument("--false-positive-cost", type=float, default=1.0)
    parser.add_argument("--output", help="Optional path for the JSON report")
    args = parser.parse_args(argv)

    try:
        report = audit_predictions(
            load_rows(args.csv_path),
            confidence_threshold=args.confidence_threshold,
            quality_threshold=args.quality_threshold,
            false_negative_cost=args.false_negative_cost,
            false_positive_cost=args.false_positive_cost,
        )
    except (OSError, ValueError) as exc:
        print(f"Audit failed: {exc}", file=sys.stderr)
        return 2

    rendered = json.dumps(report, indent=2, allow_nan=False)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
