import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEvaluations } from "./useEvaluations";
import { setEurobaseClient } from "../lib/eurobase";
import type { Evaluation } from "../types";

/** Minimal fake Eurobase client capturing query filters and realtime subs. */
function makeClient(rows: Evaluation[]) {
  const realtimeCallbacks: Array<(event: { record: unknown }) => void> = [];
  const off = vi.fn();

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (v: { data: Evaluation[]; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };

  const client = {
    db: {
      from: vi.fn(() => builder as never),
    },
    realtime: {
      on: vi.fn((_table: string, _event: string, cb: (event: { record: unknown }) => void) => {
        realtimeCallbacks.push(cb);
        return { id: "sub-1" };
      }),
      off,
    },
  } as never;

  return { client, builder, realtimeCallbacks, off };
}

beforeEach(() => {
  setEurobaseClient(null);
});

describe("useEvaluations", () => {
  it("queries evaluations filtered by venue_id, ordered, limited", async () => {
    const { client, builder } = makeClient([{ id: "e1" } as Evaluation]);
    setEurobaseClient(client as never);
    renderHook(() => useEvaluations("venue-a"));

    await waitFor(() => {
      expect(builder.eq).toHaveBeenCalledWith("venue_id", "venue-a");
    });
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(200);
  });

  it("drops realtime inserts for a different venue", async () => {
    const { client, realtimeCallbacks } = makeClient([{ id: "e1" } as Evaluation]);
    setEurobaseClient(client as never);
    const { result } = renderHook(() => useEvaluations("venue-a"));
    await waitFor(() => expect(result.current.evaluations.length).toBe(1));

    // a venue-b insert must be filtered out client-side
    act(() => {
      realtimeCallbacks.forEach((cb) =>
        cb({ record: { id: "e-b", venue_id: "venue-b" } }),
      );
    });
    expect(result.current.evaluations).toHaveLength(1);
  });

  it("prepends matching realtime inserts", async () => {
    const { client, realtimeCallbacks } = makeClient([{ id: "e1" } as Evaluation]);
    setEurobaseClient(client as never);
    const { result } = renderHook(() => useEvaluations("venue-a"));
    await waitFor(() => expect(result.current.evaluations.length).toBe(1));

    act(() => {
      realtimeCallbacks.forEach((cb) =>
        cb({ record: { id: "e-new", venue_id: "venue-a" } }),
      );
    });
    expect(result.current.evaluations[0].id).toBe("e-new");
    expect(result.current.evaluations).toHaveLength(2);
  });

  it("unsubscribes on unmount", async () => {
    const { client, off } = makeClient([]);
    setEurobaseClient(client as never);
    const { unmount } = renderHook(() => useEvaluations("venue-a"));
    unmount();
    await waitFor(() => expect(off).toHaveBeenCalledWith({ id: "sub-1" }));
  });
});
