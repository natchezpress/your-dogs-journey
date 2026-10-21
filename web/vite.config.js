import { defineConfig } from 'vite';

// The backgrounds live one level up, in assets/backgrounds, and are served at /backgrounds/.
export default defineConfig({
  publicDir: '../assets',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
  server: { host: true },
});
