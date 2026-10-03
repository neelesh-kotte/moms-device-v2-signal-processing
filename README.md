# MOM Device

**Independent biomedical engineering project for low-cost abdominal-acoustic recording and signal analysis.**

MOM has two separate parts:

1. **Engineering prototype:** ESP32 + MAX4466 + stethoscope-style acoustic coupling.
2. **Public-data research:** one fixed spectral feature tested on two public, de-identified bowel-sound datasets.

These parts are kept separate. The public datasets were not recorded with MOM hardware. MOM is a research prototype, not a diagnostic or medically validated device.

## Current hardware

- ESP32-WROOM-32-style development board
- MAX4466 microphone amplifier
- Stethoscope-style acoustic coupling
- Analog input on **GPIO32**
- Local acquisition at about **8 kHz**
- Firmware: **MOM SenseLoop 1.1**
- Protocol: **mom-provisioning-v1**

### Wiring

| MAX4466 | ESP32 |
|---|---|
| VCC | 3V3 |
| GND | GND |
| OUT | GPIO32 |

The project tested movement, environmental noise, gain and clipping, sensor placement, mounting pressure, acoustic contact, Wi-Fi behavior, and data quality. The public engineering record documents **32+ controlled experiments**, a change from about **30%** earlier within-condition variability to about **10–12%** later, and removal of a recurring clipping problem in the tested setup.

## Public-data study

The feature is:

`power(120–480 Hz) / power(20–2,000 Hz)`

For both datasets, audio is converted to a common format, resampled to 8 kHz when needed, split into non-overlapping 500 ms windows, mean-centered, Hann-tapered, and analyzed with a one-sided real FFT.

### Dataset A

- 7 recordings
- 10,922 complete windows
- 3,881 event windows
- 5,878 eligible non-event windows
- 1,163 excluded windows
- Event median: **0.426**
- Non-event median: **0.089**
- Mean recording-level difference: **0.218**
- 95% CI: **−0.023 to 0.459**
- Exact sign-flip p: **0.125**

The participant mapping is unresolved, so these are called recordings rather than subjects.

### Dataset B

- 6,424 complete windows
- 3,050 event windows
- 2,340 eligible non-event windows
- 1,034 excluded windows
- 19 anonymized subjects
- 16 eligible subjects

Primary result:

- Mean median difference: **0.0089**
- 95% bootstrap CI: **−0.0151 to 0.0329**
- Exact sign-flip p: **0.455**

The primary result is inconclusive.

An additional within-subject rank analysis was added after the primary result and is labeled exploratory:

- Rank probability: **0.598**
- 95% bootstrap CI: **0.540 to 0.655**
- Exact sign-flip p: **0.0032**
- 14/16 subjects above 0.50

The exploratory result does not replace the primary result.

## Engineering evidence

The repository separates engineering evidence from the public-data study. It includes hardware iteration notes, controlled testing records, two independent operator reproductions, external engineering review notes, and the executable external-validation package.

The two-operator result is small-sample workflow evidence. It is not presented as a population reliability study.

## Repository structure

The repository is kept tied to files that actually exist. I do not add empty notebooks, fake data, fake commit hashes, or completed-test claims without records.

```text
moms-device-v2-signal-processing/
├── README.md
├── requirements.txt
├── analysis_plan.md
├── process_gut_audio.py
├── firmware/
│   └── mom_senseloop/
│       └── mom_senseloop.ino
├── docs/
│   └── HARDWARE_VALIDATION.md
├── evidence/
│   ├── engineering-validation.md
│   ├── hardware-iteration.md
│   ├── independent-operator-evidence.md
│   └── external-reviewers.md
└── external_validation/
    ├── README.md
    ├── run_external_validation.py
    └── expected_external_summary.json
```

## Running the analysis

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python process_gut_audio.py --download --verify
```

For the independent corpus:

```bash
python external_validation/run_external_validation.py --self-test
python external_validation/run_external_validation.py --download --verify-targets
```

Raw audio is not stored in this repository.

## Hardware validation

`docs/HARDWARE_VALIDATION.md` contains the hardware test checklist. It separates expected behavior from actual observations. A blank test field is not treated as a successful test.

## Analysis plan

`analysis_plan.md` records the signal-processing rules, primary unit of analysis, exclusion rules, and statistical tests. It is not described as a pre-registration unless the relevant commit was made before the analysis was run.

## Data sources

- Figshare Bowel Sounds Signal: DOI **10.6084/m9.figshare.28595741.v1**
- Kaggle Bowel Sounds: DOI **10.34740/KAGGLE/DSV/2825527**

Raw MOM recordings and private user data are not publicly redistributed.

## Limits

MOM is still a prototype. The current hardware uses analog ADC recording, does not perform FFT analysis on the ESP32, and has not established battery life in the public hardware record. The public datasets are not clinical validation datasets, and the primary Dataset B endpoint was inconclusive.

## Author

**Neelesh Kotte**  
Los Osos High School, California, USA

Portfolio: https://neelesh-kotte.github.io/moms-device-v2-signal-processing/

GitHub: https://github.com/neelesh-kotte/moms-device-v2-signal-processing

## License

MIT License. See LICENSE.
