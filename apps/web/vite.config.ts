import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  base: "/",
  clearScreen: false,
  server: {
    port: 5180,
    host: "0.0.0.0",
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
