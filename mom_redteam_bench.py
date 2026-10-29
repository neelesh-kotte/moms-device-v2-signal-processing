#!/usr/bin/env python3
"""MOM Red-Team Bench: grouped, counterfactual audit of a simple audio classifier.

This is a research benchmark, not a clinical detector. Each manifest row must
point to one labelled audio clip/window. Split groups must represent independent
recordings (or participants, if known), not adjacent windows from the same clip.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, balanced_accuracy_score, brier_score_loss, f1_score,
    precision_score, recall_score, roc_auc_score, confusion_matrix,
)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

FS = 8000
WINDOW_S = 0.5
FEATURE_NAMES = [
    "band_ratio_120_480_to_20_2000", "log_rms", "spectral_centroid_hz",
    "spectral_flatness", "spectral_entropy", "zero_crossing_rate",
    "crest_factor",
]


def load_audio(path: Path) -> np.ndarray:
    rate, data = wavfile.read(path)
    if np.issubdtype(data.dtype, np.integer):
        info = np.iinfo(data.dtype)
        data = data.astype(np.float64) / max(abs(info.min), abs(info.max))
    else:
        data = data.astype(np.float64)
    if data.ndim == 2:
        data = data.mean(axis=1)
    elif data.ndim != 1:
        raise ValueError(f"{path}: expected mono or stereo WAV")
    if len(data) < 16 or not np.all(np.isfinite(data)):
        raise ValueError(f"{path}: audio is empty, too short, or non-finite")
    if rate <= 0:
        raise ValueError(f"{path}: invalid sample rate")
    if rate != FS:
        from math import gcd
        g = gcd(int(rate), FS)
        data = signal.resample_poly(data, FS // g, int(rate) // g)
    peak = float(np.max(np.abs(data)))
    # Integer PCM has already been normalized; float WAVs are preserved.
    if peak > 8:
        raise ValueError(f"{path}: unexpectedly large floating-point amplitude")
    return np.asarray(data, dtype=np.float64)


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)) + 1e-15))


def extract_features(x: np.ndarray) -> np.ndarray:
    """Aggregate seven interpretable acoustic features over 500 ms frames."""
    size = int(FS * WINDOW_S)
    if len(x) < size:
        x = np.pad(x, (0, size - len(x)))
    rows = []
    for start in range(0, len(x) - size + 1, size):
        w = x[start:start + size]
        centered = w - np.mean(w)
        tapered = centered * signal.windows.hann(len(centered), sym=False)
        power = np.abs(np.fft.rfft(tapered)) ** 2 + 1e-15
        freq = np.fft.rfftfreq(len(tapered), 1 / FS)
        total = (freq >= 20) & (freq <= 2000)
        target = (freq >= 120) & (freq <= 480)
        denom = float(power[total].sum()) + 1e-15
        norm = power[total] / denom
        centroid = float(np.sum(freq[total] * power[total]) / denom)
        flatness = float(np.exp(np.mean(np.log(power[total]))) / np.mean(power[total]))
        entropy = float(-np.sum(norm * np.log(norm + 1e-15)) / np.log(max(2, len(norm))))
        zcr = float(np.mean(np.signbit(centered[1:]) != np.signbit(centered[:-1])))
        crest = float(np.max(np.abs(centered)) / (rms(centered) + 1e-12))
        rows.append([
            float(power[target].sum() / denom),
            float(np.log(rms(centered) + 1e-12)),
            centroid, flatness, entropy, zcr, crest,
        ])
    return np.median(np.asarray(rows), axis=0)


def perturb(x: np.ndarray, condition: str, seed: int) -> np.ndarray:
    if condition == "baseline":
        return x.copy()
    if condition == "gain_minus_6db":
        return x * (10 ** (-6 / 20))
    if condition == "gain_plus_6db":
        return x * (10 ** (6 / 20))
    if condition in ("noise_20db_snr", "noise_10db_snr"):
        snr = 20 if condition == "noise_20db_snr" else 10
        rng = np.random.default_rng(seed)
        noise = rng.normal(size=len(x))
        return x + noise * (rms(x) / (10 ** (snr / 20)) / (rms(noise) + 1e-12))
    if condition == "shift_25ms":
        n = max(1, int(FS * 0.025))
        return np.pad(x, (n, 0))[:len(x)]
    if condition == "clip_98pct":
        return np.clip(x, -0.98, 0.98)
    raise ValueError(f"Unknown condition: {condition}")


CONDITIONS = [
    "baseline", "gain_minus_6db", "gain_plus_6db", "noise_20db_snr",
    "noise_10db_snr", "shift_25ms", "clip_98pct",
]


def read_manifest(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        required = {"clip_path", "recording_id", "label"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError("Manifest needs columns: clip_path, recording_id, label")
        rows = []
        for line, row in enumerate(reader, start=2):
            label_text = (row.get("label") or "").strip()
            if label_text not in {"0", "1"}:
                raise ValueError(f"Manifest line {line}: label must be 0 or 1")
            clip = Path((row.get("clip_path") or "").strip())
            if not clip.is_absolute():
                clip = path.parent / clip
            group = (row.get("recording_id") or "").strip()
            if not group:
                raise ValueError(f"Manifest line {line}: recording_id is required")
            if not clip.is_file():
                raise ValueError(f"Manifest line {line}: file not found: {clip}")
            rows.append({"path": clip, "group": group, "label": int(label_text)})
    if len(rows) < 8:
        raise ValueError("Need at least 8 labelled clips for a basic grouped audit.")
    if len({r["group"] for r in rows}) < 4:
        raise ValueError("Need at least 4 independent recording_id groups.")
    if {r["label"] for r in rows} != {0, 1}:
        raise ValueError("Manifest must contain both label classes (0 and 1).")
    return rows


def metrics(y: np.ndarray, p: np.ndarray) -> dict:
    pred = (p >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    try:
        auc = float(roc_auc_score(y, p))
    except ValueError:
        auc = None
    return {
        "n_clips": int(len(y)),
        "accuracy": float(accuracy_score(y, pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y, pred)),
        "event_sensitivity_recall": float(recall_score(y, pred, zero_division=0)),
        "non_event_specificity": float(tn / (tn + fp)) if (tn + fp) else None,
        "precision": float(precision_score(y, pred, zero_division=0)),
        "f1": float(f1_score(y, pred, zero_division=0)),
        "auroc": auc,
        "brier_score": float(brier_score_loss(y, p)),
        "false_negatives": int(fn),
        "false_positives": int(fp),
        "true_positives": int(tp),
        "true_negatives": int(tn),
    }


def choose_group_split(y: np.ndarray, groups: np.ndarray, seed: int):
    splitter = GroupShuffleSplit(n_splits=200, test_size=0.25, random_state=seed)
    for train_idx, test_idx in splitter.split(np.zeros(len(y)), y, groups):
        if len(np.unique(y[train_idx])) == 2 and len(np.unique(y[test_idx])) == 2:
            return train_idx, test_idx
    raise ValueError("Could not create a recording-level split containing both classes. Add more independent recordings per class.")


def run(manifest: Path, out_dir: Path, seed: int = 20261028) -> dict:
    rows = read_manifest(manifest)
    y = np.asarray([r["label"] for r in rows], dtype=int)
    groups = np.asarray([r["group"] for r in rows], dtype=str)
    audio = [load_audio(r["path"]) for r in rows]
    X = np.vstack([extract_features(x) for x in audio])
    train_idx, test_idx = choose_group_split(y, groups, seed)
    models = {
        "logistic_regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, class_weight="balanced", random_state=seed)),
        "random_forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced", random_state=seed),
    }
    report = {
        "tool": "MOM Red-Team Bench",
        "version": "0.1.0",
        "research_only": True,
        "label_definition": "User-supplied binary labels; this tool does not define what counts as a bowel sound.",
        "split": {
            "method": "GroupShuffleSplit by recording_id",
            "seed": seed,
            "train_clips": int(len(train_idx)),
            "test_clips": int(len(test_idx)),
            "train_recordings": sorted(set(groups[train_idx])),
            "test_recordings": sorted(set(groups[test_idx])),
            "feature_names": FEATURE_NAMES,
        },
        "models": {},
        "limitations": [
            "Not a diagnostic model or clinically validated system.",
            "Results depend on the user's labels, clip selection, and recording_id grouping.",
            "Counterfactual noise, clipping, and time shifts may change acoustic evidence; they are stress probes, not guaranteed label-preserving changes.",
            "One grouped holdout is a small benchmark, not a substitute for external validation or repeated group cross-validation.",
        ],
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    for model_name, model in models.items():
        model.fit(X[train_idx], y[train_idx])
        baseline_p = model.predict_proba(X[test_idx])[:, 1]
        baseline_pred = (baseline_p >= 0.5).astype(int)
        model_result = {
            "baseline": metrics(y[test_idx], baseline_p),
            "conditions": {},
        }
        for condition in CONDITIONS[1:]:
            altered = np.vstack([
                extract_features(perturb(audio[i], condition, seed + i))
                for i in test_idx
            ])
            p = model.predict_proba(altered)[:, 1]
            pred = (p >= 0.5).astype(int)
            model_result["conditions"][condition] = {
                **metrics(y[test_idx], p),
                "prediction_flip_rate_vs_baseline": float(np.mean(pred != baseline_pred)),
                "mean_absolute_probability_shift": float(np.mean(np.abs(p - baseline_p))),
            }
        model_result["conditions"]["baseline"] = model_result["baseline"]
        report["models"][model_name] = model_result
    json_path = out_dir / "redteam_report.json"
    csv_path = out_dir / "redteam_summary.csv"
    report["output_files"] = [str(json_path), str(csv_path)]
    json_path.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        fields = ["model", "condition", "n_clips", "accuracy", "balanced_accuracy",
                  "event_sensitivity_recall", "non_event_specificity", "precision", "f1",
                  "auroc", "brier_score", "false_negatives", "false_positives", "true_positives", "true_negatives",
                  "prediction_flip_rate_vs_baseline", "mean_absolute_probability_shift"]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for model_name, result in report["models"].items():
            for condition, values in result["conditions"].items():
                writer.writerow({"model": model_name, "condition": condition, **values})
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit a binary audio classifier under recording perturbations.")
    parser.add_argument("--manifest", required=True, type=Path, help="CSV with clip_path, recording_id, label (0/1)")
    parser.add_argument("--out", type=Path, default=Path("mom_redteam_report"), help="Output directory")
    parser.add_argument("--seed", type=int, default=20261028)
    args = parser.parse_args()
    report = run(args.manifest, args.out, args.seed)
    print(json.dumps({
        "tool": report["tool"],
        "test_recordings": report["split"]["test_recordings"],
        "models": {
            name: {
                "baseline": result["baseline"],
                "worst_sensitivity_condition": min(
                    result["conditions"].items(),
                    key=lambda item: item[1]["event_sensitivity_recall"]
                )[0],
            }
            for name, result in report["models"].items()
        },
        "output_files": report["output_files"],
    }, indent=2))


if __name__ == "__main__":
    main()
