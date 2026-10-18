import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import tauriConfig from "../../src-tauri/tauri.conf.json";

export default defineConfig(async () => ({
  plugins: [vue()],
  define: {
    // 应用版本号兜底: 无 Tauri 运行时(浏览器直接开 dev server)时展示, 与 tauri.conf.json 同源
    __APP_VERSION__: JSON.stringify(tauriConfig.version),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@workspace/types": resolve(__dirname, "../../packages/types/src"),
      "@workspace/services": resolve(__dirname, "../../packages/services/src"),
      "@workspace/i18n": resolve(__dirname, "../../packages/i18n/src"),
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  clearScreen: false,
  server: {
    port: 5713,
    host: "0.0.0.0",
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
