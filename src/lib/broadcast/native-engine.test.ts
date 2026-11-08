import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeEngine, nativeEngineDiagnostics } from "./native-engine";

describe("native engine bridge", () => {
  afterEach(() => {
    delete window.wmixNative;
  });

  it("stays optional in the browser", async () => {
    expect(nativeEngine()).toBeNull();
    expect(await nativeEngineDiagnostics()).toEqual({ available: false, ready: false });
  });

  it("reports an offline native process", async () => {
    window.wmixNative = {
      status: vi.fn().mockResolvedValue({ ready: false }),
      command: vi.fn(),
      onEvent: vi.fn(() => () => {}),
    };
    expect(await nativeEngineDiagnostics()).toEqual({ available: true, ready: false });
    expect(window.wmixNative.command).not.toHaveBeenCalled();
  });

  it("queries native status without cutting scenes", async () => {
    window.wmixNative = {
      status: vi.fn().mockResolvedValue({ ready: true }),
      command: vi.fn().mockResolvedValue("STATUS PROGRAM"),
      onEvent: vi.fn(() => () => {}),
    };
    expect(await nativeEngineDiagnostics()).toEqual({
      available: true, ready: true, scene: "STATUS PROGRAM",
    });
    expect(window.wmixNative.command).toHaveBeenCalledWith("STATUS");
  });
});
