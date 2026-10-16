import { useState } from "react";
import type { Evaluation } from "../types";

function fmtProb(p: number): string {
  return p.toFixed(2);
}

const ACTION_BADGE: Record<Evaluation["action"], string> = {
  allow: "badge badge-allow",
  step_up: "badge badge-step",
  deny: "badge badge-deny",
};

const ACTION_LABEL: Record<Evaluation["action"], string> = {
  allow: "allow",
  step_up: "step up",
  deny: "deny",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function EvaluationsTable({ rows }: { rows: Evaluation[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (rows.length === 0) return null;

  return (
    <table className="evals">
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col" className="num">
            p_agent
          </th>
          <th scope="col" className="num">
            p_phantom
          </th>
          <th scope="col">Action</th>
          <th scope="col">Reasons</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const reasons = row.reasons ?? [];
          const top = reasons.slice(0, 3);
          const rest = reasons.length - top.length;
          const isOpen = expanded[row.id] ?? false;
          return (
            <tr key={row.id}>
              <td className="time">{fmtTime(row.created_at)}</td>
              <td className="num">{fmtProb(row.p_agent)}</td>
              <td className="num">{fmtProb(row.p_phantom)}</td>
              <td>
                <span className={ACTION_BADGE[row.action]}>{ACTION_LABEL[row.action]}</span>
              </td>
              <td>
                <span className="reasons">
                  {top.map((r) => r.code).join(", ")}
                  {rest > 0 && (
                    <button
                      type="button"
                      className="more"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded((s) => ({ ...s, [row.id]: !isOpen }))}
                    >
                      +{rest}
                    </button>
                  )}
                  {isOpen && rest > 0 && (
                    <span className="rest" data-testid="rest">
                      {reasons.map((r) => r.code).join(", ")}
                    </span>
                  )}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
