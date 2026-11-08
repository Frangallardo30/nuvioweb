import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ENV_PROPERTY_KEYS, readEnvProperties } from "./envProperties.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
// Only the explicit browser-public allowlist enters the generated bundle.
// Account tokens, provider keys and OAuth secrets never belong here.
const { env: defaults } = await readEnvProperties({
  rootDir,
  sourcePath: path.join(rootDir, ".env.example")
});
const publicConfig = {
  ...defaults,
  PROBE_MODE: "client",
  REMUX_MODE: "client",
  INTRODB_API_URL: "/api/introdb/"
};
for (const key of ENV_PROPERTY_KEYS) {
  if (process.env[key] !== undefined) publicConfig[key] = process.env[key];
}

const directory = await mkdtemp(path.join(tmpdir(), "nuvioweb-netlify-"));
try {
  const sourcePath = path.join(directory, "public.properties");
  await writeFile(
    sourcePath,
    ENV_PROPERTY_KEYS.map((key) => {
      const value = String(publicConfig[key] ?? "");
      if (/[\r\n]/.test(value)) throw new Error(`Invalid multiline public setting: ${key}`);
      return `${key}=${value}`;
    }).join("\n"),
    { mode: 0o600 }
  );
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, NUVIO_LOCAL_PROPERTIES: sourcePath }
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
