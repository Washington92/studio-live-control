import { describe, expect, it } from "vitest";
import { sourceOutputGain, type ProgramMix } from "@/lib/broadcast/program-output";

const baseMix = (): ProgramMix => ({
  inputs: [],
  channels: {
    camera: { fader: 0.75, mute: false, solo: false, afv: true },
    screen: { fader: 0.75, mute: false, solo: false, afv: true },
  },
  master: { fader: 0.75, mute: false },
  programId: "camera",
  previewId: "screen",
  transition: 0,
  fadeToBlack: 0,
});

describe("Program output audio routing", () => {
  it("routes only Program audio when AFV is enabled", () => {
    const mix = baseMix();
    expect(sourceOutputGain(mix, "camera")).toBe(1);
    expect(sourceOutputGain(mix, "screen")).toBe(0);
  });

  it("crossfades AFV audio with the picture transition", () => {
    const mix = baseMix();
    mix.transition = 0.5;
    expect(sourceOutputGain(mix, "camera")).toBe(0.5);
    expect(sourceOutputGain(mix, "screen")).toBe(0.5);
  });

  it("respects mute and solo", () => {
    const mix = baseMix();
    mix.channels.screen!.solo = true;
    expect(sourceOutputGain(mix, "camera")).toBe(0);
    expect(sourceOutputGain(mix, "screen")).toBe(0);
    mix.channels.screen!.afv = false;
    expect(sourceOutputGain(mix, "screen")).toBe(1);
    mix.channels.screen!.mute = true;
    expect(sourceOutputGain(mix, "screen")).toBe(0);
  });

  it("can keep non-AFV sources audible outside Program", () => {
    const mix = baseMix();
    mix.channels.screen!.afv = false;
    expect(sourceOutputGain(mix, "screen")).toBe(1);
    mix.channels.screen!.fader = 0;
    expect(sourceOutputGain(mix, "screen")).toBe(0);
  });
});
