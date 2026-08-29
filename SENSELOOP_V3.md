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

The public Guest experience is hosted separately from private user data so visitors can understand the project without seeing a real user's dashboard.

Guest Mode is intentionally read-only and contains no profile names, live sensor stream, session history, check-ins, personalized model outputs, or preference data. Its interactive walkthrough is explicitly labeled as simulated/example data.

## Power-bank autonomy

The ESP32 stores its firmware in onboard flash memory. After the final firmware has been flashed once, **Arduino IDE and the programming computer are not required during normal use**.

Normal operation is:

1. connect the ESP32 development board's USB port to a stable USB power bank or USB power source;
2. the ESP32 boots the MOM firmware automatically;
3. the MAX4466 remains powered from ESP32 `3V3`, with `GND → GND` and `OUT → GPIO32`;
4. the device tries its saved 2.4 GHz Wi-Fi networks or phone hotspot for data transfer.

A power source and an internet connection are separate requirements. Power alone is enough to boot the firmware and sensor node, but remote transfer still requires a compatible Wi-Fi path. The Universal firmware includes a local fallback/status mode when no saved network is available so normal troubleshooting does not require reconnecting to Arduino.

## Public website availability

The public Guest website is designed to be cloud-hosted as a static site, so it does not depend on the home Mac, home Wi-Fi, ESP32, or an ngrok tunnel merely to remain viewable.

The private live sensor dashboard is different because its Python backend and private data store must run somewhere. If that backend runs on a Mac, the Mac must remain available. Fully removing that dependency requires deploying the private backend/database to a managed cloud host; the project documentation does not describe a Mac-hosted process as guaranteed always-online.

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
