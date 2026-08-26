import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'index.diff.html'),
    },
  },
});
