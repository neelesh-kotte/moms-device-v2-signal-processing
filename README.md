# Gastroacoustic Spectral-Energy Analysis

This repository is the reproducibility companion for the manuscript:

**Annotated bowel-sound events showed higher relative 120-480 Hz spectral energy in a public acoustic dataset**

It contains the analysis code for the manuscript's secondary analysis of the public **Bowel sounds signal** dataset by Zahra Mansour (Figshare version 1; DOI `10.6084/m9.figshare.28595741.v1`).

## What this repository analyzes

The manuscript tests the a priori hypothesis that annotated bowel-sound event windows contain a greater fraction of 20-2,000 Hz spectral power within 120-480 Hz than eligible annotation-free windows.

This repository does **not** test the ESP32/MAX4466 hardware, diagnostic accuracy, gastrointestinal motility, or a threshold-based bowel-sound detector.

## Analysis implemented in `process_gut_audio.py`

The script reproduces the manuscript pipeline:

1. Uses the seven WAV recordings and seven matching TXT annotation files in Figshare version 1.
2. Converts audio to floating point and mean-centers each recording.
3. Resamples the 48 kHz recordings to 8 kHz with polyphase resampling.
4. Splits each recording into non-overlapping 500 ms (4,000-sample) windows.
5. Parses the annotation files and treats `SB`, `MB`, `CRS`, and `HS` as confirmed bowel-sound events.
6. Gives confirmed-event overlap priority when a window overlaps a confirmed event.
7. Excludes windows that overlap other/unrecognized annotations or whose start is within 500 ms of an annotation boundary.
8. Treats the remaining eligible windows as non-events.
9. Mean-centers each retained window, applies a Hann taper, and computes a real FFT.
10. Computes the primary feature:

   `band-energy ratio = power(120-480 Hz) / power(20-2,000 Hz)`

11. Reports pooled window-level distributions descriptively only.
12. Groups recordings by their four filename date prefixes for the higher-level paired analysis.
13. Computes event-minus-non-event median differences for each date group.
14. Performs an exact two-sided sign-flip test over all 16 sign assignments.
15. Computes a conventional t-based 95% confidence interval for the mean paired difference.
16. Computes the Mann-Whitney probability-of-superiority effect size within each date group.
17. Saves the manuscript tables, figures, window-level results, and a JSON summary.

The code deliberately does **not** run a pooled window-level significance test because windows from the same recording are correlated and are not independent biological replicates.

## Dataset

Source:

- Zahra Mansour, **Bowel sounds signal**, Figshare, version 1
- DOI: `10.6084/m9.figshare.28595741.v1`
- License: CC BY 4.0

The Figshare release contains seven mono WAV recordings and seven matching TXT annotation files used here.

The source metadata states that the recordings come from four subjects, but the public release does not provide a verified recording-to-subject mapping for these seven files. Therefore, the manuscript uses the four filename date prefixes only as **unverified higher-level analysis units**, not as confirmed participant IDs.

The raw audio is not copied into this repository. The analysis script can download the immutable Figshare version-1 files directly.

## Installation

Python 3.10 or later is recommended.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## One-command reproduction

From the repository root:

```bash
python process_gut_audio.py --download --verify
```

This command:

- downloads the exact Figshare v1 files into `data/` if they are not already present,
- analyzes all seven recordings,
- writes regenerated results to `outputs/`,
- compares the regenerated values with the manuscript values at the reported precision,
- exits with an error if the values do not match.

If the data have already been downloaded, run:

```bash
python process_gut_audio.py --verify
```

## Expected manuscript results

The `--verify` check compares independently recomputed outputs against these reported values:

| Quantity | Manuscript value |
|---|---:|
| Complete 500 ms windows | 10,922 |
| Confirmed-event windows | 3,881 |
| Eligible non-event windows | 5,878 |
| Excluded windows | 1,163 |
| Event mean band-energy ratio | 0.469 |
| Event median band-energy ratio | 0.426 |
| Non-event mean band-energy ratio | 0.148 |
| Non-event median band-energy ratio | 0.089 |
| Date-group median differences | 0.077, 0.103, 0.308, 0.383 |
| Mean paired difference | 0.218 |
| Median paired difference | 0.206 |
| 95% CI for mean paired difference | -0.023 to 0.459 |
| Exact two-sided sign-flip p-value | 0.125 |
| Mean P(event > non-event) | 0.728 |

These values are stored only as **verification targets**. They are not inserted into the calculations. The analysis is recomputed from the source WAV and annotation files.

## Generated outputs

A successful run creates:

```text
outputs/
├── analysis_summary.json
├── window_level_results.csv
├── table1_pooled_summary.csv
├── table2_date_group_summary.csv
├── table3_recording_summary.csv
├── figure1_window_distributions.png
└── figure2_group_medians.png
```

## Reproducibility gate

A repository should only be described as reproducing the manuscript after a clean run of:

```bash
python process_gut_audio.py --download --verify
```

prints:

```text
REPRODUCIBILITY CHECK PASSED
```

If the check fails, the script prints each discrepancy and exits with a non-zero status. Any discrepancy should be resolved before the repository is cited as verified reproduction of the manuscript.

## Statistical interpretation

The thousands of 500 ms windows are useful for describing acoustic distributions, but they are not thousands of independent participants. The primary higher-level analysis therefore uses four filename-date groups and should be interpreted cautiously because those groups are not verified participant identifiers.

The repository reproduces the analysis as reported; it does not convert the four date groups into verified biological replicates.

## Repository structure

```text
.
├── README.md
├── process_gut_audio.py
├── requirements.txt
└── .gitignore
```

## Citation

If you reuse the source audio or annotations, cite the original Figshare dataset and comply with its CC BY 4.0 license.

## Author

Neelesh Kotte
