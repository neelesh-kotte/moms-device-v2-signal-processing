# MOM Red-Team Bench

## The problem it tests

A bowel-sound algorithm can look strong on an overall score while missing labeled events or generating false positives on recordings it has never seen. A fair audit must keep windows from the same recording together and report event sensitivity and false positives separately—not just accuracy.

This benchmark is a concrete software experiment inspired by the general principle behind high-stakes AI auditing: measure the errors that matter for the task, then challenge the system under controlled changes.

## What it does

1. Takes a CSV of short, labelled audio clips.
2. Extracts seven interpretable acoustic features, including MOM's existing 120–480 Hz / 20–2,000 Hz power ratio.
3. Trains two standard baselines: logistic regression and random forest.
4. Holds out entire `recording_id` groups so adjacent clips from one recording do not leak between train and test.
5. Tests the held-out clips unchanged and under six probes: gain −6 dB, gain +6 dB, added noise at 20 dB SNR, added noise at 10 dB SNR, a 25 ms time shift, and hard clipping.
6. Reports event recall/sensitivity, specificity, false negatives, false positives, F1, AUROC, Brier score, prediction-flip rate, and mean probability shift.

The tool does **not** decide what a bowel sound is. The researcher must define labels using an appropriate annotation protocol and report how those labels were produced. It does not diagnose disease and is not clinically validated.

## Manifest format

Create a CSV with one row per labelled clip/window. Paths may be absolute or relative to the CSV file.

```csv
clip_path,recording_id,label
clips/rec01_event_01.wav,rec01,1
clips/rec01_background_01.wav,rec01,0
clips/rec02_event_01.wav,rec02,1
clips/rec02_background_01.wav,rec02,0
```

- `label=1`: the target event under the study's pre-defined annotation rules.
- `label=0`: non-event/background under those same rules.
- `recording_id`: the source recording or participant group; use the strictest independent group identifier available. Do not assign a new ID to each adjacent window.
- Use only data you are authorized to access. Do not include names or personal identifiers in the manifest.

At least 8 clips and 4 independent recording groups are required, but more independent recordings are strongly preferable. The script will fail if it cannot find a grouped train/test split with both classes in each partition.

## Run

Install dependencies:

```bash
python -m pip install -r requirements.txt
```

Run:

```bash
python mom_redteam_bench.py --manifest path/to/manifest.csv --out mom_redteam_report
```

Outputs:
- `redteam_report.json`: metrics, held-out recording IDs, settings, and limitations.
- `redteam_summary.csv`: one row per model and test condition.

## How to interpret results

- A drop in event recall means more labelled target clips were missed under that probe in this held-out sample.
- A rise in false positives means more labelled non-event clips were flagged as events.
- A prediction flip means the model crossed its 0.5 decision threshold after a probe.
- Probability shifts are model outputs, not calibrated probabilities unless calibration is separately demonstrated.
- Noise, clipping, and time shifts can change genuine acoustic information. They are challenge conditions, not guaranteed label-preserving transformations.
- A single grouped split is exploratory. For a strong research result, pre-register the conditions, repeat grouped splits or use leave-one-recording/subject-out validation, and reserve an external dataset for final evaluation.

## Research question

**When bowel-sound event classifiers are evaluated on recordings held out by source, which controlled recording changes produce the largest increase in missed target events or false positives—and do standard aggregate scores conceal those failures?**

Do not claim novelty or clinical benefit from the existence of this tool. The contribution must come from a carefully designed, reproducible experiment and independently supported results.
