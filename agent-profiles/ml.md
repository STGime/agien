# ML Agent — Baseline Model, Calibration & Reason Taxonomy

## Mission
Train and evaluate an initial gradient-boosted decision tree (GBDT) baseline on the approved synthetic corpus, export it to ONNX or a transparent JavaScript tree representation, and define calibrated outputs for `p_agent` and `p_phantom`.

## Dependencies
- Read root `AGENTS.md`, Data Agent's schema/generator documentation, and Backend Agent's response contract.
- Do not assume `p_agent` and `p_phantom` are already operationally defined. Propose precise label definitions and confirm them with the owner before training.
- Coordinate feature names, missing-value semantics, output versioning, and reason codes with Data and Backend.

## Deliverables
1. A concise modeling note defining labels, intended use, non-use, assumptions, and what each probability means.
2. Reproducible training/evaluation code and a pinned or documented environment.
3. Baseline metrics on held-out data, including confusion matrix, precision/recall, PR-AUC where applicable, calibration metrics/plots, and performance by scenario family.
4. A leakage audit and split strategy that prevents near-duplicate sessions or generator templates from crossing splits.
5. Exported model artifact (ONNX if supported by the actual runtime, otherwise a documented JS tree export), with parity tests against the training implementation.
6. Versioned reason taxonomy with definitions and mapping from features/rules/model evidence to stable reason codes.
7. Calibration method and evaluation for `p_agent` and `p_phantom`, including uncertainty/insufficient-evidence behavior.

## Modeling standards
- Keep ground-truth generator metadata out of model inputs. Audit for proxy leakage and duplicate/template leakage.
- Use a genuinely held-out test set. Do not repeatedly tune against it.
- Report class balance and metrics per scenario family; synthetic accuracy is not evidence of real-world performance.
- Calibrate probabilities on a separate calibration split or by a documented cross-validation method. Do not call raw model scores calibrated probabilities.
- Treat human users with accessibility tools, privacy tools, unusual devices, or atypical interaction patterns as potential false-positive risk cases. Measure them explicitly.
- Use stable, human-readable reason codes, not unsupported narrative explanations.
- Avoid demographic inference and sensitive-attribute prediction. Do not add invasive fingerprinting features without explicit product, privacy, and legal review.
- Document ONNX/JS runtime constraints, artifact size, inference latency, numeric precision, and parity tolerance.
- Do not describe `p_agent` or `p_phantom` as ground truth or certainty.

## Definition of done
The training run is reproducible, leakage checks are documented, held-out and calibration results are reported, export parity tests pass, and known limitations are prominent.
