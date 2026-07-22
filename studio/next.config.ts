import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const studioDir = dirname(fileURLToPath(import.meta.url));

// Host-first: the Studio imports the plugin's canonical libs, but from a gitignored
// vendored copy inside the root (`studio/.plugin/scripts/`, populated by predev/prebuild
// via scripts/vendor-studio.mjs). Turbopack root therefore stays at studio/ and both
// DEV and production `next build` resolve the libs — no external-module escape (T14).
const nextConfig: NextConfig = {
  // See docs/decisions/2026-07-18-studio-host-first.md.
  turbopack: {
    root: studioDir,
  },
};

export default nextConfig;
