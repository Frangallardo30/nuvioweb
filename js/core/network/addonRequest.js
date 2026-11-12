import { httpRequest } from "./httpClient.js";

const LIMITS = { manifest: 8000, meta: 8000, streams: 15000, subtitles: 8000 };

export class AddonRequestError extends Error {
  constructor(resource, category, status = null) {
    super(`Addon ${resource} request failed: ${category}`);
    this.name = "AddonRequestError";
    this.diagnostic = {
      resource,
      category,
      status,
      retryable: ["timeout", "network", "rate-limited", "upstream"].includes(category)
    };
    this.status = status;
  }
}

/** A bounded addon operation, including response-body parsing. Never add session auth. */
export async function addonRequest(
  url,
  { resource = "manifest", signal, timeoutMs = LIMITS[resource], requestImpl = httpRequest } = {}
) {
  if (!Object.hasOwn(LIMITS, resource)) throw new TypeError("Unknown addon resource");
  const controller = new AbortController();
  const budget = Math.min(30000, Math.max(1, Number(timeoutMs) || LIMITS[resource]));
  let timer, onAbort;
  try {
    if (signal?.aborted) throw new AddonRequestError(resource, "cancelled");
    const stopped = new Promise((_, reject) => {
      onAbort = () => {
        reject(new AddonRequestError(resource, "cancelled"));
        controller.abort();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        reject(new AddonRequestError(resource, "timeout"));
        controller.abort();
      }, budget);
    });
    return await Promise.race([
      stopped,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new AddonRequestError(resource, "cancelled");
        return requestImpl(url, { includeSessionAuth: false, signal: controller.signal });
      })
    ]);
  } catch (error) {
    if (error instanceof AddonRequestError) throw error;
    const status = Number(error?.status) || null;
    const category = signal?.aborted
      ? "cancelled"
      : status === 401
        ? "authentication"
        : status === 403
          ? "access-denied"
          : status === 404
            ? "not-found"
            : status === 429
              ? "rate-limited"
              : status >= 500
                ? "upstream"
                : status
                  ? "http"
                  : error instanceof SyntaxError
                    ? "invalid-response"
                    : error instanceof TypeError
                      ? "network"
                      : "request-failed";
    // Do not copy the URL, raw response or original exception into diagnostics.
    // A network TypeError does not establish that CORS caused it.
    throw new AddonRequestError(resource, category, status);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
