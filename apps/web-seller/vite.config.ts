import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Set by scripts/build-vercel.ts so one deployment can host all three apps under one origin.
  base: process.env.APP_BASE ?? '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('/three/') || id.includes('@react-three') ? 'scene' : undefined) },
    },
  },
  server: { port: 5174 },
});
