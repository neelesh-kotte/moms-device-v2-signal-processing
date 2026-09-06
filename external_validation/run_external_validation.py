#!/usr/bin/env python3
"""Run the fixed external-corpus validation protocol for MOM.

This runner never contains or redistributes the public audio. It downloads the
public Kaggle archive when requested, discovers the published master-table
format (or matching sidecar annotations), and writes fresh window-level and
subject-level results.

The reported manuscript targets are used only by --verify-targets. They are
never substituted into the calculations.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import itertools
import json
import os
import re
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

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

KAGGLE_DATASET_URL = (
    "https://www.kaggle.com/api/v1/datasets/download/robertnowak/bowel-sounds"
)
TARGETS_PATH = Path(__file__).with_name("expected_external_summary.json")

EVENT_LABELS = {
    "sb",
    "single",
    "singleburst",
    "mb",
    "multiple",
    "multipleburst",
    "db",
    "distinct",
    "distinctburst",
    "crs",
    "continuous",
    "continuousrandom",
    "hs",
    "harmonic",
}
NON_EVENT_LABELS = {
    "none",
    "silence",
    "silent",
    "negative",
    "non",
    "nonevent",
    "no",
    "0",
}


@dataclass(frozen=True)
class Annotation:
    start: float
    end: float
    kind: str
    raw_label: str


@dataclass(frozen=True)
class Record:
    audio_path: Path
    subject_id: str
    source_label: str | None = None
    annotations: tuple[Annotation, ...] = ()
    source_table: str = ""


def canonical(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).strip().lower())


def label_kind(value: object) -> str:
    """Map published label text to the binary endpoint without guessing silently."""
    raw = str(value).strip()
    token = canonical(raw)
    if not token:
        raise ValueError("Encountered an empty event label.")
    if (
        token in NON_EVENT_LABELS
        or token.startswith("none")
        or "silence" in token
        or "nobowelsound" in token
        or "nosignificantbowel" in token
    ):
        return "non_event"
    if token in EVENT_LABELS or any(
        word in token
        for word in ("single", "distinct", "multiple", "continuous", "harmonic")
    ):
        return "event"
    raise ValueError(
        f"Unrecognized label {raw!r}. Add an explicit mapping only after checking "
        "the source dataset documentation."
    )


def read_delimited_rows(path: Path) -> list[list[str]]:
    text = path.read_text(encoding="utf-8-sig")
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return [row for row in csv.reader(io.StringIO(text), dialect) if any(x.strip() for x in row)]


def find_column(fieldnames: Iterable[str], aliases: set[str]) -> str | None:
    by_canonical = {canonical(name): name for name in fieldnames if name is not None}
    for alias in aliases:
        found = by_canonical.get(canonical(alias))
        if found is not None:
            return found
    return None


def resolve_audio_path(raw_value: object, table_path: Path, root: Path, by_name: dict[str, list[Path]]) -> Path:
    raw = str(raw_value).strip().replace("\\", "/")
    if not raw:
        raise ValueError(f"Empty audio path in {table_path.name}.")
    raw_path = Path(raw)
    direct_candidates = [
        table_path.parent / raw_path,
        root / raw_path,
        table_path.parent / raw_path.name,
        root / raw_path.name,
    ]
    for candidate in direct_candidates:
        if candidate.is_file() and candidate.suffix.lower() == ".wav":
            return candidate.resolve()
    matches = by_name.get(raw_path.name.lower(), [])
    if len(matches) == 1:
        return matches[0].resolve()
    if not matches:
        raise FileNotFoundError(
            f"Could not resolve {raw_value!r} from {table_path.name}. "
            "Keep the downloaded audio and label files under --data-dir."
        )
    raise RuntimeError(
        f"More than one WAV file matches {raw_value!r}; use a manifest with an unambiguous path."
    )


def discover_master_records(root: Path, wavs: list[Path]) -> list[Record]:
    by_name: dict[str, list[Path]] = {}
    for wav_path in wavs:
        by_name.setdefault(wav_path.name.lower(), []).append(wav_path)

    path_aliases = {
        "path",
        "wavpath",
        "wavfile",
        "newwavfile",
        "audiofile",
        "filename",
        "file",
    }
    label_aliases = {"label", "category", "class", "target", "eventlabel"}
    subject_aliases = {
        "patientid",
        "patentid",
        "subjectid",
        "participantid",
        "subject",
        "participant",
        "patient",
    }

    records: list[Record] = []
    tables_seen = 0
    for table_path in sorted(root.rglob("*")):
        if table_path.suffix.lower() not in {".csv", ".cvs"}:
            continue
        rows = read_delimited_rows(table_path)
        if not rows:
            continue
        headers = rows[0]
        path_col = find_column(headers, path_aliases)
        label_col = find_column(headers, label_aliases)
        subject_col = find_column(headers, subject_aliases)
        if path_col is None or label_col is None:
            continue
        if subject_col is None:
            raise ValueError(
                f"{table_path} has an audio and label column but no subject/patient ID column. "
                "Equal-subject inference requires an explicit subject ID."
            )
        tables_seen += 1
        header_index = {name: i for i, name in enumerate(headers)}
        seen_paths: dict[Path, tuple[str, str]] = {}
        for values in rows[1:]:
            if len(values) < len(headers):
                values = values + [""] * (len(headers) - len(values))
            row = {name: values[index] for name, index in header_index.items()}
            raw_audio = row.get(path_col, "")
            raw_label = row.get(label_col, "")
            subject_id = str(row.get(subject_col, "")).strip()
            if not raw_audio or not raw_label or not subject_id:
                continue
            audio_path = resolve_audio_path(raw_audio, table_path, root, by_name)
            kind = label_kind(raw_label)
            prior = seen_paths.get(audio_path)
            if prior is not None and prior != (subject_id, kind):
                raise ValueError(
                    f"{audio_path.name} appears with conflicting subject/label rows in {table_path}."
                )
            if prior is not None:
                continue
            seen_paths[audio_path] = (subject_id, kind)
            records.append(
                Record(
                    audio_path=audio_path,
                    subject_id=subject_id,
                    source_label=str(raw_label).strip(),
                    source_table=table_path.name,
                )
            )
    if tables_seen:
        return records
    return []


def parse_annotation_file(path: Path) -> tuple[Annotation, ...]:
    """Parse start/end/label rows from a matching sidecar file."""
    text = path.read_text(encoding="utf-8-sig")
    rows = read_delimited_rows(path) if path.suffix.lower() in {".csv", ".cvs", ".tsv"} else []
    annotations: list[Annotation] = []

    if rows:
        headers = rows[0]
        start_col = find_column(headers, {"start", "starttime", "onset", "begin", "beginsec"})
        end_col = find_column(headers, {"end", "endtime", "offset", "stop", "endsec"})
        label_col = find_column(headers, {"label", "category", "class", "event", "type"})
        if start_col and end_col and label_col:
            indices = {name: i for i, name in enumerate(headers)}
            for values in rows[1:]:
                values = values + [""] * max(0, len(headers) - len(values))
                try:
                    start = float(values[indices[start_col]])
                    end = float(values[indices[end_col]])
                except (ValueError, IndexError):
                    continue
                raw_label = values[indices[label_col]].strip()
                if not raw_label:
                    continue
                if end < start:
                    start, end = end, start
                annotations.append(Annotation(start, end, label_kind(raw_label), raw_label))
            if annotations:
                return tuple(annotations)

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        fields = [field for field in re.split(r",|\t+|\s+", line) if field]
        numeric: list[tuple[int, float]] = []
        for index, field in enumerate(fields):
            try:
                numeric.append((index, float(field)))
            except ValueError:
                pass
        if len(numeric) < 2:
            continue
        start_index, start = numeric[0]
        end_index, end = numeric[1]
        label = next(
            (field for index, field in enumerate(fields) if index not in {start_index, end_index}),
            None,
        )
        if label is None:
            continue
        if end < start:
            start, end = end, start
        annotations.append(Annotation(start, end, label_kind(label), label))
    if not annotations:
        raise ValueError(f"No start/end/label annotations could be parsed from {path}.")
    return tuple(annotations)


def sidecar_for(wav_path: Path, root: Path) -> Path | None:
    candidates = [
        candidate
        for candidate in root.rglob("*")
        if candidate.suffix.lower() in {".csv", ".cvs", ".txt", ".tsv"}
        and candidate.stem.lower() == wav_path.stem.lower()
    ]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        csv_candidates = [p for p in candidates if p.suffix.lower() in {".csv", ".cvs"}]
        if len(csv_candidates) == 1:
            return csv_candidates[0]
        raise RuntimeError(f"More than one sidecar annotation file matches {wav_path.name}.")
    return None


def discover_records(root: Path) -> tuple[list[Record], str]:
    wavs = sorted(path for path in root.rglob("*.wav") if path.is_file())
    if not wavs:
        raise RuntimeError(f"No WAV files found below {root}. Use --download or provide --data-dir.")

    master_records = discover_master_records(root, wavs)
    if master_records:
        return master_records, "master_table"

    records: list[Record] = []
    for wav_path in wavs:
        annotation_path = sidecar_for(wav_path, root)
        if annotation_path is None:
            raise RuntimeError(
                f"No master table or matching sidecar annotation found for {wav_path.name}."
            )
        annotations = parse_annotation_file(annotation_path)
        subject_id = wav_path.stem.split("_")[0].strip() or wav_path.stem
        records.append(
            Record(
                audio_path=wav_path.resolve(),
                subject_id=subject_id,
                annotations=annotations,
                source_table=annotation_path.name,
            )
        )
    return records, "sidecar_annotations"


def normalize_audio(data: np.ndarray) -> np.ndarray:
    if data.ndim == 2:
        if data.shape[1] != 1:
            raise ValueError("Expected mono recordings; found multi-channel audio.")
        data = data[:, 0]
    if np.issubdtype(data.dtype, np.integer):
        info = np.iinfo(data.dtype)
        scale = max(abs(info.min), abs(info.max))
        return data.astype(np.float64) / scale
    return data.astype(np.float64)


def band_energy_ratio(window: np.ndarray) -> float:
    centered = window.astype(np.float64) - np.mean(window)
    tapered = centered * signal.windows.hann(len(centered), sym=False)
    spectrum = np.fft.rfft(tapered)
    power = np.abs(spectrum) ** 2
    freqs = np.fft.rfftfreq(len(centered), d=1.0 / TARGET_FS)
    numerator = (freqs >= NUMERATOR_BAND[0]) & (freqs <= NUMERATOR_BAND[1])
    denominator = (freqs >= DENOMINATOR_BAND[0]) & (freqs <= DENOMINATOR_BAND[1])
    denominator_power = float(np.sum(power[denominator]))
    if denominator_power <= 0:
        return float("nan")
    return float(np.sum(power[numerator]) / denominator_power)


def overlaps(start: float, end: float, annotation: Annotation) -> bool:
    return start < annotation.end and end > annotation.start


def classify_window(start: float, end: float, annotations: tuple[Annotation, ...]) -> str:
    overlapping = [annotation for annotation in annotations if overlaps(start, end, annotation)]
    if any(annotation.kind == "event" for annotation in overlapping):
        return "event"
    if any(annotation.kind == "non_event" for annotation in overlapping):
        return "non_event"
    if overlapping:
        return "excluded"
    if any(
        abs(start - annotation.start) < BOUNDARY_BUFFER_SECONDS
        or abs(start - annotation.end) < BOUNDARY_BUFFER_SECONDS
        for annotation in annotations
    ):
        return "excluded"
    return "non_event"


def analyze_record(record: Record) -> tuple[list[dict], dict]:
    source_fs, raw = wavfile.read(record.audio_path)
    audio = normalize_audio(raw)
    audio = audio - np.mean(audio)
    if source_fs != TARGET_FS:
        gcd = np.gcd(source_fs, TARGET_FS)
        audio = signal.resample_poly(audio, TARGET_FS // gcd, source_fs // gcd)

    n_complete = len(audio) // WINDOW_SAMPLES
    rows: list[dict] = []
    counts = {"event": 0, "non_event": 0, "excluded": 0}
    for window_index in range(n_complete):
        start_sample = window_index * WINDOW_SAMPLES
        stop_sample = start_sample + WINDOW_SAMPLES
        start = start_sample / TARGET_FS
        end = stop_sample / TARGET_FS
        if record.annotations:
            window_class = classify_window(start, end, record.annotations)
        else:
            window_class = label_kind(record.source_label or "")
        counts[window_class] += 1
        ratio = (
            band_energy_ratio(audio[start_sample:stop_sample])
            if window_class in {"event", "non_event"}
            else float("nan")
        )
        rows.append(
            {
                "subject_id": record.subject_id,
                "source_file": record.audio_path.name,
                "source_table": record.source_table,
                "source_label": record.source_label or "",
                "window_index": window_index,
                "start_seconds": start,
                "end_seconds": end,
                "window_class": window_class,
                "band_energy_ratio": ratio,
            }
        )
    return rows, {
        "subject_id": record.subject_id,
        "source_file": record.audio_path.name,
        "source_sample_rate": int(source_fs),
        "complete_windows": n_complete,
        "event_windows": counts["event"],
        "non_event_windows": counts["non_event"],
        "excluded_windows": counts["excluded"],
    }


def probability_superiority(event_values: np.ndarray, non_values: np.ndarray) -> float:
    u = stats.mannwhitneyu(
        event_values, non_values, alternative="two-sided", method="auto"
    ).statistic
    return float(u / (len(event_values) * len(non_values)))


def exact_two_sided_sign_flip(values: np.ndarray) -> float:
    if len(values) == 0:
        return float("nan")
    observed = abs(float(np.mean(values)))
    null_values = []
    for signs in itertools.product((-1.0, 1.0), repeat=len(values)):
        null_values.append(abs(float(np.mean(values * np.asarray(signs)))))
    return float(np.mean(np.asarray(null_values) >= observed - 1e-15))


def bootstrap_ci(values: np.ndarray, seed: int = 20260906, repetitions: int = 10000) -> tuple[float, float]:
    if len(values) == 0:
        return float("nan"), float("nan")
    if len(values) == 1:
        value = float(values[0])
        return value, value
    rng = np.random.default_rng(seed)
    draws = rng.choice(values, size=(repetitions, len(values)), replace=True)
    means = np.mean(draws, axis=1)
    low, high = np.quantile(means, [0.025, 0.975])
    return float(low), float(high)


def summarize(window_frame: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    retained = window_frame[window_frame["window_class"].isin(["event", "non_event"])]
    subject_rows: list[dict] = []
    for subject_id, group in retained.groupby("subject_id", sort=True):
        event = group.loc[group.window_class == "event", "band_energy_ratio"].dropna().to_numpy()
        non_event = group.loc[group.window_class == "non_event", "band_energy_ratio"].dropna().to_numpy()
        if len(event) == 0 or len(non_event) == 0:
            continue
        event_median = float(np.median(event))
        non_event_median = float(np.median(non_event))
        subject_rows.append(
            {
                "subject_id": str(subject_id),
                "event_windows": int(len(event)),
                "non_event_windows": int(len(non_event)),
                "event_median": event_median,
                "non_event_median": non_event_median,
                "median_difference": event_median - non_event_median,
                "rank_probability_event_gt_non_event": probability_superiority(event, non_event),
            }
        )

    subject_summary = pd.DataFrame(subject_rows)
    if subject_summary.empty:
        raise RuntimeError("No subject had both event and non-event windows after filtering.")

    median_differences = subject_summary["median_difference"].to_numpy(dtype=float)
    rank_probabilities = subject_summary[
        "rank_probability_event_gt_non_event"
    ].to_numpy(dtype=float)
    median_ci = bootstrap_ci(median_differences)
    rank_ci = bootstrap_ci(rank_probabilities, seed=20260907)

    summary = {
        "protocol": {
            "target_sample_rate_hz": TARGET_FS,
            "window_seconds": WINDOW_SECONDS,
            "numerator_band_hz": list(NUMERATOR_BAND),
            "denominator_band_hz": list(DENOMINATOR_BAND),
            "boundary_buffer_seconds": BOUNDARY_BUFFER_SECONDS,
            "subject_weighting": "equal over subjects with both eligible classes",
        },
        "total_complete_windows": int(len(window_frame)),
        "event_windows": int((window_frame.window_class == "event").sum()),
        "non_event_windows": int((window_frame.window_class == "non_event").sum()),
        "excluded_windows": int((window_frame.window_class == "excluded").sum()),
        "n_subjects_observed": int(window_frame.subject_id.nunique()),
        "eligible_subjects": int(len(subject_summary)),
        "primary": {
            "estimand": "equal-subject mean of event-minus-non-event median ratios",
            "mean_median_difference": float(np.mean(median_differences)),
            "bootstrap_ci_95_low": median_ci[0],
            "bootstrap_ci_95_high": median_ci[1],
            "exact_two_sided_sign_flip_p": exact_two_sided_sign_flip(median_differences),
        },
        "exploratory_post_hoc": {
            "estimand": "equal-subject mean of within-subject P(event > non-event)",
            "mean_rank_probability": float(np.mean(rank_probabilities)),
            "bootstrap_ci_95_low": rank_ci[0],
            "bootstrap_ci_95_high": rank_ci[1],
            "exact_two_sided_sign_flip_p": exact_two_sided_sign_flip(
                rank_probabilities - 0.5
            ),
        },
    }
    return subject_summary, summary


def download_kaggle_archive(data_dir: Path) -> Path:
    data_dir.mkdir(parents=True, exist_ok=True)
    archive = data_dir / "robertnowak-bowel-sounds.zip"
    if not archive.exists():
        print(f"downloading public archive: {KAGGLE_DATASET_URL}")
        urllib.request.urlretrieve(KAGGLE_DATASET_URL, archive)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    print(f"archive sha256: {digest}")
    extraction_root = data_dir / "kaggle_bowel_sounds"
    extraction_root.mkdir(parents=True, exist_ok=True)
    root_resolved = extraction_root.resolve()
    with zipfile.ZipFile(archive) as zipped:
        for member in zipped.infolist():
            target = (extraction_root / member.filename).resolve()
            if os.path.commonpath([str(root_resolved), str(target)]) != str(root_resolved):
                raise RuntimeError(f"Unsafe archive member: {member.filename}")
            zipped.extract(member, extraction_root)
    return extraction_root


def write_outputs(
    output_dir: Path,
    window_frame: pd.DataFrame,
    subject_summary: pd.DataFrame,
    summary: dict,
    discovery_mode: str,
    records: list[Record],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    window_frame.to_csv(output_dir / "window_level_results.csv", index=False)
    subject_summary.to_csv(output_dir / "subject_summary.csv", index=False)
    (output_dir / "analysis_summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8"
    )
    manifest = {
        "data_source": "Kaggle robertnowak/bowel-sounds",
        "discovery_mode": discovery_mode,
        "record_count": len(records),
        "audio_files_are_not_copied_to_output": True,
        "protocol": summary["protocol"],
    }
    (output_dir / "run_manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8"
    )


def verify_targets(summary: dict, targets_path: Path, tolerance: float) -> None:
    targets = json.loads(targets_path.read_text(encoding="utf-8"))
    failures: list[str] = []
    for key in (
        "total_complete_windows",
        "event_windows",
        "non_event_windows",
        "excluded_windows",
        "n_subjects_observed",
        "eligible_subjects",
    ):
        if int(summary[key]) != int(targets[key]):
            failures.append(f"{key}: got {summary[key]}, target {targets[key]}")
    for path, key in (
        (("primary", "mean_median_difference"), "primary.mean_median_difference"),
        (("primary", "bootstrap_ci_95_low"), "primary.bootstrap_ci_95_low"),
        (("primary", "bootstrap_ci_95_high"), "primary.bootstrap_ci_95_high"),
        (("primary", "exact_two_sided_sign_flip_p"), "primary.exact_two_sided_sign_flip_p"),
        (("exploratory_post_hoc", "mean_rank_probability"), "exploratory.mean_rank_probability"),
        (("exploratory_post_hoc", "bootstrap_ci_95_low"), "exploratory.bootstrap_ci_95_low"),
        (("exploratory_post_hoc", "bootstrap_ci_95_high"), "exploratory.bootstrap_ci_95_high"),
        (("exploratory_post_hoc", "exact_two_sided_sign_flip_p"), "exploratory.exact_two_sided_sign_flip_p"),
    ):
        actual = float(summary[path[0]][path[1]])
        target_group = "exploratory" if path[0] == "exploratory_post_hoc" else "primary"
        expected_key = (
            "mean_rank_probability"
            if path[1] == "mean_rank_probability"
            else path[1]
        )
        expected = float(targets[target_group][expected_key])
        if not np.isfinite(actual) or abs(actual - expected) > tolerance:
            failures.append(f"{key}: got {actual:.6f}, target {expected:.6f}")
    if failures:
        print("EXTERNAL TARGET CHECK FAILED")
        for failure in failures:
            print(f"  - {failure}")
        raise SystemExit(2)
    print("EXTERNAL TARGET CHECK PASSED")


def run_self_test() -> None:
    with tempfile.TemporaryDirectory(prefix="mom-external-self-test-") as temp_dir:
        root = Path(temp_dir)
        sample_rate = TARGET_FS
        time = np.arange(WINDOW_SAMPLES * 4) / sample_rate
        event_audio = (0.6 * np.sin(2 * np.pi * 200 * time)).astype(np.float32)
        non_event_audio = (0.6 * np.sin(2 * np.pi * 800 * time)).astype(np.float32)
        wavfile.write(root / "event.wav", sample_rate, event_audio)
        wavfile.write(root / "non_event.wav", sample_rate, non_event_audio)
        (root / "segments.csv").write_text(
            "path,label,patient_id\n"
            "event.wav,SB,S1\n"
            "non_event.wav,NONE,S1\n",
            encoding="utf-8",
        )
        records, mode = discover_records(root)
        rows = []
        for record in records:
            record_rows, _ = analyze_record(record)
            rows.extend(record_rows)
        frame = pd.DataFrame(rows)
        subject_summary, summary = summarize(frame)
        assert mode == "master_table"
        assert len(frame) == 8
        assert summary["event_windows"] == 4
        assert summary["non_event_windows"] == 4
        assert summary["eligible_subjects"] == 1
        assert len(subject_summary) == 1
    print("SELF-TEST PASSED")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("data/external_corpus"),
        help="Directory containing the downloaded/extracted public corpus",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs/external_validation"),
        help="Directory for generated CSV/JSON results",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download and extract the public Kaggle archive",
    )
    parser.add_argument(
        "--verify-targets",
        action="store_true",
        help="Compare recomputed results with the recorded external-analysis targets",
    )
    parser.add_argument(
        "--target-tolerance",
        type=float,
        default=0.005,
        help="Absolute tolerance for floating-point target comparisons",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run the synthetic pipeline test and exit",
    )
    args = parser.parse_args()

    if args.self_test:
        run_self_test()
        return

    data_root = download_kaggle_archive(args.data_dir) if args.download else args.data_dir
    if not data_root.exists():
        parser.error(f"{data_root} does not exist. Use --download or provide --data-dir.")

    records, discovery_mode = discover_records(data_root)
    all_rows: list[dict] = []
    metadata: list[dict] = []
    for record in records:
        print(f"analyzing: {record.audio_path.name} [{record.subject_id}]")
        rows, meta = analyze_record(record)
        all_rows.extend(rows)
        metadata.append(meta)
    if not all_rows:
        raise RuntimeError("No complete 500 ms windows were produced.")

    window_frame = pd.DataFrame(all_rows)
    subject_summary, summary = summarize(window_frame)
    summary["discovery_mode"] = discovery_mode
    summary["source_records"] = len(records)
    write_outputs(
        args.output_dir,
        window_frame,
        subject_summary,
        summary,
        discovery_mode,
        records,
    )
    print(json.dumps(summary, indent=2, sort_keys=True))
    print(f"outputs written to: {args.output_dir.resolve()}")
    if args.verify_targets:
        verify_targets(summary, TARGETS_PATH, args.target_tolerance)


if __name__ == "__main__":
    main()
