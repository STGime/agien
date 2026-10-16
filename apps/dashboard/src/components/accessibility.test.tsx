import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { EvaluationsTable } from "./EvaluationsTable";
import { EmptyState } from "./EmptyState";
import { Login } from "./Login";
import type { Evaluation } from "../types";

const rows: Evaluation[] = [
  {
    id: "e1",
    venue_id: "v1",
    session_token_hash: null,
    p_agent: 0.12,
    p_phantom: 0.5,
    action: "allow",
    reasons: [{ code: "a", weight: 0.1 }],
    policy_version: "v0",
    latency_ms: null,
    created_at: "2026-10-16T10:00:00Z",
  },
];

describe("accessibility", () => {
  it("EvaluationsTable has no serious or critical violations", async () => {
    const { container } = render(<EvaluationsTable rows={rows} />);
    const results = await axe(container);
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious).toEqual([]);
  });

  it("Login has no serious or critical violations", async () => {
    const { container } = render(<Login onAuthed={() => {}} />);
    const results = await axe(container);
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious).toEqual([]);
  });

  it("EmptyState has no serious or critical violations", async () => {
    const { container } = render(<EmptyState venueName="Venue Test A" />);
    const results = await axe(container);
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious).toEqual([]);
  });
});
