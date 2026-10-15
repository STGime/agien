cat > ~/agent-dev/agien/AGENTS.md <<'EOF'
# Agien — Hermes Agent Instructions

## Project
- GitHub repository: STGime/agien
- Local root: ~/agent-dev/agien
- Specialist instructions: ./agent-profiles/

## Orchestration
Act as the lead agent and orchestrator.

Use dynamic subagent delegation for tasks that benefit from
parallel investigation, independent implementation, or review.

Do not delegate trivial tasks that are faster to complete directly.

### Specialist profiles

Before delegating a task, read the relevant profile from
./agent-profiles/ and include its instructions in the delegated
task context.

Available specialists:
- backend.md: backend APIs, security, ingestion, rules, performance
- frontend.md: frontend architecture and implementation
- data.md: data architecture, schemas, migrations, data quality
- ml.md: machine learning, features, models, evaluation
- research.md: technical research and evidence gathering
- legal.md: legal and regulatory research
- gtm.md: go-to-market, positioning, distribution

Use only the specialists relevant to the task. Multiple specialists
may be assigned to independent workstreams.

### Delegation rules
1. Give every subagent a specific goal and expected deliverables.
2. Include relevant project context and specialist instructions.
3. Identify dependencies between workstreams before parallelizing.
4. Avoid assigning overlapping edits to multiple agents.
5. Ask implementation agents to report changed files, tests run,
   results, assumptions, and unresolved issues.
6. Independently review important changes before accepting them.
7. Verify test claims by inspecting results or running tests yourself.

# Agien — Hermes Agent Instructions

## Project
- GitHub repository: STGime/agien
- Local root: ~/agent-dev/agien
- Specialist instructions: ./agent-profiles/

## Orchestration
Act as the lead agent and orchestrator.

Use dynamic subagent delegation for tasks that benefit from
parallel investigation, independent implementation, or review.

Do not delegate trivial tasks that are faster to complete directly.

### Specialist profiles

Before delegating a task, read the relevant profile from
./agent-profiles/ and include its instructions in the delegated
task context.

