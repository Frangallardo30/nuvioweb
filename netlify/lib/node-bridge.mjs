import { Readable } from "node:stream";

const MAX_BODY_BYTES = 64 * 1024;

export function jsonError(status, error) {
  return Response.json(
    { ok: false, error },
    {
      status,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    }
  );
}

// Preserve the upstream bridges' route allowlists, validation, provider timeouts
// and response filtering while adapting Node request/response to Fetch APIs.
export async function runNodeBridge(request, handler) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_BODY_BYTES) return jsonError(413, "request_too_large");
  const chunks = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return jsonError(413, "request_too_large");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
  }
  const url = new URL(request.url);
  const incoming = Readable.from(chunks);
  incoming.url = `${url.pathname}${url.search}`;
  incoming.method = request.method;
  incoming.headers = Object.fromEntries(request.headers);

  return new Promise((resolve) => {
    let status = 200;
    let headers = {};
    const response = {
      writeHead(code, values = {}) {
        status = code;
        headers = values;
      },
      end(body = "") {
        resolve(new Response(request.method === "HEAD" ? null : body, { status, headers }));
      }
    };
    Promise.resolve()
      .then(() => handler(incoming, response))
      .catch(() => resolve(jsonError(502, "provider_request_failed")));
  });
}
