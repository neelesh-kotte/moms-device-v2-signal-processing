#!/usr/bin/env python3
"""Reproduce the spectral-energy analysis reported in the gastroacoustic manuscript.

The analysis uses the version-1 Figshare dataset at DOI
10.6084/m9.figshare.28595741.v1. It:
  * resamples each 48 kHz recording to 8 kHz,
  * constructs non-overlapping 500 ms windows,
  * labels windows from paired annotation files,
  * computes the fraction of 20-2000 Hz power in 120-480 Hz,
  * summarizes windows by recording and filename-date group,
  * performs the exact two-sided sign-flip test across four date groups,
  * calculates a conventional t-based 95% CI for the mean paired difference,
  * computes Mann-Whitney probability-of-superiority effect sizes,
  * writes the manuscript tables and figures.

Use --verify to compare regenerated outputs with the manuscript values. The
verification targets are never substituted into the calculations.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import re
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import signal, stats
from scipy.io import wavfile

TARGET_FS = 8000
WINDOW_SECONDS = 0.5
WINDOW_SAMPLES = int(TARGET_FS * WINDOW_SECONDS)
NUMERATOR_BAND = (120.0, 480.0)
DENOMINATOR_BAND = (20.0, 2000.0)
BOUNDARY_BUFFER_SECONDS = 0.5
CONFIRMED_LABELS = {"SB", "MB", "CRS", "HS"}

FIGSHARE_ARTICLE_ID = "28595741"
FIGSHARE_VERSION = "1"
FIGSHARE_API = f"https://api.figshare.com/v2/articles/{FIGSHARE_ARTICLE_ID}/versions/{FIGSHARE_VERSION}"

# Manuscript values used only by --verify. They are not substituted into the
# analysis; every value is recomputed from the downloaded source files.
EXPECTED_MANUSCRIPT = {
    "total_complete_windows": 10922,
    "event_windows": 3881,
    "non_event_windows": 5878,
    "excluded_windows": 1163,
    "event_mean": 0.469,
    "event_median": 0.426,
    "non_event_mean": 0.148,
    "non_event_median": 0.089,
    "group_differences": [0.077, 0.103, 0.308, 0.383],
    "mean_difference": 0.218,
    "median_difference": 0.206,
    "ci_low": -0.023,
    "ci_high": 0.459,
    "sign_flip_p": 0.125,
    "mean_probability_superiority": 0.728,
}


@dataclass(frozen=True)
class Annotation:
    start: float
    end: float
    label: str


def md5_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_figshare_metadata() -> dict:
    with urllib.request.urlopen(FIGSHARE_API) as response:
        return json.load(response)


def download_dataset(data_dir: Path) -> None:
    """Download all WAV/TXT files from the immutable Figshare v1 release."""
    data_dir.mkdir(parents=True, exist_ok=True)
    metadata = fetch_figshare_metadata()
    files = metadata.get("files", [])
    wanted = [f for f in files if Path(f["name"]).suffix.lower() in {".wav", ".txt", ".tsv"}]
    if not wanted:
        raise RuntimeError("No WAV/TXT annotation files were found in Figshare metadata.")

    for item in wanted:
        destination = data_dir / item["name"]
        expected_md5 = item.get("computed_md5") or item.get("md5")
        if destination.exists() and expected_md5 and md5_file(destination) == expected_md5:
            print(f"exists/verified: {destination.name}")
            continue
        print(f"downloading: {destination.name}")
        urllib.request.urlretrieve(item["download_url"], destination)
        if expected_md5 and md5_file(destination) != expected_md5:
            destination.unlink(missing_ok=True)
            raise RuntimeError(f"Checksum mismatch after downloading {item['name']}")


def normalize_audio(data: np.ndarray) -> np.ndarray:
    """Convert integer/float PCM to mono float64 without altering relative scale."""
    if data.ndim == 2:
        if data.shape[1] != 1:
            raise ValueError("Expected mono recordings; found multi-channel audio.")
        data = data[:, 0]
    if np.issubdtype(data.dtype, np.integer):
        info = np.iinfo(data.dtype)
        scale = max(abs(info.min), abs(info.max))
        out = data.astype(np.float64) / scale
    else:
        out = data.astype(np.float64)
    return out


def parse_annotation_file(path: Path) -> list[Annotation]:
    """Parse annotation rows containing start, end, and label fields.

    The parser accepts tab/comma/whitespace delimiters and ignores header or
    comment rows. The first two numeric fields are treated as start/end times;
    the next non-numeric field is treated as the label.
    """
    annotations: list[Annotation] = []
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        fields = [x.strip() for x in re.split(r"\t+|,+|\s+", line) if x.strip()]
        numeric: list[tuple[int, float]] = []
        for i, field in enumerate(fields):
            try:
                numeric.append((i, float(field)))
            except ValueError:
                pass
        if len(numeric) < 2:
            continue
        start_i, start = numeric[0]
        end_i, end = numeric[1]
        if end < start:
            start, end = end, start
        label = None
        for i, field in enumerate(fields):
            if i not in {start_i, end_i}:
                try:
                    float(field)
                except ValueError:
                    label = field.strip()
                    break
        if label is None:
            continue
        annotations.append(Annotation(float(start), float(end), label))
    if not annotations:
        raise ValueError(f"No annotations could be parsed from {path}")
    return annotations


def annotation_path_for(wav_path: Path, files: Iterable[Path]) -> Path:
    candidates = []
    stem = wav_path.stem
    for p in files:
        if p.suffix.lower() not in {".txt", ".tsv"}:
            continue
        if p.stem == stem or p.stem.replace("record_", "") == stem.replace("record_", ""):
            candidates.append(p)
    if len(candidates) != 1:
        raise RuntimeError(f"Expected exactly one annotation file for {wav_path.name}; found {candidates}")
    return candidates[0]


def overlaps(start: float, end: float, ann: Annotation) -> bool:
    return start < ann.end and end > ann.start


def classify_window(start: float, end: float, annotations: list[Annotation]) -> str:
    """Return event, non_event, or excluded according to manuscript rules."""
    overlapping = [a for a in annotations if overlaps(start, end, a)]
    if any(a.label in CONFIRMED_LABELS for a in overlapping):
        return "event"
    if overlapping:
        return "excluded"
    for ann in annotations:
        if abs(start - ann.start) < BOUNDARY_BUFFER_SECONDS or abs(start - ann.end) < BOUNDARY_BUFFER_SECONDS:
            return "excluded"
    return "non_event"


def band_energy_ratio(window: np.ndarray) -> float:
    centered = window.astype(np.float64) - np.mean(window)
    tapered = centered * signal.windows.hann(len(centered), sym=False)
    spectrum = np.fft.rfft(tapered)
    power = np.abs(spectrum) ** 2
    freqs = np.fft.rfftfreq(len(centered), d=1.0 / TARGET_FS)
    numerator_mask = (freqs >= NUMERATOR_BAND[0]) & (freqs <= NUMERATOR_BAND[1])
    denominator_mask = (freqs >= DENOMINATOR_BAND[0]) & (freqs <= DENOMINATOR_BAND[1])
    denominator = float(np.sum(power[denominator_mask]))
    if denominator <= 0:
        return np.nan
    return float(np.sum(power[numerator_mask]) / denominator)


def date_group_from_name(name: str) -> str:
    match = re.search(r"(\d{6})", name)
    if not match:
        raise ValueError(f"Could not identify six-digit date prefix in {name}")
    return match.group(1)


def analyze_recording(wav_path: Path, ann_path: Path) -> tuple[pd.DataFrame, dict]:
    source_fs, raw = wavfile.read(wav_path)
    audio = normalize_audio(raw)
    audio = audio - np.mean(audio)
    if source_fs != TARGET_FS:
        gcd = np.gcd(source_fs, TARGET_FS)
        audio = signal.resample_poly(audio, TARGET_FS // gcd, source_fs // gcd)

    annotations = parse_annotation_file(ann_path)
    n_complete = len(audio) // WINDOW_SAMPLES
    recording = wav_path.stem.replace("record_", "")
    date_group = date_group_from_name(recording)
    rows = []
    counts = {"event": 0, "non_event": 0, "excluded": 0}

    for i in range(n_complete):
        start_sample = i * WINDOW_SAMPLES
        stop_sample = start_sample + WINDOW_SAMPLES
        start = start_sample / TARGET_FS
        end = stop_sample / TARGET_FS
        label = classify_window(start, end, annotations)
        counts[label] += 1
        ratio = np.nan
        if label in {"event", "non_event"}:
            ratio = band_energy_ratio(audio[start_sample:stop_sample])
        rows.append(
            {
                "recording": recording,
                "date_group": date_group,
                "window_index": i,
                "start_seconds": start,
                "end_seconds": end,
                "window_class": label,
                "band_energy_ratio": ratio,
            }
        )

    meta = {
        "recording": recording,
        "date_group": date_group,
        "source_sample_rate": int(source_fs),
        "complete_windows": int(n_complete),
        **{f"{k}_windows": int(v) for k, v in counts.items()},
    }
    return pd.DataFrame(rows), meta


def probability_superiority(event_values: np.ndarray, non_values: np.ndarray) -> float:
    """Mann-Whitney probability P(event > non-event), with half-credit for ties."""
    u = stats.mannwhitneyu(event_values, non_values, alternative="two-sided", method="auto").statistic
    return float(u / (len(event_values) * len(non_values)))


def exact_two_sided_sign_flip(differences: np.ndarray) -> float:
    observed = abs(float(np.mean(differences)))
    values = []
    for signs in itertools.product([-1.0, 1.0], repeat=len(differences)):
        values.append(abs(float(np.mean(differences * np.asarray(signs)))))
    return float(np.mean(np.asarray(values) >= observed - 1e-15))


def t_ci_mean(differences: np.ndarray, confidence: float = 0.95) -> tuple[float, float]:
    n = len(differences)
    mean = float(np.mean(differences))
    se = float(stats.sem(differences))
    critical = float(stats.t.ppf((1 + confidence) / 2, df=n - 1))
    return mean - critical * se, mean + critical * se


def summarize(retained: pd.DataFrame, metadata: list[dict]) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    event = retained.loc[retained.window_class == "event", "band_energy_ratio"].dropna()
    non = retained.loc[retained.window_class == "non_event", "band_energy_ratio"].dropna()

    def describe(values: pd.Series) -> tuple[int, float, float, float, float]:
        return (
            int(len(values)),
            float(values.mean()),
            float(values.std(ddof=1)),
            float(values.median()),
            float(values.quantile(0.25)),
            float(values.quantile(0.75)),
        )

    e_n, e_mean, e_sd, e_med, e_q1, e_q3 = describe(event)
    n_n, n_mean, n_sd, n_med, n_q1, n_q3 = describe(non)
    table1 = pd.DataFrame(
        [
            ["Annotated event", e_n, e_mean, e_sd, e_med, e_q1, e_q3],
            ["Eligible non-event", n_n, n_mean, n_sd, n_med, n_q1, n_q3],
        ],
        columns=["window_class", "n", "mean", "sd", "median", "q1", "q3"],
    )

    group_rows = []
    for group, g in retained.groupby("date_group", sort=True):
        ev = g.loc[g.window_class == "event", "band_energy_ratio"].dropna().to_numpy()
        ne = g.loc[g.window_class == "non_event", "band_energy_ratio"].dropna().to_numpy()
        ev_med, ne_med = float(np.median(ev)), float(np.median(ne))
        group_rows.append(
            {
                "date_group": group,
                "event_n": len(ev),
                "non_event_n": len(ne),
                "event_median": ev_med,
                "non_event_median": ne_med,
                "difference": ev_med - ne_med,
                "probability_event_gt_non_event": probability_superiority(ev, ne),
            }
        )
    table2 = pd.DataFrame(group_rows).sort_values("date_group").reset_index(drop=True)

    rec_rows = []
    for recording, g in retained.groupby("recording", sort=True):
        ev = g.loc[g.window_class == "event", "band_energy_ratio"].dropna().to_numpy()
        ne = g.loc[g.window_class == "non_event", "band_energy_ratio"].dropna().to_numpy()
        ev_med, ne_med = float(np.median(ev)), float(np.median(ne))
        rec_rows.append(
            {
                "recording": recording,
                "event_n": len(ev),
                "non_event_n": len(ne),
                "event_median": ev_med,
                "non_event_median": ne_med,
                "difference": ev_med - ne_med,
                "probability_event_gt_non_event": probability_superiority(ev, ne),
            }
        )
    table3 = pd.DataFrame(rec_rows).sort_values("recording").reset_index(drop=True)

    differences = table2["difference"].to_numpy(dtype=float)
    ci_low, ci_high = t_ci_mean(differences)
    totals = pd.DataFrame(metadata).sum(numeric_only=True)
    summary = {
        "total_complete_windows": int(totals["complete_windows"]),
        "event_windows": int(totals["event_windows"]),
        "non_event_windows": int(totals["non_event_windows"]),
        "excluded_windows": int(totals["excluded_windows"]),
        "event_mean": e_mean,
        "event_sd": e_sd,
        "event_median": e_med,
        "event_q1": e_q1,
        "event_q3": e_q3,
        "non_event_mean": n_mean,
        "non_event_sd": n_sd,
        "non_event_median": n_med,
        "non_event_q1": n_q1,
        "non_event_q3": n_q3,
        "group_differences": differences.tolist(),
        "mean_difference": float(np.mean(differences)),
        "median_difference": float(np.median(differences)),
        "ci_low": ci_low,
        "ci_high": ci_high,
        "sign_flip_p": exact_two_sided_sign_flip(differences),
        "mean_probability_superiority": float(table2["probability_event_gt_non_event"].mean()),
    }
    return table1, table2, table3, summary


def make_figures(retained: pd.DataFrame, table2: pd.DataFrame, output_dir: Path) -> None:
    event = retained.loc[retained.window_class == "event", "band_energy_ratio"].dropna().to_numpy()
    non = retained.loc[retained.window_class == "non_event", "band_energy_ratio"].dropna().to_numpy()

    fig, ax = plt.subplots(figsize=(6.2, 4.5))
    violin = ax.violinplot([event, non], positions=[1, 2], showmeans=False, showmedians=False, showextrema=False)
    for body in violin["bodies"]:
        body.set_alpha(0.55)
    for x, vals in zip([1, 2], [event, non]):
        q1, med, q3 = np.quantile(vals, [0.25, 0.5, 0.75])
        ax.vlines(x, q1, q3, linewidth=7)
        ax.scatter([x], [med], s=30, zorder=3)
    ax.set_xticks([1, 2], ["Annotated event", "Eligible non-event"])
    ax.set_ylabel("120-480 Hz / 20-2,000 Hz power")
    ax.set_ylim(0, 1)
    fig.tight_layout()
    fig.savefig(output_dir / "figure1_window_distributions.png", dpi=300)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.2, 4.5))
    markers = ["o", "s", "^", "D", "v", "P", "X"]
    linestyles = ["-", "--", "-.", ":"]
    for i, row in table2.iterrows():
        ax.plot(
            [1, 2],
            [row["non_event_median"], row["event_median"]],
            marker=markers[i % len(markers)],
            linestyle=linestyles[i % len(linestyles)],
            label=str(row["date_group"]),
        )
    ax.set_xticks([1, 2], ["Eligible non-event", "Annotated event"])
    ax.set_ylabel("Median band-energy ratio")
    ax.legend(title="Date group")
    fig.tight_layout()
    fig.savefig(output_dir / "figure2_group_medians.png", dpi=300)
    plt.close(fig)


def verify_against_manuscript(summary: dict) -> None:
    failures = []
    integer_keys = ["total_complete_windows", "event_windows", "non_event_windows", "excluded_windows"]
    for key in integer_keys:
        if int(summary[key]) != int(EXPECTED_MANUSCRIPT[key]):
            failures.append(f"{key}: got {summary[key]}, expected {EXPECTED_MANUSCRIPT[key]}")

    scalar_keys = [
        "event_mean", "event_median", "non_event_mean", "non_event_median",
        "mean_difference", "median_difference", "ci_low", "ci_high",
        "sign_flip_p", "mean_probability_superiority",
    ]
    for key in scalar_keys:
        if round(float(summary[key]), 3) != round(float(EXPECTED_MANUSCRIPT[key]), 3):
            failures.append(f"{key}: got {summary[key]:.6f}, expected {EXPECTED_MANUSCRIPT[key]:.3f}")

    got_diffs = sorted(round(float(x), 3) for x in summary["group_differences"])
    expected_diffs = sorted(round(float(x), 3) for x in EXPECTED_MANUSCRIPT["group_differences"])
    if got_diffs != expected_diffs:
        failures.append(f"group_differences: got {got_diffs}, expected {expected_diffs}")

    if failures:
        print("\nREPRODUCIBILITY CHECK FAILED")
        for failure in failures:
            print(f"  - {failure}")
        raise SystemExit(2)
    print("\nREPRODUCIBILITY CHECK PASSED")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("data"), help="Directory containing Figshare WAV/TXT files")
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"), help="Directory for generated tables/figures")
    parser.add_argument("--download", action="store_true", help="Download the immutable Figshare v1 source files")
    parser.add_argument("--verify", action="store_true", help="Verify recomputed outputs against manuscript values")
    args = parser.parse_args()

    if args.download:
        download_dataset(args.data_dir)
    if not args.data_dir.exists():
        parser.error(f"Data directory does not exist: {args.data_dir}. Use --download first.")

    files = list(args.data_dir.iterdir())
    wavs = sorted([p for p in files if p.suffix.lower() == ".wav"])
    if len(wavs) != 7:
        raise RuntimeError(f"Expected 7 WAV recordings from Figshare v1; found {len(wavs)} in {args.data_dir}")

    frames: list[pd.DataFrame] = []
    metadata: list[dict] = []
    for wav_path in wavs:
        ann_path = annotation_path_for(wav_path, files)
        print(f"analyzing: {wav_path.name} + {ann_path.name}")
        frame, meta = analyze_recording(wav_path, ann_path)
        frames.append(frame)
        metadata.append(meta)

    all_windows = pd.concat(frames, ignore_index=True)
    retained = all_windows[all_windows.window_class.isin(["event", "non_event"])].copy()
    table1, table2, table3, summary = summarize(retained, metadata)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    all_windows.to_csv(args.output_dir / "window_level_results.csv", index=False)
    table1.to_csv(args.output_dir / "table1_pooled_summary.csv", index=False)
    table2.to_csv(args.output_dir / "table2_date_group_summary.csv", index=False)
    table3.to_csv(args.output_dir / "table3_recording_summary.csv", index=False)
    (args.output_dir / "analysis_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    make_figures(retained, table2, args.output_dir)

    print("\nAnalysis summary")
    print(json.dumps(summary, indent=2))
    print(f"\nOutputs written to: {args.output_dir.resolve()}")

    if args.verify:
        verify_against_manuscript(summary)


if __name__ == "__main__":
    main()
