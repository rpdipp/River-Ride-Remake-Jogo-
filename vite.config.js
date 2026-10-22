import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode pc` builds the whole game into one HTML file (pc/) that opens straight from disk.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'pc' ? [viteSingleFile()] : [],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    ...(mode === 'pc' ? { outDir: 'pc', emptyOutDir: true } : {}),
  },
}));
