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

describe("native video diagnostics", () => {
  it("parses libobs output resolution and rational frame rate", () => {
    expect(parseNativeControlResponse("VIDEO_STATUS 1280x720 30000/1001")).toEqual({
      type: "video-status", width: 1280, height: 720, fpsNum: 30000, fpsDen: 1001,
    });
  });
  it("rejects invalid zero frame-rate denominator", () => {
    expect(parseNativeControlResponse("VIDEO_STATUS 1280x720 30/0")).toEqual({
      type: "error", message: "Resposta nativa desconhecida",
    });
  });
});

describe("native Preview scene membership", () => {
  it("parses whether the test source is attached to Preview", () => {
    expect(parseNativeControlResponse("PREVIEW_SOURCE_STATUS PRESENT WMix Test Color")).toEqual({
      type: "preview-source-status", present: true, name: "WMix Test Color",
    });
    expect(parseNativeControlResponse("PREVIEW_SOURCE_STATUS ABSENT WMix Test Color")).toEqual({
      type: "preview-source-status", present: false, name: "WMix Test Color",
    });
  });
});

describe("native output tally", () => {
  it("parses the actual Program/Preview output routing", () => {
    expect(parseNativeControlResponse("TALLY_STATUS PROGRAM")).toEqual({
      type: "tally-status", scene: "PROGRAM",
    });
    expect(parseNativeControlResponse("TALLY_STATUS PREVIEW")).toEqual({
      type: "tally-status", scene: "PREVIEW",
    });
    expect(parseNativeControlResponse("TALLY_STATUS UNKNOWN")).toEqual({
      type: "tally-status", scene: "UNKNOWN",
    });
  });
});

describe("native protocol regression after Lovable transform failure", () => {
  it("parses VIDEO_STATUS without malformed escaped regex", () => {
    expect(parseNativeControlResponse("VIDEO_STATUS 1920x1080 60/1")).toEqual({
      type: "video-status", width: 1920, height: 1080, fpsNum: 60, fpsDen: 1,
    });
    expect(parseNativeControlResponse("VIDEO_STATUS invalid").type).toBe("error");
  });

  it("handles an unknown native output scene safely", () => {
    expect(parseNativeControlResponse("STATUS UNKNOWN")).toEqual({
      type: "status", scene: "UNKNOWN",
    });
    expect(parseNativeControlResponse("ERROR CUT UNKNOWN")).toEqual({
      type: "error", message: "CUT UNKNOWN",
    });
  });
});
