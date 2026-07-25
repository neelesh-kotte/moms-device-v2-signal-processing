About the Project

MOM Device v2 is a research project I am working on to develop a low-cost ESP32-based system that can detect gastrointestinal sounds using acoustic signal processing.

The project combines hardware and software. The goal is to use an ESP32 and microphone to collect or analyze audio and determine whether gastrointestinal acoustic events can be detected reliably.

What the Code Does

The Python code processes audio recordings to look for possible gastrointestinal acoustic events.

The current process:

Reads an audio file.
Applies a bandpass filter to focus on a specific frequency range.
Calculates the amplitude envelope of the filtered audio.
Converts the signal to dBFS.
Uses a threshold to determine whether an acoustic event was detected.

The frequency range and other settings may change as I test the system and compare the results with research and published literature.

Requirements

The code uses Python 3 and the following libraries:

NumPy
SciPy

To install them, run:

pip install numpy scipy
How to Run
Install Python 3.
Install the required libraries:
pip install numpy scipy
Download or clone this repository.
Place a WAV audio file in the project folder.
Run the processing code using the audio file.

For example:

from process_gut_audio import process_gut_audio

result = process_gut_audio("example_audio.wav")

print("Gastrointestinal acoustic event detected:", result)
Dataset

I plan to use publicly available recordings and a controlled acoustic validation dataset to test the signal-processing methods.

Dataset: https://ir.lib.uwo.ca/clinicalskills_abdominalexam/

I will update this section once the final dataset has been selected. The repository will also include information about the number of unique recordings and how the recordings were processed.

Research Question

My research question is:

How accurately can a low-cost embedded acoustic system detect gastrointestinal acoustic events from controlled audio datasets?

This code is part of the analysis used to answer that question. It processes audio recordings and attempts to identify potential gastrointestinal acoustic events.

I am also testing the hypothesis that frequency-based filtering will improve gastrointestinal acoustic event detection compared with using amplitude thresholds alone.

Project Status

Status: In Development

I am currently working on the hardware feasibility testing and developing the audio-processing pipeline. The code and processing methods may change as I collect results and improve the system.

About This Repository

This repository contains the Python code used for the MOM Device v2 project. I am making the code publicly available so that the methods used in the project can be viewed and, where possible, reproduced by others.

Author

Neelesh Kotte
