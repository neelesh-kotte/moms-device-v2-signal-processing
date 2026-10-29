import unittest

from risk_aware_audit import audit_predictions


def row(truth, pred, confidence, quality, recording):
    return {
        "y_true": truth, "y_pred": pred, "confidence": confidence,
        "quality": quality, "recording_id": recording,
    }


class RiskAwareAuditTests(unittest.TestCase):
    def test_abstention_is_visible_and_coverage_is_reported(self):
        rows = [
            row(1, 1, 0.95, 0.90, "A"),
            row(1, 0, 0.80, 0.20, "A"),
            row(0, 0, 0.90, 0.90, "B"),
            row(0, 1, 0.55, 0.90, "B"),
        ]
        report = audit_predictions(rows, 0.70, 0.60)
        selective = report["selective_evaluation"]
        self.assertEqual(selective["n_total"], 4)
        self.assertEqual(selective["n_accepted"], 2)
        self.assertEqual(selective["n_abstained"], 2)
        self.assertAlmostEqual(selective["coverage"], 0.5)
        self.assertEqual(selective["accepted_metrics"]["fn"], 0)
        self.assertEqual(selective["accepted_metrics"]["fp"], 0)

    def test_recordings_are_reported_separately(self):
        rows = [
            row(1, 1, 0.9, 0.9, "A"),
            row(0, 0, 0.9, 0.9, "B"),
            row(0, 1, 0.9, 0.9, "B"),
        ]
        report = audit_predictions(rows)
        self.assertEqual(len(report["recording_level_summary"]), 2)
        self.assertEqual(report["recording_level_summary"][1]["recording_id"], "B")
        self.assertEqual(report["recording_level_summary"][1]["accepted_metrics"]["fp"], 1)

    def test_bad_threshold_fails(self):
        with self.assertRaises(ValueError):
            audit_predictions([row(1, 1, 0.9, 0.9, "A")], 1.2, 0.5)

    def test_weights_are_explicit_and_not_clinical(self):
        report = audit_predictions(
            [row(1, 0, 0.9, 0.9, "A")],
            false_negative_cost=3, false_positive_cost=1,
        )
        costs = report["analyst_defined_error_costs"]
        self.assertEqual(costs["weighted_errors_on_accepted_rows"], 3)
        self.assertIn("not clinical", costs["warning"].lower())


if __name__ == "__main__":
    unittest.main()
