import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EvaluationsTable } from "./EvaluationsTable";
import type { Evaluation } from "../types";

const row = (over: Partial<Evaluation>): Evaluation => ({
  id: "e1",
  venue_id: "v1",
  session_token_hash: null,
  p_agent: 0.1234,
  p_phantom: 0.5678,
  action: "allow",
  reasons: [{ code: "datacenter_asn", weight: 0.4 }],
  policy_version: "v0",
  latency_ms: null,
  created_at: "2026-10-16T10:00:00Z",
  ...over,
});

describe("EvaluationsTable", () => {
  it("renders probabilities with two decimals", () => {
    render(
      <EvaluationsTable
        rows={[
          row({ id: "e1", p_agent: 0.12345, p_phantom: 0.5 }),
          row({ id: "e2", p_agent: 0.9, p_phantom: 0.999 }),
        ]}
      />,
    );
    expect(screen.getByText("0.12")).toBeInTheDocument();
    expect(screen.getByText("0.50")).toBeInTheDocument();
    expect(screen.getByText("0.90")).toBeInTheDocument();
    expect(screen.getByText("1.00")).toBeInTheDocument();
  });

  it("renders action badges", () => {
    render(
      <EvaluationsTable
        rows={[
          row({ id: "a", action: "allow" }),
          row({ id: "b", action: "step_up" }),
          row({ id: "c", action: "deny" }),
        ]}
      />,
    );
    expect(screen.getByText("allow")).toBeInTheDocument();
    expect(screen.getByText("step up")).toBeInTheDocument();
    expect(screen.getByText("deny")).toBeInTheDocument();
  });

  it("truncates reasons to 3 with a +n indicator", () => {
    const reasons = ["a", "b", "c", "d", "e"].map((code) => ({ code, weight: 0.1 }));
    render(<EvaluationsTable rows={[row({ id: "x", reasons })]} />);
    // first three codes shown inline, +2 indicator for the rest
    expect(screen.getByText("a, b, c")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+2" })).toBeInTheDocument();
  });

  it("expands to show all reasons when the +n button is clicked", async () => {
    const user = userEvent.setup();
    const reasons = ["a", "b", "c", "d", "e"].map((code) => ({ code, weight: 0.1 }));
    render(<EvaluationsTable rows={[row({ id: "x", reasons })]} />);
    await user.click(screen.getByRole("button", { name: "+2" }));
    expect(screen.getByText("a, b, c, d, e")).toBeInTheDocument();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<EvaluationsTable rows={[]} />);
    expect(container.querySelector("table")).toBeNull();
  });
});
