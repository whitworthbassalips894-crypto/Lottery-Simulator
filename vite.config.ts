import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 相对基址：既能部署在 GitHub Pages 的子路径，也能放在任意目录
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});
