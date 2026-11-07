import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const basePath = (process.env.PAGES_BASE_PATH || "").replace(/^\/+|\/+$/g, "");

// The same client application can run on static hosting, without a Worker.
export default defineConfig({
  root: resolve(projectRoot, "github-pages"),
  base: basePath ? `/${basePath}/` : "/",
  publicDir: resolve(projectRoot, "public"),
  resolve: { alias: { "@": projectRoot } },
  plugins: [react()],
  build: {
    outDir: resolve(projectRoot, "dist-pages"),
    emptyOutDir: true,
  },
});
