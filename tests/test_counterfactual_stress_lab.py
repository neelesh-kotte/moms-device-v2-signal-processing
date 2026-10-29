import tempfile
import unittest
from pathlib import Path

import numpy as np
from scipy.io import wavfile

from counterfactual_stress_lab import (
    feature_per_window, make_conditions, resample_audio, run, to_float_mono
)


class CounterfactualStressLabTests(unittest.TestCase):
    def setUp(self):
        sr = 8000
        t = np.arange(sr * 2) / sr
        self.x = 0.18 * np.sin(2 * np.pi * 240 * t) + 0.04 * np.sin(2 * np.pi * 700 * t)

    def test_global_gain_leaves_band_ratio_nearly_invariant(self):
        base = np.median(feature_per_window(self.x))
        gained = np.median(feature_per_window(self.x * 0.5))
        self.assertAlmostEqual(float(base), float(gained), places=10)

    def test_conditions_are_reproducible(self):
        a = make_conditions(self.x, 8000)
        b = make_conditions(self.x, 8000)
        self.assertEqual([x[0] for x in a], [x[0] for x in b])
        np.testing.assert_allclose(a[3][2], b[3][2])

    def test_stress_report_has_baseline_and_six_probes(self):
        with tempfile.TemporaryDirectory() as td:
            wav = Path(td) / "sample.wav"
            out = Path(td) / "out"
            pcm = np.int16(np.clip(self.x, -1, 1) * 32767)
            wavfile.write(wav, 8000, pcm)
            report = run(wav, out)
            self.assertEqual(len(report["conditions"]), 7)
            self.assertEqual(report["conditions"][0]["condition"], "baseline")
            self.assertEqual(report["conditions"][0]["absolute_change_from_baseline"], 0.0)
            self.assertTrue((out / "stress_report.json").exists())
            self.assertTrue((out / "stress_report.csv").exists())

    def test_resample_and_float_conversion(self):
        converted = to_float_mono(np.array([0, 1000, -1000], dtype=np.int16))
        self.assertEqual(converted.shape, (3,))
        resampled = resample_audio(np.sin(np.arange(4800) / 10), 48000)
        self.assertEqual(len(resampled), 800)


if __name__ == "__main__":
    unittest.main()
