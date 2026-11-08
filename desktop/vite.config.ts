import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const desktopDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(desktopDir, "renderer"),
  base: "./",
  publicDir: path.resolve(desktopDir, "../public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    // The desktop Vite root is nested: resolve @ from the repository root
    // explicitly instead of relying on tsconfig discovery from renderer/.
    alias: { "@": path.resolve(desktopDir, "../src") },
  },
  build: {
    outDir: path.resolve(desktopDir, "dist-renderer"),
    emptyOutDir: true,
    target: "chrome130",
  },
});
