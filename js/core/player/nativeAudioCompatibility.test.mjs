import test from "node:test";
import assert from "node:assert/strict";
import { nativeAudioCompatibilityPlan } from "./nativeAudioCompatibility.js";
import { shouldRoutePlayerToMovi } from "./movi/moviCapability.js";

const source = {
  sourceUrl: "https://media.test/movie.mkv",
  videoCodec: "avc1.640028",
  audioCodec: "eac3",
  audioIndex: 1,
  startSeconds: 42
};
const scope = {
  isSecureContext: true,
  Worker: function () {},
  navigator: { storage: { getDirectory() {} } },
  MediaSource: { isTypeSupported: () => true },
  AudioEncoder: { isConfigSupported: async () => ({ supported: true }) }
};

test("Dolby conversion preserves source time and audio selection while using native video", async () => {
  const plan = await nativeAudioCompatibilityPlan(source, scope);
  assert.equal(plan.audioIndex, 1);
  assert.equal(plan.startSeconds, 42);
  assert.equal(plan.audioConversion, "opus");
  assert.equal(plan.serverAssistance.media, false);
  assert.equal(
    shouldRoutePlayerToMovi(
      { streamUrl: source.sourceUrl, playbackPlan: plan },
      { playerEngine: "movi" },
      { webCodecs: true }
    ),
    false
  );
});

test("incompatible devices and unsupported video never enter the conversion route", async () => {
  assert.equal(
    await nativeAudioCompatibilityPlan(source, { ...scope, AudioEncoder: undefined }),
    null
  );
  assert.equal(
    await nativeAudioCompatibilityPlan({ ...source, videoCodec: "hvc1.1.6.L120.B0" }, scope),
    null
  );
  assert.equal(
    await nativeAudioCompatibilityPlan(source, {
      ...scope,
      AudioEncoder: { isConfigSupported: async () => ({ supported: false }) }
    }),
    null
  );
});
