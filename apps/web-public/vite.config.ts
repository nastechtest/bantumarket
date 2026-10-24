import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * NO_3D=1 builds the whole app with the scene runtime replaced by a stub. It is a CI artefact, not
 * a shipping one: its job is to prove no flow depends on 3D, and to give the payload check a
 * delta to measure the scene against.
 */
const no3d = process.env.NO_3D === '1';
const here = fileURLToPath(new URL('.', import.meta.url));
const stub = resolve(here, 'src/build/no3d-stub.tsx');
const threeStub = resolve(here, 'src/build/no3d-three.ts');
const fiberStub = resolve(here, 'src/build/no3d-fiber.tsx');

export default defineConfig({
  plugins: [react()],
  define: { __NO_3D__: JSON.stringify(no3d) },
  resolve: {
    alias: no3d
      ? [
          { find: /^@nastech\/ui-3d$/, replacement: stub },
          { find: /^@nastech\/ui-3d\/scene$/, replacement: stub },
          { find: /^three$/, replacement: threeStub },
          { find: /^@react-three\/fiber$/, replacement: fiberStub },
          { find: /^@react-three\/.*/, replacement: stub },
        ]
      : [],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('/three/') || id.includes('@react-three') ? 'scene' : undefined),
      },
    },
  },
  server: { port: 5173 },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.tsx', 'src/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
