# MOM Health-Audio Research Suite

## Purpose

The website now presents MOM as an acoustic-research suite with four separate exploratory directions:

- **MOM SenseLoop:** the existing low-cost abdominal-acoustic hardware and public-data research.
- **BreathGuard:** exploratory analysis of respiratory recordings, highlighting candidate high-frequency segments.
- **SleepSignal:** exploratory analysis of sleep audio, highlighting low-energy intervals.
- **MurmurMap:** exploratory analysis of heart-sound recordings, highlighting sustained frequency-band regions.
- **Red-Team Bench:** an existing Python evaluation workflow for comparing baseline classifiers on recording-level held-out groups.

These directions are not interchangeable. They involve different sensors, recording protocols, frequency ranges, labels, and validation requirements. The original MOM hardware is not represented as a clinically validated respiratory, sleep, or cardiac device.

## What the browser lab actually implements

`assets/mom-suite.js` decodes a user-selected, short audio file in the browser, downmixes it to mono, resamples it to 8 kHz, calculates short-time RMS and spectral-band features, and highlights regions that pass transparent thresholds. The report includes clip duration, global RMS, candidate segment times, a waveform, a JSON export, and a plain-language method limitation.

- BreathGuard profile: highlights frames with elevated relative energy in a broad high-frequency band.
- SleepSignal profile: highlights consecutive low-energy frames.
- MurmurMap profile: highlights sustained frames with a relatively elevated selected-band energy ratio.
- MOM profile: highlights relatively elevated 120–480 Hz band-energy ratios.

These are **heuristic signal-processing baselines**, not machine-learning classifiers. Thresholds are exploratory and have not been clinically calibrated. The segment names describe how the baseline selected a region; they do not confirm the presence of a wheeze, crackle, apnea, murmur, bowel event, or disease. No health diagnosis, disease probability, or clinical screening score is generated.

Audio analysis is performed in the browser tab. This page does not upload the selected audio. The current lab accepts files up to 80 MB and three minutes; WAV is recommended. Actual browser support depends on the audio codec and browser.

## What is already in the repository

- `sonic-atlas.html`: interactive audio exploration and counterfactual stress lab.
- `counterfactual_stress_lab.py`: controlled feature-sensitivity probes.
- `red-team-bench.html` and `mom_redteam_bench.py`: baseline classifier evaluation and error analysis.
- `MOM_REDTEAM_BENCH.md` and `COUNTERFACTUAL_STRESS_LAB.md`: setup and interpretation notes.

The browser lab does not replace these tools. It offers a lightweight first look at audio and a consistent interface to the four research profiles.

## Research requirements before medical claims

A credible clinical-audio AI study needs, at minimum:

1. A defined research question and target event label for each modality.
2. A documented dataset with legal access, recording protocol, label provenance, and enough independent participants.
3. Patient/participant-level separation between training, validation, and test data to avoid leakage from windows belonging to the same person.
4. Pre-specified metrics, class balance, calibration, confidence intervals, and error review—especially false negatives and false positives.
5. Evaluation on an independent dataset and, where possible, recordings from a different device or setting.
6. A documented plan for privacy, data handling, safety review, and appropriate adult/qualified research supervision.

The existing MOM public-data study concerns abdominal acoustics and does not establish performance for respiratory, sleep, or heart sounds. A successful exploratory audio plot is not evidence of medical utility.

## Design and accessibility choices

The homepage uses a restrained light palette, Manrope headings and DM Sans body text, a clear content grid, layered translucent panels, responsive cards, visible keyboard focus, native buttons and links, reduced-motion support, and loading/error feedback. It avoids presenting fabricated performance metrics or invented clinical results.
