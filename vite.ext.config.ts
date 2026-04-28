import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'extensions/ga4-datalayer/assets',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/entry.ts'),
      name: 'GA4DataLayer',
      fileName: () => 'ga4-datalayer.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    target: 'es2020',
    minify: 'esbuild',
  },
});
