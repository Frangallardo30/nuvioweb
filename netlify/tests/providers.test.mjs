import test from "node:test";
import assert from "node:assert/strict";
import { createProvidersHandler } from "../lib/providers-handler.mjs";

const request = (path, options) => new Request(`https://nuvio.example${path}`, options);

test("health routes return JSON and optional integrations report their configuration", async () => {
  const handle = createProvidersHandler();
  for (const path of ["/api/debrid/health", "/api/introdb/health"]) {
    const response = await handle(request(path));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const path of ["/api/trakt/health", "/api/mdblist/health"]) {
    assert.deepEqual(await (await handle(request(path))).json(), { configured: false });
  }
});

test("provider credentials and responses pass through the restricted Torbox account route", async () => {
  let target;
  const handle = createProvidersHandler({
    fetchImpl: async (url, options) => {
      target = { url, options };
      return Response.json({ success: true, data: { email: "test@example.org", plan: 1 } });
    }
  });
  const response = await handle(
    request("/api/debrid/torbox/account", {
      headers: { Authorization: "Bearer test-provider-key" }
    })
  );
  assert.equal(response.status, 200);
  assert.equal(target.url, "https://api.torbox.app/v1/api/user/me");
  assert.equal(target.options.headers.Authorization, "Bearer test-provider-key");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("invalid bodies, oversized requests and arbitrary proxy paths never reach providers", async () => {
  const handle = createProvidersHandler({
    fetchImpl: async () => assert.fail("Unexpected provider call")
  });
  for (const [path, options, status] of [
    ["/api/debrid/torbox/device/redeem", { method: "POST", body: "{" }, 400],
    ["/api/debrid/torbox/device/redeem", { method: "POST", body: "x".repeat(65537) }, 413],
    ["/api/debrid/torbox/device/redeem", { method: "GET" }, 405],
    ["/api/debrid/torbox/account", {}, 401],
    ["/api/debrid/proxy?url=https://example.org", {}, 404],
    ["/api/transcode", {}, 404]
  ]) {
    const response = await handle(request(path, options));
    assert.equal(response.status, status, path);
    assert.match(response.headers.get("content-type"), /application\/json/);
  }
});

test("device authorization forwards a POST body using the original bridge", async () => {
  let target;
  const handle = createProvidersHandler({
    fetchImpl: async (url, options) => {
      target = { url, options };
      return Response.json({ success: true, data: { access_token: "test-resolved-key" } });
    }
  });
  const response = await handle(
    request("/api/debrid/torbox/device/redeem", {
      method: "POST",
      body: JSON.stringify({ deviceCode: "test-device-code" })
    })
  );
  assert.equal(response.status, 200);
  assert.equal(target.url, "https://api.torbox.app/v1/api/user/auth/device/token");
  assert.equal(target.options.method, "POST");
  assert.match(String(target.options.body), /test-device-code/);
});

test("provider redirects are rejected instead of forwarding credentials elsewhere", async () => {
  const handle = createProvidersHandler({
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, "manual");
      return new Response(null, { status: 302, headers: { Location: "https://example.org" } });
    }
  });
  const response = await handle(
    request("/api/debrid/torbox/account", {
      headers: { Authorization: "Bearer test-provider-key" }
    })
  );
  assert.equal(response.status, 502);
});
