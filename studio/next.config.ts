import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const studioDir = dirname(fileURLToPath(import.meta.url));

// Host-first: the Studio imports the plugin's canonical libs directly from
// ../scripts/lib/*.mjs (single source of truth). Turbopack root stays at studio/ so
// DEV (`npm run studio`, the primary mode) works. Known tradeoff: production
// `next build` cannot resolve those external modules with this root, and setting the
// root to the plugin repo root fixes the prod build but breaks dev (Next builtin RSC
// client-manifest resolution). Proper fix (backlog): a build-time re-export/vendor
// shim inside studio/ so both dev and prod resolve without moving the root.
const nextConfig: NextConfig = {
  // See docs/decisions/2026-07-18-studio-host-first.md.
  turbopack: {
    root: studioDir,
  },
};

export default nextConfig;
