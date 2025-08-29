import { defineConfig } from 'vite';

export default defineConfig({

  publicDir: 'public',
  build: {
    outDir: 'dist',

    minify: 'terser',
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  }
});