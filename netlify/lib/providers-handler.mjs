import { createDebridApiBridgeHandler } from "../../services/debrid-api-bridge/bridge.mjs";
import { createTraktAuthBridgeHandler } from "../../services/trakt-auth-bridge/bridge.mjs";
import { createMdbListBridgeHandler } from "../../services/mdblist-bridge/bridge.mjs";
import { createIntrodbBridgeHandler } from "../../services/introdb-bridge/bridge.mjs";
import { jsonError, runNodeBridge } from "./node-bridge.mjs";

export function createProvidersHandler({ environment = {}, fetchImpl = fetch } = {}) {
  const routes = [
    [
      "/api/debrid/",
      createDebridApiBridgeHandler({
        fetchImpl,
        addonResolveEnabled: /^(1|true)$/i.test(environment.MEDIA_URL_HOST_RESOLVE_ENABLED || "")
      })
    ],
    ["/api/trakt/", createTraktAuthBridgeHandler({ environment, fetchImpl })],
    ["/api/mdblist/", createMdbListBridgeHandler({ environment, fetchImpl })],
    ["/api/introdb/", createIntrodbBridgeHandler({ fetchImpl })]
  ];
  return async function handle(request) {
    const pathname = new URL(request.url).pathname;
    const route = routes.find(([prefix]) => pathname.startsWith(prefix));
    if (route) return runNodeBridge(request, route[1]);
    if (pathname === "/api/external-return/push/public-key") {
      return Response.json(
        { enabled: false, publicKey: "" },
        {
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
        }
      );
    }
    // Media bytes go from the source to the browser. Netlify is not a media relay.
    return jsonError(404, "endpoint_not_available");
  };
}
