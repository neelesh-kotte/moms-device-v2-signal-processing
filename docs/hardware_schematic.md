# MOM Hardware Schematic

## Current prototype

The current MOM capture setup uses an ESP32-WROOM-32-style development board, a MAX4466 microphone amplifier, and stethoscope-style acoustic coupling.

| MAX4466 | ESP32 | Purpose |
|---|---|---|
| VCC | 3V3 | Power |
| GND | GND | Common ground |
| OUT | GPIO32 | Analog microphone signal |

## Signal path

Abdominal sound → stethoscope-style acoustic coupling → MAX4466 microphone amplifier → ESP32 analog input on GPIO32 → local recording → software signal analysis.

## Acquisition

The current firmware is MOM SenseLoop 1.1. The target local acquisition rate is approximately 8 kHz. The ESP32 records the analog signal and calculates basic recording statistics. The public-data spectral analysis is performed separately in software.

## Important note

This document describes the current prototype wiring. It is not a medical-device schematic and does not establish electrical, safety, or clinical certification.
