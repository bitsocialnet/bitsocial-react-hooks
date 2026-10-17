// `yarn start`: serve the website at https://<name>.localhost through Portless and open it,
// matching 5chan and bitsocial-web. PORTLESS=0 (or Windows) falls back to plain `astro dev`.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { get } from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const website = fileURLToPath(new URL("../", import.meta.url));
const suffix = process.platform === "win32" ? ".cmd" : "";
const bin = (name) => path.join(website, "node_modules/.bin", name + suffix);
const portlessBin = bin("portless");
const astroBin = bin("astro");
const baseName = "hooks.bitsocial";
const usePortless =
  process.env.PORTLESS !== "0" && process.platform !== "win32" && existsSync(portlessBin);
const portlessEnv = {
  ...process.env,
  PORTLESS_PORT: process.env.PORTLESS_PORT || "443",
  PORTLESS_HTTPS: process.env.PORTLESS_HTTPS ?? "1",
  PORTLESS_LAN: process.env.PORTLESS_LAN ?? "0",
};
const openBrowser = process.env.BROWSER !== "none";

const sanitizeLabel = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const run = (command, args, options) =>
  spawnSync(command, args, { cwd: website, encoding: "utf8", ...options });

function activeRouteHosts() {
  const result = run(portlessBin, ["list"], { env: portlessEnv });
  const urls = result.status === 0 ? result.stdout.match(/https?:\/\/[a-z0-9.-]+\.localhost(?::\d+)?/g) : null;
  return new Set((urls || []).map((url) => new URL(url).hostname));
}

// Feature branches get their own subdomain so several worktrees can run side by side.
function appName() {
  const busy = activeRouteHosts();
  const isBusy = (name) => busy.has(`${name}.localhost`);
  const branch = run("git", ["branch", "--show-current"]).stdout?.trim();
  const scoped = `${sanitizeLabel(branch || "current")}.${baseName}`;
  const preferred =
    branch && branch !== "master" && branch !== "main" ? scoped : isBusy(baseName) ? scoped : baseName;
  if (!isBusy(preferred)) return preferred;
  for (let n = 2; n < 1000; n += 1) if (!isBusy(`${preferred}-${n}`)) return `${preferred}-${n}`;
  return `${preferred}-${Date.now()}`;
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = get(url, { rejectUnauthorized: false }, (response) => {
        response.resume();
        resolve((response.statusCode ?? 500) < 400);
      });
      request.on("error", () => resolve(false));
      request.setTimeout(2_000, () => request.destroy());
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function open(url) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

// Astro 7 detaches `astro dev` when it detects an AI agent; Portless needs it in the
// foreground, and `--ignore-lock` is Astro's documented opt-out of that.
let child;
if (usePortless) {
  const proxy = run(portlessBin, ["proxy", "start", "--port", portlessEnv.PORTLESS_PORT, "--https"], {
    env: portlessEnv,
    stdio: "inherit",
  });
  if (proxy.status !== 0) process.exit(proxy.status ?? 1);
  const name = appName();
  const url = `https://${name}.localhost`;
  console.log(`Starting the website at ${url}`);
  // Portless injects Astro's --port and --host.
  child = spawn(portlessBin, [name, astroBin, "dev", "--ignore-lock"], {
    cwd: website,
    env: portlessEnv,
    stdio: "inherit",
  });
  if (openBrowser) {
    waitForUrl(url, 60_000)
      .then(() => {
        console.log(`Opening ${url} in browser...`);
        open(url);
      })
      .catch((error) => console.warn(`Could not auto-open ${url}: ${error.message}`));
  }
} else {
  if (process.env.PORTLESS !== "0") console.warn("Portless unavailable, using astro dev directly");
  const args = ["dev", "--ignore-lock", "--host", "127.0.0.1", ...(openBrowser ? ["--open"] : [])];
  child = spawn(astroBin, args, { cwd: website, stdio: "inherit", shell: suffix === ".cmd" });
}

// Forward stop signals so a parent that only signals this process doesn't orphan the server.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
