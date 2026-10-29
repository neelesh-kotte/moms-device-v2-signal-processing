# MOM SenseLoop: Risk-Aware Acoustic AI Audit

## The idea

Many model summaries compress performance into one number. A high average score can conceal failures concentrated in noisy recordings, particular recording sessions, or one class. MOM can make those weaknesses visible by evaluating **what the model gets wrong, when it abstains, and how much data it can safely interpret under predefined research rules**.

This borrows the evaluation philosophy behind safety-oriented AI auditing, but adapts it to MOM's actual domain: abdominal-acoustic event research. It does not turn MOM into a medication-speech recognizer, and it does not imply that bowel sounds can diagnose hunger, disease, or another medical state.

## What is added

- `risk_aware_audit.py`: evaluates predictions from an existing model using both ordinary metrics and a selective mode.
- Confidence and signal-quality gates: predictions below either threshold are marked as abstentions. They are not silently removed.
- Coverage/error trade-off: reports the fraction of rows accepted and the sensitivity, specificity, precision, false-negative rate, false-positive rate, and balanced accuracy on accepted rows.
- Recording-level breakdown: reports metrics and coverage for each recording, making it easier to spot sessions where performance collapses.
- Explicit asymmetric error weights: optional, analyst-defined costs make the selected error priority transparent. They are illustrative weights, **not estimates of clinical harm**.
- Unit tests: basic tests cover abstention, recording breakdown, invalid thresholds, and transparent cost weights.

## Quick start

Prepare a CSV with these exact columns:

```csv
y_true,y_pred,confidence,quality,recording_id
1,1,0.92,0.88,recording_A
1,0,0.62,0.40,recording_A
0,0,0.91,0.93,recording_B
0,1,0.84,0.76,recording_B
```

Then run:

```bash
python risk_aware_audit.py predictions.csv --confidence-threshold 0.70 --quality-threshold 0.60 --output audit_report.json
```

The example values are illustrative only. Thresholds must be chosen on a validation set, documented before final evaluation, and never tuned on the test set. The input confidence must come from the evaluated model's defined confidence method; the quality score must come from a documented signal-quality method. Do not use made-up values or substitute a model's confidence for calibration.

Run tests:

```bash
python -m unittest discover -s tests -v
```

## Recommended experimental protocol

1. **Freeze the question and endpoints.** Keep the existing spectral-feature result as its own analysis. Treat this audit as a separate model-evaluation extension.
2. **Split by subject or recording before tuning.** Do not randomly split overlapping windows from the same source across training and test. When subject identity is unavailable, state that limitation and use recording-grouped splits.
3. **Set gates on validation data only.** Record the chosen confidence and signal-quality thresholds before the held-out test.
4. **Compare three views on the same held-out recordings:** (a) all predictions, (b) selective predictions after abstention, and (c) the simplest baseline. Always show coverage beside accepted-only performance.
5. **Report both classes and every recording.** Include sensitivity, specificity, false-positive and false-negative counts/rates, confusion matrices, and per-recording coverage. If sample size permits, include recording- or subject-level uncertainty intervals.
6. **Run sensitivity analyses.** Show how results change across predeclared thresholds and more than one plausible error-cost setting. Do not report only the setting that looks best.
7. **Test domain shift.** Keep external datasets separate from device engineering tests. Public-dataset performance does not establish performance on MOM hardware.
8. **Publish failures.** Include the number of abstentions, missing/invalid recordings, threshold choices, failed tests, and all exclusions.
9. **Avoid medical claims.** The output is an acoustic research audit. No diagnosis, clinical warning, food restriction, treatment recommendation, or claim of patient benefit is justified without appropriately designed independent validation and oversight.

## What would count as a meaningful result?

A credible result is not simply a higher F1 score. It would show, on held-out recordings, whether quality/confidence gating changes the error profile at a clearly reported coverage level, whether errors cluster in particular recordings, and whether the behavior generalizes across datasets. A system that appears more accurate only because it abstains on most difficult examples must be reported as such.

## Current limitations

This implementation is an evaluation utility, not a trained AI model and not a full real-time integration into the ESP32. It expects an existing model's predictions, a documented confidence score, a documented signal-quality score, and ground-truth labels. It does not yet calculate calibrated probabilities, detect acoustic events, prove that a signal is clinically meaningful, or connect to the live device UI.

## Why this direction fits MOM

MOM already studies signal quality, recording variability, cross-dataset differences, and the danger of treating many windows as independent evidence. A selective audit makes these principles executable and testable. It is a defensible step toward an acoustic system that communicates uncertainty instead of presenting every output as equally trustworthy.

## References and inspiration

- World Health Organization. *Medication safety for look-alike, sound-alike medicines* (2023). This supports the broader safety principle that aggregate process measures can miss important error modes; it is not evidence about MOM or bowel-sound classification. https://www.who.int/publications/i/item/9789240058897
- Institute for Safe Medication Practices. *ISMP List of Confused Drug Names* (2023). Used only as inspiration for risk-focused auditing, not as a dataset for MOM. https://www.ismp.org/resources/confused-drug-names-list
- Saito, T. & Rehmsmeier, M. (2015). The Precision-Recall Plot Is More Informative than the ROC Plot When Evaluating Binary Classifiers on Imbalanced Datasets. *PLOS ONE*, 10(3), e0118432. https://doi.org/10.1371/journal.pone.0118432
