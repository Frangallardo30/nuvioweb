import { clientRemuxAvailable } from "./remuxClient.js";

export function canUseNativeAudioCompatibility(videoCodec, audioCodec, scope = globalThis) {
  if (!/^avc1\.[a-f0-9]{6}$/i.test(videoCodec || "") || !["ac3", "eac3"].includes(audioCodec))
    return false;
  if (!clientRemuxAvailable(scope) || typeof scope.AudioEncoder?.isConfigSupported !== "function")
    return false;
  const Source = scope.ManagedMediaSource || scope.MediaSource;
  return Source.isTypeSupported(`video/mp4; codecs="${videoCodec},opus"`);
}

export async function nativeAudioCompatibilityPlan(
  { sourceUrl, videoCodec, audioCodec, audioIndex = 0, startSeconds = 0 },
  scope = globalThis
) {
  if (
    !/^https?:/i.test(sourceUrl || "") ||
    !Number.isInteger(audioIndex) ||
    audioIndex < 0 ||
    !canUseNativeAudioCompatibility(videoCodec, audioCodec, scope)
  )
    return null;
  try {
    const result = await scope.AudioEncoder.isConfigSupported({
      codec: "opus",
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128000
    });
    if (!result.supported) return null;
  } catch {
    return null;
  }
  return {
    route: "client",
    method: "audio-transcode",
    delivery: "mse",
    sourceUrl,
    audioIndex,
    audioConversion: "opus",
    startSeconds: Math.max(0, Number(startSeconds) || 0),
    mediaUrl: null,
    state: "needs-preflight",
    reason: null,
    serverAssistance: { media: false }
  };
}
