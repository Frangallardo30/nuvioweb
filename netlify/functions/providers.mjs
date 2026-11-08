import { createProvidersHandler } from "../lib/providers-handler.mjs";

const SERVER_KEYS = [
  "TRAKT_CLIENT_ID",
  "TRAKT_CLIENT_SECRET",
  "TRAKT_REDIRECT_URI",
  "MDBLIST_CLIENT_ID",
  "MEDIA_URL_HOST_RESOLVE_ENABLED"
];

export default async function providers(request) {
  const environment = Object.fromEntries(
    SERVER_KEYS.map((key) => [key, Netlify.env.get(key) || ""])
  );
  return createProvidersHandler({ environment })(request);
}
