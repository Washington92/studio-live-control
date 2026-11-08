import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "renderer"),
  base: "./",
  publicDir: path.resolve(__dirname, "../public"),
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: path.resolve(__dirname, "dist-renderer"),
    emptyOutDir: true,
    target: "chrome130",
  },
});
