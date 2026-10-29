# MOM Counterfactual Stress Lab

## The idea

A signal feature can look useful on a dataset yet be fragile when the same recording is captured with different gain, background noise, timing, or clipping. The Counterfactual Stress Lab probes the existing MOM feature:

`power(120–480 Hz) / power(20–2,000 Hz)`

It compares the original recording with six controlled variations and reports how much the feature changes. The goal is to make measurement sensitivity visible before someone over-interprets a number.

## Why this is useful

A research system should distinguish a potentially meaningful acoustic pattern from a feature that moves sharply under ordinary recording changes. The lab gives researchers a reproducible, per-recording stress report that can guide later controlled experiments and held-out validation.

## What the algorithm does

1. Loads a WAV and converts it to mono floating-point audio.
2. Resamples to 8 kHz.
3. Splits audio into complete, non-overlapping 500 ms windows.
4. Computes the existing MOM band-power ratio in each window.
5. Creates six reproducible probes: global gain −6 dB, global gain +6 dB, added noise at 20 dB SNR, added noise at 10 dB SNR, a 25 ms shift with zero padding, and hard clipping at ±0.98.
6. Reports the median feature, absolute/relative change from baseline, RMS amplitude, and clipped-sample fraction for each condition.
7. Writes machine-readable JSON and CSV reports.

## Run it

Install the repository requirements, then:

```bash
python counterfactual_stress_lab.py --wav path/to/recording.wav --out mom_stress_report
```

Outputs: `stress_report.json` and `stress_report.csv`.

Run the tests:

```bash
python -m unittest tests/test_counterfactual_stress_lab.py
```

## Correct interpretation

- This is a signal-feature stress test, not a classifier and not an AI that detects bowel events.
- Gain scaling is expected to leave a power ratio largely invariant; this is a useful software sanity check, not a discovery.
- Added noise, clipping, and time shifts are sensitivity probes. They are **not** guaranteed to preserve labels or biological information.
- A large feature change means the feature is sensitive to that probe. It does not prove the recording is invalid or identify why it changed.
- A small feature change does not establish clinical reliability.
- Do not compare different conditions as if they were independent subjects. This report is descriptive per recording.
- No diagnosis, hunger detection, or clinical recommendation is produced.

## Research question

**How stable is MOM's prespecified 120–480 Hz band-power ratio under controlled recording perturbations, and which perturbations change it most?**

A stronger follow-up study would preregister the perturbation levels, repeat each probe across independent recordings and hardware sessions, and compare the feature with a clearly specified passive quality-control baseline. Any future classifier must be evaluated with recording-/subject-level splits and held-out data.
