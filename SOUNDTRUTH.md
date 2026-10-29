# SOUNDTRUTH: Counterfactual Acoustic Shortcut Audit

## Core idea

A model can appear to detect bowel-sound events while quietly relying on recording conditions that happen to correlate with the labels: microphone gain, background noise, sensor contact, movement, filtering, or dataset-specific recording signatures. If those conditions change outside the lab, performance may collapse.

**SOUNDTRUTH asks a sharper question than “How accurate is the model?”: “If the same underlying recording is changed only by a realistic nuisance, does the model suddenly change its answer?”**

This is inspired by research on shortcut learning and data-acquisition bias in medical AI. It is not claimed to be the first such method, and it does not prove causality on its own. The project-specific contribution is an auditable, paired challenge protocol applied to MOM's abdominal-acoustic pipeline.

## Why this is a better MOM fit than adding a bigger model

MOM already has evidence about gain, clipping, placement, contact, environmental noise, and recording variability. The device is low-cost, so robustness to those real-world conditions is central to its credibility. This project turns that engineering insight into a falsifiable AI experiment.

## Research question

**How often does an existing abdominal-acoustic classifier change its prediction when the same labeled recording is subjected to label-preserving, realistic recording perturbations, and which perturbations cause the largest error increase?**

Do not describe synthetic perturbations as equivalent to real device failures. Validate transformation ranges using the engineering setup and label them honestly.

## Implementation

- `counterfactual_acoustic_audit.py`: analyzes paired predictions from a frozen model for clean recordings and transformed versions.
- `tests/test_counterfactual_acoustic_audit.py`: tests prediction-flip accounting, pairing, label consistency, and duplicate rejection.
- `risk_aware_audit.py`: complementary utility for confidence/quality abstention.
- `RISK_AWARE_ACOUSTIC_AUDIT.md`: the related selective-evaluation protocol.

SOUNDTRUTH reports, for each transformation:
- number of paired examples;
- clean and altered accuracy on the *same paired subset*;
- prediction-flip rate;
- correct-to-incorrect and incorrect-to-correct counts;
- accuracy change;
- per-recording results, so repeated windows are not treated as independent participants.

## Quick start

Create a prediction CSV from the same frozen model run on each clean and perturbed recording:

```csv
sample_id,condition,y_true,y_pred,recording_id,confidence
sample_001,clean,1,1,recording_A,0.91
sample_001,background_noise,1,0,recording_A,0.68
sample_002,clean,0,0,recording_A,0.88
sample_002,background_noise,0,0,recording_A,0.82
```

These are illustrative rows, not real MOM results. Use unique sample IDs to pair the same underlying segment. Every transformation must preserve the true label for the target task; the script rejects a pair if the labels differ.

```bash
python counterfactual_acoustic_audit.py predictions.csv --output soundtruth_report.json
python -m unittest discover -s tests -v
```

The script audits model outputs; it does not synthesize transformed audio or run the model. That separation prevents us from claiming a robustness experiment has happened before a frozen model has actually been evaluated.

## Experimental design

1. **Define one narrow task and label source.** Keep event detection separate from hunger prediction or diagnosis. Existing public dataset annotations can support an event-detection task, subject to their limitations.
2. **Freeze the model and split by recording/subject first.** Never place overlapping windows from one recording in both train and test. Tune nothing on the final held-out data.
3. **Create paired conditions.** For each held-out segment, retain the original and create predeclared transformations grounded in measured engineering conditions, such as modest gain changes, recorded background noise, or sensor-contact perturbations. Keep transformations within plausible ranges and document parameters.
4. **Verify label preservation.** A transformation that masks the event or changes what the label should mean is not a valid label-preserving counterfactual. Exclude it from this specific test and report why.
5. **Run the same frozen model.** Record each condition's prediction and confidence; don't retrain between clean and perturbed conditions.
6. **Compare paired outcomes.** Report flip rate and paired accuracy change for each transformation, with recording-level results and uncertainty intervals where sample size permits.
7. **Compare with a simple baseline.** Evaluate the existing spectral feature and any classifier under the same splits and perturbations.
8. **Validate on actual hardware.** Public datasets are not MOM-device recordings. Bench tests should separately examine controlled gain, mounting/contact, and environmental noise, with appropriate adult/supervisor oversight.
9. **Predefine the main comparison.** Select one primary perturbation or a small justified set before inspecting the held-out results. Treat other analyses as exploratory.
10. **Report failures.** Include missing pairs, invalid transformations, model abstentions, all thresholds, and performance degradation—not only the best condition.

## What a strong result would look like

The interesting outcome is not necessarily that the model is robust. A strong study could show that a seemingly good baseline is brittle under one realistic nuisance, identify the failure conditions, and show whether a quality gate or a more invariant feature representation reduces that brittleness without destroying coverage. A negative result is scientifically useful too.

## Boundaries

This is a research audit, not a diagnostic system or evidence that MOM detects a disease, hunger state, or patient risk. Prediction flips identify sensitivity to tested transformations; they do not alone prove which internal feature the model used. Public data results do not establish performance on the physical device. Any eventual user-facing output should avoid clinical declarations without appropriate independent validation.

## Related literature

- *Shortcut learning in medical AI hinders generalization: method for estimating AI model generalization without external data.* npj Digital Medicine (2024). Across multiple clinical datasets, the paper discusses hidden data-acquisition biases and the risk of overestimating external performance. https://www.nature.com/articles/s41746-024-01118-4
- Brown et al. *Detecting shortcut learning for fair medical AI using shortcut testing.* Nature Communications (2023). https://www.nature.com/articles/s41467-023-39902-7
- WHO. *Medication safety for look-alike, sound-alike medicines* (2023). MISHEAR's motivating domain is a different problem, but the broader design lesson is relevant: evaluate specific high-consequence failure modes instead of relying only on a single aggregate score. https://www.who.int/publications/i/item/9789240058897
