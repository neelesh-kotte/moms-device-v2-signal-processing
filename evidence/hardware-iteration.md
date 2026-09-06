# Hardware iteration and quantified change

## System

The tested capture chain is:

- ESP32 development board;
- MAX4466 microphone amplifier;
- stethoscope-style acoustic coupling;
- VCC → 3V3;
- GND → GND;
- OUT → GPIO32;
- local acquisition at approximately 8 kHz.

## Failure modes treated as engineering variables

The iteration process tracked:

- movement artifacts;
- environmental noise;
- microphone gain and clipping/headroom;
- sensor placement;
- mounting pressure;
- acoustic contact consistency;
- Wi-Fi reliability;
- usable-window coverage and data integrity.

These were treated as design inputs rather than hidden inconveniences.

## Quantified project result

| Measure | Earlier configuration | Later tested configuration | Interpretation |
|---|---:|---:|---|
| Within-condition variability | Approximately 30% | Approximately 10–12% | Lower variability in the project’s recorded repeatability measure |
| Recurring clipping | Present as a repeated failure mode | Eliminated in the tested configuration | A failure mode was addressed through iteration |
| Controlled experiments | — | 32+ across the project workflow | Evidence of repeated engineering testing |

The variability figures are reported in the project’s engineering record. The public summary does not relabel them as sensitivity, specificity, accuracy, or clinical precision.

## Version history

- **V1:** establish that the low-cost ESP32/MAX4466/stethoscope chain can acquire abdominal-acoustic data.
- **V2:** tighten acquisition and analysis around sample-rate checks, clipping checks, duplicate rejection, source separation, calibration, and held-out evaluation.
- **V3:** build a usable SenseLoop around the capture chain with guided sessions, quality gates, separated profiles, privacy boundaries, uncertainty-aware summaries, and abstention.

The hardware remains a prototype. A software feature or a successful controlled setup does not prove reliable operation across people, positions, environments, or clinical settings.
