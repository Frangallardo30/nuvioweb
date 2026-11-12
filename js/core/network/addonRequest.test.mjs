import test from "node:test";
import assert from "node:assert/strict";
import { addonRequest } from "./addonRequest.js";
import { safeApiCall } from "./safeApiCall.js";

test("a never-resolving addon is bounded and its request is aborted", async () => {
  let signal;
  const result = await safeApiCall(() =>
    addonRequest("https://private.test/token/manifest.json", {
      timeoutMs: 10,
      requestImpl: (_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      }
    })
  );
  assert.equal(result.status, "error");
  assert.equal(result.diagnostic.category, "timeout");
  assert.equal(signal.aborted, true);
  assert.doesNotMatch(JSON.stringify(result), /private|token/);
});

test("external cancellation preserves intent and never starts an already cancelled request", async () => {
  const c = new AbortController();
  c.abort();
  let started = false;
  await assert.rejects(
    addonRequest("fixture", {
      signal: c.signal,
      requestImpl: () => {
        started = true;
      }
    }),
    (e) => e.diagnostic.category === "cancelled"
  );
  assert.equal(started, false);
  const active = new AbortController();
  const pending = addonRequest("fixture", {
    signal: active.signal,
    requestImpl: () => new Promise(() => {})
  });
  active.abort();
  await assert.rejects(pending, (e) => e.diagnostic.category === "cancelled");
});

test("HTTP, parsing and ambiguous network failures retain useful safe categories", async () => {
  for (const [error, expected] of [
    [Object.assign(new Error("secret"), { status: 401 }), "authentication"],
    [Object.assign(new Error("secret"), { status: 503 }), "upstream"],
    [new SyntaxError("secret body"), "invalid-response"],
    [new TypeError("secret URL"), "network"]
  ]) {
    const result = await safeApiCall(() =>
      addonRequest("fixture", {
        requestImpl: async () => {
          throw error;
        }
      })
    );
    assert.equal(result.diagnostic.category, expected);
    assert.doesNotMatch(JSON.stringify(result), /secret|CORS/);
  }
});

test("successful empty results remain successful and never attach account authentication", async () => {
  const result = await safeApiCall(() =>
    addonRequest("fixture", {
      resource: "streams",
      requestImpl: async (_url, options) => {
        assert.equal(options.includeSessionAuth, false);
        assert.ok(options.signal);
        return { streams: [] };
      }
    })
  );
  assert.deepEqual(result, { status: "success", data: { streams: [] } });
});
