import csv
import tempfile
import unittest
from pathlib import Path

import numpy as np
from scipy.io import wavfile

from mom_redteam_bench import CONDITIONS, extract_features, load_audio, run


class RedTeamBenchTests(unittest.TestCase):
    def test_features_are_finite_and_have_expected_width(self):
        sr = 8000
        t = np.arange(sr) / sr
        x = 0.15 * np.sin(2 * np.pi * 240 * t)
        features = extract_features(x)
        self.assertEqual(features.shape, (7,))
        self.assertTrue(np.all(np.isfinite(features)))

    def test_grouped_benchmark_writes_reports(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            clips = root / "clips"
            clips.mkdir()
            rows = []
            sr = 8000
            t = np.arange(sr) / sr
            # Each independent recording has both labels, with class-specific
            # acoustic patterns. This is a software fixture, not research data.
            for group in range(8):
                for label in (0, 1):
                    freq = (80 + group * 2) if label == 0 else (260 + group * 2)
                    x = 0.12 * np.sin(2 * np.pi * freq * t)
                    wav_path = clips / f"g{group}_l{label}.wav"
                    wavfile.write(wav_path, sr, np.int16(np.clip(x, -1, 1) * 32767))
                    rows.append({"clip_path": str(wav_path.relative_to(root)),
                                 "recording_id": f"rec{group}", "label": str(label)})
            manifest = root / "manifest.csv"
            with manifest.open("w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=["clip_path", "recording_id", "label"])
                writer.writeheader()
                writer.writerows(rows)
            out = root / "out"
            report = run(manifest, out, seed=17)
            self.assertEqual(report["split"]["method"], "GroupShuffleSplit by recording_id")
            self.assertTrue(set(report["split"]["train_recordings"]).isdisjoint(report["split"]["test_recordings"]))
            self.assertEqual(set(report["models"]), {"logistic_regression", "random_forest"})
            self.assertEqual(len(report["models"]["random_forest"]["conditions"]), len(CONDITIONS))
            self.assertTrue((out / "redteam_report.json").exists())
            self.assertTrue((out / "redteam_summary.csv").exists())

    def test_invalid_manifest_label_fails(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wav_path = root / "clip.wav"
            wavfile.write(wav_path, 8000, np.zeros(8000, dtype=np.int16))
            manifest = root / "manifest.csv"
            manifest.write_text("clip_path,recording_id,label\nclip.wav,rec0,event\n")
            from mom_redteam_bench import read_manifest
            with self.assertRaises(ValueError):
                read_manifest(manifest)


if __name__ == "__main__":
    unittest.main()
