# MOM PulseCheck — “Silence is not proof”

## The idea

A quiet recording is ambiguous. It can mean the acoustic scene was quiet, the sensor was poorly coupled, the microphone path changed, or the recording clipped/failed. A passive signal-quality score cannot always distinguish these cases.

**PulseCheck is a proposed active acoustic-path integrity check:** apply a repeatable, low-amplitude calibration pulse to a bench-mounted coupler and measure how the microphone path responds. Compare the new pulse with a known-good reference using waveform correlation, pulse RMS ratio, pulse-to-baseline SNR, and clipping. If the response is outside limits learned from repeated bench tests, MOM requests a retest/inspection rather than treating the recording as usable evidence.

This reframes MOM from “record and hope” to “test the measurement pathway before interpreting the measurement.”

## What is implemented in this branch

- `pulsecheck.py` compares matched reference/test WAV recordings.
- It calculates pulse-shape correlation, amplitude ratio, pulse-to-baseline SNR, and clipping fraction.
- It emits a machine-readable JSON report with every metric, threshold, pass/fail check, and interpretation.
- `tests/test_pulsecheck.py` covers a matching pulse, missing pulse, out-of-range amplitude, mismatched lengths, and invalid windows.

## Important hardware boundary

The current MOM prototype has an ESP32 and MAX4466 microphone amplifier but **does not contain a calibrated actuator that injects a pulse**. Therefore this code is an offline analysis engine for bench recordings; it is not yet an on-device feature. The next engineering step would be to add a small actuator mechanically coupled to the test fixture, then capture repeatable bench responses. The pulse should first be tested on a fixture—not on a person—and the electronics/mechanical design should be reviewed by an adult mentor before any human-contact experiment.

A speaker placed near the microphone may only test the microphone/electronics path; it does not prove skin contact or physiological coupling. A fixture-coupled actuator and a defined mechanical path are needed to test more of the coupling chain. Even then, PulseCheck cannot determine whether bowel sounds are medically normal or abnormal.

## Calibration protocol (bench only)

1. Build a repeatable fixture that holds the actuator and sensor coupler in fixed geometry.
2. Record many known-good pulses across separate sessions and expected bench variability.
3. Record controlled fault conditions separately (loose mount, disconnected actuator, altered gain, added background noise, clipping).
4. Split calibration and evaluation by session/day, not by individual windows from one recording.
5. Set thresholds on calibration data, freeze them, and evaluate on untouched sessions.
6. Report sensitivity/specificity for the *bench fault classes*, false alarms, confidence intervals, and every condition tested. Do not tune thresholds on the evaluation set.
7. Test whether PulseCheck adds value over the existing passive clipping/variance checks.
8. Only after adult-supervised bench validation should the project consider further hardware evaluation. Do not describe this as a diagnostic or clinically validated function.

## Research question

**Can a low-cost active calibration pulse detect sensor-path changes that passive signal-quality checks miss, across repeated bench sessions?**

A strong comparison is passive checks alone versus passive checks plus PulseCheck. The main outcome is fault-detection performance on held-out bench sessions, not medical accuracy.

## Why this is more than an “AI knows when to abstain” feature

PulseCheck introduces a physical challenge-response: the system sends a known input through a defined measurement path and checks whether the measured response matches its expected fingerprint. It is analogous in principle to self-test/calibration approaches used in instrumentation, but its usefulness for MOM must be demonstrated experimentally. It does not prove the source of an acoustic event and does not infer a person's hunger or health state.

## Thresholds and claims

The command-line defaults are **illustrative engineering starting points only**, not validated operating limits. Derive thresholds from repeated bench measurements and document them before reporting performance. A `PASS_BENCH_CHECK` means only that the captured test pulse passed the configured checks under that fixture; it is not a statement about the wearer or a bowel-sound recording.

## Example

```bash
python pulsecheck.py \
  --reference bench_reference.wav \
  --test bench_test.wav \
  --pulse-start 0.40 \
  --pulse-end 0.60 \
  --out pulsecheck_report.json
```

The reference and test WAVs must have the same sample rate, duration, and pulse timing, with a pre-pulse baseline. The files should be captured from the same repeatable bench setup.

## Literature grounding and novelty boundary

- Active self-diagnostics and pulse-based coupling checks already exist in acoustic-emission and piezoelectric sensing; this project must not claim to have invented active sensor self-testing. See the [ASTM acoustic-emission system performance guide](https://www.iteh.us/catalog/standards/astm/8bb4c49f-8a24-47f7-bd05-5110ef186eae/astm-e2374-16-2021), [research on piezoelectric active-sensor diagnostics](https://laro.lanl.gov/esploro/outputs/journalArticle/Piezoelectric-Active-Sensor-Self-Diagnostics-Using-Electrical/9916364297703761), and the [open-access pitch-catch study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10457745/).
- Shortcut learning in medical AI can exploit acquisition artifacts and harm generalization. See the 2024 [npj Digital Medicine study](https://www.nature.com/articles/s41746-024-01118-4).
- The possible MOM-specific contribution is an affordable, repeatable challenge-response workflow tailored to this abdominal-acoustic prototype and evaluated against its existing passive quality checks. Whether that is useful or novel enough must be established by literature review and controlled experiments; it is not assumed.
