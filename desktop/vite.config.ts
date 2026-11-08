import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";
const desktopDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(desktopDir, "renderer"),
  base: "./",
  publicDir: path.resolve(desktopDir, "../public"),
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: path.resolve(desktopDir, "dist-renderer"),
    emptyOutDir: true,
    target: "chrome130",
  },
});
