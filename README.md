# MOM Device

**Independent biomedical engineering project exploring low-cost abdominal-acoustic data capture, reproducible signal analysis, and personalized SenseLoop software.**

MOM has two deliberately separate tracks:

1. **Engineering / product prototype — MOM SenseLoop V3:** ESP32 + MAX4466 + stethoscope-coupled abdominal-acoustic capture, multi-user profiles, guided check-ins, uncertainty-aware personal modeling, notifications, preference learning, and a privacy-safe Guest Mode.
2. **Research / validation track — cross-corpus spectral analysis:** a fixed bowel-sound spectral estimator evaluated on two public, de-identified datasets. The external primary median-shift result was inconclusive; an additional rank result is explicitly exploratory.

Keeping these tracks separate is important. The prototype is an engineering system. The public-data study is an acoustic-analysis study. Neither is presented as a diagnostic, disease-screening, or medically validated device.

## MOM SenseLoop V3 — engineering prototype

Detailed engineering overview: [`SENSELOOP_V3.md`](SENSELOOP_V3.md)

### Hardware

The current prototype uses:

- classic ESP32-WROOM-32-style development board;
- MAX4466 microphone amplifier with fixed manual gain;
- stethoscope-based acoustic coupling;
- MAX4466 `VCC → 3V3`, `GND → GND`, `OUT → GPIO32`;
- local raw-audio acquisition at approximately 8 kHz.

The project has required iterative troubleshooting of movement artifacts, environmental noise, microphone gain, sensor placement, clipping/headroom, mounting pressure, Wi-Fi reliability, and inconsistent acoustic contact.

### SenseLoop software

SenseLoop V3 extends the capture prototype into a personal learning loop without changing the core MAX4466/ESP32 hardware.

A guided session can collect:

- a short abdominal-acoustic recording;
- a 0–10 self-reported hunger check-in;
- time since eating;
- optional activity/noise/position context.

Each recording is aggregated into session-level features such as:

- candidate bowel-sound events per minute;
- event-duration summaries;
- RMS;
- spectral bandwidth;
- frequency-band power;
- spectral centroid;
- spectral entropy;
- signal-quality and movement/noise indicators.

The software compares three personalized modeling views:

- **time-only baseline** — time since eating;
- **sounds-only model** — acoustic features only;
- **personal model** — sound + meal timing + previous check-ins.

Predictions are uncertainty-aware. Poor signal quality, insufficient personal history, weak model maturity, or inconsistent recent periods can cause the system to abstain with **“Not enough information.”**

The intended wording is:

> **Estimated self-reported hunger based on your past patterns.**

The system does **not** claim that the device “knows” a user is hungry.

### Multi-user sharing

One physical device can be shared by multiple people while maintaining separate:

- profiles;
- raw recordings;
- check-ins;
- personal models;
- food-preference history.

An **Identity Latch** clears recent live buffers when the active wearer changes. A **Wearer Lock** prevents a disconnected/reconnected device from silently resuming personal monitoring under the previous wearer.

### Notifications and preference learning

Automatic SenseLoop prompts are gated by signal quality, model maturity, agreement across recent periods, and a cooldown. The prompt asks the user to confirm rather than treating an estimate as fact.

After a hunger check-in, a user can optionally select preferences such as savory, sweet, fresh, warm, crunchy, filling, or no preference. MOM can then rank a small set of ideas using practical constraints such as food available, vegetarian preference, preparation time, budget, and user-entered ingredients to avoid.

Food selection is **preference learning**, not thought reading. Any DoorDash path is an optional handoff only; the prototype does not place purchases automatically.

### Guest Mode and privacy boundary

SenseLoop V3 includes a public, read-only **Guest Mode** for people who want to understand the project without opening anybody's private dashboard.

Guest Mode can show:

- what MOM is;
- how the hardware/software loop works;
- an explicitly labeled sample session;
- product boundaries and limitations.

Guest Mode cannot show:

- profile names;
- live ESP32 readings;
- recordings or check-ins;
- food-preference history;
- personalized estimates;
- private API data.

Remote private-dashboard access remains access-code protected, while the ESP32 `/sound` ingestion endpoint remains local-network only.

## Product boundaries

MOM should be described as:

> **a low-cost prototype for abdominal-acoustic data capture and analysis**

It should not be described as a:

- diagnostic device;
- gastrointestinal disease detector;
- clinical detector;
- disease-screening system;
- medically validated device;
- mind-reading system.

The engineering goal is to explore repeatable low-cost acoustic capture, transparent feature extraction, personal association modeling, and usable human-in-the-loop feedback.

---

# Cross-Corpus Bowel-Sound Spectral Analysis

The research track asks whether annotated bowel-sound events differ from eligible non-event periods in one fixed spectral feature:

`power(120–480 Hz) / power(20–2,000 Hz)`

The project began as a seven-recording derivation analysis and was extended into an independent cross-corpus transport study. The updated manuscripts distinguish a failed primary median-shift test from an exploratory within-subject rank pattern.

## Study design

No new human-participant data were collected for this public-data analysis. The work reanalyzes two public, de-identified acoustic datasets.

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

1. converts audio to floating point and mean-centers each reconstructed recording;
2. resamples audio to 8 kHz using polyphase resampling;
3. divides audio into non-overlapping 500 ms windows;
4. labels a window as an event when it overlaps a confirmed annotation;
5. defines an eligible non-event window as annotation-free and beginning at least 500 ms from annotation boundaries;
6. mean-centers each window and applies the symmetric Hann taper from `numpy.hanning(4000)`;
7. computes a one-sided real FFT;
8. divides inclusive 120–480 Hz power by inclusive 20–2,000 Hz power.

Pooled windows are reported descriptively. Population-level inference does not treat correlated windows from the same recording or subject as independent biological replicates.

## Main findings

### Derivation corpus

- Pooled event median: **0.426**
- Pooled eligible non-event median: **0.089**
- Six of seven recording-level median differences were positive.
- Conditional four-group mean difference: **0.218** (95% CI **−0.023 to 0.459**; exact sign-flip **p = 0.125**).
- Mean within-recording probability of superiority: **0.718** (95% CI **0.570–0.865**; six of seven recordings above 0.5).

These results establish an internal recording-level association, not participant-level validation or a biological mechanism.

### Independent transport corpus

The frozen primary endpoint was the equal-subject mean of each subject's event-minus-non-event median-ratio difference.

- Primary mean median difference: **0.0089** (95% CI **−0.0151 to 0.0329**; exact sign-flip **p = 0.455**).
- The primary median-shift endpoint was therefore inconclusive.
- The derivation absolute-power pattern did not transfer.

After the primary result was observed, a within-subject Mann–Whitney probability of superiority was added as an explicitly exploratory, post-hoc estimand.

- Equal-subject rank mean: **0.598** (95% CI **0.540–0.655**; participant-bootstrap CI **0.545–0.647**).
- Exact sign-flip **p = 0.0032**.
- **14 of 16** subjects exceeded 0.5.

The rank result does not replace the failed primary endpoint. It defines a prospective hypothesis and is not a biomarker, diagnostic threshold, mechanism, or clinical tool.

## Robustness and computational verification

The updated analysis includes exact subject-level sign-flip tests, participant bootstrap intervals, leave-one-subject-out analysis, minimum class-count checks, alternative control/event-label definitions, within-unit absolute-power decomposition, deterministic estimator tests, resampling comparisons, and an independently coded periodogram comparison.

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

**Scope note:** the executable script presently on `main` covers the seven-recording derivation corpus. SenseLoop V3 product code and personal user data are not published in this repository. The external 19-subject transport package described in the updated manuscripts is also not represented by the executable script currently on `main`.

## Data availability

- Zahra Mansour, *Bowel Sounds Signal*, Figshare version 1: https://doi.org/10.6084/m9.figshare.28595741.v1
- Robert Nowak and collaborators, *Bowel Sounds*, Kaggle: https://doi.org/10.34740/KAGGLE/DSV/2825527

Raw audio is not redistributed in this repository.

## Technical portfolio

Project portfolio: https://neelesh-kotte.github.io/moms-device-v2-signal-processing/

## Author

Neelesh Kotte  
Los Osos High School, Rancho Cucamonga, California, USA
