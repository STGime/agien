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

## Eurobase Integration

- Eurobase project: Newtek.
- Use the Eurobase MCP tools to inspect the project schema and platform capabilities.
- Read the existing schema before designing database changes.
- Use the Eurobase SDK and documented APIs when implementing application code.
- Keep public keys separate from privileged server-side credentials.
- Never place PATs, secret keys, or other credentials in source code,
  frontend bundles, Git commits, or logs.
- Propose schema changes before applying them.
- Never delete tables, alter production data, or deploy functions without
  explicit approval.
- Test API behavior and relevant access-control policies.

### Eurobase SDK and MCP

- JavaScript/TypeScript SDK package: `@eurobase/sdk`.
- Target project: `newtek`.
- Project URL: `https://newtek.eurobase.app`.
- Project ID: `93df6379-8b4c-4056-8e61-647bffd9aa7c`.
- Initialise the SDK with `createClient({ url, apiKey, projectId? })`; `projectId` is optional and only required for realtime calls using an end-user access token.
- Read the installed SDK types and documentation before relying on a method or API.
- Use the configured `eurobase_newtek` MCP for supported project inspection and management operations.
- Treat management PATs and SDK API keys as distinct credentials. Never assume one can substitute for the other.
- Use public API keys only where appropriate. Secret API keys must remain server-side.
- Never print credentials or place them in source code, Git commits, or frontend bundles.
- Prefer read-only inspection before making changes.
- Explain proposed schema or access-control changes and their impact before applying them.
- Require explicit approval for destructive changes, production-data modifications, and deployments.
- Verify important operations and report the actual results, not merely that a command succeeded.
