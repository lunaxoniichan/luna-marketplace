import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const studioDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Host-first (see docs/decisions/2026-07-18-studio-host-first.md).
  turbopack: {
    root: studioDir,
  },
};

export default nextConfig;
