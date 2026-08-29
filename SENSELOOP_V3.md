# MOM SenseLoop V3 — Public Engineering Overview

MOM SenseLoop V3 is the product/engineering track of the MOM Device project. It is a **low-cost prototype for abdominal-acoustic data capture and analysis**, not a diagnostic or medically validated device.

## System loop

```text
abdominal acoustic signal
        ↓
stethoscope coupling
        ↓
MAX4466 microphone amplifier
        ↓
ESP32 ADC / local Wi-Fi stream
        ↓
Python feature extraction + quality checks
        ↓
personal check-in + uncertainty-aware model
        ↓
confirmation / preference learning / optional food handoff
```

## Why V3 exists

Earlier versions focused on controlled acoustic capture and signal-processing validation. V3 explores a human-in-the-loop product question: can a device learn a user's recurring abdominal-sound patterns from repeated, ordinary-life check-ins without pretending that an acoustic signal directly reveals a thought or medical state?

## Personal session

A guided session can include:

- a short acoustic recording;
- self-reported hunger from 0–10;
- time since eating;
- optional activity, unusual-noise, and sensor-position context.

The system does not ask users to skip or delay meals to create particular readings.

## Session-level features

Recordings can be summarized with:

- candidate bowel-sound events per minute;
- event-duration summaries;
- RMS;
- spectral bandwidth;
- frequency-band power;
- spectral centroid;
- spectral entropy;
- clipping/headroom checks;
- movement/noise indicators;
- overall signal quality.

## Three model views

V3 separates:

1. **time-only baseline** — how much can meal timing alone explain?
2. **sounds-only model** — what is associated with the acoustic features alone?
3. **personal model** — do acoustic features add useful information when combined with the user's context and previous check-ins?

The product can abstain with **“Not enough information”** when signal quality, model maturity, or uncertainty gates do not pass.

## Multi-user device sharing

Multiple people can share one physical ESP32/MAX4466 device. Each profile has separate recordings, check-ins, models, and preference history. Switching wearers clears recent live buffers before a new person's data can be used.

## Notifications

SenseLoop notifications are designed as questions, not declarations. A prompt can fire only after quality and model gates pass and multiple recent periods agree.

Example wording:

> Your current abdominal-sound pattern resembles some of your higher-hunger check-ins. How hungry do you feel?

The answer becomes another labeled example for later personal retraining.

## Preference learning

After a check-in, the wearer can optionally choose what sounds appealing: savory, sweet, fresh, warm, crunchy, filling, or no preference. The system can combine that with practical constraints and rank a few suggestions.

This is **preference prediction from previous choices**, not thought reading. DoorDash, when offered, is only a user-initiated handoff. V3 does not purchase food automatically.

## Guest Mode

The device-hosted web application includes a public Guest Mode for visitors who want to understand the project without seeing a real user's private dashboard.

Guest Mode is intentionally read-only and contains no profile names, live sensor stream, session history, check-ins, personalized model outputs, or preference data. A sample card is explicitly labeled as illustrative data.

## Claim boundaries

Appropriate description:

> a low-cost prototype for abdominal-acoustic data capture and analysis

Not supported:

- diagnostic device;
- gastrointestinal disease detector;
- clinical detector;
- disease-screening system;
- medically validated device;
- mind-reading system.

## Research track

The separate public-data research track evaluates a fixed bowel-sound spectral estimator across two datasets. See the repository README for the frozen primary result, exploratory rank analysis, and interpretation limits.
