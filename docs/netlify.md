# NuvioWeb on Netlify

Personal deployment of [alphasquare404/NuvioWeb](https://github.com/alphasquare404/NuvioWeb), based on version 0.2.1 (commit b521204). Original GPL-3.0 license and credits are preserved.

## Deploy

Import this GitHub repository in Netlify and select the `main` branch. `netlify.toml` supplies the build command (`npm run build:netlify`), publish directory (`dist`) and provider function.

The build uses the public hosted Nuvio backend values from `.env.example`. Sign in with the same Nuvio account and select the same profile. Verify addon/provider synchronization after signing in; backend and client compatibility still determine which settings synchronize. Never add personal account tokens, provider API keys or passwords to the source or build variables.

`build:netlify` uses the public allowlist in `scripts/envProperties.mjs`. Matching Netlify build environment variables override its defaults. The Supabase anon key is a public client identifier, not a service-role key.

## Available

- Browser interface, PWA, Nuvio account sign-in and cloud synchronization.
- Original Torbox/Premiumize API bridges through a Netlify Function, preserving upstream validation, response filtering and fixed provider endpoints.
- Trakt and MDBList bridges when their application identifiers are configured.
- IntroDB segment lookup through the same origin.
- Direct playback and client-side probing/remux, subject to browser codecs, HTTPS, CORS, byte-range support and browser storage.

Optional application settings: `TRAKT_CLIENT_ID` (Builds + Functions), `TRAKT_CLIENT_SECRET` and `TRAKT_REDIRECT_URI` (Functions), `MDBLIST_CLIENT_ID` (Functions), `PREMIUMIZE_CLIENT_ID` (Builds). Private secrets belong only in Netlify's Functions-scoped environment variables. Existing user credentials may synchronize from the Nuvio backend, but that does not replace application identifiers required for new OAuth connections.

`MEDIA_URL_HOST_RESOLVE_ENABLED=true` (Builds + Functions) optionally enables the original Torbox addon URL helper. It is off by default. The helper receives the required provider credential when enabled; source URLs and credentials are never logged by this adapter.

## Limits

No server-side FFmpeg probe, remux, audio transcoding, video relay or persistent external-player callback/push store is offered on this deployment. Media is requested directly by the browser. Netlify Functions only handle small provider API requests; they do not relay movie files. Use the internal browser player for the first playback test.

Publishing the interface is separate from verifying a particular source on a work network. A working sign-in does not establish playback compatibility. The interface contains no bundled media or personal credentials.

## Local checks

```sh
npm ci --ignore-scripts
npm run test:netlify
npm run build:netlify
```

GitHub Actions repeats the adapter tests and browser build on pushes and pull requests. `.netlify/` is ignored so Netlify's local site linkage is not committed.
