import { describe, expect, it, vi } from "vitest";
import { TransitionGuard } from "./transition-guard";

describe("TransitionGuard", () => {
  it("blocks simultaneous cuts and confirms only after acknowledgement", async () => {
    const guard = new TransitionGuard();
    let acknowledge!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    const first = guard.execute(action);
    expect(guard.state.phase).toBe("pending");
    expect(await guard.execute(action)).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    acknowledge();
    expect(await first).toBe(true);
    expect(guard.state.phase).toBe("confirmed");
  });

  it("reports errors and releases the lock", async () => {
    const guard = new TransitionGuard();
    expect(await guard.execute(async () => { throw new Error("Engine offline"); })).toBe(false);
    expect(guard.state).toMatchObject({ phase: "error", message: "Engine offline" });
    expect(guard.locked).toBe(false);
    guard.reset();
    expect(guard.state.phase).toBe("idle");
  });
});
