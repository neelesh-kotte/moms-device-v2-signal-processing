#!/usr/bin/env python3
"""MOM PulseCheck: bench-only active acoustic-path self-test.

Compare a known-good reference WAV and a new test WAV captured while the same
controlled calibration pulse is applied to the sensor coupler. The result is an
engineering integrity check, not a bowel-sound classifier or medical judgment.

The reference and test recordings must contain pre-pulse baseline followed by a
pulse at the same specified time. Thresholds are provisional and must be set
from repeated bench calibration data before interpreting any real device.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from scipy.io import wavfile

DEFAULTS = {
    "min_correlation": 0.80,
    "min_amplitude_ratio": 0.50,
    "max_amplitude_ratio": 2.00,
    "min_snr_db": 10.0,
    "max_clipping_fraction": 0.002,
}


def _to_float(audio: np.ndarray) -> np.ndarray:
    if audio.ndim == 2:
        if audio.shape[1] != 1:
            raise ValueError("Only mono WAV files are supported.")
        audio = audio[:, 0]
    if np.issubdtype(audio.dtype, np.integer):
        info = np.iinfo(audio.dtype)
        scale = float(max(abs(info.min), abs(info.max)))
        return audio.astype(np.float64) / scale
    out = audio.astype(np.float64)
    if not np.all(np.isfinite(out)):
        raise ValueError("Audio contains NaN or infinite samples.")
    return out


def read_wav(path: str | Path) -> tuple[int, np.ndarray]:
    sample_rate, raw = wavfile.read(str(path))
    if sample_rate <= 0:
        raise ValueError(f"Invalid sample rate in {path}.")
    audio = _to_float(raw)
    if len(audio) < 4:
        raise ValueError(f"WAV is too short: {path}")
    return int(sample_rate), audio


def _segment(audio: np.ndarray, sample_rate: int, start_s: float, end_s: float) -> np.ndarray:
    start = int(round(start_s * sample_rate))
    end = int(round(end_s * sample_rate))
    if start < 1 or end <= start or end > len(audio):
        raise ValueError("Pulse window must start after the baseline and fit inside the WAV.")
    return audio[start:end]


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x - np.mean(x)))))


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) != len(b):
        raise ValueError("Reference and test pulse windows must have equal sample counts.")
    a = a - np.mean(a)
    b = b - np.mean(b)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= np.finfo(float).eps:
        return 0.0
    return float(np.dot(a, b) / denom)


def _clipping_fraction(audio: np.ndarray) -> float:
    # Conservative full-scale proximity check for normalized PCM.
    return float(np.mean(np.abs(audio) >= 0.99))


def compare_recordings(
    reference: np.ndarray,
    test: np.ndarray,
    sample_rate: int,
    pulse_start_s: float,
    pulse_end_s: float,
    thresholds: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Compare matched reference/test pulse recordings and return transparent metrics."""
    limits = {**DEFAULTS, **(thresholds or {})}
    required = set(DEFAULTS)
    missing = required - set(limits)
    if missing:
        raise ValueError("Missing thresholds: " + ", ".join(sorted(missing)))
    if not (0 < limits["min_correlation"] <= 1):
        raise ValueError("min_correlation must be in (0, 1].")
    if not (0 < limits["min_amplitude_ratio"] <= limits["max_amplitude_ratio"]):
        raise ValueError("Amplitude-ratio limits must be positive and ordered.")
    if limits["min_snr_db"] < 0 or not (0 <= limits["max_clipping_fraction"] < 1):
        raise ValueError("Invalid SNR or clipping threshold.")

    if len(reference) != len(test):
        raise ValueError("Reference and test WAVs must have equal duration after alignment.")
    pulse_ref = _segment(reference, sample_rate, pulse_start_s, pulse_end_s)
    pulse_test = _segment(test, sample_rate, pulse_start_s, pulse_end_s)
    base_ref = reference[:int(round(pulse_start_s * sample_rate))]
    base_test = test[:int(round(pulse_start_s * sample_rate))]
    if len(base_ref) < 2 or len(base_test) < 2:
        raise ValueError("Need a pre-pulse baseline before pulse_start_s.")

    ref_rms = _rms(pulse_ref)
    test_rms = _rms(pulse_test)
    if ref_rms <= 1e-12:
        raise ValueError("Reference pulse has negligible energy; capture a valid reference.")
    ratio = test_rms / ref_rms
    baseline_rms = _rms(base_test)
    snr_db = 20 * math.log10(max(test_rms, 1e-12) / max(baseline_rms, 1e-12))
    correlation = _corr(pulse_ref, pulse_test)
    clipping = _clipping_fraction(test)

    checks = {
        "pulse_shape_similarity": correlation >= limits["min_correlation"],
        "pulse_amplitude_ratio": limits["min_amplitude_ratio"] <= ratio <= limits["max_amplitude_ratio"],
        "pulse_above_baseline_noise": snr_db >= limits["min_snr_db"],
        "clipping": clipping <= limits["max_clipping_fraction"],
    }
    passed = all(checks.values())
    # A failed check means repeat/reseat/inspect the bench setup; it is not a diagnosis.
    status = "PASS_BENCH_CHECK" if passed else "RETEST_AND_INSPECT"
    return {
        "tool": "MOM PulseCheck",
        "status": status,
        "scope": "bench engineering self-test only; not medical validation",
        "sample_rate_hz": sample_rate,
        "pulse_window_seconds": [pulse_start_s, pulse_end_s],
        "metrics": {
            "pulse_shape_correlation": correlation,
            "test_to_reference_pulse_rms_ratio": ratio,
            "test_pulse_snr_db": snr_db,
            "test_recording_clipping_fraction": clipping,
            "reference_pulse_rms": ref_rms,
            "test_pulse_rms": test_rms,
            "test_baseline_rms": baseline_rms,
        },
        "checks": checks,
        "thresholds": limits,
        "interpretation": (
            "All configured engineering checks passed. This only indicates similarity to "
            "the chosen bench reference under this test setup."
            if passed else
            "At least one configured engineering check failed. Repeat the bench test and "
            "inspect actuator placement, coupling, gain, noise, and clipping. Do not infer "
            "a physiological state from this result."
        ),
        "threshold_warning": "Thresholds are provisional examples; derive and freeze them from repeated bench calibration data.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", required=True, help="Known-good bench calibration WAV.")
    parser.add_argument("--test", required=True, help="New bench calibration WAV.")
    parser.add_argument("--pulse-start", type=float, required=True, help="Pulse start in seconds.")
    parser.add_argument("--pulse-end", type=float, required=True, help="Pulse end in seconds.")
    parser.add_argument("--min-correlation", type=float, default=DEFAULTS["min_correlation"])
    parser.add_argument("--min-amplitude-ratio", type=float, default=DEFAULTS["min_amplitude_ratio"])
    parser.add_argument("--max-amplitude-ratio", type=float, default=DEFAULTS["max_amplitude_ratio"])
    parser.add_argument("--min-snr-db", type=float, default=DEFAULTS["min_snr_db"])
    parser.add_argument("--max-clipping-fraction", type=float, default=DEFAULTS["max_clipping_fraction"])
    parser.add_argument("--out", help="Optional path for the JSON report.")
    args = parser.parse_args()

    try:
        ref_fs, reference = read_wav(args.reference)
        test_fs, test = read_wav(args.test)
        if ref_fs != test_fs:
            raise ValueError(f"Sample rates differ ({ref_fs} vs {test_fs}); resample deliberately before comparison.")
        result = compare_recordings(
            reference, test, ref_fs, args.pulse_start, args.pulse_end,
            {
                "min_correlation": args.min_correlation,
                "min_amplitude_ratio": args.min_amplitude_ratio,
                "max_amplitude_ratio": args.max_amplitude_ratio,
                "min_snr_db": args.min_snr_db,
                "max_clipping_fraction": args.max_clipping_fraction,
            },
        )
        rendered = json.dumps(result, indent=2, allow_nan=False)
        print(rendered)
        if args.out:
            Path(args.out).write_text(rendered + "\n", encoding="utf-8")
        return 0
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
