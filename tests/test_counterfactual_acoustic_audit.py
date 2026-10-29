import unittest

from counterfactual_acoustic_audit import audit_counterfactuals


def row(sample, condition, truth, pred, recording="R1", confidence=0.9):
    return {
        "sample_id": sample, "condition": condition, "y_true": truth,
        "y_pred": pred, "recording_id": recording, "confidence": confidence,
    }


class CounterfactualAuditTests(unittest.TestCase):
    def test_reports_prediction_flips_and_accuracy_change(self):
        rows = [
            row("a", "clean", 1, 1),
            row("a", "noise", 1, 0),
            row("b", "clean", 0, 0, "R2"),
            row("b", "noise", 0, 0, "R2"),
        ]
        report = audit_counterfactuals(rows)
        noise = report["results_by_perturbation"]["noise"]
        self.assertEqual(noise["prediction_flip_count"], 1)
        self.assertAlmostEqual(noise["prediction_flip_rate"], 0.5)
        self.assertEqual(noise["correct_to_incorrect_count"], 1)
        self.assertAlmostEqual(noise["accuracy_change_altered_minus_clean"], -0.5)

    def test_missing_clean_pair_is_not_counted(self):
        rows = [
            row("a", "clean", 1, 1),
            row("a", "noise", 1, 1),
            row("b", "noise", 0, 1),
        ]
        report = audit_counterfactuals(rows)
        self.assertEqual(report["results_by_perturbation"]["noise"]["n_paired_samples"], 1)

    def test_rejects_label_changing_perturbation(self):
        rows = [row("a", "clean", 1, 1), row("a", "noise", 0, 1)]
        with self.assertRaises(ValueError):
            audit_counterfactuals(rows)

    def test_rejects_duplicate_condition_pair(self):
        rows = [
            row("a", "clean", 1, 1),
            row("a", "clean", 1, 1),
        ]
        with self.assertRaises(ValueError):
            audit_counterfactuals(rows)


if __name__ == "__main__":
    unittest.main()
