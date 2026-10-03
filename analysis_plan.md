# MOM Analysis Plan

**Project:** MOM Device
**Author:** Neelesh Kotte
**School:** Los Osos High School
**Record date:** October 2, 2026

## Purpose

This file explains the main analysis rules used for the MOM public-data study. It is written so another student could follow the same steps and understand why each step was used.

This file is an analysis record. It is not called a pre-registration unless the repository history shows that it was committed before the related analysis was run.

## Main question

The study tests whether the spectral feature below changes between annotated bowel-sound events and eligible non-event periods:

`power(120–480 Hz) / power(20–2,000 Hz)`

The public-data study is separate from the physical MOM prototype. The public recordings were not collected with the MOM hardware.

## Signal processing

For each recording:

1. Convert the audio to a common numeric format.
2. Mean-center the recording.
3. Resample to 8,000 Hz when needed.
4. Split the recording into complete, non-overlapping 500 ms windows.
5. Use the published annotations to label event windows.
6. Exclude windows that overlap unclear labels or are too close to annotation boundaries.
7. Mean-center each retained window.
8. Apply a Hann taper.
9. Calculate a one-sided real FFT.
10. Calculate 120–480 Hz power divided by 20–2,000 Hz power.

## Unit of analysis

A 500 ms window is useful for measuring the signal, but windows from the same recording or subject are not treated as independent people.

For Dataset A, the analysis is recording-level because the source does not provide a verified participant mapping.

For Dataset B, the primary analysis uses each eligible subject's event median and non-event median. The difference for subject i is:

`difference_i = event_median_i - non_event_median_i`

The primary result is the mean of these subject-level differences.

## Primary Dataset B test

The primary Dataset B test uses:

- 19 observed anonymized subjects;
- 16 eligible subjects with both classes;
- two-sided exact sign-flip testing;
- alpha = 0.05;
- a 95% bootstrap confidence interval for the mean subject-level difference.

The recorded primary result is:

- mean difference = **0.0089**;
- 95% bootstrap CI = **−0.0151 to 0.0329**;
- exact sign-flip p = **0.455**.

## Exploratory Dataset B analysis

A within-subject rank probability was added after the primary result. It is kept separate from the primary endpoint.

Recorded exploratory values:

- rank probability = **0.598**;
- 95% bootstrap CI = **0.540 to 0.655**;
- exact sign-flip p = **0.0032**;
- 14 of 16 eligible subjects were above 0.50.

This analysis is exploratory and is not used as a diagnostic threshold.

## Dataset A

The derivation dataset contains:

- 7 recordings;
- 10,922 complete windows;
- 3,881 event windows;
- 5,878 eligible non-event windows;
- 1,163 excluded windows.

The recorded pooled medians are 0.426 for event windows and 0.089 for eligible non-event windows.

The recording-level mean difference is 0.218, with a 95% CI of −0.023 to 0.459 and an exact four-group sign-flip p value of 0.125.

## What is not part of the primary public-data test

The following are not used as substitutes for the primary subject-level endpoint:

- treating all windows as independent biological samples;
- choosing a result because its p value is smaller;
- changing the feature definition after seeing the primary result;
- calling the exploratory rank result a diagnostic result;
- combining the two public datasets as if they were collected in the same study.

## Engineering analysis

The physical MOM prototype is documented separately from the public-data analysis.

Current hardware:

- ESP32-WROOM-32-style development board;
- MAX4466 microphone amplifier;
- stethoscope-style acoustic coupling;
- VCC to 3V3;
- GND to GND;
- OUT to GPIO32;
- approximately 8 kHz local acquisition.

Firmware: **MOM SenseLoop 1.1**.

The engineering record documents 32+ controlled experiments and a change from about 30% earlier within-condition variability to about 10–12% later. These values describe the project's engineering repeatability measure. They are not clinical accuracy measures.

## Reproducibility rule

Analysis code must calculate results from source data. Recorded target values may be used for a verification check, but they must not be inserted into the calculation to force a match.

Raw public audio is not redistributed in this repository. Raw MOM recordings and private user data are also not public.

## Changes to this plan

If the analysis method changes after this file is committed, the change should be recorded in Git with a short explanation. The original method should not be silently replaced.
