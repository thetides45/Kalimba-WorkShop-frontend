import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/* 双产物构建（WBS 2.3）：
   - `npm run build`            → dist/ 单页应用（社区门户）
   - `npm run offline:build`    → public/offline/kalimba-tab.html 单 HTML 离线版
   离线产物不走 Vite：内核与工作台装配层被逐字内联（见 tools/build_offline.js），
   这样「内联产物」与「源文件」之间不存在打包器引入的语义差。 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  }
});
