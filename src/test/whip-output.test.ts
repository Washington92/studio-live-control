import { describe, expect, it } from "vitest";
import { resolveWhipSessionLocation, validateWhipEndpoint } from "@/lib/broadcast/whip-output";

describe("WHIP endpoint validation", () => {
  it("accepts HTTPS WHIP addresses", () => {
    expect(validateWhipEndpoint("https://example.com/whip")).toBe("https://example.com/whip");
  });
  it("rejects RTMP and insecure endpoints", () => {
    expect(() => validateWhipEndpoint("rtmps://example.com/live/key")).toThrow("HTTPS");
    expect(() => validateWhipEndpoint("http://example.com/whip")).toThrow("HTTPS");
    expect(() => validateWhipEndpoint("not a url")).toThrow("URL");
  });
  it("rejects credentials in the URL authority", () => {
    expect(() => validateWhipEndpoint("https://user:password@example.com/live")).toThrow();
  });
  it("resolves relative session locations", () => {
    expect(resolveWhipSessionLocation("https://example.com/whip", "/session/123")).toBe("https://example.com/session/123");
  });
  it("prevents cross-origin session deletion", () => {
    expect(() => resolveWhipSessionLocation("https://example.com/whip", "https://other.example/s")).toThrow("outra origem");
  });
  it("requires a Location header", () => {
    expect(() => resolveWhipSessionLocation("https://example.com/whip", null)).toThrow("Location");
  });
});
