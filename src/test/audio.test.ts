import { describe, expect, it } from "vitest";
import { dbToGain, faderToDb, smpte } from "@/lib/broadcast/audio";

describe("audio taper", () => {
  it("unity at 0.75", () => expect(faderToDb(0.75)).toBe(0));
  it("+10 dB at top", () => expect(faderToDb(1)).toBe(10));
  it("-inf at bottom", () => expect(faderToDb(0)).toBe(-Infinity));
  it("0 dB = gain 1", () => expect(dbToGain(0)).toBe(1));
  it("SMPTE timecode at 30fps", () => expect(smpte(3_661_500)).toBe("01:01:01:15"));
});
