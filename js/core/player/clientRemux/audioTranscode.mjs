import { EncodedPacket } from "mediabunny";

/* global importScripts, createFFmpegCore */
let corePromise;
const INPUT = "/nuvio-dolby-input",
  OUTPUT = "/nuvio-dolby-output.pcm",
  RATE = 48000,
  CHANNELS = 2;

async function loadAudioCore() {
  if (!corePromise) {
    const script = new URL("../../ffprobe/ffmpeg-core.js?v=0.12.10", self.location.href);
    const wasm = new URL("ffmpeg-core.wasm?v=0.12.10", script);
    importScripts(script.href);
    corePromise = createFFmpegCore({
      // This core overrides locateFile; its supported URL override lives here.
      mainScriptUrlOrBlob: script.href + "#" + btoa(JSON.stringify({ wasmURL: wasm.href }))
    });
  }
  return corePromise;
}

/** Decode only Dolby audio in the remux worker; video packets never enter FFmpeg. */
export async function createDolbyAudioTranscoder({ codec, onPacket }) {
  if (!["ac3", "eac3"].includes(codec)) throw Error("audio-conversion-codec-unsupported");
  const core = await loadAudioCore();
  core.setLogger(() => {});
  let packets = [],
    duration = 0,
    previous = null,
    failure = null,
    writes = Promise.resolve();
  const encoder = new AudioEncoder({
    output(chunk, meta) {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      writes = writes
        .then(() => onPacket(packet, meta))
        .catch((error) => {
          failure ||= error;
        });
    },
    error(error) {
      failure ||= error;
    }
  });
  encoder.configure({
    codec: "opus",
    sampleRate: RATE,
    numberOfChannels: CHANNELS,
    bitrate: 128000
  });
  function remove(path) {
    try {
      core.FS.unlink(path);
    } catch {
      /* The first batch has no previous files. */
    }
  }
  async function batch() {
    if (!packets.length) return;
    if (failure) throw failure;
    const current = packets;
    packets = [];
    duration = 0;
    // One preceding frame restores the IMDCT overlap at every batch boundary.
    // Its PCM is discarded, so both audio and video retain their source timestamps.
    const preroll =
      previous && Math.abs(previous.timestamp + previous.duration - current[0].timestamp) < 0.003
        ? previous
        : null;
    const inputPackets = preroll ? [preroll, ...current] : current;
    const bytes = new Uint8Array(inputPackets.reduce((n, packet) => n + packet.byteLength, 0));
    let offset = 0;
    for (const packet of inputPackets) {
      bytes.set(packet.data, offset);
      offset += packet.byteLength;
    }
    remove(INPUT);
    remove(OUTPUT);
    try {
      core.FS.writeFile(INPUT, bytes);
      core.reset();
      core.exec(
        "-v",
        "error",
        "-f",
        codec,
        "-i",
        INPUT,
        "-ac",
        String(CHANNELS),
        "-ar",
        String(RATE),
        "-c:a",
        "pcm_f32le",
        "-f",
        "f32le",
        OUTPUT
      );
      if (core.ret !== 0) throw Error("audio-conversion-decode-failed");
      const pcm = core.FS.readFile(OUTPUT);
      const skip = preroll ? Math.round(preroll.duration * RATE) : 0;
      const frames = pcm.byteLength / (4 * CHANNELS) - skip;
      if (!Number.isInteger(frames) || frames <= 0 || frames > RATE * 2)
        throw Error("audio-conversion-output-invalid");
      const audio = new AudioData({
        format: "f32",
        sampleRate: RATE,
        numberOfChannels: CHANNELS,
        numberOfFrames: frames,
        timestamp: Math.round(current[0].timestamp * 1e6),
        data: pcm.subarray(skip * 4 * CHANNELS)
      });
      try {
        encoder.encode(audio);
      } finally {
        audio.close();
      }
      // Keep the encoder continuous across batches. Flushing every half-second
      // would pad incomplete Opus frames and introduce repeated A/V discontinuities.
      while (encoder.encodeQueueSize > 0 && !failure)
        await new Promise((resolve) =>
          encoder.addEventListener("dequeue", resolve, { once: true })
        );
      await writes;
      if (failure) throw failure;
      previous = current.at(-1);
    } finally {
      remove(INPUT);
      remove(OUTPUT);
    }
  }
  return {
    async add(packet) {
      if (!(packet.duration > 0) && packet.data[0] === 0x0b && packet.data[1] === 0x77) {
        const code = packet.data[4] >> 6;
        const rate =
          code === 3
            ? [24000, 22050, 16000][(packet.data[4] >> 4) & 3]
            : [48000, 44100, 32000][code];
        const blocks = codec === "ac3" || code === 3 ? 6 : [1, 2, 3, 6][(packet.data[4] >> 4) & 3];
        packet = {
          data: packet.data,
          byteLength: packet.byteLength,
          timestamp: packet.timestamp,
          duration: (blocks * 256) / rate
        };
      }
      if (!(packet.duration > 0) || packet.duration > 0.1 || packet.byteLength > 256 * 1024)
        throw Error("audio-conversion-packet-invalid");
      packets.push(packet);
      duration += packet.duration;
      if (duration >= 0.5) await batch();
    },
    async flush() {
      await batch();
      await encoder.flush();
      await writes;
      if (failure) throw failure;
    },
    close() {
      packets = [];
      previous = null;
      if (encoder.state !== "closed") encoder.close();
      remove(INPUT);
      remove(OUTPUT);
    }
  };
}
