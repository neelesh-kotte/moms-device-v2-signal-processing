# External-corpus executable package

This folder contains the executable package for the independent transport analysis described in the MOM public evidence record.

It applies the fixed signal-processing protocol to the public robertnowak/bowel-sounds corpus:

1. convert each WAV to mono floating-point audio;
2. resample to 8,000 Hz when needed;
3. split complete recordings into non-overlapping 500 ms windows;
4. classify event and non-event windows from the published labels;
5. mean-center each retained window;
6. apply a Hann taper;
7. calculate the fraction of 120–480 Hz power inside 20–2,000 Hz power;
8. summarize by subject, giving every eligible subject equal weight.

The package does not contain raw audio, private MOM recordings, user profiles, or dashboard data.

## Run it

From the repository root:

~~~text
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r external_validation/requirements.txt
python external_validation/run_external_validation.py --self-test
python external_validation/run_external_validation.py --download --verify-targets
~~~

The public Kaggle archive is downloaded into data/external_corpus/, which is ignored by Git. Results are written to outputs/external_validation/, also ignored by Git.

If the public download endpoint changes, download the dataset from the Kaggle source page at https://www.kaggle.com/datasets/robertnowak/bowel-sounds, extract it under a local directory, and run:

~~~text
python external_validation/run_external_validation.py \
  --data-dir /path/to/extracted/bowel-sounds \
  --verify-targets
~~~

No Kaggle credentials are stored in this repository.

## Accepted input layouts

The runner first looks for a master CSV/CVS table with columns equivalent to:

| Required field | Accepted names |
|---|---|
| Audio path | path, Wav_path, New_Wav_File, filename |
| Label | label, category, class, target |
| Subject | patient_id, patent_id, subject_id, participant_id |

The source table may use absolute paths from its original creator; the runner resolves them by basename when the matching WAV is under --data-dir.

If no master table is present, the runner accepts one matching sidecar annotation file per WAV. Sidecars should contain start time, end time, and label fields. Ambiguous or unknown labels stop the run instead of being silently recoded.

## Outputs

The run creates:

- window_level_results.csv: one row per complete 500 ms window;
- subject_summary.csv: subject-level medians, differences, and rank probabilities;
- analysis_summary.json: protocol, counts, primary endpoint, and exploratory endpoint;
- run_manifest.json: data-source and protocol metadata without audio.

--verify-targets compares fresh calculations with the recorded target summary in expected_external_summary.json. The target values are comparison checks only; they are never used as inputs to the estimator.

## Recorded external-analysis targets

The public evidence record reports 6,424 complete windows from 19 anonymized subject groups. Sixteen groups had both eligible event and non-event windows.

The frozen primary endpoint was inconclusive:

- equal-subject mean median difference: 0.0089;
- 95% bootstrap interval: −0.0151 to 0.0329;
- exact two-sided sign-flip p = 0.455.

A within-subject rank probability was added after the primary result and is labeled exploratory:

- equal-subject mean probability: 0.598;
- 95% bootstrap interval: 0.540 to 0.655;
- exact two-sided sign-flip p = 0.0032.

The exploratory result does not replace the inconclusive primary endpoint and is not a diagnostic threshold, biomarker, or clinical performance claim.

## Data sources

- Figshare derivation corpus: https://doi.org/10.6084/m9.figshare.28595741.v1
- Kaggle independent corpus: https://www.kaggle.com/datasets/robertnowak/bowel-sounds

Raw public audio remains at the source hosts and is not redistributed here.
