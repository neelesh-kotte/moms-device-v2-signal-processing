# Cross-Corpus Bowel-Sound Spectral Analysis

This repository supports research on whether annotated bowel-sound events differ from eligible non-event periods in a fixed spectral feature:

`power(120–480 Hz) / power(20–2,000 Hz)`

The project began as a seven-recording derivation analysis and was extended into an independent cross-corpus transport study. The updated manuscripts distinguish a failed primary median-shift test from an exploratory within-subject rank pattern.

## Manuscripts

- **Journal of Emerging Investigators manuscript:** *A fixed bowel-sound spectral ratio shows rank separation but an unstable median shift across datasets*
- **Columbia Junior Science Journal research brief:** *Cross-corpus transport of a fixed bowel-sound spectral ratio: failed median transfer and an exploratory rank pattern*

## Study design

No new human-participant data were collected. The work reanalyzes two public, de-identified acoustic datasets.

| | Derivation corpus | Independent transport corpus |
|---|---:|---:|
| Source | Figshare, `10.6084/m9.figshare.28595741.v1` | Kaggle, `10.34740/KAGGLE/DSV/2825527` |
| Analysis units | 7 recordings; participant IDs unresolved | 19 anonymized subjects; 16 with both guarded classes |
| Complete 500 ms windows | 10,922 | 6,424 |
| Event windows | 3,881 | 3,050 |
| Eligible non-event windows | 5,878 | 2,340 |
| Excluded windows | 1,163 | 1,034 |

The derivation release does not provide verified recording-to-participant or recording-to-sensor mappings. Its results are therefore recording-level and conditional, not verified participant-level replication.

## Fixed signal-processing estimator

For both corpora, the analysis:

1. Converts audio to floating point and mean-centers each reconstructed recording.
2. Resamples audio to 8 kHz using polyphase resampling.
3. Divides audio into non-overlapping 500 ms windows.
4. Labels a window as an event when it overlaps a confirmed annotation.
5. Defines an eligible non-event window as annotation-free and beginning at least 500 ms from annotation boundaries.
6. Mean-centers each window and applies the symmetric Hann taper from `numpy.hanning(4000)`.
7. Computes a one-sided real FFT.
8. Divides inclusive 120–480 Hz power by inclusive 20–2,000 Hz power.

Pooled windows are reported descriptively. Population-level inference does not treat correlated windows from the same recording or subject as independent biological replicates.

## Main findings

### Derivation corpus

- Pooled event median: **0.426**
- Pooled eligible non-event median: **0.089**
- Six of seven recording-level median differences were positive.
- Conditional four-group mean difference: **0.218** (95% CI **−0.023 to 0.459**; exact sign-flip **p = 0.125**).
- Mean within-recording probability of superiority: **0.718** (95% CI **0.570–0.865**; six of seven recordings above 0.5).
- Event-associated power changes were **6.63-fold** in the target band, **2.43-fold** outside the target band, and **4.19-fold** across 20–2,000 Hz.

These results establish an internal recording-level association, not participant-level validation or a biological mechanism.

### Independent transport corpus

The frozen primary endpoint was the equal-subject mean of each subject's event-minus-non-event median-ratio difference.

- Primary mean median difference: **0.0089** (95% CI **−0.0151 to 0.0329**; exact sign-flip **p = 0.455**).
- The primary median-shift endpoint was therefore inconclusive.
- External target, outside-target, and total power factors were **1.46**, **0.99**, and **1.08**; all corresponding intervals included zero.
- The derivation absolute-power pattern did not transfer.

After the primary result was observed, a within-subject Mann–Whitney probability of superiority was added as an explicitly exploratory, post-hoc estimand.

- Equal-subject rank mean: **0.598** (95% CI **0.540–0.655**; participant-bootstrap CI **0.545–0.647**).
- Exact sign-flip **p = 0.0032**.
- **14 of 16** subjects exceeded 0.5.
- Leave-one-subject-out means ranged from **0.586 to 0.614**.
- Minimum class-count checks of 5, 10, 20, and 50 windows retained means of **0.595, 0.594, 0.571, and 0.572**.

The rank result does not replace the failed primary endpoint. It defines a prospective hypothesis and is not a biomarker, diagnostic threshold, mechanism, or clinical tool.

## Why the median and rank results can differ

The median difference tests separation at one point in each distribution. Probability of superiority measures ordering across all event–non-event pairs within a subject. Similar medians can coexist with systematic pairwise ordering when distribution shapes differ or when separation occurs away from the median.

## Robustness and computational verification

The updated analysis includes:

- exact subject-level sign-flip tests;
- participant bootstrap intervals;
- leave-one-subject-out analysis;
- minimum class-count checks;
- alternative control and event-label definitions with Holm correction;
- within-unit absolute-power decomposition;
- 28 deterministic estimator tests;
- 991 end-to-end resampling comparisons, with maximum ratio discrepancy `1.79 × 10⁻¹¹`;
- 100 independently coded periodogram comparisons, with maximum difference `2.22 × 10⁻¹⁶`;
- machine-readable CSV/JSON results and input manifests.

## Current public code

The current `process_gut_audio.py` script reproduces the original Figshare derivation analysis:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python process_gut_audio.py --download --verify
```

A successful run prints:

```text
REPRODUCIBILITY CHECK PASSED
```

**Scope note:** the script presently on `main` covers the seven-recording derivation corpus. The independent 19-subject transport analysis and the expanded V8 verification package described in the updated manuscripts are not yet represented by the public files on this branch. This README separates manuscript-wide results from the narrower scope of the currently available executable script so that repository claims remain auditable.

## Data availability

- Zahra Mansour, *Bowel Sounds Signal*, Figshare version 1: https://doi.org/10.6084/m9.figshare.28595741.v1
- Robert Nowak and collaborators, *Bowel Sounds*, Kaggle: https://doi.org/10.34740/KAGGLE/DSV/2825527

Raw audio is not redistributed in this repository.

## Interpretation limits

The corpora differ in sensors, formats, event taxonomies, gains, and recording protocols. Corpus 1 lacks verified participant and sensor mappings, and the external release lacks clinical and acquisition metadata needed for biological attribution. The work tests portability of a fixed acoustic estimator under dataset shift; it does not test disease diagnosis, gastrointestinal motility, ESP32/MAX4466 hardware, or a deployed bowel-sound detector.

## Repository structure

```text
.
├── README.md
├── process_gut_audio.py
├── requirements.txt
└── .gitignore
```

## Author

Neelesh Kotte  
Los Osos High School, Rancho Cucamonga, California, USA
