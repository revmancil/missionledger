import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// PORT and BASE_PATH are injected by the Replit runtime for `dev`/`preview`.
// `vite build` never binds a port and only needs BASE_PATH to set the asset
// base path in the emitted HTML, so we fall back to sane defaults for build
// (and for any environment — Vercel, CI, local — that doesn't set them)
// instead of hard-failing. When the vars ARE provided (Replit), behavior is
// unchanged: the exact same port/base are used as before.
const isBuild = process.argv.includes("build");

const rawPort = process.env.PORT;

if (!rawPort && !isBuild) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = rawPort ? Number(rawPort) : 5173;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

// Dev/preview only: forward `/api/*` to the local API server so the browser sees
// a single, same-origin app — exactly like production, where `vercel.json`
// rewrites `/api/:path*` to the deployed API. Without this, raw
// `fetch(`${BASE}/api/…`)` calls (which — unlike the generated `customFetch` —
// do not consult `VITE_API_BASE_URL`) hit the Vite dev server and receive
// `index.html`, so auth/subscription/sub-resource loading fails and the
// authenticated app hangs on "Loading session…".
// `vite build` never binds a server, so this has no effect on the bundle.
// Override the target with API_PROXY_TARGET (defaults to the local API).
const apiProxyTarget = process.env.API_PROXY_TARGET || "http://127.0.0.1:8080";
const apiProxy = {
  "/api": {
    target: apiProxyTarget,
    changeOrigin: true,
    secure: false,
  },
};

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: apiProxy,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: apiProxy,
  },
});
