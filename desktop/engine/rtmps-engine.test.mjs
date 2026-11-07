import test from "node:test";
import assert from "node:assert/strict";
import { buildFfmpegArgs, redactSecrets, validateRtmpsUrl } from "./rtmps-engine.mjs";

test("validates YouTube RTMPS URL", () => {
  assert.equal(validateRtmpsUrl("rtmps://a.rtmps.youtube.com/live2/key"), "rtmps://a.rtmps.youtube.com/live2/key");
});
test("rejects plain RTMP, HTTP and embedded credentials", () => {
  for (const url of ["rtmp://example.com/live", "https://example.com", "rtmps://user:pass@example.com/live", "rtmps://example.com/live?token=x"]) {
    assert.throws(() => validateRtmpsUrl(url));
  }
});
test("creates FFmpeg input and YouTube-compatible output settings", () => {
  const args = buildFfmpegArgs("rtmps://a.rtmps.youtube.com/live2/test-key", 4500);
  assert.deepEqual(args.slice(args.indexOf("-f"), args.indexOf("-i") + 2), ["-f", "webm", "-i", "pipe:0"]);
  assert.equal(args[args.indexOf("-c:v") + 1], "libx264");
  assert.equal(args[args.indexOf("-c:a") + 1], "aac");
  assert.equal(args[args.indexOf("-f") + 1], "webm");
  assert.equal(args.at(-2), "flv");
  assert.equal(args.at(-1), "rtmps://a.rtmps.youtube.com/live2/test-key");
});
test("rejects out-of-range bitrates", () => {
  for (const bitrate of [0, 499, 20001, 4500.5, NaN]) assert.throws(() => buildFfmpegArgs("rtmps://example.com/live/key", bitrate));
});
test("redacts both full destination and key from encoder diagnostics", () => {
  const url = "rtmps://a.rtmps.youtube.com/live2/sensitive-key";
  const text = redactSecrets(`Error opening ${url} (sensitive-key)`, url);
  assert.ok(!text.includes("sensitive-key"));
  assert.ok(!text.includes(url));
});
