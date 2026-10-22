import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.tsx', 'src/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
