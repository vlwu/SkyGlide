import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative paths so assets load correctly in the Chrome Extension environment
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        // Ensure code is compatible with standard extension environments
        target: 'esnext',
        // minimize noise in the build output
        reportCompressedSize: false
    }
});