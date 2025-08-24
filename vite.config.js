import { defineConfig } from 'vite';

export default defineConfig({
  // The public directory will be copied to the root of the dist folder
  publicDir: 'public',
  build: {
    outDir: 'dist',
    // Optional: minify for smaller file size
    minify: 'terser',
    rollupOptions: {
      input: {
        main: 'public/index.html' // Specify the entry point
      }
    }
  }
});