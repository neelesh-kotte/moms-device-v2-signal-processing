import unittest

import numpy as np

from pulsecheck import compare_recordings


class PulseCheckTests(unittest.TestCase):
    def setUp(self):
        self.fs = 4000
        t = np.arange(0, 1.0, 1 / self.fs)
        rng = np.random.default_rng(7)
        self.reference = rng.normal(0, 0.002, len(t))
        pulse = (t >= 0.4) & (t < 0.6)
        self.reference[pulse] += 0.12 * np.sin(2 * np.pi * 180 * (t[pulse] - 0.4))
        self.test = self.reference.copy()

    def test_matching_pulse_passes_bench_check(self):
        result = compare_recordings(self.reference, self.test, self.fs, 0.4, 0.6)
        self.assertEqual(result["status"], "PASS_BENCH_CHECK")
        self.assertGreater(result["metrics"]["pulse_shape_correlation"], 0.99)

    def test_missing_pulse_triggers_retest(self):
        test = self.test.copy()
        test[int(0.4 * self.fs):int(0.6 * self.fs)] = 0
        result = compare_recordings(self.reference, test, self.fs, 0.4, 0.6)
        self.assertEqual(result["status"], "RETEST_AND_INSPECT")
        self.assertFalse(result["checks"]["pulse_above_baseline_noise"])
        self.assertTrue(np.isfinite(result["metrics"]["test_pulse_snr_db"]))

    def test_amplitude_out_of_range_triggers_retest(self):
        test = self.test.copy()
        test[int(0.4 * self.fs):int(0.6 * self.fs)] *= 0.1
        result = compare_recordings(self.reference, test, self.fs, 0.4, 0.6)
        self.assertEqual(result["status"], "RETEST_AND_INSPECT")
        self.assertFalse(result["checks"]["pulse_amplitude_ratio"])

    def test_different_lengths_rejected(self):
        with self.assertRaisesRegex(ValueError, "equal duration"):
            compare_recordings(self.reference, self.test[:-1], self.fs, 0.4, 0.6)

    def test_bad_pulse_window_rejected(self):
        with self.assertRaises(ValueError):
            compare_recordings(self.reference, self.test, self.fs, 0.8, 0.7)


if __name__ == "__main__":
    unittest.main()
