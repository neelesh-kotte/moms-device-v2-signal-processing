# MOM: A Low-Cost System for Recording Abdominal Sounds and Testing Sound Features Across Datasets

**Author:** Neelesh Kotte Neil Benjamin  
**Project category:** Engineering / Biomedical Signal Processing  
**Project type:** Independent biomedical engineering research project

## Abstract

Abdominal sounds may contain useful information, but they are difficult to record and study. The sounds can change because of movement, background noise, sensor placement, recording devices, and the way data are analyzed. I built and tested MOM, a low-cost system for recording abdominal sounds and checking whether sound features remain useful across different datasets.

MOM uses a stethoscope-style coupler, a MAX4466 microphone amplifier, and an ESP32-WROOM-32-style microcontroller. The system records sound at about 8,000 Hz and uses a signal-quality index, or SQI, before analysis. The SQI rejects recordings that are too noisy, too weak, clipped, or affected by movement.

I tested MOM in more than 32 controlled engineering experiments. The project report gives a mean sampling rate of 7,998 Hz, a sampling-rate CV of 0.14%, and a fixed-placement spectral-ratio CV of 5.8%. Same-operator coupling CV was 10.1% and different-operator coupling CV was 16.1%. Earlier system variability was reported as 30.0%, compared with 11.0% after system improvements.

The SQI summary contains 600 labeled windows: 400 usable and 200 poor-quality. The reported sensitivity was 92.0%, specificity 89.0%, precision 94.4%, and F1 score 93.2%.

The public-data analysis used one predefined spectral feature in two public bowel-sound datasets. Dataset A contained 10,922 complete windows from seven recordings. Dataset B contained 6,424 complete windows from 19 anonymized subjects, with 16 eligible subjects in the primary analysis. The Dataset B primary subject-level result was a mean difference of 0.0089, with a 95% bootstrap interval of -0.0151 to 0.0329 and an exact sign-flip p-value of 0.455.

The project also reports five-fold Leave-One-Session-Out Cross-Validation (LOSO-CV). The reported mean balanced accuracy was 68.0% for the baseline model, 78.0% for the acoustic-feature model, 82.0% for the combined model, and 88.0% for the combined model with the SQI quality gate at 80.0% coverage.

MOM is a research prototype. It is not a medical device and does not diagnose a health condition.

## System

| Part | Setup |
|---|---|
| Microcontroller | ESP32-WROOM-32-style development board |
| Microphone amplifier | MAX4466 |
| Sound coupling | Stethoscope-style acoustic coupler |
| MAX4466 power | ESP32 3.3-V pin |
| Ground | ESP32 ground |
| Audio output | ESP32 GPIO32 |
| Firmware | MOM SenseLoop 1.1 |
| Communication protocol | mom-provisioning-v1 |
| Sampling target | 8,000 Hz |

Signal path:

**Abdominal sound → acoustic coupler → MAX4466 → ESP32 → signal-quality check → spectral feature → recording/subject/session analysis**

## Hardware Baseline

The project report gives the following baseline values.

| Measurement | Result |
|---|---:|
| Mean sampling rate | 7,998 Hz |
| Sampling-rate SD | 11 Hz |
| Sampling-rate CV | 0.14% |
| Quiet-room noise | 0.018 RMS |
| Fan noise | 0.024 RMS |
| Conversation noise | 0.039 RMS |
| Movement noise | 0.052 RMS |
| Median clipping rate | 0.00% |
| Highest controlled clipping | 0.14% |

The report also states that MOM was tested at 50, 100, 150, 200, 300, 400, 500, 1,000, and 2,000 Hz, with five tests per frequency.

## Repeatability and Placement

| Test | Result |
|---|---:|
| Fixed-placement spectral-ratio CV | 5.8% |
| Same-operator coupling CV | 10.1% |
| Different-operator coupling CV | 16.1% |
| Earlier system variability | 30.0% |
| Final system variability | 11.0% |

The report identifies sensor placement and acoustic coupling as important sources of variation.

## SQI

The reported SQI evaluation contains 600 windows.

| Window type | Number |
|---|---:|
| Usable | 400 |
| Poor quality | 200 |

Reported confusion matrix:

| | Actually usable | Actually poor |
|---|---:|---:|
| SQI accepted | 368 | 22 |
| SQI rejected | 32 | 178 |

Reported metrics:

| Metric | Result |
|---|---:|
| Sensitivity | 92.0% |
| Specificity | 89.0% |
| Precision | 94.4% |
| F1 | 93.2% |

## Public Dataset Analysis

The main spectral feature is:

**power(120–480 Hz) / power(20–2,000 Hz)**

The signal-processing workflow uses mean-centered audio, resampling to 8 kHz when needed, non-overlapping 500-ms windows, a Hann taper, and a one-sided real FFT.

### Dataset A

Dataset A had seven recordings and 10,922 complete windows.

| Measure | Value |
|---|---:|
| Event windows | 3,881 |
| Eligible non-event windows | 5,878 |
| Excluded windows | 1,163 |
| Pooled event median | 0.426 |
| Pooled non-event median | 0.089 |
| Recording-level mean difference | 0.218 |
| 95% CI | -0.023 to 0.459 |
| Exact sign-flip p-value | 0.125 |
| Mean superiority probability | 0.718 |
| 95% CI for superiority probability | 0.570 to 0.865 |

The pooled-window result is descriptive because windows from one recording are related. The recording-level interval includes zero.

### Dataset B

Dataset B had 19 anonymized subjects and 6,424 complete windows. Sixteen subjects had both classes and were included in the primary subject-level analysis.

| Measure | Value |
|---|---:|
| Event windows | 3,050 |
| Eligible non-event windows | 2,340 |
| Excluded windows | 1,034 |
| Primary mean difference | 0.0089 |
| 95% bootstrap CI | -0.0151 to 0.0329 |
| Exact sign-flip p-value | 0.455 |

The project also reports an exploratory post-hoc rank-probability result of 0.598, with a 95% interval of 0.540 to 0.655, exact sign-flip p=0.0032, and 14 of 16 eligible subjects above 0.50. This exploratory result is not treated as a replacement for the primary endpoint.

## Five-Fold LOSO-CV

The project report gives these mean balanced accuracies:

| Model | Mean balanced accuracy | Coverage |
|---|---:|---:|
| Baseline | 68.0% | 100% |
| Acoustic-feature model | 78.0% | 100% |
| Combined model | 82.0% | 100% |
| Combined model + SQI | 88.0% | 80.0% |

The SQI result uses fewer recordings because the quality gate rejects recordings that do not meet the quality requirement.

## Limits

MOM is a research prototype, not a medical device. The public datasets were not recorded using MOM. Dataset A has seven recordings and unresolved participant mapping. Dataset B has 19 anonymized subjects, with 16 eligible subjects for the primary analysis. Five sessions are a small number for model validation. The project does not establish diagnostic performance or clinical validity.

## Reproducibility

The summary values in this file are the values supplied for the project report. The raw audio, original measurement logs, and session-level model predictions are not included here. The analysis notebooks therefore check the supplied summary values and provide a place to connect the original data for a full re-run.

