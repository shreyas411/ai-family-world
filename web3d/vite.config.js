import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built into ../static/3d and served by FastAPI at /3d/. `npm run dev` proxies the API + WebSocket to :8000.
export default defineConfig({
  base: '/3d/',
  plugins: [react()],
  build: { outDir: '../static/3d', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: { proxy: { '/api': 'http://localhost:8000', '/ws': { target: 'ws://localhost:8000', ws: true } } },
});
