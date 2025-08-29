import { defineConfig } from 'vite';

export default defineConfig({

  publicDir: 'public',
  build: {
    outDir: 'dist',

    minify: 'terser',
    rollupOptions: {
      input: {
        main: 'index.html'
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }
        }
      }
    }
  }
});