#!/usr/bin/env python3
"""Counterfactual stress test for MOM's 120–480 Hz acoustic feature.

This tool does NOT classify bowel sounds or diagnose anything. It asks a
narrow engineering question: how much does MOM's existing band-power ratio
change when the same waveform is subjected to controlled recording changes?

Outputs are reproducible JSON and CSV reports. Perturbations are probes, not
claims that every transformation preserves a biological label.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

TARGET_FS = 8000
WINDOW_SECONDS = 0.5
FEATURE_BAND = (120.0, 480.0)
TOTAL_BAND = (20.0, 2000.0)


def to_float_mono(data: np.ndarray) -> np.ndarray:
    if data.ndim == 2:
        data = data.astype(np.float64).mean(axis=1)
    elif data.ndim != 1:
        raise ValueError("Audio must be mono or multi-channel PCM.")
    if np.issubdtype(data.dtype, np.integer):
        info = np.iinfo(data.dtype)
        x = data.astype(np.float64) / max(abs(info.min), abs(info.max))
    else:
        x = data.astype(np.float64)
    if not np.all(np.isfinite(x)):
        raise ValueError("Audio contains non-finite values.")
    if len(x) < 16:
        raise ValueError("Audio is too short to analyze.")
    return x


def resample_audio(x: np.ndarray, source_rate: int, target_rate: int = TARGET_FS) -> np.ndarray:
    if source_rate <= 0:
        raise ValueError("Sample rate must be positive.")
    if source_rate == target_rate:
        return x.copy()
    from math import gcd
    common = gcd(int(source_rate), int(target_rate))
    return signal.resample_poly(x, target_rate // common, source_rate // common)


def feature_per_window(x: np.ndarray, sample_rate: int = TARGET_FS) -> list[float]:
    size = int(round(WINDOW_SECONDS * sample_rate))
    features: list[float] = []
    for start in range(0, len(x) - size + 1, size):
        window = x[start:start + size]
        centered = window - np.mean(window)
        tapered = centered * signal.windows.hann(len(centered), sym=False)
        power = np.abs(np.fft.rfft(tapered)) ** 2
        freqs = np.fft.rfftfreq(len(centered), d=1.0 / sample_rate)
        total_mask = (freqs >= TOTAL_BAND[0]) & (freqs <= TOTAL_BAND[1])
        feature_mask = (freqs >= FEATURE_BAND[0]) & (freqs <= FEATURE_BAND[1])
        denominator = float(np.sum(power[total_mask]))
        features.append(float(np.sum(power[feature_mask]) / denominator) if denominator > 0 else float("nan"))
    if not features:
        raise ValueError("Audio must contain at least one complete 500 ms window after resampling.")
    return features


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x))))


def add_noise_at_snr(x: np.ndarray, snr_db: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    noise = rng.normal(size=len(x))
    noise_rms = rms(noise)
    if noise_rms == 0:
        return x.copy()
    target_noise_rms = rms(x) / (10.0 ** (snr_db / 20.0))
    return x + noise * (target_noise_rms / noise_rms)


def shifted(x: np.ndarray, samples: int) -> np.ndarray:
    out = np.zeros_like(x)
    if samples > 0:
        out[samples:] = x[:-samples]
    elif samples < 0:
        out[:samples] = x[-samples:]
    else:
        out[:] = x
    return out


def make_conditions(x: np.ndarray, sample_rate: int) -> list[tuple[str, str, np.ndarray]]:
    # Noise and clipping are stress probes and may change acoustic evidence;
    # results are sensitivity measurements, not label-preserving guarantees.
    shift = max(1, int(round(0.025 * sample_rate)))
    return [
        ("baseline", "Original recording", x.copy()),
        ("gain_minus_6db", "Global gain −6 dB", x * (10 ** (-6 / 20))),
        ("gain_plus_6db", "Global gain +6 dB", x * (10 ** (6 / 20))),
        ("noise_20db_snr", "Added noise at 20 dB SNR", add_noise_at_snr(x, 20, 20261028)),
        ("noise_10db_snr", "Added noise at 10 dB SNR", add_noise_at_snr(x, 10, 20261029)),
        ("shift_25ms", "25 ms time shift with zero padding", shifted(x, shift)),
        ("clip_98pct", "Hard clipping at ±98% full scale", np.clip(x, -0.98, 0.98)),
    ]


def summarize(name: str, description: str, x: np.ndarray, base_feature: float | None) -> dict:
    values = np.asarray(feature_per_window(x), dtype=float)
    finite = values[np.isfinite(values)]
    feature = float(np.median(finite)) if len(finite) else None
    delta = feature - base_feature if base_feature is not None and feature is not None else None
    rel = abs(delta) / max(abs(base_feature), 1e-12) if delta is not None and base_feature is not None else None
    return {
        "condition": name,
        "description": description,
        "complete_windows": int(len(values)),
        "median_band_power_ratio": feature,
        "absolute_change_from_baseline": float(delta) if delta is not None else None,
        "relative_change_percent": float(100 * rel) if rel is not None else None,
        "rms_amplitude": rms(x),
        "clipped_sample_fraction": float(np.mean(np.abs(x) >= 0.999)),
    }


def run(path: Path, output_dir: Path) -> dict:
    sample_rate, raw = wavfile.read(path)
    original = to_float_mono(raw)
    x = resample_audio(original, int(sample_rate))
    conditions = make_conditions(x, TARGET_FS)
    baseline_vals = np.asarray(feature_per_window(conditions[0][2]), dtype=float)
    baseline_finite = baseline_vals[np.isfinite(baseline_vals)]
    baseline_feature = float(np.median(baseline_finite)) if len(baseline_finite) else None
    rows = [summarize(key, desc, arr, baseline_feature if key != "baseline" else None)
            for key, desc, arr in conditions]
    rows[0]["absolute_change_from_baseline"] = 0.0
    rows[0]["relative_change_percent"] = 0.0
    nonbaseline = [r for r in rows if r["condition"] != "baseline"]
    valid_deltas = [r["relative_change_percent"] for r in nonbaseline if r["relative_change_percent"] is not None and np.isfinite(r["relative_change_percent"])]
    report = {
        "tool": "MOM Counterfactual Stress Lab",
        "version": "1.0.0",
        "input_file": path.name,
        "original_sample_rate_hz": int(sample_rate),
        "analysis_sample_rate_hz": TARGET_FS,
        "duration_seconds": float(len(x) / TARGET_FS),
        "feature_definition": "power(120–480 Hz) / power(20–2000 Hz), per complete 500 ms window; report is median across windows",
        "baseline_median_feature": baseline_feature,
        "median_absolute_relative_feature_change_percent_across_probes": float(np.median(valid_deltas)) if valid_deltas else None,
        "conditions": rows,
        "interpretation": "Engineering sensitivity audit only. Perturbations are probes, not guaranteed label-preserving transformations. No event classification, diagnosis, or clinical conclusion is produced."
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "stress_report.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    with (output_dir / "stress_report.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wav", type=Path, required=True, help="Input WAV recording")
    parser.add_argument("--out", type=Path, default=Path("mom_stress_report"), help="Output directory")
    args = parser.parse_args()
    report = run(args.wav, args.out)
    print(json.dumps({
        "input_file": report["input_file"],
        "duration_seconds": round(report["duration_seconds"], 3),
        "baseline_median_feature": report["baseline_median_feature"],
        "probe_count": len(report["conditions"]) - 1,
        "median_absolute_relative_feature_change_percent_across_probes":
            report["median_absolute_relative_feature_change_percent_across_probes"],
        "outputs": [str(args.out / "stress_report.json"), str(args.out / "stress_report.csv")],
        "interpretation": report["interpretation"],
    }, indent=2))


if __name__ == "__main__":
    main()
