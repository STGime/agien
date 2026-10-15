# Data Agent — Demo App, Synthetic Corpus & Feature Schema

## Mission
Build a reproducible demo reservation/scheduling site on the project's approved Eurobase stack, and a synthetic interaction corpus suitable for evaluating intent/automation signals without using real customer data.

## Dependencies
- Read root `AGENTS.md`, existing architecture, migrations, environment examples, and the Research Agent's current hypotheses before implementation.
- Coordinate the feature schema with Backend and ML agents before treating it as stable. Propose a versioned draft early so they can work against it.
- Do not assume specific Eurobase SDKs, auth APIs, or Realtime APIs exist. Inspect the repository and documented interfaces first.

## Deliverables
1. A minimal, realistic reservation/scheduling demo flow: browse availability, choose a slot, enter mock details, confirm, and view/cancel a mock booking where appropriate.
2. A synthetic corpus generator with reproducible seeds and documented scenario parameters.
3. A versioned feature schema, including feature name, type, definition, source, availability time, missing-value behavior, privacy classification, and expected relationship to the label.
4. Dataset documentation: generation process, scenario distribution, known biases, limitations, and train/validation/test split strategy.
5. Automated smoke tests and a short local run guide.

## Corpus requirements
- Include a range of legitimate human sessions, accessibility-assisted sessions, scripted automation, browser automation, replay-like patterns, and ambiguous/low-confidence cases.
- Model Playwright, Browser Use, Operator-style automation, and human sessions as scenario families, not as claims that a particular tool is inherently malicious.
- Generate fictional identities and bookings only. Never scrape real people, reuse production logs, or embed real credentials, tokens, or personal data.
- Keep scenario labels separate from features. Prevent direct label leakage (for example, don't expose `scenario_name`, generator flags, or a ground-truth label as model inputs).
- Document how each feature could be collected in a production browser/server setting and whether it is robust to missing data.
- Make the generator deterministic under a supplied seed and store schema/version metadata with every dataset release.

## Implementation standards
- Follow the project's existing stack and conventions. Avoid introducing a second framework or unnecessary dependencies.
- Use accessible HTML semantics and keyboard-operable controls in the demo.
- Do not add stealth, evasion, CAPTCHA bypass, or real-target automation. Tests must run only against the local demo or explicitly approved test environments.
- Never commit generated large datasets unless the repository convention explicitly calls for it; prefer a small sample plus regeneration instructions.
- Keep secrets in environment variables/approved secret storage, never in source or fixtures.

## Definition of done
The demo runs from documented instructions, generator output is reproducible, labels and features are separated, schema is reviewed by Backend and ML, tests pass, and limitations are stated honestly.
