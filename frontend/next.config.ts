import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
    resolveAlias: {
      // Absolute path — Turbopack CSS @import resolver needs this to find
      // tailwindcss in frontend/node_modules, not VoiceAI/node_modules.
      tailwindcss: path.resolve(__dirname, "node_modules/tailwindcss"),
      "tw-animate-css": path.resolve(__dirname, "node_modules/tw-animate-css"),
    },
  },
};

export default nextConfig;
