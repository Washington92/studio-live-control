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

import { parseNativeControlResponse } from "./native-engine";

describe("native control protocol", () => {
  it("parses confirmed CUT and current Program source", () => {
    expect(parseNativeControlResponse("OK CUT PREVIEW")).toEqual({ type: "cut", ok: true, scene: "PREVIEW" });
    expect(parseNativeControlResponse("STATUS PROGRAM")).toEqual({ type: "status", scene: "PROGRAM" });
  });
  it("does not mistake a failed CUT for success", () => {
    expect(parseNativeControlResponse("ERROR CUT PROGRAM")).toEqual({ type: "cut", ok: false, scene: "PROGRAM" });
    expect(parseNativeControlResponse("garbage").type).toBe("error");
  });
});

describe("native desktop contract", () => {
  it("allows a source test without modifying browser state", async () => {
    const command = vi.fn().mockResolvedValue("OK SOURCE WMix Test Color");
    window.wmixNative = {
      status: vi.fn().mockResolvedValue({ ready: true }),
      command,
      onEvent: vi.fn(() => () => {}),
      restart: vi.fn().mockResolvedValue({ restarted: true }),
    };
    expect(await nativeEngine()?.command("ADD_TEST_SOURCE")).toBe("OK SOURCE WMix Test Color");
    expect(command).toHaveBeenCalledOnce();
    expect(command).toHaveBeenCalledWith("ADD_TEST_SOURCE");
    expect(await nativeEngine()?.restart?.()).toEqual({ restarted: true });
  });
});

describe("native source status", () => {
  it("distinguishes an attached source from an absent source", () => {
    expect(parseNativeControlResponse("SOURCE_STATUS PRESENT WMix Test Color")).toEqual({
      type: "source-status", present: true, name: "WMix Test Color",
    });
    expect(parseNativeControlResponse("SOURCE_STATUS ABSENT WMix Test Color")).toEqual({
      type: "source-status", present: false, name: "WMix Test Color",
    });
  });
});

describe("native Program scene routing", () => {
  it("distinguishes a source on air from a source only registered in OBS", () => {
    expect(parseNativeControlResponse("PROGRAM_SOURCE_STATUS PRESENT WMix Test Color")).toEqual({
      type: "program-source-status", present: true, name: "WMix Test Color",
    });
    expect(parseNativeControlResponse("PROGRAM_SOURCE_STATUS ABSENT WMix Test Color")).toEqual({
      type: "program-source-status", present: false, name: "WMix Test Color",
    });
  });
});
