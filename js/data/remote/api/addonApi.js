import { addonRequest } from "../../../core/network/addonRequest.js";

export const AddonApi = {
  async getManifest(url, options = {}) {
    return addonRequest(url, { ...options, resource: "manifest" });
  },

  async getMeta(url, options = {}) {
    return addonRequest(url, { ...options, resource: "meta" });
  },

  async getStreams(url, options = {}) {
    return addonRequest(url, { ...options, resource: "streams" });
  },

  async getSubtitles(url, options = {}) {
    return addonRequest(url, { ...options, resource: "subtitles" });
  }
};
