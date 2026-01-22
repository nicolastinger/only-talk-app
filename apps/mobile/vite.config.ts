import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig(async () => ({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@workspace/types': resolve(__dirname, '../../packages/types/src'),
      '@workspace/services': resolve(__dirname, '../../packages/services/src'),
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
    port: 8080,
    host: '0.0.0.0',
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));