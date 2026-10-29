#!/usr/bin/env python3
"""Counterfactual nuisance audit for existing MOM acoustic-model predictions.

Input is a CSV exported by running the SAME frozen model on matched original and
nuisance-perturbed recordings. This script does not generate audio, train a model,
or establish clinical validity.

Required columns:
  sample_id, condition, y_true, y_pred, recording_id
Optional column:
  confidence (numeric in [0, 1])

Use condition='clean' for the original. Other conditions may include gain,
background_noise, movement_artifact, contact_shift, or band_filter, but names
must accurately describe the transformations actually performed. Only compare
paired rows whose labels are legitimately preserved by the transformation.
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

REQUIRED = {"sample_id", "condition", "y_true", "y_pred", "recording_id"}


def _num(value: str, name: str, line: int) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Line {line}: {name} must be numeric.") from exc
    if not math.isfinite(number):
        raise ValueError(f"Line {line}: {name} must be finite.")
    return number


def load_predictions(path: str | Path) -> list[dict[str, Any]]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("CSV needs a header row.")
        columns = {c.strip().lower(): c for c in reader.fieldnames if c}
        missing = REQUIRED - set(columns)
        if missing:
            raise ValueError("Missing columns: " + ", ".join(sorted(missing)))
        rows = []
        for line, raw in enumerate(reader, 2):
            sid = (raw[columns["sample_id"]] or "").strip()
            condition = (raw[columns["condition"]] or "").strip()
            recording = (raw[columns["recording_id"]] or "").strip()
            if not sid or not condition or not recording:
                raise ValueError(f"Line {line}: sample_id, condition and recording_id cannot be blank.")
            truth = _num(raw[columns["y_true"]], "y_true", line)
            pred = _num(raw[columns["y_pred"]], "y_pred", line)
            if truth not in (0, 1) or pred not in (0, 1):
                raise ValueError(f"Line {line}: y_true and y_pred must be 0 or 1.")
            confidence = None
            if "confidence" in columns and (raw[columns["confidence"]] or "").strip():
                confidence = _num(raw[columns["confidence"]], "confidence", line)
                if not 0 <= confidence <= 1:
                    raise ValueError(f"Line {line}: confidence must be in [0, 1].")
            rows.append({
                "sample_id": sid, "condition": condition, "y_true": int(truth),
                "y_pred": int(pred), "recording_id": recording,
                "confidence": confidence,
            })
    if not rows:
        raise ValueError("CSV contains no rows.")
    return rows


def _summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"n": 0, "accuracy": None, "error_rate": None, "mean_confidence": None}
    correct = sum(r["y_true"] == r["y_pred"] for r in rows)
    confidence = [r["confidence"] for r in rows if r["confidence"] is not None]
    return {
        "n": len(rows),
        "accuracy": correct / len(rows),
        "error_rate": 1 - correct / len(rows),
        "mean_confidence": sum(confidence) / len(confidence) if confidence else None,
        "false_positives": sum(r["y_true"] == 0 and r["y_pred"] == 1 for r in rows),
        "false_negatives": sum(r["y_true"] == 1 and r["y_pred"] == 0 for r in rows),
    }


def audit_counterfactuals(rows: list[dict[str, Any]], clean_condition: str = "clean") -> dict[str, Any]:
    by_pair: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    conditions = set()
    for row in rows:
        key = row["sample_id"]
        condition = row["condition"]
        if condition in by_pair[key]:
            raise ValueError(f"Duplicate sample_id/condition pair: {key!r}/{condition!r}")
        by_pair[key][condition] = row
        conditions.add(condition)

    if clean_condition not in conditions:
        raise ValueError(f"No rows use clean condition {clean_condition!r}.")

    clean_rows = [group[clean_condition] for group in by_pair.values() if clean_condition in group]
    result_by_condition = {}
    for condition in sorted(conditions - {clean_condition}):
        paired = []
        for sample_id, group in by_pair.items():
            if clean_condition not in group or condition not in group:
                continue
            clean, altered = group[clean_condition], group[condition]
            if clean["y_true"] != altered["y_true"]:
                raise ValueError(
                    f"Label changed for sample {sample_id!r} between {clean_condition!r} "
                    f"and {condition!r}; exclude this transformation from label-preserving audit."
                )
            if clean["recording_id"] != altered["recording_id"]:
                raise ValueError(f"Recording ID changed for paired sample {sample_id!r}.")
            paired.append((clean, altered))

        base = [p[0] for p in paired]
        altered = [p[1] for p in paired]
        flips = sum(a["y_pred"] != b["y_pred"] for a, b in paired)
        correct_to_wrong = sum(
            a["y_pred"] == a["y_true"] and b["y_pred"] != b["y_true"]
            for a, b in paired
        )
        wrong_to_correct = sum(
            a["y_pred"] != a["y_true"] and b["y_pred"] == b["y_true"]
            for a, b in paired
        )
        recs: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
        for pair in paired:
            recs[pair[0]["recording_id"]].append(pair)
        per_recording = []
        for rec_id, rec_pairs in sorted(recs.items()):
            rec_flips = sum(a["y_pred"] != b["y_pred"] for a, b in rec_pairs)
            per_recording.append({
                "recording_id": rec_id,
                "n_pairs": len(rec_pairs),
                "prediction_flip_rate": rec_flips / len(rec_pairs),
                "clean_accuracy": _summary([a for a, _ in rec_pairs])["accuracy"],
                "altered_accuracy": _summary([b for _, b in rec_pairs])["accuracy"],
            })
        result_by_condition[condition] = {
            "n_paired_samples": len(paired),
            "clean_metrics_on_paired_subset": _summary(base),
            "altered_metrics": _summary(altered),
            "prediction_flip_count": flips,
            "prediction_flip_rate": flips / len(paired) if paired else None,
            "correct_to_incorrect_count": correct_to_wrong,
            "incorrect_to_correct_count": wrong_to_correct,
            "accuracy_change_altered_minus_clean": (
                _summary(altered)["accuracy"] - _summary(base)["accuracy"] if paired else None
            ),
            "per_recording": per_recording,
        }

    return {
        "name": "SOUNDTRUTH: counterfactual acoustic nuisance audit",
        "purpose": (
            "Test whether predictions change under paired, label-preserving recording "
            "nuisance transformations."
        ),
        "notice": (
            "Research audit only. A prediction flip suggests sensitivity to the tested "
            "transformation; it does not by itself prove a model used a specific shortcut "
            "or establish clinical harm."
        ),
        "clean_condition": clean_condition,
        "n_rows": len(rows),
        "n_unique_samples": len(by_pair),
        "clean_rows": len(clean_rows),
        "results_by_perturbation": result_by_condition,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path")
    parser.add_argument("--clean-condition", default="clean")
    parser.add_argument("--output")
    args = parser.parse_args(argv)
    try:
        report = audit_counterfactuals(load_predictions(args.csv_path), args.clean_condition)
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
