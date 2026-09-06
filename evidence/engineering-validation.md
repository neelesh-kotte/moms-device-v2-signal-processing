# Engineering validation record

## Scope

MOM is a low-cost prototype for abdominal-acoustic data capture and analysis. The evidence below supports engineering claims about the prototype and its workflow. It does not establish a diagnosis, a disease detector, an objective hunger meter, or clinical validity.

## V1 → V2 → V3

| Version | Engineering question | What changed | Evidence boundary |
|---|---|---|---|
| V1 | Can a low-cost acoustic chain capture a usable abdominal signal? | Established the ESP32, MAX4466 microphone amplifier, and stethoscope-style acoustic coupling as a workable capture chain. | Capture feasibility is not clinical validity. |
| V2 | Can the capture and analysis process be made more controlled? | Added controlled acquisition, sample-rate checks, clipping checks, duplicate rejection, source-separated evaluation, and held-out analysis. | Held-out engineering evaluation is not a medical performance study. |
| V3 | Can the system become a careful human-in-the-loop product prototype? | Added guided recordings, signal-quality gates, profile separation, optional self-reports, uncertainty-aware summaries, privacy-safe Guest Mode, and “Not enough information” abstention. | Product behavior is documented separately from the public-corpus research result. |

## Project evidence register

| Evidence item | Publicly reported result | What it supports | What it does not support |
|---|---:|---|---|
| Controlled engineering experiments | 32+ | Iterative testing across hardware, acquisition, data preparation, and evaluation workflow | A universal reliability estimate |
| Within-condition variability | Approximately 30% before iteration; 10–12% after iteration | Quantified improvement in the project’s recorded repeatability measure | A standard clinical measurement or population statistic |
| Recurring clipping failure | Eliminated in the tested configuration | A concrete hardware/gain/protocol failure mode was addressed | Clipping-free operation under every environment |
| Independent operators | 2 people completed the recording workflow without direct supervision | The written workflow was usable by more than the designer in this small sample | General operator reliability or inter-rater validity |
| External technical review | 8+ professional engineering reviewers | Design critique was obtained across chemical, mechanical, and software/technical perspectives | Endorsement, certification, or peer review |
| Public-data transport analysis | 6,424 complete windows from 19 anonymized subject groups; 16 groups were eligible for both classes | A reproducible external-corpus test can be run from public data | A positive primary replication |

## External validation result

The frozen primary endpoint was the equal-subject mean of each eligible subject’s event-minus-non-event median spectral-ratio difference:

- mean difference: 0.0089;
- 95% bootstrap interval: −0.0151 to 0.0329;
- exact two-sided sign-flip p = 0.455.

That primary median-shift result is inconclusive. The derivation absolute-power pattern was not treated as replicated.

A within-subject rank-probability analysis was added after the primary result and is labeled exploratory:

- equal-subject mean probability: 0.598;
- 95% bootstrap interval: 0.540 to 0.655;
- exact two-sided sign-flip p = 0.0032.

The exploratory analysis does not replace the primary endpoint. It is not a diagnostic threshold, biomarker, mechanism, or clinical tool.

## Audit path

- Run the [external-corpus package](../external_validation/README.md).
- Inspect the generated window_level_results.csv and subject_summary.csv.
- Compare fresh output with expected_external_summary.json only through --verify-targets.
- Inspect the [hardware record](hardware-iteration.md), [operator record](independent-operator-evidence.md), and [reviewer record](external-reviewers.md).

Raw public audio is not redistributed in this repository. Personal MOM recordings and private dashboard records are not published.
