import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Shared Vite configuration for every renderer surface, keyed by HTML entry. */
export function rendererViteConfig(htmlEntry: string) {
  return defineConfig({
    plugins: [react()],
    css: {
      modules: {
        localsConvention: 'camelCaseOnly',
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        input: path.resolve(import.meta.dirname, htmlEntry),
      },
    },
  });
}
